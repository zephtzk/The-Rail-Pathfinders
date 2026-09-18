# Six-upgrade verification

Recorded 19 September 2026, Asia/Singapore. Runtime implementation commit: `702225c97a381fafe82ba381a954674acd25a7d9`. Later documentation-only commits do not change the application bytes.

## Clean checkout

A new local clone of `codex/commute-six-upgrades` was created with `git clone --no-hardlinks --single-branch`. `npm ci --offline` installed the exact lockfile from the npm cache, without reusing the source checkout's node_modules. This is a fresh install from cached packages, not a fresh registry download. Windows, Node 24.16.0, Python, and installed Edge 153.0.4234.32 were used.

`npm run check` passed **231 JavaScript tests**, **27 rail-import tests**, **12 bus-import tests**, **1 walking-metadata test**, syntax checks and the Worker build. The existing baseline had 140 JavaScript tests. No tests were skipped. The original replay test's OSM attribution selector is scoped to its existing map because the companion adds another attributed map.

## Browser and HTTP results

All these commands passed against the clean checkout. Browser checks are desktop Edge/Chromium automation, including mobile/touch emulation and actual browser offline networking. They are not physical-device tests.

| Command | Result |
| --- | --- |
| `npm run test:browser` | 30 original replay checks passed |
| `npm run test:rail-browser` | 29 rail checks passed |
| `npm run test:multimodal-browser` | 27 bus/walking checks passed |
| `npm run test:phase4-browser` | 39 confirmed-progress/rerouting checks passed |
| `npm run test:upgrades-browser` | 18 integrated checks passed: saved pair, official fare, local QR, two clients, separate consent, closure/replacement, detour return, offline, completion once, narrow/large text and private cache exclusion |
| `npm run test:sharing-privacy-browser` | 8 checks passed: GPS preserves focus/checkpoint selection; stop-location survives visibility changes; pending revocation cannot be downgraded; offline retry; no terminal restart; terminal revocation; lost-acceptance recovery; no browser errors |
| `npm run test:facilities-browser` | Connected fixture mobile flow passed, including unknown real coverage, independent alternative, manual return and unchanged destination/consent |
| `npm run test:sharing-http` | Two isolated HTTP clients and fresh SQLite server passed create/review/accept/revision/restart/revocation, viewer edit denial, request forwarding and unconfigured deployed-provider rejection |

The integrated fare case explicitly selects 10:00 because early-morning discounts require eligibility evidence; it must not assume a standard fare for whatever time the test happens to run. All original replay scenarios remain intact.

## Reproducibility

The working build, clean clone and a new committed-source archive produced identical application identity and Worker bytes after applying the repository's existing LF attributes. The archive check copies the two locked shipped dependencies (Leaflet and QR encoder) and uses the same Node/zlib runtime; it is not a Linux cross-runtime test.

- Application SHA-256: `eee8daf46c8164d0dab161d5226a8374cbd1972f8e479b1655c97581edca94da`
- Worker SHA-256: `b8bdaa8954bfbbc9c7f27f8a4ee370c6b02dbb2c0b43fbd4d653e9d3dfc22caf`
- Build: 52 local assets; Worker approximately 3490 KiB before deployment compression.

Reproduce with the commands in [delivery instructions](UPGRADE_DELIVERY.md). `scripts/verify-reproducible-build.mjs` checks committed-source reproducibility after building; commit local source changes before running it. Browser outputs default to ignored `test-results` directories, with the clean run's original suites captured separately to avoid overwriting historical evidence.

## Not verified or unavailable

- No physical iPhone Safari or Android Chrome devices were available. Keyboard/chrome/safe-area behaviour on those devices remains in the [device checklist](../DEVICE_CHECKLIST.md).
- No complete real accessible entrance–platform–interchange–destination graph or verified real toilet entrance path is available. Indoor/toilet route tests use explicitly fictional fixtures. Real verified toilet-routing coverage is zero.
- No LTA AccountKey was configured, so live facility feed access and real identifier mapping remain unverified. No authoritative escalator or future-maintenance feed was supplied.
- Cloudflare D1 provider logic and migration are implemented, but a provisioned deployed database/HTTPS/audience setup was unavailable. Production durability and genuine two-user access remain unverified.
- Web Push encryption, event delivery to a local test transport, deduplication and expired subscription behaviour pass local tests. External delivery lacks VAPID configuration and has not been tested.
- Browser background location is constrained; native Dynamic Island is not implemented. No route estimate establishes actual arrival or actual payment.
- The existing hosted project, audience and production deployment were unchanged.
