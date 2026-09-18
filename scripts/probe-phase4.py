"""Bounded real metadata evidence; credential inherited only, payloads not saved."""
import importlib.util
import json
import os
from pathlib import Path
import hashlib
import csv
import io
import zipfile

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('audit', ROOT / 'scripts/audit-datamall.py')
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)
from google.transit import gtfs_realtime_pb2

def observed(message, name):
    if name not in message.DESCRIPTOR.fields_by_name:
        return {'schemaSupported': False, 'present': None, 'value': None}
    present = message.HasField(name)
    value = getattr(message, name) if present else None
    return {'schemaSupported': True, 'present': present, 'value': value[:120] if isinstance(value, str) else value}

def descriptor(trip):
    return {n: observed(trip, n) for n in ('trip_id', 'route_id', 'direction_id', 'start_date', 'start_time', 'schedule_relationship')}

def intervals(alert, name):
    if name not in alert.DESCRIPTOR.fields_by_name:
        return {'schemaSupported': False}
    return {'schemaSupported': True, 'count': len(getattr(alert, name)), 'samples': [{n: observed(v, n) for n in ('start', 'end')} for v in getattr(alert, name)[:5]]}

key = os.environ.get('LTA_ACCOUNT_KEY', '').strip()
if not key:
    raise SystemExit('Credential unavailable')
archive = (ROOT / 'data/rail/sources/lta-train-2026-09-18.zip').read_bytes()
with zipfile.ZipFile(io.BytesIO(archive)) as z:
    info = next((n for n in z.namelist() if n.endswith('feed_info.txt')), None)
    feed_info = list(csv.DictReader(io.TextIOWrapper(z.open(info), encoding='utf-8-sig'))) if info else []
report = {'recordedAt': audit.now(), 'evidenceClass': 'real-provider bounded sample', 'maxRequests': 4,
          'scheduleSha256': hashlib.sha256(archive).hexdigest(), 'scheduleFeedVersions': [r.get('feed_version') for r in feed_info], 'feeds': []}
for endpoint in ('GTFSRealTimeTrainServiceAlerts', 'GTFSRealtimeTrainTripUpdates'):
    item = {'endpoint': endpoint}
    try:
        body, metadata = audit.read_url(audit.BASE + endpoint, key)
        data, download = audit.safe_download(audit.download_link(json.loads(body)))
        feed = gtfs_realtime_pb2.FeedMessage()
        feed.ParseFromString(data)
        if not feed.IsInitialized():
            raise ValueError('Uninitialized')
        updates = [e.trip_update for e in feed.entity if e.HasField('trip_update')]
        alerts = [e.alert for e in feed.entity if e.HasField('alert')]
        item.update(status='PASS', envelope=metadata, download=download, retrievedAt=audit.now(),
                    header={n: observed(feed.header, n) for n in ('timestamp', 'feed_version', 'incrementality')},
                    entities=len(feed.entity), alertCount=len(alerts), tripUpdateCount=len(updates),
                    nonemptyTripMapping='NOT TESTED' if not updates else 'UNVERIFIED',
                    tripSamples=[{'trip': descriptor(u.trip), 'sourceTimestamp': observed(u, 'timestamp'), 'stopCount': len(u.stop_time_update)} for u in updates[:5]],
                    alertSamples=[{'effect': observed(a, 'effect'), 'active': intervals(a, 'active_period'), 'communication': intervals(a, 'communication_period'), 'impact': intervals(a, 'impact_period'), 'selectors': [{**{n: observed(s, n) for n in ('route_id', 'direction_id', 'stop_id')}, 'trip': descriptor(s.trip) if s.HasField('trip') else None} for s in a.informed_entity[:5]]} for a in alerts[:5]])
    except Exception as error:
        item.update(status='BLOCKED', errorType=type(error).__name__)
    report['feeds'].append(item)
out = ROOT / 'docs/evidence/phase4/gtfs-real.json'
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(json.dumps(report, indent=2).replace(key, '[redacted]') + '\n', encoding='utf-8')
print(json.dumps({'status': 'recorded', 'feeds': [{'endpoint': f['endpoint'], 'status': f['status'], 'entities': f.get('entities')} for f in report['feeds']]}))
