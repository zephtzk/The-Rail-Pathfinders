# R5 bus coverage, operating spans and exceptions

Reviewed 19 September 2026. This is a broader **frequency-estimate** implementation, not a full bus timetable, universal service coverage, field validation or a source refresh.

## Included source and audit

The immutable acquisition remains `lta-bus-2026-09-18-439b6cf16c91`, source SHA-256 `439b6cf16c91eb85e11f90dfb44bd477127842c1204bdc1139c35d8048cb181e`. Original pages, retrieval timestamps and hashes are unchanged. R5 compiler 5.0.0 checks every exact service/operator/direction against this source and records its inclusion or exception in `public/data/bus-manifest.json` → `audit.reviewedPatterns`.

| Measure | R4 | R5 |
| --- | ---: | ---: |
| Exact service numbers with eligible timing, suffixes separate | 3 | 297 |
| Complete directional patterns with at least one eligible day | 5 | 391 |
| Stops on at least one timing-eligible pattern | 261 | 4,826 |
| Compiled registry stop occurrences | 291 | 16,253 |
| Reviewed source service/direction metadata | 5 selected | 801, each accounted for |

The compiled registry retains **416 complete patterns, 322 exact service numbers and 4,840 stops** for provenance and exact live-arrival matching. Routing admits **391 patterns/297 services/4,826 stops** with at least one eligible day. Twenty-five complete registry patterns are fully withheld from timing, while seven retain only their reviewed-duration days. Counts therefore distinguish data presence from routing availability.

There are **385 structurally or headway-excluded metadata patterns**. Exception counts overlap: sequence needing service review 151; nonzero start distance 23; loop-description disagreement 43; loop-direction disagreement 1; decreasing distance 1 (`857:TTS:1`); metadata without a route 3; no published headway/fixed trips unresolved 22; peak-only or limited service needing trip rules 223; invalid/unsupported headway 2 (`36B:GAS:1`, `62A:GAS:1`). These are unresolved interpretations, not declarations that official records are wrong. No exception is compacted, renumbered, connected across gaps or silently promoted to a complete route. Included patterns pass contiguous sequence, zero start, monotonic distance, exact termini, loop, source-hash, stop-reference and clock checks. This is a reproducible record audit, not 416 independent physical surveys.

