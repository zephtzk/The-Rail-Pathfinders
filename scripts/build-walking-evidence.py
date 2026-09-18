"""Rebuild the four manually reviewed paths from pinned map sources.

This is NOT a walking-edge discovery algorithm. The selected ways, source nodes,
thresholds and boarding-forecourt connectors below were individually reviewed.
Changing the sources requires a fresh visual/path review before running this.
Only Python's standard library is required.
"""
import hashlib
import json
import math
import html
from pathlib import Path
import xml.etree.ElementTree as ET
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[1]
DIR = ROOT / 'data/bus/walking-evidence'


def distance(a, b):
    lat1, lon1, lat2, lon2 = map(math.radians, [a['lat'], a['lon'], b['lat'], b['lon']])
    dlat, dlon = lat2 - lat1, lon2 - lon1
    h = math.sin(dlat / 2)**2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2)**2
    return 6371000 * 2 * math.atan2(math.sqrt(h), math.sqrt(1 - h))


def source(id, filename, url, **extra):
    file = DIR / filename
    return {'id': id, 'url': url, 'file': file.relative_to(ROOT).as_posix(),
            'sha256': hashlib.sha256(file.read_bytes()).hexdigest(),
            'retrievedAt': datetime.fromtimestamp(file.stat().st_mtime, timezone.utc).isoformat(), **extra}


sources = [
    source('smrt-paya-lebar', 'smrt-paya-lebar-map.jpg',
           'https://connect-cdn.smrt.wwprojects.com/autoupdate/images/locality/Paya%20Lebar.jpg',
           publisher='SMRT; map copyright LTA', sourceDate='2021-02',
           pageUrl='https://journey.smrt.com.sg/journey/station_info/paya-lebar/map/',
           sourceDateBasis='SMRT station map page template states accurate as of February 2021; image has no independent revision date.'),
    source('smrt-bugis', 'smrt-bugis-map.jpg',
           'https://connect-cdn.smrt.wwprojects.com/autoupdate/images/locality/Bugis.jpg',
           publisher='SMRT; map copyright LTA', sourceDate='2021-02',
           pageUrl='https://journey.smrt.com.sg/journey/station_info/bugis/map/',
           sourceDateBasis='SMRT station map page template states accurate as of February 2021; image has no independent revision date.'),
    source('osm-paya-lebar', 'osm-paya-lebar.osm',
           'https://api.openstreetmap.org/api/0.6/map?bbox=103.8908,1.3166,103.8935,1.3205',
           publisher='OpenStreetMap contributors', license='ODbL 1.0',
           attributionUrl='https://www.openstreetmap.org/copyright'),
    source('osm-bugis', 'osm-bugis.osm',
           'https://api.openstreetmap.org/api/0.6/map?bbox=103.8547,1.3001,103.8572,1.3019',
           publisher='OpenStreetMap contributors', license='ODbL 1.0',
           attributionUrl='https://www.openstreetmap.org/copyright'),
]

maps = {}
for name in ['paya-lebar', 'bugis']:
    tree = ET.parse(DIR / ('osm-' + name + '.osm')).getroot()
    nodes = {n.attrib['id']: dict(id=n.attrib['id'], lat=float(n.attrib['lat']), lon=float(n.attrib['lon']),
                               tags={t.attrib['k']: t.attrib['v'] for t in n.findall('tag')}) for n in tree.findall('node')}
    ways = {w.attrib['id']: dict(id=w.attrib['id'], version=int(w.attrib['version']),
                               timestamp=w.attrib['timestamp'], nodeIds=[n.attrib['ref'] for n in w.findall('nd')],
                               tags={t.attrib['k']: t.attrib['v'] for t in w.findall('tag')}) for w in tree.findall('way')}
    maps[name] = (nodes, ways)

bus = json.loads((ROOT / 'public/data/bus-network.json').read_text(encoding='utf-8'))
bus_stops = {s['id']: s for s in bus['stops']}

