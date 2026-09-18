"""Independent integrity/topology/arithmetic checks for the curated walking ledger.
This cannot replace the map review, a field survey, or current facilities checks.
"""
from pathlib import Path
import hashlib
import json
import math
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
read = lambda path: json.loads((ROOT / path).read_text(encoding='utf-8'))
ledger = read('data/bus/walking-links.json')
assert (ROOT / 'data/bus/walking-links.json').read_bytes() == (ROOT / 'public/data/walking-links.json').read_bytes()
bus = {s['id']: s for s in read('public/data/bus-network.json')['stops']}
rail = {s['id']: s for s in read('public/data/rail-network.json')['stops']}
sources = {s['id']: s for s in ledger['sources']}
maps = {}
for source in sources.values():
    raw = (ROOT / source['file']).read_bytes()
    assert hashlib.sha256(raw).hexdigest() == source['sha256'], source['id']
    if source['file'].endswith('.osm'):
        root = ET.fromstring(raw)
        nodes = {n.get('id'): {'lat': float(n.get('lat')), 'lon': float(n.get('lon')),
                             'tags': {t.get('k'): t.get('v') for t in n.findall('tag')}} for n in root.findall('node')}
        ways = {w.get('id'): {'nodeIds': [n.get('ref') for n in w.findall('nd')],
                            'tags': {t.get('k'): t.get('v') for t in w.findall('tag')},
                            'version': int(w.get('version'))} for w in root.findall('way')}
        maps[source['id']] = nodes, ways


def metres(a, b):
    y1, y2, dx = map(math.radians, [a['lat'], b['lat'], b['lon'] - a['lon']])
    v = math.sin((y2-y1)/2)**2 + math.cos(y1)*math.cos(y2)*math.sin(dx/2)**2
    return 12742000 * math.asin(math.sqrt(v))


checks = []
for link in ledger['links']:
    assert link['busStopId'] in bus and len(link['busStopId']) == 5
    assert link['enabled'] and link['directionality'] == 'bidirectional'
    assert link['railAllowanceSeconds'] == 120
    assert link['fieldSurveyed'] is False and link['accessibility'] == 'unknown'
    assert len(link['railPlatformIds']) == 2
    for platform in link['railPlatformIds']:
        assert rail[platform]['stationId'] == link['railStationId']
        assert platform in {'CC9_A', 'CC9_B', 'EW12_A', 'EW12_B'}
    nodes, ways = maps[next(s for s in link['sourceIds'] if s.startswith('osm-'))]
    path = link['path']
    assert nodes[path['busPlatformOsmNodeId']]['tags']['ref'] == link['busStopId']
    assert nodes[path['entranceOsmNodeId']]['tags']['ref'] == link['entrance']
    points = path['waypoints']
    assert points[0]['osmNodeId'] == path['busPlatformOsmNodeId']
    assert points[-1]['osmNodeId'] == path['exteriorThresholdOsmNodeId']
    accepted = {}
    for evidence in path['mappedWays']:
        way = ways[evidence['id']]
        assert evidence['version'] == way['version']
        assert evidence['tags'] == way['tags']
        tags = way['tags']
        assert tags.get('highway') == 'footway' or (tags.get('highway') == 'cycleway' and tags.get('foot') == 'designated')
        assert tags.get('foot') not in ['no', 'private'] and tags.get('access') not in ['no', 'private']
        assert tags.get('oneway:foot', 'no') == 'no' and tags.get('oneway', 'no') == 'no'
        assert tags.get('tunnel', 'no') == 'no' and tags.get('footway') != 'crossing'
        idx = [way['nodeIds'].index(n) for n in evidence['selectedNodeIds']]
        assert all(abs(a-b) == 1 for a, b in zip(idx, idx[1:]))
        accepted[evidence['id']] = way
    for p in points:
        if 'osmNodeId' in p:
            assert metres(p, nodes[p['osmNodeId']]) < 0.01
        else:
            assert p['osmWayId'] in accepted
            a, b = [nodes[n] for n in p['onSegmentBetweenNodeIds']]
            assert abs(metres(a, p) + metres(p, b) - metres(a, b)) < 0.01
    for i, (a, b) in enumerate(zip(points, points[1:])):
        if i == 0 and path['boardingForecourtConnectorMeters']:
            assert metres(a, b) < 10 and path['boardingForecourtReview']
            assert abs(metres(a, b) - path['boardingForecourtConnectorMeters']) < 0.01
            continue
        if 'osmWayId' in a:
            assert b['osmNodeId'] in a['onSegmentBetweenNodeIds']
        else:
            assert any(a['osmNodeId'] in w['nodeIds'] and b['osmNodeId'] in w['nodeIds']
                       and abs(w['nodeIds'].index(a['osmNodeId'])-w['nodeIds'].index(b['osmNodeId'])) == 1
                       for w in accepted.values()), (link['id'], a, b)
    threshold = path['exteriorThresholdOsmNodeId']
    assert threshold in ways[path['stationBuildingOsmWayId']]['nodeIds'] or any(
        w['nodeIds'][0] == threshold and w['tags'].get('tunnel') == 'yes' for w in ways.values())
    length = sum(metres(a, b) for a, b in zip(points, points[1:]))
    marker_error = metres(points[0], bus[link['busStopId']])
    assert abs(length-link['distanceAssumptions']['tracedMeters']) < 0.01
    assert abs(marker_error-link['distanceAssumptions']['busMarkerDiscrepancyMeters']) < 0.01
    assert link['externalDistanceMeters'] == math.ceil((length+marker_error)/10)*10
    assert link['externalSeconds'] == math.ceil(link['externalDistanceMeters']/1.2/30)*30+30
    checks.append({'id': link['id'], 'status': 'PASS', 'exteriorDistanceMeters': link['externalDistanceMeters'],
                   'exteriorSeconds': link['externalSeconds'], 'indoorAllowanceSeconds': 120,
                   'totalTransitionSeconds': link['externalSeconds'] + 120,
                   'curatedMappedWayCount': len(accepted), 'forecourtConnectorMeters': path['boardingForecourtConnectorMeters']})
assert len(checks) == 4 and len({l['id'] for l in ledger['links']}) == 4
report = {'status': 'PASS', 'ledgerVersion': ledger['version'], 'checkKind': 'Pinned-source integrity, source-way continuity and independent distance/time arithmetic; not field verification',
          'ledgerSha256': hashlib.sha256((ROOT / 'data/bus/walking-links.json').read_bytes()).hexdigest(),
          'checks': checks, 'notTested': ['Physical path survey', 'Current closures', 'Indoor access route', 'Step-free accessibility and lift operation']}
out = ROOT / 'docs/evidence/phase3/walking-validation.json'
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(json.dumps(report, indent=2)+'\n', encoding='utf-8')
print(json.dumps(report, indent=2))
