# R3 verification

19 September 2026. Worktree: `The-Rail-Pathfinders-r3`; branch: `codex/features-r3`; merged-R2 baseline: `5b089bb9cfb09ec5df4fa314f3fb2b55074d8e55`. The original R2 checkout remains clean. These are local verification results, not a deployment record.

## Release review follow-up

The R4 handoff review found a compatibility defect not covered by the original checks: an R2 user-added station bookmark without `savedVia` metadata can be hidden by `visiblePersonalState` after a timestamped route references it. Deleting that route can then classify the bookmark as a hidden `route-endpoint`. Original place data remains stored, but the bookmark disappears from Your places. The R3 PR must remain draft until this is corrected and covered by a regression test. Preserve ambiguous older user bookmarks and explicit saved-place intent; do not infer automatic provenance from a route reference alone.

## Final candidate

- Application SHA-256: `287b0001707380ab1ffe129ae4b6985192a402f92e40efc3ccaed9129534c734`
- Worker SHA-256: `2e6b6c5d35d477ab865bd9e84b9b98dc68e705e8cc5f96db97a8c25c6d657b19`
- Runtime source is normalized to the existing LF policy; byte-hashed imported data is unchanged.
- `npm run check`: **274 JavaScript tests, 40 Python tests, syntax checks and build passed**; 67 local assets.
- New integrated R3 browser verification: **36 general checks + 17 address/place checks + 8 current-trip/privacy groups + 4 map checks**, all passed.

The general suite covers in-app Home navigation, six independent views with one controller/map, named route saving, no automatic station bookmarks, cancellation/keep/reload/new journey, spending once, and six screens at 320px with large text. The address suite includes stale requests, no-match/offline errors, explicit result selection, saved-source provenance, no silent transit snapping, hidden imports and byte preservation on display. A targeted unit regression checks that deleting an older R2 route cannot expose its hidden station endpoints.

Cancellation is exercised against the actual local sharing API, including an offline stop followed by reconnect. Local location fixes cannot restart an ended journey; cancellation does not create a completed spending record or revoke a caregiver link. Existing sharing permissions and pending changes remain explicit.

The map test supplies a valid image with HTTP 403: the image must not appear, the schematic must remain, and only explicit Retry can recover the base map. Actual browser request headers are checked to ensure query strings and invitation fragments are not included in the tile referrer. This caught and corrected the initial image-error-only approach, which Edge could bypass by decoding the error image.

## Retained regression suites

The following suites also passed during R3 integration; later visual adjustments only changed labels/layout, and the final saved-endpoint adjustment received focused unit and browser verification.

| Suite | Result |
| --- | --- |
| Unified R2 | 35 checks |
| Original replay | 30 checks |
| Original rail | 29 checks |
| Original multimodal | 27 checks |
| Phase 4 rerouting | 39 checks |
| R1 integrated upgrades | 18 checks |
| Sharing/privacy | 8 groups |
| Location/offline lifecycle | 11 groups |
| Standalone facilities | Passed |
| Two-client sharing HTTP and backend restart | Passed |

Legacy browser selectors were updated for intentional disclosures and navigation changes; the behavioral assertions remain. Full local logs are under `test-results/r3-*`; durable summaries and selected screenshots are under `docs/evidence/r3/`.

## Live provider checks and limits

An explicit public Changi Airport search returned HTTP 200 with Singapore Photon results. An OSM Singapore tile with a valid app referrer returned HTTP 200 with PNG bytes and ordinary cache headers; its CORS header allows the browser's status-checking request. These are point-in-time connectivity checks, not an uptime or completeness guarantee. Sources and service constraints are in [R3 map coverage](R3_MAP_COVERAGE.md).

Environment: Windows, Node 24.16.0, Edge 153.0.4234.32, desktop mobile/touch emulation. Installed locked dependencies were copied from the R2 checkout. This is not a fresh registry installation, physical iPhone/Android test, live crowding validation, deployed sharing test or external push-delivery test. Fixtures are identified; map-failure screenshots intentionally use a blocked tile response.

## Reproduce and preview

Run from the R3 application checkout:

```powershell
npm run check
$env:PORT='4193'
npm run dev
```

The local preview is `http://localhost:4193/`. Before starting another server, inspect that port. In a separate terminal:

```powershell
$env:TEST_BASE_URL='http://127.0.0.1:4193'
$env:BROWSER_EXECUTABLE='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
npm run test:r3-browser
node tests/r3-places-browser.mjs
node tests/r3-current-trip-browser.mjs
node tests/r3-map-browser.mjs
```

No R3 merge, production deployment or audience change was performed.