# Each tuple names a reviewed source way and its exact ordered source-node slice.
# A partial first segment starts at the reviewed shelter/forecourt edge, not a
# discovered nearest walking edge. No endpoint radius is searched at runtime.
curations = [
    dict(id='walk-81111-paya-lebar-b', area='paya-lebar', busStopId='81111', busNode='410464255',
         railStationId='CC9', railPlatformIds=['CC9_A', 'CC9_B'], exit='B', entranceId='CC9_EB',
         entranceNode='2402427003', threshold='6333789484', buildingWay='231917983',
         segments=[('877813337', ['8167238191', '8169270118', '8167238189']),
                   ('188867235', ['8167238189', '6333789484'])],
         instructions=['Leave bus stop 81111 on the Paya Lebar Square side, staying within its shelter/boarding forecourt.',
                       'Follow the mapped east-side concrete footway south beside Paya Lebar Road.',
                       'Turn onto the mapped station approach at Exit B; stop the exterior trace at the station-building threshold.'],
         connectorReview='The bus platform marker and selected footway lie within the same mapped bus shelter footprint. The short lateral connector stays inside that shelter; it does not cross Paya Lebar Road.',
         barriers='Paya Lebar Road separates this stop from 81119. Remain on the east side. No road, driveway, railway or canal crossing on the selected exterior path.'),
    dict(id='walk-81119-paya-lebar-c', area='paya-lebar', busStopId='81119', busNode='410470849',
         railStationId='CC9', railPlatformIds=['CC9_A', 'CC9_B'], exit='C', entranceId='CC9_EC',
         entranceNode='3986226732', threshold='3738967183', buildingWay='188867429',
         segments=[('547109567', ['5286398024', '13004673986']),
                   ('1415207209', ['13004673986', '5286398023', '5286398022']),
                   ('370173956', ['5286398022', '3738967183'])],
         instructions=['Leave bus stop 81119 onto the same west-side boarding forecourt.',
                       'Follow the mapped shared cycleway south; this way explicitly permits pedestrians (foot=designated).',
                       'Continue on the adjoining footway, then turn west along the mapped Exit C approach. End the exterior trace before the underground walkway.'],
         connectorReview='The bus marker is beside the foot-designated shared path on the same west-side stop forecourt shown by the operator map. The lateral connector stays on that forecourt; no carriageway is crossed.',
         barriers='Do not cross Paya Lebar Road to Exit B. The route ends before OSM underground walkway 188867494. Shared cycling is mapped; conflict-free passage is not promised.'),
    dict(id='walk-01059-bugis-b', area='bugis', busStopId='01059', busNode='410483661',
         railStationId='DT14', railPlatformIds=['EW12_A', 'EW12_B'], exit='B', entranceId='DT14_EB',
         entranceNode='1839626455', threshold='1764839483', buildingWay='164882623',
         segments=[('545573091', ['410483661', '1839636508']),
                   ('545573093', ['1839636508', '1764839474']),
                   ('164882621', ['1764839474', '1764839483'])],
         instructions=['From stop 01059, follow the mapped footway northeast along the Raffles Hospital side of Victoria Street.',
                       'At the path junction, turn southeast toward the station approach, then south to Exit B.',
                       'End the exterior trace at the mapped station-building boundary; continue indoors using station signs.'],
         connectorReview='None: OSM bus stop node 410483661 is itself a vertex of footway 545573091, and the final node is a vertex of station building 164882623.',
         barriers='Stay on the Raffles Hospital side. Do not cross Victoria Street or Rochor Road. The selected path stops before the hospital driveway crossings farther northeast.'),
    dict(id='walk-01113-bugis-a', area='bugis', busStopId='01113', busNode='610707573',
         railStationId='DT14', railPlatformIds=['EW12_A', 'EW12_B'], exit='A', entranceId='DT14_EA',
         entranceNode='1839626456', threshold='1780030019', buildingWay='166554010',
         segments=[('739532532', ['6924431331', '1780030019'])],
         instructions=['Leave stop 01113 through its boarding forecourt to the adjoining footway on the same side of Victoria Street.',
                       'Turn northwest along the mapped station approach to Exit A.',
                       'End the exterior trace at the station-building boundary.'],
         connectorReview='The reviewed seven-metre connector joins the bus platform marker to its same-side footway junction. The official locality map places both stop 4 and Exit A on this forecourt, without an intervening carriageway.',
         barriers='Victoria Street separates this stop from 01059. No Victoria Street or Rochor Road crossing is enabled. Do not substitute stop 01112.'),
]


def point(nodes, id):
    return {'lat': nodes[id]['lat'], 'lon': nodes[id]['lon'], 'osmNodeId': id}


