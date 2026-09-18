# R5 current bus data contract

R5 expands the same pinned acquisition to a **416-pattern / 4,840-stop registry**, of which **391 patterns across 297 exact services at 4,826 stops have at least one timing-eligible day**, with weekday/Saturday/Sunday operating spans, period-specific estimates and previous-service-day carryover. Source validity remains **18 September–2 October 2026**. It does not establish all-service coverage or a full timetable. See [R5 coverage, exceptions and timing rules](R5_BUS_COVERAGE.md) for the current implementation, complete audit and performance evidence.

The following Phase 3 record is retained as historical baseline evidence; its three-service/daytime limits describe R4, not current shipped R5 coverage.

# Phase 3 bus data and timing contract

The shipped planner accepts **three complete services: 2, 23 and 28**. Their five direction-specific patterns contain 291 stop occurrences at 261 physical stops. All selected routes continue to their actual termini; their geographic extent is larger than the initial Tampines–Paya Lebar–Bugis transfer pilot. Downloaded island-wide records do not establish island-wide journey support.

| Service | Operator | Direction | Full termini | Occurrences |
| --- | --- | --- | --- | ---: |
| 2 | GAS | 1 | Changi Village 99009 → Kampong Bahru 10499 | 70 |
| 2 | GAS | 2 | Kampong Bahru 10499 → Changi Village 99009 | 62 |
| 23 | GAS | 1, loop | Tampines 75009 → Rochor Canal Road → Tampines 75009 | 43 |
| 28 | GAS | 1 | Tampines 75009 → Toa Payoh 52009 | 59 |
| 28 | GAS | 2 | Toa Payoh 52009 → Tampines 75009 | 57 |

The exact walking links and their evidence are maintained in [WALKING_COVERAGE.md](WALKING_COVERAGE.md). Only enabled, reviewed links can connect bus and rail; similar names and nearby coordinates do not create links. The wider existing validated rail network remains available.

Rail-station endpoints require a train ride on their applicable side of the journey. The pilot does not implement bus-to-station-entrance-only routing, or let a station origin pay an access allowance then immediately walk out to a bus. This avoids charging indoor access twice or claiming an unverified station entrance as a destination. Select the exact bus-stop endpoint when ending at a supported stop.

Bus-to-bus transfers at **75009 (Tampines Int), 52009 (Toa Payoh Int), 99009 (Changi Village Ter) and 10499 (Kampong Bahru Ter)** are disabled. These identifiers can aggregate separate alighting/boarding bays; an internal pedestrian path has not been verified. Journeys can still start or finish at them. At a shared roadside physical stop, changing buses uses an assumed 60-second change allowance with no inferred street crossing; this is distinct from walking to another stop.

## Official sources and observed semantics

