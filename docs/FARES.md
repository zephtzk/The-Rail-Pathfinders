# Saved places, fare estimates and expenditure

R5 adds an optional weekly/monthly commute budget using the ledger's existing **recorded total**: confirmed charges plus recorded estimates and their adjustments. Estimates remain explicit until replaced by confirmed charges; unpriced trips make remaining budget incomplete. Geometry clamps at 100% while the text reports the full overrun. Singapore Monday-start weeks/months and original-trip refund attribution are unchanged. All history remains accessible and changing/disabling the budget only changes a separate local setting. Departure-scheme hints never modify recorded spending. Broader R5 routing does not broaden the fare-distance allowlist below.

## Fare coverage and evidence

`src/fare-data.js` pins fare version `ptc-2025-12-27.review-2026-09-18`. Rates are effective from **27 December 2025**, checked on **18 September 2026**. Dates before this version are unavailable. No superseding effective date was present in the reviewed sources; future estimates retain this version and can change when a new schedule is published.

Sources: [PTC fares and passes](https://www.ptc.gov.sg/fares/public-transport-fares-and-passes/), [PTC's official MRT/LRT fare dataset](https://data.gov.sg/datasets/d_2ca29f673b89e0cfddbb7c74516fa4d3/view), [SimplyGo's effective-date notice](https://www.simplygo.com.sg/travel-fares/adult-fares), [transfer rules](https://www.simplygo.com.sg/transfer-fare-rules/), and [LTA's public fare calculator](https://www.lta.gov.sg/content/ltagov/en/map/fare-calculator.html). Source metadata and the two manually observed result rows are in `public/data/fare-sources.json`.

The LTA calculator's rendered UI was queried with Adult / MRT-LRT on the review date:

| Boarding → alighting | Official fare distance | Displayed standard adult card fare |
| --- | ---: | ---: |
| Paya Lebar (EW8/CC9) → Bugis (EW12/DT14) | 4.8 km | S$1.49 |
| Tampines (EW2/DT32) → Bugis (EW12/DT14) | 14.1 km | S$2.02 |

These are the only automatic rail origin/destination distances in this release. Reverse directions and other pairs remain unavailable until explicitly reviewed. The fare distance is a fare-system value, independent of the displayed OSM geometry. A continuous journey inside the paid area has one combined rail fare; the app does not invent a fare allocation for every train line or interchange. A route involving an unreviewed tap-out transfer or a gate-changing/unknown toilet detour is marked for reassessment/manual recording. An explicitly reviewed no-gate detour can retain the continuous paid-area rail fare; a bus/mixed journey still needs transfer-timing reassessment.

The existing permitted LTA DataMall bus snapshot supports basic bus services **2, 23 and 28**, using the exact direction and stop occurrences. `busFareLeg` matches the pinned source version, pattern, boarding/alighting sequence and stop IDs before subtracting official cumulative Distance fields. Unsupported mixed journeys are unavailable when any leg lacks reviewed fare-distance evidence. No rail fare is computed from stop counts, track length, or straight-line distance.

Adult, eligible senior citizen, Persons with Disabilities and student **card** categories are supported using published standard-time bands. Eligibility is selected by the traveller, never inferred from mobility needs. Cash, Workfare, other concessions, foreign-card fees and unverified products require a manual amount. Pre-07:45 rail estimates are unavailable because exact tap-in time and holiday eligibility are not established. Promotional/free off-peak travel, TSJ and disruption transport are not automatically applied. A caller may provide an explicitly confirmed valid basic-bus-and-train pass; this represents zero *incremental ride charge*, excluding the separately recorded pass purchase and any penalties. No payment-card details or private SimplyGo data are collected.

## Transfer and gate rules

The calculator groups validated legs into fare journeys. It enforces the two-hour first-to-last boarding limit, five transfers, 45-minute bus interchange limit, 15-minute external rail interchange limit, and exclusion of repeated/subsidiary bus services. Same-station exit/re-entry creates a new fare journey. The published Bukit Panjang/Newton/Tampines line-transfer exceptions need additional reviewed connection evidence and are deliberately not applied to a toilet visit. A toilet stop never implies free re-entry. Unknown distances produce an unavailable estimate, not a fabricated new charge. Each displayed breakdown sums exactly to the trip total.

## Completion and local records

`createLedger(storage)` in `src/fare-ledger.js` stores schema 2 under `commute-copilot-expenditure-v2`. The canonical schema-2 journey must have `status: 'completed'` and an explicit completion time. Stable journey IDs provide idempotence across repeated taps/reloads. Cancelled, started and paused journeys cannot create a record. Replay journeys go only to `commute-copilot-demo-expenditure-v2`, and personal totals exclude demo records.

Each completed record stores the accepted route snapshot/revision, fare version, estimate provenance and completion timestamp. It stores no geographic movement trail and no separate toilet-use history. An unknown fare remains unpriced. Actual charged amounts replace estimates in totals, while the old estimate remains available as provenance. Adjustments/refunds use integer cents and are tied to the original trip's accounting period. Repeated adjustment IDs are ignored; refunds cannot make a trip negative. Corrections, adjustment removal, record deletion, explicit history deletion and JSON export are available in the expenditure view. Deleted journey IDs remain as minimal tombstones to prevent a completed snapshot from repopulating deleted spending after reload.

Totals use **Asia/Singapore** day boundaries, **Monday-start calendar weeks**, and calendar months. Each total shows confirmed charges plus recorded estimates, with unpriced trips separately identified. These are traveller-managed records, not bank or SimplyGo transactions. Browser storage can be cleared by the user or OS; use Export for a portable backup. Blocked/full/corrupt storage returns an explicit error without claiming durability. Corrupt existing blobs are preserved, never replaced by empty data.

## Saved places and migration

`commute-copilot-personal-v2` stores named resolved places and reusable pairs independently of the offline journey snapshot. Each place has stable ID, validated latitude/longitude, source ID and optional entrance/station ID. Manual coordinate selection is deliberately labelled coverage/accessibility unknown. Labels alone are never geocoded or treated as resolved addresses. Places support create, rename, selection into either endpoint, reorder and delete; templates support rename/delete and capture the pair and walking/step-free preferences.

`instantiateTemplate` uses the currently selected date/time, sets `requiresRecheck: true` and returns no cached route. Deleting a referenced place preserves the template but disables reuse with an explanation. Swapping endpoints clears the route. Duplicate labels are rejected case-insensitively.

The migration imports only an offline v1 snapshot accepted by the existing strict `restoreJourney` validator. It copies supported station coordinates and preferences to a reusable template, discards the old replay date, retains accessibility as unknown, and leaves the original snapshot byte-for-byte intact. A migration marker prevents duplicates. Demo reset has no access to these storage keys. Saved local data and fare history each have separate explicit deletion controls. Saved addresses are not uploaded automatically.

## Integration contracts and tests

- `mountPersonal({host, storage, getPlan, onSelectPlan, onEndpoint, places})` returns `refresh`, `getState`, and `store`. `onSelectPlan` receives a new route-less draft; use `stationId`/`entranceId` or coordinates to resolve network endpoints, never the local place UUID.
- `fareEstimateHTML(planOrJourney, options)` renders a transparent combined estimate/unsupported explanation with source and version. `estimatePlanFare` also accepts canonical `route.legacyRoute` plus `route.legacyInput`; bus support requires `options.busNetwork`.
- `mountExpenditure({host, storage, getJourney, getFareOptions})` returns `refresh`, `complete`, `ledger`, and `demoLedger`. Call `complete` only after the canonical finish transition and check its `{ok, error}` result. Retry a failed write explicitly; a duplicate successful call is harmless.
- `node --test tests/personal.test.mjs tests/fares.test.mjs tests/fare-ledger.test.mjs` verifies official examples, boundaries, category/date support, migration, reconciliation, reloads, deletion, Singapore periods and storage errors.

The official calculator checks above are public-page UI observations. Automated browser tests are emulation; they do not establish actual card charges or physical-phone results. No external payment or account integration is implemented.
