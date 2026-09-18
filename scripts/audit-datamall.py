"""Phase 0 read-only smoke audit. Never persist credentials, raw feeds or signed URLs.

Install audit-requirements.txt separately; no application dependency is added.
Run with --prompt in a local terminal, or use an existing process LTA_ACCOUNT_KEY.
"""
import argparse
import csv
import datetime as dt
import getpass
import hashlib
import io
import ipaddress
import json
import os
from pathlib import Path
import re
import socket
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'test-results' / 'audit-deps'))
BASE = 'https://datamall2.mytransport.sg/ltaodataservice/'
LIMIT = 32 * 1024 * 1024
UTC = dt.timezone.utc
SGT = dt.timezone(dt.timedelta(hours=8))
TIME_FIELDS = {'CreatedDate', 'StartTime', 'EndTime', 'Date', 'Start', 'EstimatedArrival'}


def now():
    return dt.datetime.now(UTC).isoformat()


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None  # Never forward an AccountKey or follow an unreviewed redirect.


def read_url(url, key=None):
    headers = {'Accept': 'application/json' if key else '*/*'}
    if key:
        headers['AccountKey'] = key
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.build_opener(NoRedirect()).open(req, timeout=25) as response:
        data = response.read(LIMIT + 1)
        if len(data) > LIMIT:
            raise ValueError('Response exceeds audit byte limit')
        meta = {'httpStatus': response.status, 'bytes': len(data),
                'contentType': response.headers.get('Content-Type'),
                'httpDate': response.headers.get('Date'),
                'lastModified': response.headers.get('Last-Modified')}
        return data, meta


def shape(value, depth=0):
    if depth > 5:
        return type(value).__name__
    if isinstance(value, dict):
        return {str(k)[:80]: shape(v, depth + 1) for k, v in list(value.items())[:40]}
    if isinstance(value, list):
        return {'type': 'array', 'count': len(value), 'firstItem': shape(value[0], depth + 1) if value else None}
    return type(value).__name__


def time_samples(value, found=None):
    found = {} if found is None else found
    if isinstance(value, dict):
        for k, v in value.items():
            if k in TIME_FIELDS and isinstance(v, str) and re.fullmatch(r'[0-9T :+.Z-]{8,35}', v):
                found.setdefault(k, set()).add(v)
            elif isinstance(v, (list, dict)):
                time_samples(v, found)
    elif isinstance(value, list):
        for item in value:
            time_samples(item, found)
    return found


def rows(payload):
    v = payload.get('value') if isinstance(payload, dict) else None
    return v if isinstance(v, list) else []


def contract_check(path, payload):
    """Representative structure check only; neither freshness nor exhaustive schema conformance."""
    if not isinstance(payload, dict) or any(k.lower() in ('error', 'errors', 'errorcode') for k in payload):
        return 'FAIL', 'Not a documented feed envelope'
    endpoint = path.split('?')[0]
    if endpoint.startswith('GTFS'):
        return ('PASS', 'Download link present; contents require separate validation') if download_link(payload) else ('NOT TESTED', 'No download link in this response')
    if endpoint == 'TrainServiceAlerts':
        value = payload.get('value')
        valid = isinstance(value, dict) and type(value.get('Status')) is int and value['Status'] in (1, 2)
        return ('PASS', 'Status envelope matches current adapter') if valid else ('FAIL', 'Status envelope does not match current adapter')
    if endpoint == 'v3/BusArrival':
        if not isinstance(payload.get('BusStopCode'), str) or not isinstance(payload.get('Services'), list):
            return 'FAIL', 'Missing stop/services envelope'
        samples = payload['Services']
        required = {'ServiceNo', 'Operator', 'NextBus', 'NextBus2', 'NextBus3'}
    else:
        if not isinstance(payload.get('value'), list):
            return 'FAIL', 'Expected collection wrapper is absent; inspect updated provider contract'
        samples = payload['value']
        required = {'BusStops': {'BusStopCode', 'RoadName', 'Description', 'Latitude', 'Longitude'},
                    'BusServices': {'ServiceNo', 'Operator', 'Direction'},
                    'BusRoutes': {'ServiceNo', 'Direction', 'StopSequence', 'BusStopCode'},
                    'PCDRealTime': {'Station', 'StartTime', 'EndTime', 'CrowdLevel'},
                    'PCDForecast': {'Date', 'Stations'}}.get(endpoint, set())
    if not samples:
        return 'NOT TESTED', 'Empty collection; no representative record'
    valid = all(isinstance(s, dict) and required <= s.keys() for s in samples[:5])
    return ('PASS', 'Required keys present in up to five records; full semantics unverified') if valid else ('FAIL', 'Representative keys differ from expected contract')


