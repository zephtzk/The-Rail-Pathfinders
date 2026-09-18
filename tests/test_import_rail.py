"""Independent tiny GTFS fixtures exercise the strict importer, without network I/O."""

import copy
import csv
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
import zipfile


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("import_rail", ROOT / "scripts" / "import-rail.py")
rail = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(rail)


def make_zip(tables):
    result = io.BytesIO()
    with zipfile.ZipFile(result, "w", zipfile.ZIP_DEFLATED) as archive:
        for name, rows in tables.items():
            fields = list(dict.fromkeys(key for row in rows for key in row))
            output = io.StringIO(newline="")
            writer = csv.DictWriter(output, fieldnames=fields)
            writer.writeheader()
            writer.writerows(rows)
            info = zipfile.ZipInfo(name, (2026, 9, 18, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(info, output.getvalue().encode("utf-8"))
    return result.getvalue()


def fixture():
    tables = {
        "agency.txt": [{"agency_id": "OP", "agency_name": "Fixture operator", "agency_timezone": "Asia/Singapore"}],
        "routes.txt": [{"route_id": route, "route_type": "1", "agency_id": "OP", "route_short_name": route, "route_color": "123ABC"}
                       for route in ("R1", "R2")],
        "trips.txt": [
            {"trip_id": "T1", "route_id": "R1", "service_id": "S", "direction_id": "0", "trip_headsign": "Bravo"},
            {"trip_id": "T2", "route_id": "R2", "service_id": "S", "direction_id": "1", "trip_headsign": "Charlie"},
        ],
        "calendar.txt": [{"service_id": "S", **{day: "1" for day in ("monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday")},
                          "start_date": "20260917", "end_date": "20260920"}],
        "calendar_dates.txt": [{"service_id": "S", "date": "20260919", "exception_type": "2"},
                               {"service_id": "S", "date": "20260921", "exception_type": "1"}],
        "stops.txt": [
            {"stop_id": key, "stop_name": name, "stop_lat": lat, "stop_lon": "103.8", "location_type": "1", "parent_station": ""}
            for key, name, lat in (("A", "Alpha", "1.3"), ("B", "Bravo", "1.31"), ("C", "Charlie", "1.32"))
        ] + [
            {"stop_id": key, "stop_name": name, "stop_lat": lat, "stop_lon": "103.8", "location_type": "0", "parent_station": parent}
            for key, name, lat, parent in (("A1", "Alpha platform", "1.3", "A"), ("B1", "Bravo north", "1.31", "B"),
                                          ("B2", "Bravo east", "1.31", "B"), ("C1", "Charlie platform", "1.32", "C"))
        ],
        "stop_times.txt": [
            {"trip_id": trip, "stop_id": stop, "stop_sequence": seq, "arrival_time": arrive, "departure_time": depart,
             "pickup_type": "0", "drop_off_type": "0", "timepoint": "1"}
            for trip, stop, seq, arrive, depart in (
                ("T1", "A1", "10", "23:50:00", "23:51:00"), ("T1", "B1", "20", "24:00:00", "24:00:30"),
                ("T2", "B2", "1", "24:03:00", "24:03:00"), ("T2", "C1", "2", "24:10:00", "24:10:00"))
        ],
    }
    metadata = {"publisher": "Reference fixture", "sourceUrl": "https://example.org/fixture.zip", "retrievedAt": "2026-09-18", "version": "fixture-1"}
    rules = {"schemaVersion": 1, "timeZone": "Asia/Singapore", "includeRouteIds": ["R1", "R2"], "excludedRoutes": {},
             "assumptions": {"accessSeconds": 120, "exitSeconds": 120},
             "transfers": [{"fromStopId": "B1", "toStopId": "B2", "seconds": 120, "walkSeconds": 120,
                            "provenance": "Independent reference network: connected platforms", "assumed": True}]}
    return tables, metadata, rules


class ImportRailTests(unittest.TestCase):
    def setUp(self):
        self.tables, self.metadata, self.rules = fixture()

    def compile(self):
        return rail.compile_network(make_zip(self.tables), self.metadata, self.rules)

    def test_deterministic_identifiers_dwell_after_midnight_and_manifest(self):
        network, manifest = self.compile()
        repeated_network, repeated_manifest = self.compile()
        self.assertEqual(rail.encoded(network), rail.encoded(repeated_network))
        self.assertEqual(rail.encoded(manifest), rail.encoded(repeated_manifest))
        self.assertEqual(network["trips"][0]["stopTimes"], [["A1", 85800, 85860, True, True], ["B1", 86400, 86430, True, True]])
        self.assertEqual(network["trips"][1]["directionId"], 1)
        self.assertEqual(network["stations"][1]["stopIds"], ["B1", "B2"])
        self.assertEqual(network["coverage"], {"startDate": "2026-09-17", "endDate": "2026-09-21"})
        self.assertEqual(manifest["counts"]["raw"]["stop_times.txt"], 4)
        self.assertEqual(manifest["counts"]["included"]["stops"], 4)
        self.assertEqual(manifest["services"][0]["activeDateCount"], 4)
        self.assertEqual(manifest["sizes"]["networkBytes"], len(rail.encoded(network)))
        self.assertEqual(manifest["source"]["archiveSha256"], rail.digest(make_zip(self.tables)))

    def test_reviewed_query_dates_preserve_prior_service_day_carryover(self):
        self.rules.update(validationStartDate="2026-09-18", validationEndDate="2026-09-20")
        network, manifest = self.compile()
        self.assertEqual(network["coverage"], {"startDate": "2026-09-18", "endDate": "2026-09-20"})
        self.assertEqual(network["services"][0]["startDate"], "2026-09-17")
        self.assertTrue(network["services"][0]["exceptions"]["2026-09-21"])
        self.assertEqual(manifest["services"][0]["activeDateCount"], 2)
        self.assertEqual(manifest["services"][0]["sourceActiveDateCount"], 4)
        self.assertEqual(manifest["routes"][0]["startDate"], "2026-09-18")

    def test_transfer_connections_never_inferred_from_parents_or_coordinates(self):
        self.rules["transfers"] = []
        network, _ = self.compile()
        self.assertEqual(network["transfers"], [])
        self.assertEqual(network["stations"][1]["stopIds"], ["B1", "B2"])

    def test_explicit_same_platform_reboarding_can_have_zero_walking(self):
        self.rules["transfers"].append({"fromStopId": "B1", "toStopId": "B1", "seconds": 60, "walkSeconds": 0,
                                       "provenance": "Stay at identical scheduled platform", "assumed": True})
        network, _ = self.compile()
        self.assertEqual(network["transfers"][0]["walkSeconds"], 0)

    def test_source_checksum_and_size_are_pinned(self):
        self.metadata["sha256"] = "0" * 64
        with self.assertRaisesRegex(rail.ImportError, "pinned metadata SHA"):
            self.compile()
        del self.metadata["sha256"]
        self.metadata["bytes"] = 1
        with self.assertRaisesRegex(rail.ImportError, "size does not match"):
            self.compile()

    def test_output_changes_when_rules_or_metadata_change(self):
        _, before = self.compile()
        self.rules["transfers"][0]["seconds"] = 180
        _, after = self.compile()
        self.assertNotEqual(before["buildId"], after["buildId"])
        self.metadata["version"] = "fixture-2"
        _, newer = self.compile()
        self.assertNotEqual(after["buildId"], newer["buildId"])

    def test_weekdays_sunday_zero_and_calendar_exceptions(self):
        row = self.tables["calendar.txt"][0]
        for day in ("monday", "tuesday", "wednesday", "thursday", "saturday", "sunday"):
            row[day] = "0"
        network, manifest = self.compile()
        self.assertEqual(network["services"][0]["weekdays"], [5])
        self.assertEqual(manifest["services"][0]["activeDateCount"], 2)  # Friday plus exception Monday.
        row["sunday"] = "1"
        network, _ = self.compile()
        self.assertEqual(network["services"][0]["weekdays"], [0, 5])

    def test_calendar_dates_only_service_is_supported(self):
        del self.tables["calendar.txt"]
        network, manifest = self.compile()
        self.assertEqual(network["services"][0]["weekdays"], [])
        self.assertEqual(network["coverage"], {"startDate": "2026-09-21", "endDate": "2026-09-21"})
        self.assertEqual(manifest["counts"]["raw"]["calendar.txt"], 0)

    def test_repeated_loop_stops_and_unsorted_rows_are_valid(self):
        self.tables["stop_times.txt"].append({**self.tables["stop_times.txt"][0], "stop_sequence": "30", "arrival_time": "24:15:00", "departure_time": "24:16:00"})
        self.tables["stop_times.txt"].reverse()
        network, _ = self.compile()
        self.assertEqual([stop[0] for stop in network["trips"][0]["stopTimes"]], ["A1", "B1", "A1"])

    def test_pickup_and_dropoff_restrictions_remain_explicit(self):
        self.tables["stop_times.txt"][0]["pickup_type"] = "1"
        self.tables["stop_times.txt"][1]["drop_off_type"] = "1"
        network, _ = self.compile()
        self.assertFalse(network["trips"][0]["stopTimes"][0][3])
        self.assertFalse(network["trips"][0]["stopTimes"][1][4])

    def test_approximate_source_times_are_disclosed(self):
        self.tables["stop_times.txt"][0]["timepoint"] = "0"
        _, manifest = self.compile()
        self.assertEqual(manifest["completeness"]["approximateStopTimes"], 1)
        self.assertTrue(any("timepoint=0" in item for item in manifest["completeness"]["limitations"]))

    def test_nonrail_excluded_and_unserved_entrance_explained(self):
        self.tables["routes.txt"].append({"route_id": "BUS", "route_type": "3", "agency_id": "OP"})
        self.tables["stops.txt"].append({"stop_id": "ENTRANCE", "location_type": "2", "parent_station": "A", "stop_name": "Alpha exit"})
        _, manifest = self.compile()
        self.assertEqual(manifest["completeness"]["excludedRoutes"][0]["reason"], "Non-rail GTFS route_type 3")
        self.assertIn("entrance", manifest["completeness"]["excludedStops"][0]["reason"].lower())

    def test_rail_exclusion_requires_reason_and_missing_route_is_rejected(self):
        self.rules["includeRouteIds"] = ["R1"]
        with self.assertRaisesRegex(rail.ImportError, "explicit reason"):
            self.compile()
        self.rules["excludedRoutes"]["R2"] = "Not reviewed"
        self.rules["transfers"] = []
        network, manifest = self.compile()
        self.assertEqual(len(network["trips"]), 1)
        self.assertEqual(manifest["completeness"]["excludedRoutes"][0]["reason"], "Not reviewed")
        self.rules["includeRouteIds"].append("MISSING")
        with self.assertRaisesRegex(rail.ImportError, "missing route_id"):
            self.compile()

    def test_bad_schedule_values_fail_without_interpolation(self):
        changes = [
            ("arrival_time", "", "interpolation"), ("arrival_time", "24:61:00", "invalid time"),
            ("arrival_time", "48:00:00", ">= 48"), ("departure_time", "23:40:00", "precedes arrival"),
            ("pickup_type", "2", "on-demand"), ("drop_off_type", "3", "on-demand"),
            ("continuous_pickup", "0", "continuous"), ("location_group_id", "FLEX", "flexible service"),
            ("stop_id", "MISSING", "unknown stop_id"), ("stop_sequence", "-1", "nonnegative integer"),
        ]
        for field, value, message in changes:
            with self.subTest(field=field, value=value):
                original = copy.deepcopy(self.tables)
                self.tables["stop_times.txt"][0][field] = value
                with self.assertRaisesRegex(rail.ImportError, message):
                    self.compile()
                self.tables = original

    def test_duplicate_sequence_or_backward_time_fails(self):
        self.tables["stop_times.txt"][1]["stop_sequence"] = "10"
        with self.assertRaisesRegex(rail.ImportError, "duplicate stop_sequence"):
            self.compile()
        self.tables["stop_times.txt"][1]["stop_sequence"] = "20"
        self.tables["stop_times.txt"][1].update(arrival_time="23:40:00", departure_time="23:40:00")
        with self.assertRaisesRegex(rail.ImportError, "go backwards"):
            self.compile()

    def test_missing_direction_service_parent_and_timezone_fail(self):
        cases = [("trips.txt", 0, "direction_id", "", "direction_id"),
                 ("trips.txt", 0, "service_id", "MISSING", "no calendar"),
                 ("stops.txt", 3, "parent_station", "MISSING", "missing parent_station"),
                 ("stops.txt", 3, "parent_station", "B1", "not a station"),
                 ("agency.txt", 0, "agency_timezone", "UTC", "timezone")]
        for table, index, field, value, message in cases:
            with self.subTest(field=field):
                original = copy.deepcopy(self.tables)
                self.tables[table][index][field] = value
                with self.assertRaisesRegex(rail.ImportError, message):
                    self.compile()
                self.tables = original

    def test_conflicting_calendar_dates_fail(self):
        self.tables["calendar_dates.txt"].append({"service_id": "S", "date": "20260919", "exception_type": "1"})
        with self.assertRaisesRegex(rail.ImportError, "duplicate/conflicting"):
            self.compile()

    def test_frequency_service_fails_instead_of_inventing_departures(self):
        self.tables["frequencies.txt"] = [{"trip_id": "T1", "start_time": "05:00:00", "end_time": "23:00:00", "headway_secs": "180"}]
        with self.assertRaisesRegex(rail.ImportError, "frequency-based"):
            self.compile()

    def test_unreviewed_and_impossible_transfer_rules_fail(self):
        cases = [("provenance", "", "provenance"), ("assumed", False, "assumed allowance"),
                 ("walkSeconds", 121, "walking exceeds"), ("walkSeconds", 0, "positive walking"),
                 ("seconds", 0, "must be >= 1"), ("toStopId", "MISSING", "outside validated")]
        for field, value, message in cases:
            with self.subTest(field=field):
                original = copy.deepcopy(self.rules)
                self.rules["transfers"][0][field] = value
                with self.assertRaisesRegex(rail.ImportError, message):
                    self.compile()
                self.rules = original

    def test_source_prohibition_blocks_reviewed_transfer(self):
        self.tables["transfers.txt"] = [{"from_stop_id": "B1", "to_stop_id": "B2", "transfer_type": "3"}]
        with self.assertRaisesRegex(rail.ImportError, "GTFS prohibits"):
            self.compile()

    def test_source_minimum_transfer_time_cannot_be_shortened(self):
        self.tables["transfers.txt"] = [{"from_stop_id": "B1", "to_stop_id": "B2", "transfer_type": "2", "min_transfer_time": "180"}]
        with self.assertRaisesRegex(rail.ImportError, "below source min_transfer_time"):
            self.compile()

    def test_station_level_source_transfer_restrictions_cover_child_platforms(self):
        self.tables["transfers.txt"] = [{"from_stop_id": "B", "to_stop_id": "B", "transfer_type": "2", "min_transfer_time": "180"}]
        with self.assertRaisesRegex(rail.ImportError, "below source min_transfer_time"):
            self.compile()
        self.tables["transfers.txt"][0]["transfer_type"] = "3"
        with self.assertRaisesRegex(rail.ImportError, "GTFS prohibits"):
            self.compile()

    def test_scoped_and_guaranteed_transfers_are_rejected(self):
        cases = [
            ({"from_stop_id": "B1", "to_stop_id": "B2", "transfer_type": "2", "min_transfer_time": "120", "from_route_id": "R1"}, "Route/trip-specific"),
            ({"from_trip_id": "T1", "to_trip_id": "T2", "transfer_type": "2", "min_transfer_time": "120"}, "Route/trip-specific"),
            ({"from_trip_id": "T1", "to_trip_id": "T2", "transfer_type": "4"}, "In-seat"),
            ({"from_stop_id": "B1", "to_stop_id": "B2", "transfer_type": "1"}, "Guaranteed/timed"),
        ]
        for row, message in cases:
            with self.subTest(row=row):
                self.tables["transfers.txt"] = [row]
                with self.assertRaisesRegex(rail.ImportError, message):
                    self.compile()

    def test_two_hop_walk_cannot_bypass_source_transfer_restrictions(self):
        template = self.rules["transfers"][0]
        self.rules["transfers"] = [
            {**template, "seconds": 180},
            {**template, "toStopId": "A1", "seconds": 30, "walkSeconds": 30},
            {**template, "fromStopId": "A1", "seconds": 30, "walkSeconds": 30},
        ]
        self.tables["transfers.txt"] = [{"from_stop_id": "B1", "to_stop_id": "B2", "transfer_type": "2", "min_transfer_time": "180"}]
        with self.assertRaisesRegex(rail.ImportError, "transfer-only path is below"):
            self.compile()
        self.rules["transfers"] = self.rules["transfers"][1:]
        self.tables["transfers.txt"][0]["transfer_type"] = "3"
        with self.assertRaisesRegex(rail.ImportError, "transfer-only path bypasses"):
            self.compile()

    def test_source_self_transfer_constraint_requires_a_nonempty_path(self):
        template = {**self.rules["transfers"][0], "toStopId": "B1", "seconds": 60, "walkSeconds": 0}
        self.rules["transfers"] = [template]
        self.tables["transfers.txt"] = [{"from_stop_id": "B1", "to_stop_id": "B1", "transfer_type": "2", "min_transfer_time": "60"}]
        self.compile()  # A zero-edge path must not incorrectly violate the minimum.
        self.rules["transfers"] = [
            {**template, "seconds": 180},
            {**template, "toStopId": "A1", "seconds": 30, "walkSeconds": 30},
            {**template, "fromStopId": "A1", "seconds": 30, "walkSeconds": 30},
        ]
        self.tables["transfers.txt"][0]["min_transfer_time"] = "120"
        with self.assertRaisesRegex(rail.ImportError, "transfer-only path is below"):
            self.compile()

    def test_zero_second_ride_requires_explicit_whole_trip_quarantine(self):
        broken_trip = {**self.tables["trips.txt"][0], "trip_id": "BROKEN"}
        self.tables["trips.txt"].append(broken_trip)
        self.tables["stop_times.txt"].extend([
            {**self.tables["stop_times.txt"][0], "trip_id": "BROKEN"},
            {**self.tables["stop_times.txt"][1], "trip_id": "BROKEN", "arrival_time": "23:51:00", "departure_time": "23:51:00"},
        ])
        with self.assertRaisesRegex(rail.ImportError, "zero-second ride"):
            self.compile()
        self.rules["excludedTrips"] = {"BROKEN": "Zero-second source ride A1 to B1: quarantined, no interpolation"}
        network, manifest = self.compile()
        self.assertEqual([trip["id"] for trip in network["trips"]], ["T1", "T2"])
        self.assertEqual(manifest["counts"]["raw"]["stop_times.txt"], 6)
        self.assertEqual(manifest["counts"]["excluded"], {"routes": 0, "stops": 0, "trips": 1, "stopTimes": 2})
        self.assertEqual(manifest["completeness"]["excludedTrips"][0]["id"], "BROKEN")

    def test_cli_is_reproducible_and_failed_import_does_not_replace_outputs(self):
        with tempfile.TemporaryDirectory() as temp:
            folder = Path(temp)
            source, metadata, rules, output, manifest = [folder / name for name in ("source.zip", "source.json", "rules.json", "network.json", "manifest.json")]
            source.write_bytes(make_zip(self.tables))
            metadata.write_bytes(rail.encoded(self.metadata))
            rules.write_bytes(rail.encoded(self.rules))
            args = ["--source", str(source), "--metadata", str(metadata), "--rules", str(rules), "--output", str(output), "--manifest", str(manifest)]
            self.assertEqual(rail.main(args), 0)
            old_network, old_manifest = output.read_bytes(), manifest.read_bytes()
            self.assertEqual(rail.main(args), 0)
            self.assertEqual((output.read_bytes(), manifest.read_bytes()), (old_network, old_manifest))
            source.write_bytes(b"not a ZIP")
            self.assertEqual(rail.main(args), 1)
            self.assertEqual((output.read_bytes(), manifest.read_bytes()), (old_network, old_manifest))


if __name__ == "__main__":
    unittest.main()
