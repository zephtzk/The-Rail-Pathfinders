#!/usr/bin/env python3
"""Deterministic bounded bus compiler. Complete selected patterns or fail closed."""
import argparse
from collections import Counter, defaultdict
import hashlib
import json
import math
from pathlib import Path
import re

VERSION = '3.0.0'
ENDPOINTS = ('BusStops', 'BusRoutes', 'BusServices')
DAYS = ('WD', 'SAT', 'SUN')
FREQUENCIES = ('AM_Peak_Freq', 'AM_Offpeak_Freq', 'PM_Peak_Freq', 'PM_Offpeak_Freq')

def require(condition, message):
    if not condition:
        raise ValueError(message)

def digest(blob):
    return hashlib.sha256(blob).hexdigest()

def encoded(value):
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'))+'\n').encode()

def stop_code(value):
    require(isinstance(value, str) and re.fullmatch(r'\d{5}', value), 'Stop identifier must be a five-digit string')
    return value

def hhmm(value):
    if value == '-':
        return None
    require(isinstance(value, str) and re.fullmatch(r'\d{4}', value), 'Invalid HHMM time')
    hour, minute = int(value[:2]), int(value[2:])
    require(hour <= 24 and minute < 60 and (hour < 24 or minute == 0), 'Invalid clock time')
    return hour*3600+minute*60

def first_last(first, last):
    start, finish = hhmm(first), hhmm(last)
    require((start is None) == (finish is None), 'One-sided first/last absence')
    if start is None:
        return None, False
    rollover = finish < start
    return [start, finish+86400 if rollover else finish], rollover

def frequency(value):
    if value in ('-', ''):
        return None
    match = re.fullmatch(r'(\d{1,3})(?:-(\d{1,3}))?', value if isinstance(value, str) else '')
    require(match is not None, 'Invalid headway range')
    low, high = int(match[1]), int(match[2] or match[1])
    require(0 < low <= high <= 180, 'Invalid headway bound')
    return [low, high]

def pattern_key(row):
    return (row['ServiceNo'], row['Operator'], row['Direction'])

def read_source(source):
    metadata = json.loads((source/'metadata.json').read_text(encoding='utf-8'))
    result = {}
    for endpoint in ENDPOINTS:
        spec = metadata['datasets'][endpoint]
        require(spec['pageSize'] == 500 and spec['paginationComplete'] and spec['terminalEmptyPage'], 'Incomplete pagination')
        pages = spec['pages']
        require(pages and pages[-1]['count'] == 0, 'No terminal empty page')
        records, hashes = [], set()
        for index, page in enumerate(pages):
            require(page['skip'] == index*500, 'Missing or reordered pagination offset')
            require(page['file'] == f'{endpoint}/{index*500:06d}.json', 'Unsafe or unexpected page path')
            blob = (source/page['file']).read_bytes()
            require(digest(blob) == page['sha256'], 'Raw page hash mismatch')
            payload = json.loads(blob)
            rows = payload.get('value')
            require(isinstance(rows, list) and len(rows) == page['count'] and len(rows) <= 500, 'Page count mismatch')
            require(index == len(pages)-1 or len(rows) > 0, 'Records after terminal empty page')
            require(index >= len(pages)-2 or len(rows) == 500, 'Short page followed by nonempty page')
            if rows:
                fingerprint = digest(encoded(rows))
                require(fingerprint not in hashes, 'Repeated pagination page')
                hashes.add(fingerprint)
            records.extend(rows)
        require(len(records) == spec['rawCount'], 'Raw total mismatch')
        result[endpoint] = records
    # The acquisition hash covers every record, including records excluded from
    # the pilot. Insertion order and compact encoding match acquisition's JSON.
    canonical = json.dumps(result, ensure_ascii=False, separators=(',', ':')).encode()
    require(digest(canonical) == metadata['version'], 'Combined source version mismatch')
    return result, metadata

