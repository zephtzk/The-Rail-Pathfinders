# Commute Copilot — The Rail Pathfinders

**Six-upgrade review candidate:** start with [completion, limits and setup](docs/UPGRADE_DELIVERY.md), the [two-device rehearsal](docs/UPGRADE_DEMO.md), [facility/toilet coverage](docs/FACILITY_COVERAGE.md), [sharing and database setup](docs/SHARING.md), and [fares](docs/FARES.md). The companion is integrated below all existing planners. Review a selected journey, then start it or create a recipient link.

The browser workflows, local durable sharing and tests are implemented. A real verified step-free door-to-door corridor and real verified toilet entrance paths remain blocked by missing checked source data. Deployed D1/push delivery and physical phones are unverified. The existing production site and audience are unchanged.

The following Phase 4 publication information describes the **previous hosted release**, not a deployment of this branch.


Previous hosted delivery: **Phase 4 user-testing build, published for owner testing**. Start with the [publication report](docs/PHASE4_PUBLICATION.md) and [repeatable device checklist](DEVICE_CHECKLIST.md). This round evaluates scheduled planning, journey acceptance, confirmed progress, offline guidance and explicitly labelled synthetic rerouting. Real-provider routing effects remain disabled and unfinished.

| Entry page | Use in this round |
| --- | --- |
| `/multimodal.html` | Main Phase 4 test: accept a journey, confirm progress, compare synthetic changes and reload offline. |
| `/` | General station-to-station scheduled rail planner, 186 imported station records. |
| `/replay.html` | Original fictional corridor replay and optional Phase 1 advisory panel; separate from the scheduled planner. |
| `/data/application-build.json` | Compare the application SHA-256 with the candidate report before recording a test. |