Reviewed on 18 September 2026: the [DataMall dynamic dataset catalogue](https://datamall.lta.gov.sg/content/datamall/en/dynamic-data.html) and its linked [API User Guide v6.9, 3 August 2026](https://datamall.lta.gov.sg/content/dam/datamall/datasets/LTA_DataMall_API_User_Guide.pdf), sections 2.1–2.4. Observed responses matched the documented `value` arrays for BusStops, BusRoutes and BusServices. The API uses 500-row pagination. Service suffixes are meaningful identifiers; route direction and stop sequence are distinct from physical stop codes. First/last fields give each stop's service span; they do not provide intermediate departures. Headways describe dispatch frequency bands, not exact trips.

Actual records include `2400` and clock values after midnight such as `0109`. The compiler preserves original strings and records each rollover; its audit representation adds a day where last is earlier than first. **This is a clock-span interpretation, not validation of overnight service-day/calendar rules. Overnight journey planning remains excluded.** The guide gives weekday/Saturday/Sunday labels but does not establish a holiday calendar or day-specific applicability for headway fields. No holiday/weekend timing claim is made.

The live v3 response has stop/service identifiers and per-vehicle origin, destination, visit number, estimated arrival and monitored status. It supplies no observation/generation timestamp. Production matching must retain exact service suffix/operator/termini and the occurrence number; unmatched or ambiguous data cannot change journey timings.

## Pinned acquisition and completeness

`data/bus/sources/lta-bus-2026-09-18-439b6cf16c91` contains every original JSON response plus sanitized metadata. Acquisition began `2026-09-18T13:46:22.405Z` and finished `2026-09-18T13:46:41.120Z`. Each page records offset, count, retrieval time, HTTP Date, optional Last-Modified and raw SHA-256. The combined source version is:

`439b6cf16c91eb85e11f90dfb44bd477127842c1204bdc1139c35d8048cb181e`

| Endpoint | Raw records | Pages including final empty page | Accepted | Excluded |
| --- | ---: | ---: | ---: | ---: |
| BusStops | 5,208 | 12 | 261 | 4,947 |
| BusRoutes | 26,823 | 55 | 291 | 26,532 |
| BusServices | 801 | 3 | 5 | 796 |

Excluded stops are unused by selected complete patterns; excluded route/service records belong to services outside the reviewed pilot. There are no duplicate natural keys or route references to missing stop/service records. Three metadata records have no route records (`291:GAS:2`, `293:GAS:2`, `307:SMRT:2`) and empty termini; all are outside the pilot. Selected routes have no missing stops, sequence gaps or termini conflicts. Service 23's terminal appears twice and keeps visit numbers 1 and 2.

Pagination ends only after an explicit empty page; repeated pages, invalid envelopes, oversized pages, incomplete source manifests and changed hashes fail closed. Each selected service must include every contiguous occurrence from its declared origin to its declared destination. Other services with sequence gaps cannot be silently admitted by changing a service list.

A second complete 70-request acquisition at `2026-09-18T13:52:18.022Z` reproduced the same records and source hash; see [real repeat evidence](evidence/phase3/bus-acquisition-repeat.json). The provider offers no atomic cross-endpoint snapshot/version, so identical sequential observations establish stability during these two checks, not a permanent completeness guarantee. Feeds update ad hoc; the validity window below is a project policy, not a provider promise.

## Supported estimates and dates

Ordinary **weekdays from 18 September through 2 October 2026, 09:30–16:30 Singapore time** are the bounded estimate window. Every bus boarding and alighting must fall inside it. The [MOM 2026 holiday list](https://www.mom.gov.sg/newsroom/press-releases/2025/0616-public-holidays-for-2026) contains no holiday in this weekday interval. Saturdays, Sundays, holidays, overnight travel and dates after the reviewed window require further validation.

- Waiting: the maximum published `AM_Offpeak_Freq` interval for that exact direction. This represents a conservative planning assumption, not a guaranteed bound: downstream gaps and actual traffic can differ from dispatch frequencies. Its use on ordinary weekdays is explicit because the guide does not give a separate frequency calendar.
- Riding: DataMall cumulative-distance differences at an assumed **18 km/h**, plus **30 seconds per downstream stop**. This is an uncalibrated model, not a timetable, field measurement or live downstream ETA.
- First/last: check service-span feasibility only. Intermediate first-bus times can reflect buses beginning partway along a route, so differences are not used to invent riding schedules.
- Deadlines: bus and mixed itineraries are estimated outcomes and cannot guarantee arrival. Published headways are never expanded into artificial clock departures.
- Crowding/accessibility: comparisons remain unknown unless independently supported. An accessible vehicle flag cannot prove that the entire pedestrian journey is accessible.

The network retains separate first/last pairs for WD/SAT/SUN and source strings for audit even though only the bounded weekday window is enabled. `headways` are minutes; `firstLast` and coverage limits are seconds from service-day midnight. `stops[].visitNumber` is the count of appearances of that exact physical stop within the full pattern. A loop is one finite pattern; the router must not continue past its final terminal or board a previous occurrence.

## Reproduce and refresh locally

No account key is needed to rebuild the checked-in source:

```powershell
python scripts/import-bus.py --source data/bus/sources/lta-bus-2026-09-18-439b6cf16c91
python -m unittest discover -s tests -p test_import_bus.py
node --test tests/import_bus.test.mjs
node scripts/check-bus-import.mjs
```

`public/data/bus-manifest.json` pins the source, importer, validation-rules and compiled-network hashes. Rebuilding the pinned source must reproduce the checked-in output bytes. The browser receives only the selected compiled network (106,971 bytes), not all raw records (7,140,496 bytes including metadata). The importer version is 3.0.0.

For a new snapshot, use `python scripts/download-bus.py --gui`, or run that script from a real terminal for masked entry. The key remains in process memory and is passed to the downloader through its child environment; it is never saved, printed or placed in command arguments. The downloader makes one static-feed request at a time, with request timeouts and page/byte bounds; it stops on authentication errors, rate limits, malformed data or networking errors. Do not deliberately provoke provider failures.

An already authorized local live runtime can be reused with `node scripts/acquire-bus-session.mjs 4173`. This temporarily installs a nonce-specific, POST-only loopback handler in the local generated build; it uses the existing server environment internally and restores the original build in `finally`. Do not build concurrently. The handler is not part of production source and is absent after completion. Adding `--observe` makes exactly two additional live-arrival requests, for 81111 and 01059, and writes sanitized evidence. A new source hash requires explicit review of `data/bus/validation.json`, route audit and date policy before replacing the shipped network.

## Verification classification

| Check | Status | Evidence |
| --- | --- | --- |
| Real full endpoint acquisition and repeat | PASS | Pinned pages/metadata; identical repeated source hash |
| Selected full routes, leading zeros, occurrence/variant preservation | PASS | Manifest audit; Python fixtures and real-source reproduction |
| Hash/pagination/duplicate/orphan/truncation rejection | PASS | Python and Node importer/downloader tests |
| Two real BusArrival v3 observations and exact matches | PASS | [Sanitized real observations](evidence/phase3/bus-live-real.json); 81111: 3 matched service-28 predictions, 01059: 3 matched service-2 predictions |
| Real authentication/rate-limit/timeout failures | NOT TESTED | Synthetic cases only; provider deliberately not stressed |
| Bus running-time calibration and all-day/holiday/overnight service rules | NOT TESTED | Excluded from supported claims |

The recorded live arrivals are historical evidence. They are not fixtures to display as current, nor predictions for the pilot's future dates. End-to-end routing, offline checks and performance evidence are reported separately in the Phase 3 report.