links = []
for spec in curations:
    nodes, ways = maps[spec['area']]
    stop = point(nodes, spec['busNode'])
    trace = [stop]
    details = []
    for i, (wid, ids) in enumerate(spec['segments']):
        way = ways[wid]
        indices = [way['nodeIds'].index(n) for n in ids]
        assert all(abs(a - b) == 1 for a, b in zip(indices, indices[1:])), (wid, ids)
        assert way['tags'].get('highway') in ['footway', 'cycleway']
        if way['tags']['highway'] == 'cycleway':
            assert way['tags'].get('foot') == 'designated'
        assert not way['tags'].get('tunnel') and way['tags'].get('access') not in ['no', 'private']
        points = [point(nodes, n) for n in ids]
        if i == 0 and spec['busNode'] != ids[0]:
            if spec['busStopId'] in ['81111', '81119']:
                # Reviewed point on the specified first shelter-side path segment.
                # This interpolation only locates that manually selected segment.
                a, b = points[0], points[1]
                fraction = ((stop['lat']-a['lat'])*(b['lat']-a['lat']) + (stop['lon']-a['lon'])*(b['lon']-a['lon'])) / ((b['lat']-a['lat'])**2 + (b['lon']-a['lon'])**2)
                assert 0 <= fraction <= 1
                anchor = {'lat': round(a['lat']+fraction*(b['lat']-a['lat']), 9),
                          'lon': round(a['lon']+fraction*(b['lon']-a['lon']), 9), 'osmWayId': wid,
                          'onSegmentBetweenNodeIds': ids[:2]}
                trace.append(anchor)
                points = points[1:]
            else:
                trace.append(points[0])
                points = points[1:]
        for p in points:
            if trace[-1].get('osmNodeId') != p['osmNodeId']:
                trace.append(p)
        details.append(dict(way, selectedNodeIds=ids,
                            url='https://www.openstreetmap.org/way/' + wid))
    assert trace[-1]['osmNodeId'] == spec['threshold']
    length = sum(distance(a, b) for a, b in zip(trace, trace[1:]))
    discrepancy = distance(stop, bus_stops[spec['busStopId']])
    allowance_distance = math.ceil((length + discrepancy) / 10) * 10
    seconds = math.ceil(allowance_distance / 1.2 / 30) * 30 + 30
    platform_connector = 0 if spec['busStopId'] == '01059' else distance(trace[0], trace[1])
    links.append({
        'id': spec['id'], 'enabled': True, 'busStopId': spec['busStopId'],
        'railStationId': spec['railStationId'], 'railPlatformIds': spec['railPlatformIds'],
        'entrance': spec['exit'], 'entranceId': spec['entranceId'],
        'entranceName': ('Paya Lebar' if spec['area'] == 'paya-lebar' else 'Bugis') + ' Exit ' + spec['exit'],
        'directionality': 'bidirectional', 'evidenceLevel': 'map-supported', 'fieldSurveyed': False,
        'accessibility': 'unknown', 'externalDistanceMeters': allowance_distance,
        'externalSeconds': seconds, 'railAllowanceSeconds': 120,
        'railAllowanceBasis': 'Existing estimated access/exit allowance, once per bus-rail transition. Exterior path excludes indoor travel. Other rail line requires the existing reviewed interchange transfer.',
        'sourceIds': ['smrt-' + spec['area'], 'osm-' + spec['area']],
        'sourceUrl': sources[0 if spec['area'] == 'paya-lebar' else 1]['url'],
        'sourceUrls': [sources[0 if spec['area'] == 'paya-lebar' else 1]['url']] + [w['url'] for w in details],
        'description': ' '.join(spec['instructions']),
        'source': {'type': 'operator-locality-map-plus-curated-pedestrian-ways',
                   'reviewedAt': '2026-09-18', 'provenance': 'data/bus/walking-links.json#sources',
                   'reviewFile': 'data/bus/walking-evidence/path-review.html#' + spec['id']},
        'distanceAssumptions': {'tracedMeters': round(length, 2),
                                'busMarkerDiscrepancyMeters': round(discrepancy, 2),
                                'basis': 'Polyline trace plus full DataMall-versus-OSM stop-marker separation, rounded up to 10 m. The extra separation is position uncertainty allowance, not an invented pedestrian link.',
                                'speedMetersPerSecond': 1.2, 'orientationSeconds': 30,
                                'roundingSeconds': 30, 'measuredOnFoot': False},
        'path': {'waypoints': trace, 'mappedWays': details,
                 'busPlatformOsmNodeId': spec['busNode'], 'entranceOsmNodeId': spec['entranceNode'],
                 'exteriorThresholdOsmNodeId': spec['threshold'], 'stationBuildingOsmWayId': spec['buildingWay'],
                 'boardingForecourtConnectorMeters': round(platform_connector, 2),
                 'boardingForecourtReview': spec['connectorReview'],
                 'instructions': spec['instructions'], 'reverseInstructions': 'Follow the same exterior path in reverse; verify the exact five-digit boarding stop.',
                 'crossings': [], 'barriersReview': spec['barriers']},
        'limitations': ['Map-supported only; no field survey or current closure inspection.',
                        'Indoor route, stairs, escalators, lift operation, tactile guidance and step-free access are unverified.',
                        'Map entrance symbols and DataMall markers are not surveyed doorway or boarding positions.',
                        'Walking time is an assumption, not an operator guarantee.'],
    })