The [existing Site](https://commute-copilot-nebula.simhongmen.chatgpt.site) serves **version 3**, source `32d97e39172827cd31916f62aa39603c2cb3e5b3`, with **owner-only access**. Sign in as the authorized owner; external testers need a separately approved access arrangement after owner phone smoke tests. Local testing needs no account. GitHub and Sites were published separately; a future GitHub push alone will not update the hosted app. The publication report records the verified build and distinguishes later documentation updates from the deployed source.

Use the fixed date **18 September 2026** for the checklist, even when testing later. Rail dates are **18 September–31 December 2026**, subject to actual calendars, exceptions and genuine after-midnight carryover. Bus services **2, 23 and 28** cover 261 stops, ordinary weekdays **18 September–2 October 2026**, with both boarding and alighting within **09:30–16:30**. Four map-supported exterior bus/rail paths are included at Paya Lebar and Bugis. All times are Asia/Singapore.

Bus timing uses published maximum off-peak headway and an uncalibrated ride model of 18 km/h plus 30 seconds per stop. Arrival estimates and deadlines are not guarantees. No address search, step-free assurance, broader bus coverage or intermediate onboard alighting was supported in that release. This branch adds the bounded fare and companion features described above. Confirmed progress recalculation supports the accepted civil date; earlier progress corrections require a new reviewed acceptance. Current arrivals and notices are advisory only. Scheduled, synthetic and offline testing needs **no DataMall key**; hosted real advisory feeds need a securely configured `LTA_ACCOUNT_KEY`.

See [coverage](docs/PHASE3_COVERAGE.md), [historical Phase 4 acceptance](docs/PHASE4_REPORT.md), [operations](docs/PHASE4_OPERATIONS.md) and the [milestone ledger](docs/MILESTONES.md). Physical Android Chrome and iPhone Safari checks remain **NOT TESTED**; desktop emulation does not close them.

## Run and verify

Requires Node.js 22.13+ (Node 24 tested) and Python 3.10+. The importer uses only Python's standard library.

```sh
npm ci
npm run check
npm run dev
```

Open `http://localhost:4173`. The development server serves built output; rebuild after edits. Use the process `PORT` environment variable if that port is occupied. No DataMall key is needed to use or repeat the included import.

```sh
npm run import:rail
npm run test:import
npm test
npm run benchmark:rail
npm run test:rail-browser
npm run test:multimodal-browser
npm run import:bus
npm run test:bus-import
npm run benchmark:multimodal
node tests/rail-offline-browser.mjs
python scripts/verify-walking.py
npm run test:browser
node tests/live-browser.mjs
```

For the complete bounded readiness run (build, all existing unit/import checks, walking verification, Worker/comparison budgets and six browser suites):

```powershell
$env:BROWSER_EXECUTABLE='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
$env:READINESS_REQUIRE_CLEAN='1'
npm run verify:readiness
```

Run the clean-candidate check after committing all intended source changes. The runner starts its own no-secret loopback server on port 4181, stops it afterward and writes the exact commit, application/Worker hashes and logs to ignored `test-results/readiness-candidate/`. Set `READINESS_PORT` if occupied or `READINESS_OUTPUT` to retain another run. It does not call live providers or modify hosted state.

Playwright requires installed Chromium or an existing Edge/Chrome via `BROWSER_EXECUTABLE`. Set `TEST_BASE_URL` to the root for rail tests and `/replay.html` for the two existing suites. `CAPTURE_DIR` selects browser evidence output. These tests are desktop emulation, not physical-phone evidence.

## What is supported

Query dates are **18 September–31 December 2026**, plus genuine after-midnight carryover from the final service day. Individual calendars and exceptions determine actual availability. The source contains **19 rail service patterns, 17,575 accepted trips and 333,231 stop times**. One impossible zero-second ride caused its whole trip to be quarantined, with the reason recorded.

The model has **27 reviewed standard interchange groups**. Tap-out connections at Newton, Tampines and Bukit Panjang are excluded, while those stations remain selectable endpoints. Access and exit each assume 2 minutes. Interchange walking assumes 4–8 minutes; changing trains at the identical platform assumes 1 minute without extra walking. These are planning allowances, not measured paths or accessibility guarantees. The rail schematic connects scheduled stop coordinates; it cannot establish a walking link.

Calendars follow the source literally. `SERVICE_PH` is an identifier, not holiday logic. Public-holiday substitutions absent from the supplied exceptions remain unverified.

Try **Yew Tee ↔ Punggol Coast**, 19 September, 08:10 departure, 11:00 deadline, 30-minute walking limit. The fastest routes use two transfers each way. **South View ↔ Punggol Coast** exercises three transfers. A BP journey on 20 September demonstrates a supplied cancellation exception. Unsupported dates, unknown stations, walking violations and impossible deadlines receive explanations.

Preferences are fastest arrival, fewer transfers and less walking within an extra-time allowance and deadline. Quieter explicitly falls back to fastest because comparable journey crowding is unavailable. The default search horizon is six hours; a later explicit deadline can extend it up to 48 hours. After-midnight deadlines require the next day's date.

## Versioned import and architecture

`data/rail/sources/` holds the licensed immutable source ZIP and sanitised acquisition metadata. `scripts/create-rail-rules.py` materialises individually reviewed platform groups into `data/rail/validation.json`. Parent membership, names and proximity never infer transfers. `scripts/import-rail.py` validates the archive and emits `public/data/rail-network.json` and `rail-manifest.json`. Source, metadata, rules, importer and compiled artifact hashes are checked before every build.

For a new snapshot, run `python scripts/download-rail.py --gui`, entering the DataMall key only in its masked local window. Without `--gui`, use a real terminal for hidden entry. One bounded download saves the archive and sanitised metadata, never credentials or signed URLs. Review the new archive, update pinned paths/rules, and validate before promoting it. Downloading new data does not automatically extend validated coverage. The included snapshot was acquired through the existing secure local session without extracting or persisting its key.

- `src/rail-engine.js`: pure multi-criteria connection scan, stable source IDs, trip direction, dwell, boarding restrictions, calendars, carryover and explicit interchange rules.
- `src/rail-ui.js` and `rail.css`: station choices, coverage, schedule provenance, timing explanation, preferences, schematic and saved guidance.
- `src/engine.js`, `data.js`, `app.js`: preserved corridor replay. Phase 1 live notices and station crowding remain advisory there.
- `public/sw.js`: caches the same-origin shell and pinned rail data, retaining original provenance; never caches API responses or OSM tiles.
- `scripts/build.mjs`: static assets plus a Cloudflare-compatible Worker, serving compressed rail data with an identity fallback. `scripts/serve.mjs` runs it locally.

The source has no shapes or transfers table. Explicit interchange rules are a separate versioned input. Independent reference-network tests and an event-state oracle validate routing; imported-data tests check an exact raw-source trip and multi-transfer journeys.

## Original corridor and live panel

At `/replay.html`, **Reset demo** restores Tampines 08:10 → Bugis 08:41, the historical **31-minute replay assumption**. Planned works uses a 49-minute alternative; the Paya Lebar disruption compares 09:03 with 08:59. These fictional scenarios remain tested and never alter the timetable planner.

The pinned Saturday timetable instead has 2 minutes access + 5m20s wait + 31 minutes riding on `EWL_Main_WB_WE_31` + 2 minutes exit = **08:50:20**. The difference is intentional and traceable to the distinct data sources.

For optional Phase 1 live information, build then run `python scripts/run-live-local.py --gui`. Enter the DataMall API key only in the masked field; it remains server-side in process memory. Station crowding is not carriage occupancy. The Phase 1 ledger retains its unobserved live-variant limits. EXTOL uses a separate SDK credential and is outside this phase.

## Deployment and licence

The authorized GitHub push and Sites version 3 deployment are recorded in the [publication report](docs/PHASE4_PUBLICATION.md). The existing Sites identity and owner-only audience are preserved. Owner phone smoke tests and explicitly approved tester access remain before invitations.

Application code: MIT. LTA GTFS and DataMall data: [Singapore Open Data Licence v1.0](https://data.gov.sg/open-data-licence), attributed with retrieval time in the UI and manifest, not relicensed as MIT. Official map references establish interchange topology. Two operator locality-map JPEGs are retained in Git as provenance evidence, carry their original copyright notices, and are not application basemaps. The owner's confirmation of written redistribution permission is recorded in [publication authorization](docs/PUBLICATION_AUTHORIZATION.md); the permission document was not independently reviewed. See [third-party notices](THIRD_PARTY_NOTICES.md). Legacy corridor geometry: © OpenStreetMap contributors, [ODbL](https://www.openstreetmap.org/copyright). Leaflet: BSD-2-Clause. No official endorsement or live service guarantee is implied.