def download_link(payload):
    if isinstance(payload, dict):
        if isinstance(payload.get('Link'), str):
            return payload['Link']
        for v in payload.values():
            link = download_link(v)
            if link:
                return link
    if isinstance(payload, list):
        for item in payload:
            link = download_link(item)
            if link:
                return link
    return None


def safe_download(link):
    url = urllib.parse.urlsplit(link)
    if url.scheme != 'https' or not url.hostname or url.username or url.password or url.port not in (None, 443):
        raise ValueError('Unsafe download destination')
    addresses = socket.getaddrinfo(url.hostname, 443)
    if not addresses or any(not ipaddress.ip_address(a[4][0]).is_global for a in addresses):
        raise ValueError('Download destination is not public')
    return read_url(link)  # No DataMall credential is sent to the download host.


def schedule_summary(data):
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        if sum(i.file_size for i in archive.infolist()) > 256 * 1024 * 1024:
            raise ValueError('Expanded archive exceeds audit limit')
        members = {Path(i.filename).name: i for i in archive.infolist() if i.filename.endswith('.txt')}
        required = {'agency.txt', 'routes.txt', 'stops.txt', 'trips.txt', 'stop_times.txt'}
        if not required <= members.keys() or not {'calendar.txt', 'calendar_dates.txt'} & members.keys():
            raise ValueError('Required GTFS tables missing')
        def records(name):
            if name not in members:
                return iter(())
            return csv.DictReader(io.TextIOWrapper(archive.open(members[name]), encoding='utf-8-sig'))
        agency = list(records('agency.txt'))
        routes_data = list(records('routes.txt'))
        stops = list(records('stops.txt'))
        trips = list(records('trips.txt'))
        calendars = list(records('calendar.txt'))
        exceptions = list(records('calendar_dates.txt'))
        required_headers = {'agency.txt': {'agency_timezone'}, 'routes.txt': {'route_id'},
                            'stops.txt': {'stop_id', 'stop_name'}, 'trips.txt': {'trip_id', 'service_id', 'route_id'},
                            'stop_times.txt': {'trip_id', 'stop_id', 'stop_sequence', 'arrival_time', 'departure_time'}}
        if 'calendar.txt' in members:
            required_headers['calendar.txt'] = {'service_id', 'start_date', 'end_date', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'}
        if 'calendar_dates.txt' in members:
            required_headers['calendar_dates.txt'] = {'service_id', 'date', 'exception_type'}
        for name, headers in required_headers.items():
            if not headers <= set(records(name).fieldnames or []):
                raise ValueError('GTFS required headers missing')
        if not agency or not routes_data or not stops or not trips:
            raise ValueError('Required GTFS tables are empty')
        today = dt.datetime.now(SGT).strftime('%Y%m%d')
        weekday = dt.datetime.now(SGT).strftime('%A').lower()
        active = {c['service_id'] for c in calendars if c.get(weekday) == '1' and c.get('start_date', '') <= today <= c.get('end_date', '')}
        for c in exceptions:
            if c.get('date') == today:
                if c.get('exception_type') == '1': active.add(c['service_id'])
                if c.get('exception_type') == '2': active.discard(c['service_id'])
        trip_ids = {t['trip_id'] for t in trips}
        stop_ids = {s['stop_id'] for s in stops}
        counts = {'rows': 0, 'orphanTrips': 0, 'orphanStops': 0, 'timesBeyond24Hours': 0}
        for s in records('stop_times.txt'):
            counts['rows'] += 1
            counts['orphanTrips'] += s.get('trip_id') not in trip_ids
            counts['orphanStops'] += s.get('stop_id') not in stop_ids
            counts['timesBeyond24Hours'] += any(v and v.split(':')[0].isdigit() and int(v.split(':')[0]) >= 24 for v in (s.get('arrival_time'), s.get('departure_time')))
        names = ('Tampines', 'Paya Lebar', 'Bugis', 'Promenade')
        return {'files': sorted(members), 'timezones': sorted({a.get('agency_timezone', '') for a in agency}),
                'routeCount': len(routes_data), 'tripCount': len(trips), 'stopCount': len(stops),
                'routeNames': sorted({r.get('route_short_name', '') for r in routes_data}),
                'calendarRows': len(calendars), 'calendarDateRows': len(exceptions),
                'calendarStart': min((c.get('start_date', '') for c in calendars), default=None),
                'calendarEnd': max((c.get('end_date', '') for c in calendars), default=None),
                'exceptionStart': min((c.get('date', '') for c in exceptions), default=None),
                'exceptionEnd': max((c.get('date', '') for c in exceptions), default=None),
                'evaluatedSingaporeDate': today, 'activeServiceCount': len(active),
                'activeTripCount': sum(t.get('service_id') in active for t in trips),
                'namedStationMatches': {name: sum(name.casefold() in s.get('stop_name', '').casefold() for s in stops) for name in names},
                'stopTimes': counts,
                'limits': 'Name matching is not a verified corridor/transfer mapping; counts do not prove a routable trip.'}, trip_ids, stop_ids


def realtime_summary(data, trip_ids, stop_ids):
    from google.transit import gtfs_realtime_pb2
    feed = gtfs_realtime_pb2.FeedMessage()
    feed.ParseFromString(data)
    if not feed.IsInitialized():
        raise ValueError('Missing required protobuf fields')
    updates = [e.trip_update for e in feed.entity if e.HasField('trip_update')]
    timestamp = feed.header.timestamp if feed.header.HasField('timestamp') else None
    return {'protobufInitialized': True, 'gtfsRealtimeVersion': feed.header.gtfs_realtime_version,
            'incrementality': int(feed.header.incrementality), 'headerTimestampUnix': timestamp,
            'headerAgeSeconds': round(time.time() - timestamp) if timestamp else None,
            'entityCount': len(feed.entity), 'tripUpdateCount': len(updates),
            'alertCount': sum(e.HasField('alert') for e in feed.entity),
            'vehicleCount': sum(e.HasField('vehicle') for e in feed.entity),
            'tripIdsMatchedToSchedule': sum(u.trip.trip_id in trip_ids for u in updates) if trip_ids else None,
            'tripUpdatesWithTimestamp': sum(u.HasField('timestamp') for u in updates),
            'stopTimeUpdateCount': sum(len(u.stop_time_update) for u in updates),
            'explicitStopIdsMatched': sum(s.stop_id in stop_ids for u in updates for s in u.stop_time_update if s.HasField('stop_id')) if stop_ids else None,
            'scheduleRelationships': sorted({int(u.trip.schedule_relationship) for u in updates}),
            'limits': 'A bounded snapshot; empty or missing updates do not establish on-time or network-wide service.'}


def run(key):
    report = {'auditVersion': 2, 'startedAt': now(), 'mode': 'authenticated-live-smoke' if key else 'blocked-no-credential',
              'rawPayloadsRetained': False, 'signedUrlsRetained': False, 'requests': [],
              'limits': 'Small samples, not an exhaustive directory or continuous service validation.'}
    if not key:
        report['status'] = 'BLOCKED'
        return report
    trip_ids, stop_ids = set(), set()
    bus_stop = None
    paths = ['TrainServiceAlerts', 'GTFSScheduleTrain', 'GTFSRealTimeTrainServiceAlerts', 'GTFSRealtimeTrainTripUpdates']
    paths += [f'{endpoint}?TrainLine={line}' for endpoint in ('PCDRealTime', 'PCDForecast') for line in ('EWL', 'CCL', 'DTL')]
    paths += [f'{endpoint}?$skip={skip}' for endpoint in ('BusStops', 'BusRoutes', 'BusServices') for skip in (0, 500)]
    paths += ['v3/BusArrival']
    auth_failed = False
    for path in paths:
        if auth_failed:
            report['requests'].append({'endpoint': path, 'status': 'BLOCKED', 'reason': 'Stopped after authentication rejection; this feed not attempted'})
            continue
        if path == 'v3/BusArrival':
            if not bus_stop:
                report['requests'].append({'endpoint': path, 'status': 'BLOCKED', 'reason': 'No stop identifier from the stop directory'})
                continue
            path += '?BusStopCode=' + urllib.parse.quote(bus_stop)
        entry = {'endpoint': path, 'retrievedAt': now()}
        stage = 'api'
        report['requests'].append(entry)
        print('Checking ' + path.split('?')[0], flush=True)
        try:
            data, meta = read_url(BASE + path, key)
            entry.update(meta)
            payload = json.loads(data)
            entry['shape'] = shape(payload)
            entry['sourceTimeSamples'] = {k: {'min': min(v), 'max': max(v), 'count': len(v)} for k, v in time_samples(payload).items()}
            entry['records'] = len(rows(payload))
            entry['httpReachable'] = True
            entry['contractStatus'], entry['contractReason'] = contract_check(path, payload)
            entry['status'] = 'ACCESSIBLE' if entry['contractStatus'] == 'PASS' else 'UNVERIFIED'
            if path.startswith('BusStops'):
                values = rows(payload)
                bus_stop = bus_stop or next((str(s['BusStopCode']) for s in values if s.get('BusStopCode')), None)
                entry['stopIdentifierTypes'] = sorted({type(s.get('BusStopCode')).__name__ for s in values})
            if path.startswith('TrainServiceAlerts'):
                value = payload.get('value')
                entry['existingAdapterAcceptsStatusShape'] = isinstance(value, dict) and type(value.get('Status')) is int and value['Status'] in (1, 2)
            if path.startswith('v3/BusArrival'):
                services = payload.get('Services', [])
                entry['serviceCount'] = len(services)
                entry['populatedArrivalSlots'] = sum(bool(s.get(n, {}).get('EstimatedArrival')) for s in services for n in ('NextBus', 'NextBus2', 'NextBus3'))
                entry['monitoredValues'] = sorted({str(s.get(n, {}).get('Monitored')) for s in services for n in ('NextBus', 'NextBus2', 'NextBus3')})
            if path.startswith('GTFS'):
                link = download_link(payload)
                if not link:
                    entry['downloadStatus'] = 'UNAVAILABLE_NO_LINK'
                else:
                    stage = 'download'
                    blob, detail = safe_download(link)
                    entry['download'] = {**detail, 'sha256': hashlib.sha256(blob).hexdigest()}
                    if path == 'GTFSScheduleTrain':
                        entry['schedule'], trip_ids, stop_ids = schedule_summary(blob)
                    else:
                        entry['realtime'] = realtime_summary(blob, trip_ids, stop_ids)
                    entry['downloadStatus'] = 'PARSED'
        except urllib.error.HTTPError as exc:
            if stage == 'api':
                entry['status'] = 'UNAVAILABLE'
                entry['httpStatus'] = exc.code
                auth_failed = exc.code in (401, 403)
            else:
                entry['downloadStatus'] = 'UNAVAILABLE'
                entry['downloadHttpStatus'] = exc.code
            entry['reason'] = 'HTTP request rejected; response body and URL omitted'
        except Exception as exc:
            entry['status' if stage == 'api' else 'downloadStatus'] = 'UNVERIFIED'
            entry['reason'] = type(exc).__name__  # Exception text may contain signed URLs.
        time.sleep(1)  # Small sequential audit; no polling loop or retries.
    report['finishedAt'] = now()
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--prompt', action='store_true')
    parser.add_argument('--output', default='test-results/phase0/datamall-smoke.json')
    args = parser.parse_args()
    if args.prompt and not sys.stdin.isatty():
        parser.error('Masked entry requires a real local terminal; refusing non-terminal input')
    key = getpass.getpass('DataMall API Access Key (hidden; use replacement of exposed key): ') if args.prompt else os.environ.get('LTA_ACCOUNT_KEY', '')
    try:
        report = run(key.strip())
        output = ROOT / args.output
        output.parent.mkdir(parents=True, exist_ok=True)
        text = json.dumps(report, indent=2)
        if key.strip():
            text = text.replace(key.strip(), '[REDACTED]')
        output.write_text(text + '\n', encoding='utf-8')
        print('Sanitised audit saved to ' + str(output), flush=True)
    finally:
        key = None


if __name__ == '__main__':
    main()
