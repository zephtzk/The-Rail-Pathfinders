#!/usr/bin/env python3
"""Compile a pinned GTFS archive and reviewed rail rules, using only the stdlib.

This deliberately implements a strict, scheduled rail subset of GTFS. Unsupported
operational semantics fail the import instead of being converted to invented
times or interchange paths. Output bytes are reproducible from the four inputs
(archive, metadata, rules, and this versioned importer).
"""

from __future__ import annotations

import argparse
import csv
from collections import Counter, defaultdict
from datetime import date, timedelta
import gzip
import hashlib
import heapq
import io
import json
import math
from pathlib import Path
import re
import sys
import zipfile


VERSION = "2.0.0"
SCHEMA_VERSION = 1
RAIL_TYPES = {0, 1, 2, 12} | set(range(100, 118)) | set(range(400, 406)) | set(range(900, 907))
MAX_GTFS_SECONDS = 48 * 3600 - 1
MAX_CALENDAR_DAYS = 3660


class ImportError(ValueError):
    """An input is inconsistent or outside the supported routing contract."""


def require(condition, message):
    if not condition:
        raise ImportError(message)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def encoded(value):
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n").encode("utf-8")


def integer(value, context, minimum=0):
    require(re.fullmatch(r"[0-9]+", str(value)) is not None, f"{context}: expected a nonnegative integer, got {value!r}")
    result = int(value)
    require(result >= minimum, f"{context}: must be >= {minimum}")
    return result


def gtfs_date(value, context):
    require(re.fullmatch(r"[0-9]{8}", value or "") is not None, f"{context}: invalid GTFS date {value!r}")
    try:
        result = date(int(value[:4]), int(value[4:6]), int(value[6:]))
    except ValueError as exc:
        raise ImportError(f"{context}: invalid date {value!r}") from exc
    return result.isoformat()


def gtfs_time(value, context):
    require(re.fullmatch(r"[0-9]{1,2}:[0-9]{2}:[0-9]{2}", value or "") is not None,
            f"{context}: a complete scheduled HH:MM:SS time is required; interpolation is unsupported")
    hours, minutes, seconds = map(int, value.split(":"))
    require(minutes < 60 and seconds < 60, f"{context}: invalid time {value!r}")
    result = hours * 3600 + minutes * 60 + seconds
    require(result <= MAX_GTFS_SECONDS, f"{context}: times >= 48:00:00 are unsupported")
    return result


def coordinate(value, context, limit):
    try:
        result = float(value)
    except (ValueError, TypeError) as exc:
        raise ImportError(f"{context}: a numeric coordinate is required") from exc
    require(math.isfinite(result) and -limit <= result <= limit, f"{context}: invalid coordinate")
    return result


def unique(rows, key, filename):
    result = {}
    for row in rows:
        identifier = row.get(key, "")
        require(identifier, f"{filename}: missing {key}")
        require(identifier not in result, f"{filename}: duplicate {key} {identifier!r}")
        result[identifier] = row
    return result


class Archive:
    def __init__(self, content):
        try:
            self.zip = zipfile.ZipFile(io.BytesIO(content))
        except zipfile.BadZipFile as exc:
            raise ImportError("Source is not a readable ZIP archive") from exc
        self.members = {}
        self.counts = {}
        total = 0
        for info in self.zip.infolist():
            if info.is_dir():
                continue
            name = Path(info.filename.replace("\\", "/")).name
            require(name not in self.members, f"Archive has duplicate basename {name!r}")
            require(not info.flag_bits & 1, "Encrypted archives are unsupported")
            total += info.file_size
            require(total <= 2 * 1024 ** 3, "Archive exceeds the 2 GiB uncompressed safety limit")
            self.members[name] = info

    def rows(self, name, required=False):
        if name not in self.members:
            require(not required, f"Missing required GTFS file {name}")
            self.counts[name] = 0
            return
        count = 0
        with self.zip.open(self.members[name]) as raw:
            with io.TextIOWrapper(raw, encoding="utf-8-sig", newline="") as stream:
                reader = csv.DictReader(stream)
                require(reader.fieldnames is not None, f"{name}: missing header")
                require(len(reader.fieldnames) == len(set(reader.fieldnames)), f"{name}: duplicate CSV header")
                for row in reader:
                    count += 1
                    require(None not in row and all(value is not None for value in row.values()), f"{name}:{count + 1}: malformed CSV row")
                    yield {key: value.strip() for key, value in row.items()}
        self.counts[name] = count