result = {'schemaVersion': 1, 'version': '2026-09-18.1', 'reviewDate': '2026-09-18', 'timezone': 'Asia/Singapore',
          'coverage': 'Four individually reviewed, bidirectional exterior bus-stop to rail-entrance links at Paya Lebar and Bugis. No Tampines walking link or opposite-side stop shortcut.',
          'sources': sources, 'links': links,
          'excluded': [
              {'id': 'tampines-bus-rail', 'reason': 'Interchange indoor pedestrian route, boarding-berth access and corresponding rail entrance not validated; no edge enabled.'},
              {'id': 'different-stop-bus-bus', 'reason': 'No additional cross-stop pedestrian connection validated. A same-stop service change does not license walking to an opposite-direction stop.'},
              {'id': 'newton-tampines-bukit-panjang-tap-out', 'reason': 'Phase 2 omitted rail tap-out connections remain omitted; this ledger enables no rail-to-rail exterior edge.'}],
          'routingContract': {'walkSecondsPerBusRailTransition': 'externalSeconds + railAllowanceSeconds, counted once',
                              'walkBudget': 'Count both exterior time and the indoor allowance.',
                              'platformRestriction': 'Use only railPlatformIds. Do not expand to every platform sharing railStationId.',
                              'noStationShortcut': 'Do not chain bus-rail and rail-bus exterior links through a station without a rail ride.',
                              'noLiveAccessClaim': 'Rail operating calendars constrain train use; current entrance opening or lift availability is not verified.'}}
(ROOT / 'data/bus/walking-links.json').write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
(ROOT / 'public/data/walking-links.json').write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')

