# Phase 3 pedestrian coverage

Four individually reviewed exterior paths connect two exact bus stops at Paya Lebar and two at Bugis to named rail entrances, in both directions. This is **map-supported connectivity**, not a field survey. The [machine-readable ledger](../data/bus/walking-links.json), [source-map/path review](../data/bus/walking-evidence/path-review.html), and [independent validation result](evidence/phase3/walking-validation.json) are the evidence.

| Exact bus stop | Entrance / direct rail platforms | Exterior estimate | Indoor estimate | Total walking charged per transition |
| --- | --- | ---: | ---: | ---: |
| `81111` Paya Lebar Stn Exit B | Exit B / `CC9_A`, `CC9_B` | 60 m, 90 s | 120 s | 210 s |
| `81119` Paya Lebar Stn Exit C | Exit C / `CC9_A`, `CC9_B` | 60 m, 90 s | 120 s | 210 s |
| `01059` Bugis Stn Exit B | Exit B / `EW12_A`, `EW12_B` | 50 m, 90 s | 120 s | 210 s |
| `01113` Bugis Stn Exit A | Exit A / `EW12_A`, `EW12_B` | 20 m, 60 s | 120 s | 180 s |

Paya Lebar's source station ID is `CC9`; Bugis's is `DT14`. Sharing those parent identities does **not** grant direct access to every platform. The Paya Lebar B/C approach leads to the Circle Line entrance; a rail journey using East–West Line must include the existing four-minute rail interchange estimate. Bugis A/B are East–West Line entrances; Downtown Line uses the existing seven-minute interchange estimate. Platform access remains estimated; no indoor geometry is claimed as verified.

## What was reviewed

