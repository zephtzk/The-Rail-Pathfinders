# FR2 item 6 — fares and expenditure

Branch: `codex/fr2-fares`, based on `f78882b`. Implemented and checked 19 September 2026. Integration, PRs and deployment remain with the parent task. Local app served on port 4243.

## Delivered behavior

- Completed real rail, basic bus and mixed journeys automatically receive a labelled card-fare estimate. The ledger already records explicit completion exactly once; estimates now cover substantially more than the previous two rail pairs and three bus services.
- Rail prefers the two retained official calculator facts. Other rail pairs use the shortest connected path of LTA GTFS station-coordinate segments, rounded up to 100 m. Paid-area train changes become one origin/destination fare leg. This is explicitly an approximate distance, not official fare distance, track length, or a time-derived distance.
- Bus service categories are generated from the hash-checked original DataMall BusServices pages for all 798 routing patterns. TRUNK and FEEDER are supported; feeder distance is capped at 3.2 km. Exact pattern, direction, boarding/alighting occurrences and distance-reset segment must match. EXPRESS, CITY_LINK and unclassified/private services remain manual.
- Eligible bus/rail transfers use the combined distance once. Separate fares apply after five transfers, beyond two hours between first/last boarding, beyond 15/45-minute transfer windows, same-station rail re-entry, or a repeated bus service/subsidiary within the fare group.
- OneMap retains its already-validated leg distance as `step.source.distanceMetres`. Transit distances can yield an explicitly approximate fare; walking distance is excluded. Its initial blanket unknown-fare flag is removed. All explicit reroute and gate-changing detour manual-fare guards remain.
- Fare panels and each stored transaction expose category, approximate/published distance, official source, fare effective/check dates, method and original version. Manual confirmed charges replace estimates in totals once; refunds and original provenance remain. Replay stays separate from personal totals and budgets. Existing history is not silently repriced.

## Official sources and validity

Reviewed live primary pages on 19 September 2026:

- [PTC fare table](https://www.ptc.gov.sg/fares/public-transport-fares-and-passes/) — standard adult basic card fare bands $1.28–$2.57; senior/PWD/student bands retained and checked; feeder cap.
- [PTC 2025 fare review](https://www.ptc.gov.sg/media-centre/newsroom/fare-review-exercise-2025/) — effective **27 December 2025**. Latest published table found at review; future estimates explicitly warn that rates may change.
- [PTC transfer rules](https://www.ptc.gov.sg/fares/distance-fares-and-transfer-rules/) and [SimplyGo rules/examples](https://www.simplygo.com.sg/transfer-fare-rules/) — grouping, transfer windows, repeated-service restrictions.
- [PTC rail fare calculation](https://ask.gov.sg/ptc/questions/cmq0md92s00785l017w6x8nog) — shortest possible station distance, independent of the train route/time actually taken.
- [PTC morning/off-peak schemes](https://www.ptc.gov.sg/fares/morning-pre-peak-fares/) — discounts exist, including north-east off-peak rail. Estimates deliberately use standard fares without claiming eligibility from planned boarding time.

Full machine-readable provenance is in `public/data/fare-sources.json`. The existing two calculator queries remain dated **18 September 2026**; they were not re-queried or presented as fresh observations. Generated rail graph validity is **18 September–31 December 2026**. Bus classification validity is **18 September–2 October 2026**. Source hashes and dates are embedded in `src/fare-distance-data.js`; graph/category generation reproduces from the existing permitted source snapshots with `node scripts/build-fare-distances.mjs --check`.

## Validation

- `npm run check`: **469/469 Node tests**, 27 rail-import tests, 16 bus-import tests, 1 walking-metadata test, all JS syntax checks and production build passed.
- `node tests/fr2-fares-browser.mjs`: **15/15** Edge checks; real journey lifecycle/completion, estimated and confirmed spending, refund, budget, replay isolation, reload, source/method disclosure and 390 px layout.
- `node tests/r4-spending-browser.mjs`: existing spending regression passed, including large text and cross-period corrections.
- `TEST_BASE_URL=http://127.0.0.1:4243 node tests/pre-fr2-start-journey-browser.mjs`: **29/29** full-app local/provider start safeguards passed; no browser exceptions.
- Evidence: `docs/evidence/fr2-fares/results.json`, `fare-estimate-mobile.png`, `fare-corrections-mobile.png`. These are synthetic browser test journeys, not payment-account evidence.

## Integration notes and limits

- Shared-file edits are minimal: `address-routing.js` retains distance and removes only the generic initial unavailable flag; `copilot-ui.js` forwards `getFareOptions()` to the compact fare summary. No routing engine, ledger schema, preference, budget or service-worker changes are required. New modules are picked up automatically by the build.
- The existing R5 address browser assertion `planner details preserve unknown fare/accessibility` needs to accept `Planned fare: $… estimate` and `Approximate distance` for its supported bus fixture. Accessibility stays `unknown` and source stays OneMap. Parent owns reconciliation with the parallel search branch.
- The rail graph uses straight segments, excludes unreviewed tap-out shortcuts, and can under- or over-estimate official chargeable distance. OneMap distance follows its planned route and may differ from the official shortest rail distance. Neither method is a payment quote or confidence interval.
- Planned transfer times are not tap transactions. Cash, unknown passes, unsupported bus categories, uncertain rail tap-out transfers, gate-changing toilet detours and reroutes after boarding still need actual amounts. No automatic concession eligibility, early-morning/free-ride promotion, foreign-card charge or disruption discount is assumed.
- No payment account linking, location upload or external storage was added. Records remain on-device. No other worktrees, Git configuration, main merge or public deployment were changed.