# Standalone review diagrams show source geometry; they do not alter the operator
# maps. The original JPEGs are displayed below them for independent comparison.
cards = []
for link, spec in zip(links, curations):
    nodes, ways = maps[spec['area']]
    pts = link['path']['waypoints']
    lon0 = sum(p['lon'] for p in pts) / len(pts)
    lat0 = sum(p['lat'] for p in pts) / len(pts)
    coord = lambda p: ((p['lon'] - lon0) * 111195 * math.cos(math.radians(lat0)), (p['lat'] - lat0) * 111195)
    xy = [coord(p) for p in pts]
    # Fixed real-world scale in both dimensions, sufficient room for labels.
    extent = max(max(abs(x) for x, _ in xy), max(abs(y) for _, y in xy)) + 35
    scale = 580 / (extent * 2)
    pix = lambda p: (320 + coord(p)[0] * scale, 320 - coord(p)[1] * scale)
    points_attr = lambda ps: ' '.join(f'{x:.2f},{y:.2f}' for x, y in map(pix, ps))
    shapes = []
    for way in ways.values():
        ps = [nodes[n] for n in way['nodeIds']]
        if not any(abs(coord(p)[0]) < extent and abs(coord(p)[1]) < extent for p in ps):
            continue
        tags = way['tags']
        if tags.get('building'):
            shapes.append(f'<polygon points="{points_attr(ps)}" fill="#edf0f3" stroke="#a6b1bf" stroke-width="1"/>')
        if tags.get('barrier'):
            shapes.append(f'<polyline points="{points_attr(ps)}" fill="none" stroke="#c0392b" stroke-width="3"/>')
        highway = tags.get('highway')
        if highway:
            walk = highway in ['footway', 'pedestrian', 'steps'] or (highway == 'cycleway' and tags.get('foot') == 'designated')
            color, width = ('#27996b', 3) if walk else ('#bdc5cd', 6)
            shapes.append(f'<polyline points="{points_attr(ps)}" fill="none" stroke="{color}" stroke-width="{width}"/>')
    path = pts[1:] if link['path']['boardingForecourtConnectorMeters'] else pts
    shapes.append(f'<polyline points="{points_attr(path)}" fill="none" stroke="#7628bf" stroke-width="7" stroke-linejoin="round"/>')
    if link['path']['boardingForecourtConnectorMeters']:
        shapes.append(f'<polyline points="{points_attr(pts[:2])}" fill="none" stroke="#7628bf" stroke-width="7" stroke-dasharray="4 4"/>')
    for p, label, delta in [(pts[0], link['busStopId'], -18), (pts[-1], 'Exit '+link['entrance']+' threshold', 27)]:
        x, y = pix(p)
        shapes.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="7" fill="white" stroke="#7628bf" stroke-width="4"/>')
        shapes.append(f'<text x="{x:.1f}" y="{y+delta:.1f}" text-anchor="middle" paint-order="stroke" stroke="white" stroke-width="4" fill="#331652" font-size="18" font-weight="bold">{label}</text>')
    shapes.append(f'<path d="M30 590 h{10*scale:.1f}" stroke="#223" stroke-width="3"/><text x="30" y="617" font-size="17">10 metres</text><text x="592" y="45" font-size="22">N ↑</text>')
    svg = '<svg role="img" aria-label="Reviewed exterior path, north up" viewBox="0 0 640 640">' + ''.join(shapes) + '</svg>'
    steps = ''.join('<li>'+html.escape(s)+'</li>' for s in link['path']['instructions'])
    waylinks = ', '.join(f'<a href="{w["url"]}">{w["id"]} v{w["version"]}</a>' for w in link['path']['mappedWays'])
    cards.append(f'''<section id="{link['id']}"><h2>{link['busStopId']} ↔ {link['entranceName']}</h2>
    <div class="grid"><div>{svg}<p class="legend">Green: mapped pedestrian ways. Purple: reviewed path. Purple dots: explicitly reviewed platform connector. Gray: source building/road geometry. Red: mapped barriers.</p></div>
    <div><p><b>{link['externalDistanceMeters']} m / {link['externalSeconds']} s exterior allowance</b>, plus the separate 120 s indoor estimate.</p><ol>{steps}</ol>
    <p>{html.escape(link['path']['barriersReview'])}</p><p><b>Boarding connection:</b> {html.escape(link['path']['boardingForecourtReview'])}</p>
    <p>Source way(s): {waylinks}. Raw trace {link['distanceAssumptions']['tracedMeters']} m; stop-position uncertainty allowance {link['distanceAssumptions']['busMarkerDiscrepancyMeters']} m. Map-supported; no field survey.</p>
    <p>Indoor path and accessibility unknown. The source maps are dated; current obstructions or facility operation are unverified.</p></div></div></section>''')
review = '''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Phase 3 walking path evidence</title>
<style>body{font:16px/1.55 system-ui,sans-serif;color:#172432;max-width:1180px;margin:40px auto;padding:0 24px;background:#fafbfc}h1,h2{line-height:1.2}section{background:white;padding:28px;margin:28px 0;border:1px solid #d7dee7;border-radius:14px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:28px}svg{width:100%;border:1px solid #e0e5ea;background:white}.legend{font-size:13px;color:#4a5664}img{max-width:100%;height:auto}a{color:#244eaa}@media(max-width:760px){.grid{grid-template-columns:1fr}}</style>
<h1>Four reviewed exterior walking links</h1><p>Review date: 18 September 2026. These diagrams render the pinned <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors / ODbL</a> source geometry and the exact curated polyline. They show map-supported connectivity, not a field survey or turn-by-turn accessibility guarantee. Original SMRT/LTA locality maps below confirm entrance identity and road side.</p>'''+''.join(cards)+'''
<section><h2>Original operator locality maps</h2><p>SMRT's page template dates these maps to February 2021. Current retrieval is not a new map revision. Exact stop identities are cross-checked against the September 2026 DataMall import and OSM way versions.</p><div class="grid"><div><h3>Paya Lebar</h3><a href="smrt-paya-lebar-map.jpg"><img alt="Original SMRT/LTA Paya Lebar locality map" src="smrt-paya-lebar-map.jpg"></a></div><div><h3>Bugis</h3><a href="smrt-bugis-map.jpg"><img alt="Original SMRT/LTA Bugis locality map" src="smrt-bugis-map.jpg"></a></div></div></section></html>'''
(DIR / 'path-review.html').write_text(review, encoding='utf-8')
print(json.dumps([{'id': l['id'], 'traceMeters': l['distanceAssumptions']['tracedMeters'], 'budgetMeters': l['externalDistanceMeters'], 'externalSeconds': l['externalSeconds'], 'forecourtConnectorMeters': l['path']['boardingForecourtConnectorMeters']} for l in links], indent=2))
