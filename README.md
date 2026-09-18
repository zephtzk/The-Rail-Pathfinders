# Commute Copilot — The Rail Pathfinders

Current delivery: **Phase 4 local release candidate**. Confirmed progress and resilient accepted guidance are available in `/multimodal.html`; real routing effects remain disabled. See [acceptance report](docs/PHASE4_REPORT.md) and [operating / rollback instructions](docs/PHASE4_OPERATIONS.md). Deployment is blocked by the explicit no-push instruction and Sites source-push requirement; the existing private site remains version 2.


A Singapore **station-to-station scheduled rail planner**, using a general routing engine and a pinned, reproducible LTA GTFS import. Choose any pair of **186 imported station records**, with calendars, directed trips and reviewed interchange connections. Access, waiting, riding, transfers and exit all count.

The **[Phase 3 bus & walking pilot](docs/PHASE3_REPORT.md)** is at `/multimodal.html`: complete services **2, 23 and 28**, 261 bus stops, estimated weekday timing and four map-supported bus/rail paths at Paya Lebar and Bugis. Wider scheduled rail stays at `/`. Address search, fare and step-free routing are not supported. The original corridor replay and Phase 1 live information remain separate at `/replay.html`.

Bus estimates support ordinary weekdays **18 September–2 October 2026, 09:30–16:30**. Published maximum off-peak headway is the wait assumption; distance at 18 km/h plus 30 seconds per stop is the uncalibrated ride model. An estimated deadline is not guaranteed. Current arrivals are optional advisory information and never alter future-date or downstream timings. See [bus data](docs/BUS_DATA.md), [walking evidence](docs/WALKING_COVERAGE.md), and [combined coverage](docs/PHASE3_COVERAGE.md).

Phase 3 is committed locally only. No push, PR, hosting or audience change is part of this delivery.

See the [Phase 2 report](docs/PHASE2_REPORT.md), [coverage summary](docs/RAIL_COVERAGE.md) and [milestone ledger](docs/MILESTONES.md). The [existing private hosted preview](https://commute-copilot-nebula.simhongmen.chatgpt.site) remains an older release. **Phase 2 is not deployed.**

## Run and verify

Requires Node.js 22+ and Python 3.10+. The importer uses only Python's standard library.

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

No hosted release or audience change is part of Phase 2. Preserve the existing Sites identity in `.openai/hosting.json` and its private audience. Local implementation, Git publication and hosted release are distinct.

Application code: MIT. LTA GTFS and DataMall data: [Singapore Open Data Licence v1.0](https://data.gov.sg/open-data-licence), attributed with retrieval time in the UI and manifest, not relicensed as MIT. Official map references establish interchange topology; map images are not redistributed. Legacy corridor geometry: © OpenStreetMap contributors, [ODbL](https://www.openstreetmap.org/copyright). Leaflet: BSD-2-Clause. No official endorsement or live service guarantee is implied.