A further conservative policy withholds each origin-day span shorter than six hours until its service-specific trip rules are reviewed. This is a review threshold, **not a claim that every short span is fixed-trip**. The manifest lists all **37 exact pattern/day exceptions** and **25 fully timing-excluded patterns**. It keeps original spans, sequence numbers, variants and geometry; the router skips only unsupported timing. This catches numeric-headway short services such as 55B and 189A that a missing-AM-offpeak check alone would miss. [Tower Transit’s service 189 page](https://www.towertransit.sg/route/189) explicitly identifies the night short-trip variant, without supplying its full trip rules. [SBS’s service 107M page](https://www.sbstransit.com.sg/Service/BusService?ServiceNo=107M) confirms limited weekday hours and different day-specific frequencies; its weekday span is withheld. Longer supported weekend spans still use the generic DataMall bands as the disclosed uncalibrated assumption, not that operator page’s exact day-specific timetable.

## Current operating contract

Source validity remains **18 September–2 October 2026**, a project review window rather than a provider promise. Weekdays select WD stop spans, Saturdays SAT, Sundays SUN. A missing day span is no service estimate for that occurrence on that service day; it never borrows WD. MOM's 2026 holiday/substitute-date list is retained with its year validity. No holidays fall in the source window. The router requires a separately reviewed holiday day-type mapping; it does **not** assume that every holiday is Sunday service.

The [DataMall API guide v6.9, 3 August 2026](https://datamall.lta.gov.sg/content/dam/datamall/datasets/LTA_DataMall_API_User_Guide.pdf), sections 2.1–2.4, was rechecked. It publishes generic dispatch frequencies: 06:30–08:30; 08:31–16:59; 17:00–19:00; after 19:00. R5 selects the matching period and its maximum interval as an **uncalibrated waiting estimate**. A missing period cannot acquire another period's frequency. A later covered period may be offered within the bounded search horizon. The guide does not give separate weekend frequencies; applying generic bands within the actual SAT/SUN spans is an explicit model assumption, not a measured weekend wait or a guaranteed upper bound.

Before 06:30 on a new service day there is no documented headway band. Only an explicit first-arrival time may be considered; after that first arrival the model waits for the next documented band. Thus **continuous full-day timing is not claimed**. First/last rows constrain feasibility at each occurrence; they are not assembled into a through-bus timetable. Ride time still assumes 18 km/h plus 30 seconds per traversed stop. Exact source sequence/visit numbers, cumulative distance, canonical indices and explicit acceptance are preserved. If an early candidate reaches an alighting stop before its independent first-arrival bound, a bounded retry considers later published periods on the same supported service-day candidates. It never shifts the exact pre-06:30 first bus or invents an early headway. Regression: 96109 to 85079 on 21 September can wait for Bus 10 and arrive at 06:42:30 whether ready at 05:05 or 06:30.

After midnight, boarding retains its previous service date, day type and offset. Alighting checks that same service day's span. A late-starting route's downstream post-midnight clocks are normalized only when its origin begins at/after 18:00 and the downstream first clock is before 06:00. Ordinary early/partial first buses are not shifted. The final source day can spill over only while its source bounds permit; the following daytime cannot become another valid service date.

Fixed-trip and unresolved peak-only services are excluded rather than expanded into continuous frequency. For example [LTA's service 684 notice](https://www.lta.gov.sg/content/dam/ltagov/Interactive_map/pdf/CDS_684.pdf) identifies two morning and two evening departures, weekdays excluding public holidays; the retained feed has no headway fields. It remains excluded until actual service-specific trip rules and intermediate boarding semantics are implemented. The [official MOM holiday source](https://www.mom.gov.sg/newsroom/press-releases/2025/0616-public-holidays-for-2026) supports the retained 2026 calendar. The documented GTFS schedule endpoint remains Train; no public bus GTFS timetable was established.

## Walking and terminal evidence

All 341 retained-source origin/destination codes that appear among compiled stops, including endpoints of structurally excluded services, are treated conservatively as potential separate boarding/alighting bays. Same-code bus transfers there are disabled until an internal connection is reviewed. Starts and ends remain possible. This may omit some valid roadside transfers; it does not claim that all 341 are physical terminals. Changi Airport T2 (95129), for example, remains protected even when only through-service patterns are included. Elsewhere an unchanged physical roadside stop has the existing assumed 60-second change allowance. No street crossing, nearest-stop walk or terminal bay connection is inferred from coordinates or names.

The four existing reviewed exterior bus/rail links at Paya Lebar and Bugis are unchanged. Wider bus geography therefore does not establish island-wide pedestrian, indoor or step-free connections. Unverified indoor allowances remain estimates.

## Bounded execution and live arrivals

The router indexes occurrences by boarding stop, ignores dominated queued labels, prunes only routes outside the exact allowed arrival/detour bound, and avoids allocating rejected ride chains. Rail dates with identical active services share an index, with four cached calendar combinations. The default work ceiling is 2,000,000 frequency/rail expansions (hard maximum 2,000,000); reaching it returns `search-limit` with **no partial recommendation**. AbortSignal is checked before/during work; the main planner uses a worker so cancellation can terminate active CPU work. Canonical progress is never inferred by the worker or the timing model.

The server builds one exact arrival-match index (service, operator, origin, destination, stop, visit). It retains two concurrent upstream requests, at most 40 cached stops including pending entries, 30-second refresh, bounded body/timeouts and shared backoff. Broad coverage does not poll all stops. Credentials stay in the server environment. No live stop prediction is propagated into downstream arrival or an accepted itinerary.

Two public adapter calls through the already-authorized local runtime returned HTTP 200 with valid **empty** upstream feeds at 03:20 SGT for 75009 and 70251. This verifies current access/normalization, not a matched current bus or downstream timing. Empty feed is not proof of no real service. See [sanitized live evidence](evidence/r5/bus-live.json). Previous matched observations remain historical Phase 3 evidence, never displayed as current.

## Validation and performance

Reproduction and validation commands:

```powershell
python scripts/import-bus.py --source data/bus/sources/lta-bus-2026-09-18-439b6cf16c91
python -m unittest discover -s tests -p test_import_bus.py
node scripts/check-bus-import.mjs
node --test tests/r5-bus-coverage.test.mjs tests/r5-bus-oracle.test.mjs tests/bus-oracle.test.mjs
node --expose-gc scripts/benchmark-r5-bus.mjs
npm run check
```

Fourteen importer tests include deterministic byte reproduction and explicit audit exceptions. Focused calendar tests cover WD/SAT/SUN absence, all bands, pre-06:30, missing headways, holiday failure, previous service days, final-day rollover and bounded/cancelled searches. Six island-wide pairs match an independent integer-distance Dijkstra oracle. The original 36-pair oracle and pilot arithmetic remain as an explicitly isolated historical subset; they no longer assume the first pattern in the broader array is service 2. Full `npm run check` passed 348 JavaScript tests and 42 Python tests with build at this checkpoint.

The [desktop benchmark](evidence/r5/bus-benchmark.json) records 24 mixed/bus/rail queries, source hashes and Node/runtime flags. Cold parse/index/first result: **224.6 ms**; warm p95 **508.3 ms**; combined gzip data **2,611,239 bytes**. The arrival index has 16,253 exact keys; 1,000 three-prediction matches took 4.02 ms after indexing. CPU/payload targets passed. Queries use the app's default 30-minute walking allowance.

**Memory target remains unmet for observed transient Node heap**: sampled post-query peak 434.3 MiB versus the predeclared 150 MiB target; retained heap after explicit garbage collection 78.5 MiB. The benchmark intentionally exits nonzero for that unmet target. GC timing is runtime-dependent; these measurements do not establish physical-phone memory or responsiveness. The first-result heap check in the retained legacy browser suite passed 150 MiB; that is a distinct browser sample, not a repeated-search or physical-device memory guarantee. The initial pre-optimization record is retained separately; its arrival timing included compression and is not used as a matching-performance measurement. The [browser worker checks](evidence/r5/bus-browser.json) use actual clicks/keyboard on desktop Edge with mobile/touch emulation: editing the destination cancels the in-flight search, stale results stay absent, a new search succeeds, the accepted journey is unchanged, and frames continue. Eight checks passed with no browser errors; the final recorded restarted-worker query was 975 ms with 113 frames across the scenario (maximum frame gap 347 ms). This is separate from Node heap measurement. Physical-phone memory remains unverified.

Remaining coverage dependencies: service-specific evidence for the 385 structurally/headway-excluded patterns and 37 limited-span day exceptions, actual fixed-trip rules, validated early-hours and day-specific headway semantics, bus running-time calibration, reviewed terminal/pedestrian links, and refresh review after 2 October. No source refresh, official endorsement, production deployment or audience expansion occurred.

Final compiled network SHA-256: `5a33daf7f84c3c09e397d2e21c6eb7314d8ba59b5357b9996b5ecef15d221886`; 4,721,033 bytes. Final focused validation after early-bus, terminal and limited-span fixes passed **53 JavaScript checks plus 14 importer tests** and `check-bus-import`. The retained R2 (35), R3 (36), R4 flow (33), R4 planner (24), legacy multimodal (28) and worker-cancellation (8) browser checks passed before those final model corrections; the final root delivery record identifies subsequent regression reruns. No Git commits or GitHub mutations were made by the bus implementation subtask.