The official [SMRT Paya Lebar locality map](https://connect-cdn.smrt.wwprojects.com/autoupdate/images/locality/Paya%20Lebar.jpg) and [SMRT Bugis locality map](https://connect-cdn.smrt.wwprojects.com/autoupdate/images/locality/Bugis.jpg) identify entrances and the side of each road. The Paya Lebar map prints exact stop codes; Bugis uses map stop symbols 4 and 5, correlated with the current exact DataMall stop records and the OSM bus-platform `ref` tags. Names or distance alone do not create a connection.

The SMRT page template describes these maps as accurate as of **February 2021**. Retrieving them on 18 September 2026 does not change that age. Two bounded, current [OpenStreetMap](https://www.openstreetmap.org/copyright) API extracts supply inspectable pedestrian-way topology and exact source object versions. The path ledger stores the source URL, retrieval time, SHA-256, selected way/node IDs, coordinates and source-way edit timestamps. Relevant ways include 2025 and February 2026 edits; an edit timestamp is not proof of a new field survey. OSM source tags mentioning someone else's ground survey do not make these routes field-surveyed by this project.

Each path was manually selected and reviewed against both map sources. No general nearest-stop search, same-name match, radius-based edge builder, station-coordinate shortcut or automatic pedestrian graph expansion is enabled.

- **81111 → Paya Lebar B:** from the mapped bus shelter, follow east-side footway `877813337` south, then the short station approach on `188867235`. The trace stops at station-building threshold node `6333789484`. A 1.07 m lateral connector stays within the mapped shelter footprint. Paya Lebar Road is not crossed.
- **81119 → Paya Lebar C:** remain on the west side. Follow shared cycleway `547109567`, explicitly tagged `foot=designated`, then footways `1415207209` and `370173956`. Stop at threshold node `3738967183`, before the underground walkway. The reviewed 3.01 m connector stays within the same stop forecourt. Shared cycling is a limitation; no conflict-free passage is promised.
- **01059 → Bugis B:** the exact bus-platform node is already part of footway `545573091`. Continue northeast along that way, turn via sidewalk `545573093` to footway `164882621`, and stop at station-building boundary node `1764839483`. This continuous mapped path approaches the doorway instead of drawing a line straight through the entrance structure. It does not cross Victoria Street, Rochor Road or the hospital driveways farther northeast.
- **01113 → Bugis A:** a reviewed 7.23 m boarding-forecourt connector leads to the same-side junction at `6924431331`, then footway `739532532` reaches station-building boundary `1780030019`. The official map identifies the same stop/entrance forecourt. No road crossing is added.

The small boarding connectors are explicitly documented manual links between platform pins and the adjacent mapped footway, with same-forecourt/road-side evidence. They are not claims that every nearby map point is walkable. The ledger records both their length and the review rationale. All selected ways permit pedestrian movement in both directions and contain no mapped one-way pedestrian restriction. Reverse guidance follows the same path and retains the exact five-digit stop ID.

## Distance, timing and limitations

Polyline lengths are respectively **41.37, 37.83, 44.55 and 12.33 m**. The distance budget adds the full separation between the DataMall and OSM stop markers and rounds up to the next ten metres. That separation is position uncertainty allowance, not another generated walking edge. Entrance symbols also differ from doorway thresholds; the trace ends at the mapped public approach, not at a straight line to a GTFS station/platform centre.

Exterior time is `ceil((distance / 1.2 m/s) / 30 s) × 30 s + 30 s`: an assumed walking speed, half-minute rounding, and a 30-second orientation allowance. No crossing wait is added because these four curated exterior paths cross no road. These are estimates, not measured walking times or operator promises.

The existing **120-second rail access/exit allowance is charged once**, separately from exterior time. A bus→platform transition is exterior + 120; the reverse is 120 + exterior. Do not add a second station-endpoint access allowance on the same transition. Both components count toward the user's walking limit. Ordinary station endpoints still use the Phase 2 allowance. Changing rail lines uses the established rail transfer rule in addition; no new indoor shortcut is assumed.

Indoor paths, stairs/escalators, lift operation, tactile facilities, current entrance opening and temporary obstructions remain **unverified**. Accessibility is **unknown**, even if a source map displays a wheelchair symbol. The router's train calendars constrain available train use; they do not verify live entrance access. Follow current station signs and local instructions. The cached ledger remains a dated map assessment when offline.

## Exclusions and acceptance

- **Tampines bus interchange walking:** excluded. The berth-to-entrance indoor path has not been validated. Tampines remains a bus and rail endpoint, without an invented connecting walk.
- **Opposite-side bus stops / bus–bus walks:** no additional pedestrian link has been validated. `81111` and `81119`, or `01059` and `01113`, are not interchangeable. A same-stop roadside bus change uses that exact physical stop; it does not authorize crossing a road. Terminal/interchange codes `75009`, `52009`, `99009` and `10499` do not prove the same boarding bay, and their bus transfers are excluded pending bay-to-bay evidence.
- **Newton, Tampines and Bukit Panjang rail tap-out transfers:** remain omitted. This ledger creates no rail-to-rail edge and cannot be chained through a station as an outside-station shortcut without a rail ride.
- **Other nearby stops/entrances:** excluded until individually reviewed. Four records do not imply area-wide pedestrian or step-free coverage.

| Acceptance check | Status | Evidence / limit |
| --- | --- | --- |
| Exact bus IDs, entrance identities and platform restrictions | PASS | Pinned DataMall stops, official locality maps and source-node/way ledger |
| Reviewable public exterior path in both directions | PASS | Four manual traces; source objects, barriers and forecourt connectors documented in path review |
| Source file hashes, copied public ledger, mapped segment continuity | PASS | `python scripts/verify-walking.py` and saved validation JSON |
| Independently recomputed exterior distance/time | PASS | Validator recomputes geodesic segment sums, uncertainty allowance and rounding |
| Physical path survey / current closure inspection | NOT TESTED | No physical visit or live path-status source |
| Indoor path / lift operation / step-free access | NOT TESTED | Retained estimates and explicit unknown accessibility |
| Tampines walking connection | BLOCKED | Missing reviewed interchange/entrance path; excluded from routing |

Run `python scripts/build-walking-evidence.py` to reproduce both identical ledgers and the standalone review from the pinned, already-reviewed sources, then `python scripts/verify-walking.py`. Updating map sources requires a fresh path review before rebuilding; the builder intentionally does not discover new edges. The operator images and OSM extracts are repository evidence, while only the compact ledger is shipped to/offline-cached by the app. OSM-derived geometry is attributed to OpenStreetMap contributors under ODbL 1.0; the original SMRT/LTA map copyrights are retained.

The build calls the read-only `checkWalking()` guard in `scripts/check-walking.mjs`. It checks byte-identical source/public ledgers, source artifact hashes, required provenance and bounded verification claims; a changed source cannot silently pass as the reviewed snapshot.
