# The-Rail-Pathfinders — Commute Copilot

Source repository: [The-Rail-Pathfinders](https://github.com/zephtzk/The-Rail-Pathfinders).

A mobile browser MVP for NEBULA X PS2: decide when to leave, understand a disruption and choose a feasible route to Bugis. No login or installation is needed for the app. **Journey times, route ranking, demo crowding and demo events remain deterministic replay.** A separate live-information panel shows official DataMall service notices and station reports for the existing corridor, with explicit source times and unavailable/expired states.

Hosted preview: [Commute Copilot](https://commute-copilot-nebula.simhongmen.chatgpt.site). Hosting remains owner-private, on the earlier version 2 source. **Phase 1 is a local/Git delivery; it has not been deployed.** Its implementation does not authorize a hosting audience change. See [the milestone ledger](docs/MILESTONES.md#phase-1--live-information-on-the-existing-corridor) for check-by-check evidence and remaining live-validation limits.

## Run

Requires Node.js 22 or newer and npm. Validated with Node 24.16.0 and npm 11.13.0 on Windows.

```sh
npm ci
npm test
npm run build
npm run dev
```

Open `http://localhost:4173`. `npm run dev` serves the built release and reloads its Worker after a rebuild. Run `npm run build` after source changes. Service workers require localhost or HTTPS; ordinary LAN HTTP is insufficient for phone offline testing. The published HTTPS prototype can test only the older baseline. Phase 1 physical-device verification awaits a separately authorized HTTPS build.

```sh
# Optional automated browser checks
npx playwright install chromium
node tests/browser.mjs
node tests/live-browser.mjs
```

The browser test defaults to `http://localhost:4173`. Optional environment variables: `TEST_BASE_URL`, `CAPTURE_DIR`, `BROWSER_EXECUTABLE` (for an existing Edge/Chrome executable). Browser captures are emulation, not physical-phone evidence.

To run with live DataMall information, first build, then use Python 3.10+ with Tkinter:

```sh
npm run check
python scripts/run-live-local.py --gui
```

Enter the **DataMall API Access Key** only in the masked desktop field and start the local session. Open `http://localhost:4173`, then select **View live corridor notices and station reports**. The key stays in the local processes' memory; no credential file is written. Close the entry window to stop that server. Stop any other server using port 4173 first, or pass `--port 4175`. A real interactive terminal can run the script without `--gui` for hidden terminal entry. EXTOL's separate SDK key is not used.

While that session is running, `node scripts/verify-live.mjs` records a sanitised application-adapter check in ignored `test-results/phase1/live-adapter.json`. It excludes notice text, request headers and credentials. Use `TEST_BASE_URL` if you selected another port. This is a live check; the browser suite's feed fixtures are separate evidence. Without a key, `npm run dev` still provides the reproducible demo and explicitly unavailable live sources.

## Supported journey

- Origin: Tampines EW2 or Paya Lebar EW8/CC9. Destination: Bugis EW12/DT14. Singapore time; same-day departure and deadline.
- Direct: East West Line westbound toward Tuas Link.
- Alternative: East West to Paya Lebar where needed, Circle clockwise via Dakota to Promenade, then Downtown toward Bukit Panjang to Bugis.
- Replanning is from a user-confirmed Paya Lebar position on the replay clock. No GPS tracking, arbitrary address routing, bus routing, fares, live timetable routing or step-free guarantee.

The actual OSM rail geometry includes 16 directed segments and 19 line-specific station positions. Paya Lebar and Promenade interchange **topology** is verified by operator/LTA sources. Dashed transfer connectors are illustrative links between platform anchors, not surveyed indoor walking paths. Follow station signs; all walking allowances are scenario assumptions. See `public/data/sources.json`.

## Reproducible demonstration

Default: 19 September 2026, depart Tampines 08:10, deadline 09:00, walking limit 12 minutes, fastest preference.

1. **Reset demo**. Normal arrival is 08:41, with 19 minutes of buffer. Inspect the next move, journey strip, steps and Map.
2. **Demo controls → Planned track works**. A fictional 08:00–10:00 westbound closure Paya Lebar→Aljunied makes the direct route unavailable. The alternative takes 49 minutes; leave by 08:11 for 09:00.
3. **Demo controls → Disruption during travel**. The clock advances to 08:29 at Paya Lebar. A fictional 22-minute delay yields a 09:03 direct arrival. **Compare options** shows a 30-minute remaining alternative arriving 08:59.
4. **Use this route**. The app confirms Route updated and saves it. View the alternative geometry.
5. **Save for offline**. Wait for Offline app ready. Disable the browser/device network and reload. The selected journey, steps, geometry and schematic remain; no offline OSM basemap is promised.
6. Reconnect: the selected route stays selected. **Reset demo** clears only this app’s saved journey and resets fixtures.

**Run automatic event replay** surfaces a planned change after five seconds and a mid-journey disruption after fourteen seconds while the page is open. Manual scenario buttons make rehearsal immediate. Irrelevant time-window/direction events and repeat alert IDs are suppressed. Closed-tab push is omitted.

## Decision model

Access, waiting, rides, interchange walking and exit time all count. Events match directed edges and half-open time intervals. Each event’s delay is applied once, even across split ride legs. Edge timing within a ride is evenly apportioned for the fixture; this is not a timetable claim.

1. Exclude closed routes, unverified transfer connections and routes above the total walking allowance (including completed access walking).
2. Prefer routes that meet the deadline. If none do, choose the earliest feasible arrival and disclose lateness.
3. Fastest weights speed 0.8 and comfort 0.2; lower crowding uses 0.5/0.5 within the user’s extra-time allowance. Speed is `clamp(1 - (duration - fastestDuration)/30, 0, 1)`; comfort is `1 - crowdingLoad`, with unknown crowding scoring zero. Higher is better on both scales.
4. Retain a selected on-time route rather than switch for less than three minutes of fastest-mode benefit. Preference changes need not change the recommendation.

Default arithmetic (all minutes): direct `2 access + 3 wait + 14 EW + 10 EW + 2 exit = 31`; alternative from Tampines `2 + 3 + 14 + 4 transfer + 3 wait + 12 CC + 4 transfer + 3 wait + 2 DT + 2 exit = 49`. At Paya Lebar 08:29, staying is `10 ride + 22 delay + 2 exit = 34`, arriving 09:03; alternative is `4 + 3 + 12 + 4 + 3 + 2 + 2 = 30`, arriving 08:59. The four-minute difference is fixture arithmetic, not measured real-world savings.

A Paya Lebar **origin** enters Circle directly: `2 access + 3 wait + 12 CC + 4 transfer + 3 wait + 2 DT + 2 exit = 28`, one transfer, eight minutes walking. Arriving on EW from Tampines still requires the Paya Lebar transfer.

## Architecture and data contract

- Browser: vanilla ES modules, semantic HTML/CSS, Leaflet **1.9.4**. No UI framework or LLM dependency.
- Engine: pure functions in `src/engine.js`; static corridor contract and fixtures in `src/data.js`.
- State: journey inputs; selected route ID; replay scene; confirmed current stop/time; routes with timed legs and source metadata; geometry; alert keys. Journey state and connection/source state are independent.
- Persistence: versioned, validated localStorage snapshot, verified after write. Service worker caches the same-origin shell and GeoJSON. Each build hashes its cache version. Standard OSM raster tiles are never prefetched or intercepted by the service worker.
- Server: Cloudflare-compatible ESM Worker with `fetch(request, env, ctx)`. Build embeds a small asset table, avoiding framework/runtime dependencies. `GET /api/status` returns separately normalised notices and EWL/CCL/DTL station reports. Bounded upstream requests, shared per-process caching and failure backoff protect the optional server-only key. `GET /api/health` is public health metadata.
- Build: `scripts/build.mjs` emits `dist/server/index.js`, public assets and Sites metadata. Node’s test runner covers domain, data, adapter and persistence; Playwright **1.62.1** covers browser flow.

## Configuration and live-data limits

`LTA_ACCOUNT_KEY` is optional and **server-only**. Prefer the masked local launcher above. A managed runtime can inject the process environment securely. A later authorized deployment would use the existing hosting project's secret settings. Never put the key in browser code, a public-prefixed variable, chat, Git or a literal shell command. No key is included in this release.

Phase 1 reads TrainServiceAlerts and PCDRealTime for EWL, CCL and DTL. The corridor has 19 line-specific codes: EW2–EW12, CC4–CC9 and DT14–DT15. Live checks matched all 19; the sampled intervals were already expired. The panel shows such bands only as last reported, with current crowding unavailable. A fresh fetch, cache hit, reconnect or saved-state restoration cannot extend the original source interval. Missing, invalid, future, conflicting or NA observations cannot earn a current label. Local clock accuracy still matters.

Source requests time out after six seconds and accept at most 2 MiB each. Per-process/isolate caching is 60 seconds for notices and 10 minutes for crowding; concurrent requests share the same fetch. Failures back off at least 60 seconds, authentication failures five minutes, and rate limits honor longer Retry-After values. The browser requests the adapter at most on its 60-second timer plus explicit/resume events; the server cache applies to those events. Visible interval expiry is re-evaluated every second. This is not a global distributed rate limiter or a provider freshness guarantee.

Notice status 1 means normal service **or minor delays**, not a corridor all-clear. Structured segments are matched conservatively; general messages are not linked to segments by list order or prose. Missing timezones/validity remain unconfirmed. All live information is advisory in this phase: route durations, preference ranking and rerouting remain the labelled replay calculation. No numerical delay, closure, recovery, train arrival or future-journey crowding is inferred from the live feeds. GTFS import/routing and disruption trip-update integration are later work.

Boarding guidance is **unavailable** in the product. The validation function and tests reject stale, incomplete, wrong-train/direction/formation observations and unverified orientation/door maps. Station crowding is not carriage occupancy. No door numbers or seating guarantee are presented.

## Deployment

The checked-in `.openai/hosting.json` identifies the existing Sites project; preserve its identity and private audience. **No deployment is part of Phase 1.** A later explicitly authorized deployment should use the Sites connector/skills and the existing project. Publishing a Git branch is not publishing a hosted version or changing its visibility. No source credentials belong in files or remotes.

For an independently owned Cloudflare Workers account, the included `wrangler.jsonc` supports:

```sh
npm ci
npm run build
npx wrangler@4 deploy
# Optional server-only DataMall key:
npx wrangler@4 secret put LTA_ACCOUNT_KEY
```

These commands are reference material for a separately authorized deployment. Wrangler requires your authenticated Cloudflare account; no second instance has been deployed.

## Verification and remaining device checks

Phase 1 passed 48 automated tests and 53 Edge browser checks (30 existing plus 23 new). Coverage includes replay calculations/preferences, structured notice relevance, source interval boundaries, future/missing/expired data, credential redaction, cache/backoff, partial failures, corrupt saved state and actual browser offline reload/reconnection. Sanitised evidence is in [docs/evidence/phase1](docs/evidence/phase1/).

Authenticated application access and all 19 crowd station mappings passed. A currently valid live crowd interval and a nonempty live affected-segment/disruption/recovery response were **NOT TESTED** because the sampled provider responses did not contain them; synthetic coverage does not clear those live checks. Physical iPhone Safari and Android Chrome remain **NOT TESTED**. Before a later release, check its authorized hosted build, keyboard/browser-bar behavior, bright-light readability and airplane-mode reload/reconnect on both phones.

The earlier `engineering_return.zip` is historical baseline evidence and was not rebuilt for Phase 1. Current Phase 1 evidence is in [docs/evidence/phase1](docs/evidence/phase1/); locally generated emulation captures are in ignored `test-results/phase1/`. The pitch video, polished write-up and organiser submission assembly belong to the separate submission workflow.

## Attribution and licence

Application code: MIT (see LICENSE). Rail geography: © OpenStreetMap contributors, [ODbL 1.0](https://www.openstreetmap.org/copyright). OSM-derived GeoJSON retains its source metadata and licence. Leaflet is BSD-2-Clause; its licence is included in the built vendor assets. Operator maps and the private participant/reference documents are not redistributed in the app or public repository. [OSM tile policy](https://operations.osmfoundation.org/policies/tiles/) prohibits bulk/offline raster prefetch.

Live data: LTA DataMall — TrainServiceAlerts and Station Crowd Density Real Time, with access times shown in the panel, under the [Singapore Open Data Licence v1.0](https://data.gov.sg/open-data-licence). DataMall data is not relicensed as MIT code. The product uses plain source attribution and this official licence link, without direct DataMall API/download links or an endorsement claim.
