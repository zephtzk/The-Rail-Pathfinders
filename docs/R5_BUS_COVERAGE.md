# Island-wide bus directory and routing estimates

Updated 19 September 2026. This supersedes the initial R5 conservative subset. The user requested the widest practical island-wide coverage. No new source acquisition or production deployment is claimed.

| Coverage | Initial R5 | Current |
| --- | ---: | ---: |
| Searchable source stops | 4,840 | **5,208** |
| Route directions in the registry | 416 | **798** |
| Exact service numbers in the registry | 322 | **602** |
| Directions with timing estimates | 391 | **776** |
| Service numbers with timing estimates | 297 | **583** |
| Stops on timing-supported directions | 4,826 | **5,206** |

All 26,823 route occurrences are retained. All 801 source service/direction metadata records are accounted for: 798 have route records; three metadata-only records have no path to import. The 22 directions without usable headways remain in search/details and exact arrival matching, but do not acquire invented continuous departures. Being on a timing-supported direction does not promise a boarding or feasible connection at every time of day.

## Source interpretation

The pinned source is `lta-bus-2026-09-18-439b6cf16c91`, SHA-256 `439b6cf16c91eb85e11f90dfb44bd477127842c1204bdc1139c35d8048cb181e`. Compiler 5.1.0 reproduces the registry deterministically and records inclusion/exclusion plus annotations in `public/data/bus-manifest.json`. Original page bytes, clock strings, timestamps and hashes remain unchanged. Browser data retains normalized time spans instead of duplicate raw clock strings to reduce memory.

The [official DataMall guide v6.9](https://datamall.lta.gov.sg/content/dam/datamall/datasets/LTA_DataMall_API_User_Guide.pdf), sections 2.2-2.4, was rechecked. It describes route order, distance from the starting location, first/last arrivals and dispatch frequency bands. The following are explicit application interpretations, not provider certification of the model:

- Keep ascending source sequence order, including 151 patterns with non-1..N numbering. Preserve original numbers and repeated visits; do not invent missing stop records.
- Use distance differences even when the first distance is nonzero (23 patterns).
- Keep source loop descriptions and both directions. Metadata differences no longer discard the listed route. No implicit edge connects the final stop back to the first.
- Accept any usable published frequency band; do not require AM off-peak service. A malformed field is withheld individually, preserving other valid periods. Raw fields remain available for audit.
- Remove the arbitrary six-hour minimum span. Short and peak services use their per-stop operating windows and published bands. A published first arrival can be used at any hour; it is not expanded into a repeating timetable.
- Bus 857's final occurrence resets cumulative distance from 42.3 km to zero. Keep all occurrences, but withhold only rides crossing that reset. Earlier monotonic portions remain routable. No closing distance or arrival time is invented.

The remaining malformed fields are 36B's AM off-peak `08-288`, and 62A's `00-00` AM peak/off-peak values. Other valid fields on those routes remain usable. Source integrity, unique IDs, stop references, nonnegative finite distances and clock parsing are still checked.

## Times, transfers and discovery

Source validity remains **18 September-2 October 2026**. WD/SAT/SUN per-stop spans, applicable frequency bands and previous-service-day carryover apply. Unsupported holiday mapping and missing frequency periods are not filled automatically. Before 06:30, only a published first arrival is usable; no early continuous headway is inferred. Riding remains an uncalibrated 18 km/h plus 30 seconds per traversed listed stop; all bus outcomes are estimates.

Same-code potential terminal transfers now use **five minutes of estimated walking**, included in the user's cumulative walking budget. Instructions say to confirm the boarding bay. Roadside same-stop changes retain a 60-second allowance. Different stop codes, road crossings and new bus/rail walks are not created from coordinates. The four existing exterior bus/rail links remain. Accessibility and internal bay paths remain unverified.

All stops are searchable by code/name/road/service metadata. Selected details distinguish listed services with unavailable timing. The map shows a bounded Canvas stop layer when zoomed to neighbourhood scale, with Start here/Go here controls. At most 450 nearby stops are drawn at once, with a zoom-in message where needed; the directory is not truncated by this display limit. No island-wide live polling occurs.

## Verification

Importer tests check deterministic full-source reproduction, source identity, sequence/visit preservation, missing periods, short spans, malformed fields and distance resets. Independent Dijkstra checks cover six island-wide pairs and the retained 36-pair pilot. Synthetic integration tests cover five-minute terminal walking, different-stop separation, source sequence identity, fixed-service exclusion, daytime first arrivals and the detour-limit alias.

The expanded network initially exposed a work-limit regression for Woodlands to Changi Airport. A feasible rail-only result now provides an initial arrival bound, including the caller's extra-time budget, before mixed alternatives are searched. It preserves later preferred routes while avoiding irrelevant bus expansion. The search work limit remains unchanged; explicit caller work limits skip the preliminary search.

See the [desktop benchmark](evidence/r5/bus-benchmark.json) and [inside-search memory probe](evidence/r5/bus-memory-probe.json). Both retain the original 150 MiB sampled-heap target; the probe accounts for both rail preliminary and mixed passes. These are desktop observations, not physical-phone guarantees. The full check and affected browser workflows must pass before promotion.

Final verification: **385 JavaScript tests, 44 Python tests, build, 14 island-stop browser checks and 9 worker/accepted-journey browser checks passed**. Desktop cold parse/index/first result197.5ms, warm p95105.4ms, combined gzip2,617,492bytes. Inside-search sampling:142.3MiB against unchanged150MiBtarget. Desktop/mobile screenshots were visually inspected. Exact build and evidence are in [island-bus-verification.json](evidence/r5/island-bus-verification.json).
