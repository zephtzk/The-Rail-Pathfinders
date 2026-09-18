# Commute Copilot

A mobile browser MVP for NEBULA X PS2: decide when to leave, understand a disruption and choose a feasible route to Bugis. No login or installation is needed for the app. **Journey times, crowding and transport events are labelled deterministic replay, not live travel advice.**

Hosted preview: [Commute Copilot](https://commute-copilot-nebula.simhongmen.chatgpt.site). Hosting access is currently owner-private; approval to make it public is pending. The app itself has no account system. Public judge access must be enabled before submission.

## Run

Requires Node.js 22 or newer and npm. Validated with Node 24.16.0 and npm 11.13.0 on Windows.

```sh
npm ci
npm test
npm run build
npm run dev
```

Open `http://localhost:4173`. `npm run dev` serves the built release and reloads its Worker after a rebuild. Run `npm run build` after source changes. Service workers require localhost or HTTPS; ordinary LAN HTTP is insufficient for phone offline testing. Use the published HTTPS prototype on phones.

```sh
# Optional automated browser checks
npx playwright install chromium
node tests/browser.mjs
```

The browser test defaults to `http://localhost:4173`. Optional environment variables: `TEST_BASE_URL`, `CAPTURE_DIR`, `BROWSER_EXECUTABLE` (for an existing Edge/Chrome executable). Browser captures are emulation, not physical-phone evidence.

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
- Server: Cloudflare-compatible ESM Worker with `fetch(request, env, ctx)`. Build embeds a small asset table, avoiding framework/runtime dependencies. `GET /api/status` protects the optional LTA key, times out upstream requests, validates responses and returns honest unavailable/partial status. `GET /api/health` is public health metadata.
- Build: `scripts/build.mjs` emits `dist/server/index.js`, public assets and Sites metadata. Node’s test runner covers domain, data, adapter and persistence; Playwright **1.62.1** covers browser flow.

## Configuration and live-data limits

Copy `.env.example` to `.env` if running with your own server configuration. The local server reads process environment; to load a file with current Node, run `node --env-file=.env scripts/serve.mjs` after building.

`LTA_ACCOUNT_KEY` is optional and **server-only**. Configure it as a runtime secret at the hosting provider. Never put it in browser code or a public-prefixed environment variable. No key is included in this release.

Without the key, the live service source explicitly reports unavailable. With a key, the adapter exposes official TrainServiceAlerts notices separately; route estimates and crowding remain replay. The adapter does not invent expiry, travel delays or recoveries from unvalidated text. Integrating current LTA train GTFS and disruption trip updates is future work, not a claim that those feeds do not exist.

Boarding guidance is **unavailable** in the product. The validation function and tests reject stale, incomplete, wrong-train/direction/formation observations and unverified orientation/door maps. Station crowding is not carriage occupancy. No door numbers or seating guarantee are presented.

## Deployment

The checked-in `.openai/hosting.json` identifies this Sites project; do not create a replacement for edits. Build, push the exact source revision to the configured Sites source repository using a temporary per-command credential, package `dist`, save that version and deploy it. Use the Sites connector/skills for this lifecycle. No source credentials belong in files or remotes.

For an independently owned Cloudflare Workers account, the included `wrangler.jsonc` supports:

```sh
npm ci
npm run build
npx wrangler@4 deploy
# Optional server-only DataMall key:
npx wrangler@4 secret put LTA_ACCOUNT_KEY
```

Wrangler deployment requires your authenticated Cloudflare account and is an alternative, not a claim of a second deployed instance.

## Verification and remaining device checks

Automated tests cover normal/stay, planned closure, mid-trip disruption, wrong direction, exact time boundaries, all-late/no-feasible cases, walking limits, preference ranking, deduplication, corrupt storage, source failure, boarding validity and actual offline reload. Physical iPhone Safari and Android Chrome have **not** been tested in this environment. Before submission, check the hosted URL, keyboard visibility, browser-bar changes, 200% text, bright-light readability, real airplane-mode reload and reconnect on both phones.

Engineering evidence and labelled captures are delivered in `engineering_return.zip`. The pitch video, polished write-up and organiser submission assembly belong to the separate submission workflow.

## Attribution and licence

Application code: MIT (see LICENSE). Rail geography: © OpenStreetMap contributors, [ODbL 1.0](https://www.openstreetmap.org/copyright). OSM-derived GeoJSON retains its source metadata and licence. Leaflet is BSD-2-Clause; its licence is included in the built vendor assets. Operator maps and the private participant/reference documents are not redistributed in the app or public repository. [OSM tile policy](https://operations.osmfoundation.org/policies/tiles/) prohibits bulk/offline raster prefetch.
