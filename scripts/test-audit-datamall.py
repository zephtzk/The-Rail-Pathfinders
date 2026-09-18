"""Local synthetic checks for the audit tool; these never demonstrate live access."""
import importlib.util
import io
import json
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('audit', Path(__file__).with_name('audit-datamall.py'))
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)


class AuditTests(unittest.TestCase):
    def test_missing_key_does_not_request_network(self):
        with patch.object(audit, 'read_url', side_effect=AssertionError('network')):
            self.assertEqual(audit.run('')['status'], 'BLOCKED')

    def test_shape_retains_types_not_credentials_or_locations(self):
        payload = {'AccountKey': 'synthetic-secret', 'Latitude': '1.23', 'Link': 'https://example.com/?signature=private'}
        summary = str(audit.shape(payload))
        for secret in ('synthetic-secret', '1.23', 'signature=private'):
            self.assertNotIn(secret, summary)

    def test_rejects_unsafe_download_schemes_and_private_hosts(self):
        for url in ('http://example.com/feed', 'https://user:password@example.com/feed', 'file:///feed'):
            with self.assertRaises(ValueError): audit.safe_download(url)
        with patch.object(audit.socket, 'getaddrinfo', return_value=[(None, None, None, None, ('127.0.0.1', 443))]):
            with self.assertRaises(ValueError): audit.safe_download('https://example.com/feed')

    def test_download_never_receives_api_key(self):
        with patch.object(audit.socket, 'getaddrinfo', return_value=[(None, None, None, None, ('8.8.8.8', 443))]), patch.object(audit, 'read_url', return_value=(b'x', {})) as read:
            audit.safe_download('https://example.com/feed')
            read.assert_called_once_with('https://example.com/feed')

    def test_timestamp_capture_excludes_free_text(self):
        found = audit.time_samples({'CreatedDate': '2026-09-18 12:00:00', 'timestamp': '2026-09-18T12:00:00Z', 'Message': 'private', 'Date': 'private'})
        self.assertEqual(found, {'CreatedDate': {'2026-09-18 12:00:00'}, 'timestamp': {'2026-09-18T12:00:00Z'}})

    def test_gtfs_link_casing_and_invalid_values(self):
        for field in ('link', 'Link'):
            payload = {'value': [{'timestamp': '2026-09-18T12:00:00Z', field: 'https://example.com/feed'}]}
            self.assertEqual(audit.download_link(payload), 'https://example.com/feed')
            self.assertEqual(audit.contract_check('GTFSScheduleTrain', payload)[0], 'PASS')
        for value in ('', '  ', None, 42):
            payload = {'value': [{'link': value}]}
            self.assertIsNone(audit.download_link(payload))
            self.assertEqual(audit.contract_check('GTFSScheduleTrain', payload)[0], 'NOT TESTED')

    def test_gtfs_only_attempts_downloads_without_retaining_urls(self):
        # Synthetic values reproduce the observed lowercase envelope, not live data.
        link = 'https://example.com/feed?signature=synthetic-only'
        payload = json.dumps({'value': [{'timestamp': '2026-09-18T12:00:00Z', 'link': link}]}).encode()
        with patch.object(audit, 'read_url', return_value=(payload, {'httpStatus': 200})) as read, \
             patch.object(audit, 'safe_download', return_value=(b'synthetic', {'httpStatus': 200})) as download, \
             patch.object(audit, 'schedule_summary', return_value=({}, {'trip'}, {'stop'})), \
             patch.object(audit, 'realtime_summary', return_value={}), \
             patch.object(audit.time, 'sleep'), patch('builtins.print'):
            result = audit.run('synthetic-test-only', gtfs_only=True)
        self.assertEqual([r['endpoint'] for r in result['requests']], [
            'GTFSScheduleTrain', 'GTFSRealTimeTrainServiceAlerts', 'GTFSRealtimeTrainTripUpdates'])
        self.assertEqual(read.call_count, 3)
        self.assertEqual(download.call_count, 3)
        self.assertTrue(all(r['downloadStatus'] == 'PARSED' for r in result['requests']))
        self.assertNotIn(link, json.dumps(result))
        self.assertNotIn('synthetic-test-only', json.dumps(result))

    def test_gtfs_metadata_success_is_separate_from_download_failure(self):
        payload = json.dumps({'value': [{'link': 'https://example.com/feed'}]}).encode()
        error = audit.urllib.error.HTTPError('https://example.com/feed', 403, 'Forbidden', {}, None)
        with patch.object(audit, 'read_url', return_value=(payload, {'httpStatus': 200})), \
             patch.object(audit, 'safe_download', side_effect=error), \
             patch.object(audit.time, 'sleep'), patch('builtins.print'):
            result = audit.run('synthetic-test-only', gtfs_only=True)
        self.assertEqual(len(result['requests']), 3)
        self.assertTrue(all(r['httpStatus'] == 200 and r['contractStatus'] == 'PASS' and
                            r['downloadStatus'] == 'UNAVAILABLE' and r['downloadHttpStatus'] == 403
                            for r in result['requests']))

    def test_http_200_error_is_not_a_valid_feed(self):
        self.assertEqual(audit.contract_check('TrainServiceAlerts', {'error': 'invalid account'})[0], 'FAIL')
        self.assertEqual(audit.contract_check('BusStops', {'value': []})[0], 'NOT TESTED')
        self.assertEqual(audit.contract_check('TrainServiceAlerts', {'value': {'Status': '1'}})[0], 'FAIL')

    def test_empty_zip_is_not_gtfs(self):
        stream = io.BytesIO()
        with zipfile.ZipFile(stream, 'w'): pass
        with self.assertRaises(ValueError): audit.schedule_summary(stream.getvalue())

    def test_authentication_failure_stops_remaining_requests(self):
        error = audit.urllib.error.HTTPError(audit.BASE, 401, 'Unauthorized', {}, None)
        with patch.object(audit, 'read_url', side_effect=error) as read, patch.object(audit.time, 'sleep'), patch('builtins.print'):
            result = audit.run('synthetic-test-only')
        self.assertEqual(read.call_count, 1)
        self.assertEqual(result['requests'][0]['httpStatus'], 401)
        self.assertTrue(all(r['status'] == 'BLOCKED' for r in result['requests'][1:]))

    def test_schedule_dates_joins_and_extended_times_are_separate(self):
        stream = io.BytesIO()
        with zipfile.ZipFile(stream, 'w') as z:
            z.writestr('agency.txt', 'agency_timezone\nAsia/Singapore\n')
            z.writestr('routes.txt', 'route_id,route_short_name\nr,EWL\n')
            z.writestr('stops.txt', 'stop_id,stop_name\ns,Tampines\n')
            z.writestr('trips.txt', 'trip_id,service_id,route_id\nt,svc,r\n')
            z.writestr('calendar_dates.txt', 'service_id,date,exception_type\nsvc,20000101,1\n')
            z.writestr('stop_times.txt', 'trip_id,stop_id,stop_sequence,arrival_time,departure_time\nt,s,1,25:01:00,25:01:00\nmissing,unknown,2,10:00:00,10:00:00\n')
        result, trips, stops = audit.schedule_summary(stream.getvalue())
        self.assertEqual(result['activeTripCount'], 0)
        self.assertEqual(result['stopTimes'], {'rows': 2, 'orphanTrips': 1, 'orphanStops': 1, 'timesBeyond24Hours': 1})
        self.assertEqual(trips, {'t'})
        self.assertEqual(stops, {'s'})

    def test_malformed_calendar_is_not_zero_service_evidence(self):
        stream = io.BytesIO()
        with zipfile.ZipFile(stream, 'w') as z:
            z.writestr('agency.txt', 'agency_timezone\nAsia/Singapore\n')
            z.writestr('routes.txt', 'route_id\nr\n')
            z.writestr('stops.txt', 'stop_id,stop_name\ns,Bugis\n')
            z.writestr('trips.txt', 'trip_id,service_id,route_id\nt,svc,r\n')
            z.writestr('stop_times.txt', 'trip_id,stop_id,stop_sequence,arrival_time,departure_time\nt,s,1,10:00:00,10:00:00\n')
            z.writestr('calendar_dates.txt', 'service_id,wrong_date,exception_type\nsvc,20260919,1\n')
        with self.assertRaisesRegex(ValueError, 'headers'):
            audit.schedule_summary(stream.getvalue())


if __name__ == '__main__':
    unittest.main()