def active_dates(service):
    start, end = date.fromisoformat(service["startDate"]), date.fromisoformat(service["endDate"])
    require(0 <= (end - start).days <= MAX_CALENDAR_DAYS, f"Service {service['id']}: unsupported calendar span")
    result = set()
    current = start
    while current <= end:
        if (current.weekday() + 1) % 7 in service["weekdays"]:
            result.add(current.isoformat())
        current += timedelta(days=1)
    for day, added in service["exceptions"].items():
        if added:
            result.add(day)
        else:
            result.discard(day)
    return sorted(result)


def compile_network(source_bytes, metadata, rules, *, metadata_bytes=None, rules_bytes=None):
    require(isinstance(metadata, dict) and isinstance(rules, dict), "Metadata and rules must be JSON objects")
    require(rules.get("schemaVersion") == 1, "Rules schemaVersion must be 1")
    require(rules.get("timeZone") == "Asia/Singapore", "Only Asia/Singapore is validated by this importer version")
    for field in ("sourceUrl", "publisher", "retrievedAt", "version"):
        require(isinstance(metadata.get(field), str) and metadata[field].strip(), f"Source metadata requires {field}")
    require(metadata["sourceUrl"].startswith("https://"), "Source metadata sourceUrl must use HTTPS")
    if metadata.get("sha256"):
        require(metadata["sha256"] == digest(source_bytes), "Source archive does not match the pinned metadata SHA-256")
    if metadata.get("bytes") is not None:
        require(metadata["bytes"] == len(source_bytes), "Source archive size does not match pinned metadata")
    try:
        date.fromisoformat(metadata["retrievedAt"][:10])
    except ValueError as exc:
        raise ImportError("Source metadata retrievedAt must begin with an ISO date") from exc
    archive = Archive(source_bytes)
    agencies = list(archive.rows("agency.txt", True))
    require(agencies, "agency.txt is empty")
    agency_by_id = {}
    for agency in agencies:
        key = agency.get("agency_id", "")
        require(key not in agency_by_id, "agency.txt: duplicate agency_id")
        agency_by_id[key] = agency
    routes_raw = unique(archive.rows("routes.txt", True), "route_id", "routes.txt")
    selected_ids = rules.get("includeRouteIds")
    require(isinstance(selected_ids, list) and selected_ids and all(isinstance(x, str) and x for x in selected_ids),
            "Rules includeRouteIds must explicitly list validated route IDs")
    require(len(selected_ids) == len(set(selected_ids)), "Rules includeRouteIds contains duplicates")
    require(set(selected_ids) <= routes_raw.keys(), "Rules reference a missing route_id")
    exclusions = rules.get("excludedRoutes", {})
    require(isinstance(exclusions, dict), "Rules excludedRoutes must be an ID-to-reason object")
    excluded_routes = []
    routes = []
    for route_id, row in sorted(routes_raw.items()):
        kind = integer(row.get("route_type", ""), f"Route {route_id} route_type")
        if route_id not in selected_ids:
            reason = exclusions.get(route_id) if kind in RAIL_TYPES else f"Non-rail GTFS route_type {kind}"
            require(isinstance(reason, str) and reason, f"Excluded rail route {route_id} requires an explicit reason")
            excluded_routes.append({"id": route_id, "name": row.get("route_long_name") or row.get("route_short_name") or route_id, "reason": reason})
            continue
        require(kind in RAIL_TYPES, f"Included route {route_id} is not a supported rail type")
        agency_id = row.get("agency_id", "")
        agency = agency_by_id.get(agency_id)
        if agency is None and not agency_id and len(agencies) == 1:
            agency = agencies[0]
        require(agency is not None, f"Route {route_id}: unknown or ambiguous agency_id")
        require(agency.get("agency_timezone") == rules["timeZone"], f"Route {route_id}: agency timezone does not match rules")
        for field in ("continuous_pickup", "continuous_drop_off"):
            require(row.get(field, "") in ("", "1"), f"Route {route_id}: continuous boarding/alighting is unsupported")
        color = row.get("route_color", "")
        require(not color or re.fullmatch(r"[A-Fa-f0-9]{6}", color), f"Route {route_id}: invalid route_color")
        routes.append({"id": route_id, "shortName": row.get("route_short_name") or route_id,
                       "name": row.get("route_long_name") or row.get("route_short_name") or route_id,
                       "color": color.upper() or "64748B"})
    trips_raw = unique(archive.rows("trips.txt", True), "trip_id", "trips.txt")
    selected_trips = {}
    for trip_id, row in trips_raw.items():
        require(row.get("route_id") in routes_raw, f"Trip {trip_id}: unknown route_id")
        if row["route_id"] not in selected_ids:
            continue
        require(row.get("service_id"), f"Trip {trip_id}: missing service_id")
        require(row.get("direction_id") in ("0", "1"), f"Trip {trip_id}: direction_id 0 or 1 is required")
        selected_trips[trip_id] = row
    require(selected_trips, "No trips remain in validated rail coverage")
    excluded_trip_rules = rules.get("excludedTrips", {})
    require(isinstance(excluded_trip_rules, dict), "Rules excludedTrips must be an ID-to-reason object")
    require(set(excluded_trip_rules) <= selected_trips.keys(), "Rules excludedTrips reference trips outside selected rail routes")
    require(all(isinstance(reason, str) and reason.strip() for reason in excluded_trip_rules.values()), "Every quarantined trip needs an explicit reason")
    wanted_services = {row["service_id"] for row in selected_trips.values()}
    calendars_raw = unique(archive.rows("calendar.txt"), "service_id", "calendar.txt")
    exceptions = defaultdict(dict)
    for row in archive.rows("calendar_dates.txt"):
        service_id = row.get("service_id", "")
        require(service_id, "calendar_dates.txt: missing service_id")
        day = gtfs_date(row.get("date", ""), f"Service {service_id}")
        require(row.get("exception_type") in ("1", "2"), f"Service {service_id}: invalid exception_type")
        require(day not in exceptions[service_id], f"Service {service_id}: duplicate/conflicting calendar exception {day}")
        exceptions[service_id][day] = row["exception_type"] == "1"
    weekdays = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]
    services, service_dates, raw_service_bounds = [], {}, {}
    validation_start, validation_end = rules.get("validationStartDate"), rules.get("validationEndDate")
    require(bool(validation_start) == bool(validation_end), "Both validationStartDate and validationEndDate must be supplied together")
    if validation_start:
        try:
            require(date.fromisoformat(validation_start) <= date.fromisoformat(validation_end), "Validation coverage is reversed")
        except ValueError as exc:
            raise ImportError("Validation bounds must be ISO dates") from exc
    for service_id in sorted(wanted_services):
        row = calendars_raw.get(service_id)
        if row is None:
            additions = sorted(day for day, added in exceptions[service_id].items() if added)
            require(additions, f"Service {service_id}: no calendar or added service dates")
            start, end, days = additions[0], additions[-1], []
        else:
            start = gtfs_date(row.get("start_date", ""), f"Service {service_id} start_date")
            end = gtfs_date(row.get("end_date", ""), f"Service {service_id} end_date")
            require(all(row.get(day) in ("0", "1") for day in weekdays), f"Service {service_id}: weekday flags must be 0/1")
            days = [index for index, day in enumerate(weekdays) if row[day] == "1"]
        raw_service_bounds[service_id] = {"startDate": start, "endDate": end, "exceptions": dict(sorted(exceptions[service_id].items()))}
        service = {"id": service_id, "startDate": start, "endDate": end, "weekdays": days,
                   "exceptions": dict(sorted(exceptions[service_id].items()))}
        dates = active_dates(service)
        require(dates, f"Service {service_id}: no active dates after calendar exceptions")
        services.append(service)
        service_dates[service_id] = dates
    for row in archive.rows("frequencies.txt"):
        require(row.get("trip_id") in trips_raw, "frequencies.txt: unknown trip_id")
        require(row["trip_id"] not in selected_trips, f"Trip {row['trip_id']}: frequency-based service is unsupported; scheduled trips are required")
    stops_raw = unique(archive.rows("stops.txt", True), "stop_id", "stops.txt")
    trip_times = defaultdict(list)
    approximate_times = 0
    for row in archive.rows("stop_times.txt", True):
        trip_id = row.get("trip_id", "")
        require(trip_id in trips_raw, f"stop_times.txt: unknown trip_id {trip_id!r}")
        if trip_id not in selected_trips:
            continue
        context = f"Trip {trip_id} stop {row.get('stop_id', '')}"
        require(row.get("stop_id") in stops_raw, f"{context}: unknown stop_id")
        sequence = integer(row.get("stop_sequence", ""), f"{context} stop_sequence")
        arrival = gtfs_time(row.get("arrival_time", ""), f"{context} arrival_time")
        departure = gtfs_time(row.get("departure_time", ""), f"{context} departure_time")
        require(departure >= arrival, f"{context}: departure precedes arrival")
        for field in ("pickup_type", "drop_off_type"):
            require(row.get(field, "") in ("", "0", "1"), f"{context}: on-demand {field} is unsupported")
        for field in ("continuous_pickup", "continuous_drop_off"):
            require(row.get(field, "") in ("", "1"), f"{context}: continuous boarding/alighting is unsupported")
        for field in ("start_pickup_drop_off_window", "end_pickup_drop_off_window", "location_group_id", "location_id", "pickup_booking_rule_id", "drop_off_booking_rule_id"):
            require(not row.get(field), f"{context}: flexible service field {field} is unsupported")
        require(row.get("timepoint", "") in ("", "0", "1"), f"{context}: invalid timepoint")
        approximate_times += row.get("timepoint") == "0"
        trip_times[trip_id].append((sequence, [row["stop_id"], arrival, departure, row.get("pickup_type", "0") != "1", row.get("drop_off_type", "0") != "1"]))
    trips, used_stops, excluded_trips = [], set(), []
    for trip_id, row in sorted(selected_trips.items()):
        ordered = sorted(trip_times[trip_id], key=lambda item: item[0])
        require(len(ordered) >= 2, f"Trip {trip_id}: fewer than two scheduled stops")
        require(len({seq for seq, _ in ordered}) == len(ordered), f"Trip {trip_id}: duplicate stop_sequence")
        times = [item for _, item in ordered]
        for previous, current in zip(times, times[1:]):
            require(current[1] >= previous[2], f"Trip {trip_id}: stop times go backwards")
        if trip_id in excluded_trip_rules:
            excluded_trips.append({"id": trip_id, "routeId": row["route_id"], "serviceId": row["service_id"],
                                   "reason": excluded_trip_rules[trip_id], "stopTimeCount": len(times)})
            continue
        for previous, current in zip(times, times[1:]):
            require(current[1] > previous[2], f"Trip {trip_id}: zero-second ride {previous[0]}->{current[0]}; quarantine explicitly instead of inventing a time")
        used_stops.update(item[0] for item in times)
        trips.append({"id": trip_id, "routeId": row["route_id"], "serviceId": row["service_id"],
                      "directionId": int(row["direction_id"]), "headsign": row.get("trip_headsign", ""), "stopTimes": times})
    station_rows, stops = {}, []
    overrides = rules.get("stopOverrides", {})
    require(isinstance(overrides, dict), "Rules stopOverrides must be an object")
    require(set(overrides) <= used_stops, "Rules stopOverrides references a stop outside validated trips")
    for stop_id in sorted(used_stops):
        row = stops_raw[stop_id]
        require(row.get("location_type", "") in ("", "0"), f"Stop {stop_id}: a scheduled boarding stop must have location_type 0")
        require(row.get("stop_timezone", "") in ("", rules["timeZone"]), f"Stop {stop_id}: timezone differs from validated timezone")
        parent_id = row.get("parent_station", "")
        parent = stops_raw.get(parent_id) if parent_id else None
        if parent_id:
            require(parent is not None, f"Stop {stop_id}: missing parent_station {parent_id}")
            require(parent.get("location_type") == "1", f"Stop {stop_id}: parent_station is not a station")
            require(not parent.get("parent_station"), f"Station {parent_id}: nested station parents are invalid")
        override = overrides.get(stop_id)
        if override:
            require(isinstance(override, dict) and override.get("stationId") and override.get("provenance"), f"Stop {stop_id}: station override requires stationId and provenance")
            station_id = override["stationId"]
            station_name = override.get("name") or (parent or row).get("stop_name")
            station_lat = override.get("lat", (parent or row).get("stop_lat"))
            station_lon = override.get("lon", (parent or row).get("stop_lon"))
        else:
            station_id = parent_id or stop_id
            station_name = (parent or row).get("stop_name")
            station_lat, station_lon = (parent or row).get("stop_lat"), (parent or row).get("stop_lon")
        require(station_name and row.get("stop_name"), f"Stop {stop_id}: stop/station name is required")
        station = {"id": station_id, "name": station_name,
                   "lat": coordinate(station_lat, f"Station {station_id} latitude", 90),
                   "lon": coordinate(station_lon, f"Station {station_id} longitude", 180), "stopIds": []}
        if station_id in station_rows:
            old = station_rows[station_id]
            require(all(old[field] == station[field] for field in ("id", "name", "lat", "lon")), f"Station {station_id}: inconsistent explicit grouping")
        else:
            station_rows[station_id] = station
        station_rows[station_id]["stopIds"].append(stop_id)
        stops.append({"id": stop_id, "stationId": station_id, "name": row["stop_name"],
                      "lat": coordinate(row.get("stop_lat"), f"Stop {stop_id} latitude", 90),
                      "lon": coordinate(row.get("stop_lon"), f"Stop {stop_id} longitude", 180)})
    prohibited_transfers, source_minimum_transfers = set(), {}
    source_transfer_count = 0
    transfer_endpoints = {stop_id: {stop_id} for stop_id in used_stops}
    for stop_id in used_stops:
        parent_id = stops_raw[stop_id].get("parent_station")
        if parent_id:
            transfer_endpoints.setdefault(parent_id, set()).add(stop_id)
    for row in archive.rows("transfers.txt"):
        source_from, source_to = row.get("from_stop_id", ""), row.get("to_stop_id", "")
        from_stops, to_stops = transfer_endpoints.get(source_from, set()), transfer_endpoints.get(source_to, set())
        for field, known_ids in (("from_stop_id", stops_raw), ("to_stop_id", stops_raw),
                                 ("from_route_id", routes_raw), ("to_route_id", routes_raw),
                                 ("from_trip_id", trips_raw), ("to_trip_id", trips_raw)):
            require(not row.get(field) or row[field] in known_ids, f"transfers.txt: unknown {field}")
        relevant = bool(from_stops and to_stops) or any(row.get(field) in selected_trips for field in ("from_trip_id", "to_trip_id")) or any(row.get(field) in selected_ids for field in ("from_route_id", "to_route_id"))
        if not relevant:
            continue
        source_transfer_count += 1
        require(row.get("transfer_type", "0") in ("", "0", "1", "2", "3"), "In-seat GTFS transfers are unsupported")
        require(not any(row.get(field) for field in ("from_route_id", "to_route_id", "from_trip_id", "to_trip_id")), "Route/trip-specific GTFS transfer restrictions are unsupported")
        require(row.get("transfer_type") != "1", "Guaranteed/timed GTFS transfers are unsupported")
        require(from_stops and to_stops, "GTFS transfer has missing or unsupported rail endpoints")
        if row.get("transfer_type") == "3":
            prohibited_transfers.update((start, end) for start in from_stops for end in to_stops)
        if row.get("transfer_type") == "2":
            minimum = integer(row.get("min_transfer_time", ""), "GTFS min_transfer_time")
            for start in from_stops:
                for end in to_stops:
                    key = (start, end)
                    source_minimum_transfers[key] = max(source_minimum_transfers.get(key, 0), minimum)
    transfers, pairs = [], set()
    require(isinstance(rules.get("transfers", []), list), "Rules transfers must be an explicit array")
    for rule in rules.get("transfers", []):
        start, end = rule.get("fromStopId"), rule.get("toStopId")
        require(start in used_stops and end in used_stops, f"Transfer {start}->{end}: stop is outside validated coverage")
        require((start, end) not in pairs, f"Transfer {start}->{end}: duplicate directed connection")
        require((start, end) not in prohibited_transfers, f"Transfer {start}->{end}: GTFS prohibits this connection")
        seconds = integer(rule.get("seconds", ""), f"Transfer {start}->{end} seconds", minimum=1)
        require(seconds >= source_minimum_transfers.get((start, end), 0), f"Transfer {start}->{end}: allowance is below source min_transfer_time")
        walking = integer(rule.get("walkSeconds", ""), f"Transfer {start}->{end} walkSeconds")
        require(start == end or walking > 0, f"Transfer {start}->{end}: different boarding stops require a positive walking allowance")
        require(walking <= seconds, f"Transfer {start}->{end}: walking exceeds total transfer allowance")
        require(isinstance(rule.get("provenance"), str) and rule["provenance"], f"Transfer {start}->{end}: reviewed topology provenance is required")
        require(rule.get("assumed") is True, f"Transfer {start}->{end}: assumed allowance must be explicit")
        transfers.append({"fromStopId": start, "toStopId": end, "seconds": seconds, "walkSeconds": walking, "provenance": rule["provenance"], "assumed": True})
        pairs.add((start, end))
    # The router permits chains of reviewed walking edges. A source restriction
    # must therefore hold over that closure, not just the directly listed edge.
    # Seed outgoing edges instead of distance[start]=0: a same-platform
    # reboarding restriction applies only after at least one transfer edge.
    constrained_pairs = prohibited_transfers | source_minimum_transfers.keys()
    adjacency = defaultdict(list)
    for transfer in transfers:
        adjacency[transfer["fromStopId"]].append((transfer["seconds"], transfer["toStopId"]))
    for origin in sorted({start for start, _ in constrained_pairs}):
        shortest = {}
        queue = list(adjacency[origin])
        heapq.heapify(queue)
        while queue:
            elapsed, current = heapq.heappop(queue)
            if current in shortest:
                continue
            shortest[current] = elapsed
            for duration, target in adjacency[current]:
                if target not in shortest:
                    heapq.heappush(queue, (elapsed + duration, target))
        for start, end in constrained_pairs:
            if start != origin or end not in shortest:
                continue
            require((start, end) not in prohibited_transfers,
                    f"Transfer {start}->{end}: a transfer-only path bypasses the GTFS prohibition")
            require(shortest[end] >= source_minimum_transfers.get((start, end), 0),
                    f"Transfer {start}->{end}: a transfer-only path is below source min_transfer_time")
    assumptions = rules.get("assumptions", {})
    assumptions = {field: integer(assumptions.get(field, ""), f"Assumption {field}", minimum=1) for field in ("accessSeconds", "exitSeconds")}
    reviewed_service_dates = {key: [day for day in days if not validation_start or validation_start <= day <= validation_end]
                              for key, days in service_dates.items()}
    require(all(reviewed_service_dates.values()), "An included service has no active dates in the reviewed coverage; explicitly exclude its trips before importing")
    all_dates = sorted({day for days in reviewed_service_dates.values() for day in days})
    coverage = {"startDate": all_dates[0], "endDate": all_dates[-1]}
    feed_info = list(archive.rows("feed_info.txt"))
    require(len(feed_info) <= 1, "feed_info.txt: multiple rows are unsupported")
    if feed_info:
        for field, bound, relation in (("feed_start_date", coverage["startDate"], "start"), ("feed_end_date", coverage["endDate"], "end")):
            if feed_info[0].get(field):
                day = gtfs_date(feed_info[0][field], f"feed_info {field}")
                require(day <= bound if relation == "start" else day >= bound, f"feed_info {field} contradicts active service calendar coverage")
    network = {"schemaVersion": SCHEMA_VERSION, "timeZone": rules["timeZone"],
               "stations": [station_rows[key] for key in sorted(station_rows)], "stops": stops, "routes": routes,
               "services": services, "trips": trips,
               "transfers": sorted(transfers, key=lambda item: (item["fromStopId"], item["toStopId"])),
               "coverage": coverage, "assumptions": assumptions}
    network_bytes = encoded(network)
    importer_hash = digest(Path(__file__).read_bytes())
    hashes = {"archive": digest(source_bytes), "metadata": digest(metadata_bytes or encoded(metadata)),
              "rules": digest(rules_bytes or encoded(rules)), "importer": importer_hash}
    route_coverage = []
    for route in routes:
        route_trips = [trip for trip in trips if trip["routeId"] == route["id"]]
        require(route_trips, f"Route {route['id']}: no included trips")
        ids = sorted({trip["serviceId"] for trip in route_trips})
        dates = sorted({day for key in ids for day in reviewed_service_dates[key]})
        route_coverage.append({"id": route["id"], "name": route["name"], "startDate": dates[0], "endDate": dates[-1],
                               "serviceIds": ids, "tripCount": len(route_trips), "directions": sorted({trip["directionId"] for trip in route_trips}),
                               "firstDepartureSeconds": min(trip["stopTimes"][0][2] for trip in route_trips),
                               "lastArrivalSeconds": max(trip["stopTimes"][-1][1] for trip in route_trips)})
    stop_exclusion_reasons = {"1": "Station has no scheduled boarding stops in included rail trips",
                              "2": "Station entrance: entrance and address routing are unsupported",
                              "3": "Generic internal station node: pedestrian routing is unsupported",
                              "4": "Boarding area: platform-area routing is unsupported"}
    excluded_stops = [{"id": key, "name": row.get("stop_name") or key,
                       "locationType": int(row.get("location_type") or "0"), "parentStation": row.get("parent_station", ""),
                       "reason": stop_exclusion_reasons.get(row.get("location_type"), "No scheduled boarding in included, validated rail trips")}
                      for key, row in sorted(stops_raw.items()) if key not in used_stops and key not in station_rows]
    limits = ["Scheduled rail only; bus and address-to-address routing are unsupported.",
              "Coverage is limited to active source calendar dates; no extrapolation beyond the published timetable.",
              "Only published weekday flags and explicit calendar exceptions are honored. SERVICE_PH is a service identifier, not holiday logic; public-holiday substitutions absent from explicit exceptions remain unverified.",
              "Only reviewed directed transfer rules connect different stop IDs; proximity, station names and map lines never create interchange edges.",
              "Access, exit and transfer allowances are assumptions, not surveyed walking times or step-free guarantees.",
              "Rail geometry connects scheduled stop coordinates and is not proof of walkable station entrances or interchanges.",
              "No live trip updates, fares, carriage occupancy or continuous/on-demand/frequency service is modeled."]
    if approximate_times:
        limits.append(f"The source labels {approximate_times} included stop times as approximate (timepoint=0).")
    manifest = {"schemaVersion": SCHEMA_VERSION, "buildId": digest(encoded({"version": VERSION, **hashes})),
                "importer": {"version": VERSION, "sha256": importer_hash},
                "source": {**metadata, "archiveSha256": hashes["archive"], "archiveBytes": len(source_bytes), "metadataSha256": hashes["metadata"], "feedInfo": feed_info},
                "rules": {"sha256": hashes["rules"], "schemaVersion": rules["schemaVersion"],
                          **{field: rules[field] for field in ("reviewedAt", "validationStartDate", "validationEndDate", "topologySource", "unsupportedConnections", "transferPolicy", "accessPolicy", "geometryPolicy") if field in rules}},
                "coverage": {**coverage, "timeZone": rules["timeZone"], "activeServiceDateCount": len(all_dates), "maxStopTimeSeconds": max(time[2] for trip in trips for time in trip["stopTimes"])},
                "counts": {"raw": dict(sorted(archive.counts.items())), "included": {key: len(network[key]) for key in ("stations", "stops", "routes", "services", "trips", "transfers")}},
                "completeness": {"includedRouteIds": sorted(selected_ids), "excludedRoutes": excluded_routes, "excludedStops": excluded_stops, "excludedTrips": excluded_trips,
                                 "unmodeledArchiveFiles": sorted(set(archive.members) - set(archive.counts)),
                                 "sourceTransfersRequireReviewCount": source_transfer_count, "approximateStopTimes": approximate_times, "limitations": limits},
                "services": [{"id": service["id"], "sourceCalendar": raw_service_bounds[service["id"]],
                              "calendarStartDate": service["startDate"], "calendarEndDate": service["endDate"],
                              "startDate": reviewed_service_dates[service["id"]][0], "endDate": reviewed_service_dates[service["id"]][-1],
                              "activeDateCount": len(reviewed_service_dates[service["id"]]),
                              "sourceActiveDateCount": len(service_dates[service["id"]])} for service in services],
                "routes": route_coverage, "assumptions": assumptions,
                "sizes": {"networkBytes": len(network_bytes), "networkGzipBytes": len(gzip.compress(network_bytes, mtime=0)), "networkSha256": digest(network_bytes)}}
    manifest["counts"]["included"]["stopTimes"] = sum(len(trip["stopTimes"]) for trip in trips)
    manifest["counts"]["excluded"] = {"routes": len(excluded_routes), "stops": len(excluded_stops), "trips": len(excluded_trips), "stopTimes": sum(trip["stopTimeCount"] for trip in excluded_trips)}
    return network, manifest


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", required=True, type=Path)
    parser.add_argument("--metadata", required=True, type=Path)
    parser.add_argument("--rules", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--manifest", required=True, type=Path)
    args = parser.parse_args(argv)
    try:
        source = args.source.read_bytes()
        metadata_bytes, rules_bytes = args.metadata.read_bytes(), args.rules.read_bytes()
        metadata, rules = json.loads(metadata_bytes), json.loads(rules_bytes)
        network, manifest = compile_network(source, metadata, rules, metadata_bytes=metadata_bytes, rules_bytes=rules_bytes)
        for path, value in ((args.output, network), (args.manifest, manifest)):
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(encoded(value))
    except (ImportError, OSError, UnicodeError, json.JSONDecodeError, zipfile.BadZipFile) as exc:
        print(f"Rail import failed: {exc}", file=sys.stderr)
        return 1
    print(json.dumps({"buildId": manifest["buildId"], "coverage": manifest["coverage"], "included": manifest["counts"]["included"], "sizes": manifest["sizes"]}, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