def compile_records(data, metadata, rules):
    require(metadata['version'] == rules['sourceVersion'], 'Unreviewed source version')
    selected = set(rules['serviceNumbers'])
    require(selected and len(selected) == len(rules['serviceNumbers']), 'Duplicate/empty coverage services')
    stops, services, route_groups = {}, {}, defaultdict(list)
    duplicate_counts = {}
    for endpoint, fields in [('BusStops', ('BusStopCode',)), ('BusServices', ('ServiceNo','Operator','Direction')), ('BusRoutes', ('ServiceNo','Operator','Direction','StopSequence'))]:
        keys = [tuple(row.get(field) for field in fields) for row in data[endpoint]]
        duplicate_counts[endpoint] = len(keys)-len(set(keys))
        require(duplicate_counts[endpoint] == 0, f'Duplicate {endpoint} identifiers')
    for row in data['BusStops']:
        code = stop_code(row['BusStopCode'])
        lat, lon = row['Latitude'], row['Longitude']
        require(type(lat) in (int,float) and type(lon) in (int,float) and math.isfinite(lat) and math.isfinite(lon), 'Invalid stop coordinate')
        stops[code] = {'id':code,'name':row['Description'],'roadName':row['RoadName'],'lat':lat,'lon':lon}
    for row in data['BusServices']:
        services[pattern_key(row)] = row
    for row in data['BusRoutes']:
        route_groups[pattern_key(row)].append(row)
    global_orphans = {'missingStopRecords':sum(row['BusStopCode'] not in stops for row in data['BusRoutes']),
                      'missingServiceRecords':sum(pattern_key(row) not in services for row in data['BusRoutes']),
                      'servicesWithoutRoutes':sum(key not in route_groups for key in services),
                      'servicesWithoutRoutesIdentifiers':[':'.join(map(str,key)) for key in sorted(services) if key not in route_groups]}
    selected_keys = set(key for key in services if key[0] in selected) | set(key for key in route_groups if key[0] in selected)
    require({key[0] for key in selected_keys} == selected, 'Selected service absent')
    patterns, used_stops, rollover_count = [], set(), 0
    for key in sorted(selected_keys):
        require(key in services and key in route_groups, 'Selected service/route orphan')
        service = services[key]
        require(key[2] in (1,2) and type(key[2]) is int, 'Invalid direction')
        rows = sorted(route_groups[key], key=lambda row:row['StopSequence'])
        require([row['StopSequence'] for row in rows] == list(range(1,len(rows)+1)), 'Non-contiguous selected route sequence')
        origin, destination = stop_code(service['OriginCode']), stop_code(service['DestinationCode'])
        require(rows[0]['BusStopCode'] == origin and rows[-1]['BusStopCode'] == destination, 'Selected service truncated or termini conflict')
        loop = bool(service['LoopDesc'])
        require(loop == (origin == destination), 'Loop/termini semantics conflict')
        require(not loop or key[2] == 1, 'Unexpected loop direction; preserve variants separately')
        headways = {field:frequency(service[field]) for field in FREQUENCIES}
        require(headways[rules['assumptions']['waitField']] is not None, 'Pilot headway missing')
        occurrences, visits, previous_distance = [], Counter(), -1
        for row in rows:
            code = stop_code(row['BusStopCode'])
            require(code in stops, 'Selected route references unknown stop')
            distance = row['Distance']
            require(type(distance) in (int,float) and math.isfinite(distance) and distance >= previous_distance >= -1, 'Route distance decreases or is invalid')
            previous_distance = distance
            visits[code] += 1
            times, raw_times, rollover_days = {}, {}, []
            for day in DAYS:
                raw_times[day] = [row[day+'_FirstBus'],row[day+'_LastBus']]
                times[day], rollover = first_last(*raw_times[day])
                if rollover:
                    rollover_days.append(day)
                    rollover_count += 1
            require(times['WD'] and times['WD'][0] <= rules['coverage']['earliestSeconds'] and times['WD'][1] >= rules['coverage']['latestSeconds'], 'Stop does not support full reviewed daytime window')
            occurrences.append({'stopId':code,'sequence':row['StopSequence'],'visitNumber':visits[code],'distanceKm':distance,'firstLast':times,'firstLastRaw':raw_times,'rolloverDays':rollover_days})
            used_stops.add(code)
        require(rows[0]['Distance'] == 0, 'Route start distance is not zero')
        patterns.append({'id':':'.join(map(str,key)),'serviceNo':key[0],'operator':key[1],'direction':key[2],
                         'originCode':origin,'destinationCode':destination,'loop':loop,'loopDescription':service['LoopDesc'],
                         'headways':headways,'timingKind':'frequency-estimate','stops':occurrences})
    counts = {'BusStops':len(used_stops),'BusRoutes':sum(len(p['stops']) for p in patterns),'BusServices':len(patterns)}
    bay_codes = rules['assumptions'].get('unverifiedBayStopCodes', [])
    require(len(bay_codes) == len(set(bay_codes)) and all(stop_code(code) in used_stops for code in bay_codes), 'Invalid unverified-bay exclusion')
    network = {'schemaVersion':1,'importerVersion':VERSION,'timezone':'Asia/Singapore','sourceVersion':metadata['version'],
               'retrievedAt':metadata['retrievedAt'],'coverage':rules['coverage'],'assumptions':rules['assumptions'],
               'stops':[stops[code] for code in sorted(used_stops)],'patterns':patterns}
    audit = {'rawCounts':{e:len(data[e]) for e in ENDPOINTS},'acceptedCounts':counts,
             'excludedCounts':{e:len(data[e])-counts[e] for e in ENDPOINTS},
             'exclusionReasons':{'BusStops':'Not referenced by complete selected pilot patterns','BusRoutes':'Service outside reviewed pilot; exact service suffix variants remain separate','BusServices':'Service outside reviewed pilot; no implicit variant or direction merging'},
             'duplicateKeys':duplicate_counts,'globalOrphans':global_orphans,'selectedOrphans':0,
             'selectedSequenceGaps':0,'selectedTruncatedPatterns':0,'rolloverDayRecords':rollover_count,
             'repeatedStopOccurrences':sum(sum(v-1 for v in Counter(s['stopId'] for s in p['stops']).values()) for p in patterns),
             'loopPatterns':sum(p['loop'] for p in patterns),'patterns':[{'id':p['id'],'occurrences':len(p['stops']),'origin':p['originCode'],'destination':p['destinationCode']} for p in patterns]}
    return network, audit

def build(source, rules_path, output, manifest_path):
    data, metadata = read_source(source)
    rules_blob = rules_path.read_bytes()
    network, audit = compile_records(data, metadata, json.loads(rules_blob))
    blob = encoded(network)
    manifest = {'schemaVersion':1,'importerVersion':VERSION,'importerSha256':digest(Path(__file__).read_bytes()),'rulesSha256':digest(rules_blob),
                'sourceVersion':metadata['version'],'sourceMetadataSha256':digest((source/'metadata.json').read_bytes()),
                'retrievedAt':metadata['retrievedAt'],'documentationVersion':metadata['documentationVersion'],
                'sourceDirectory':source.name,'networkSha256':digest(blob),'networkBytes':len(blob),
                'pagination':{e:{'pages':len(metadata['datasets'][e]['pages']),'terminalEmptyPage':True,'rawCount':metadata['datasets'][e]['rawCount']} for e in ENDPOINTS},
                'audit':audit,'coverage':network['coverage'],'serviceNumbers':sorted({p['serviceNo'] for p in network['patterns']})}
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_bytes(blob)
    manifest_path.write_bytes(encoded(manifest))
    return manifest

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source',type=Path,required=True)
    parser.add_argument('--rules',type=Path,default=Path('data/bus/validation.json'))
    parser.add_argument('--output',type=Path,default=Path('public/data/bus-network.json'))
    parser.add_argument('--manifest',type=Path,default=Path('public/data/bus-manifest.json'))
    args = parser.parse_args()
    print(json.dumps(build(args.source,args.rules,args.output,args.manifest),indent=2))
