# Six Commute Copilot upgrades

This branch extends the newer Phase 4 checkout (`551b266`), preserving the original replay, imported rail timetable, bus pilot and pedestrian source evidence. The source is a review candidate; the existing hosted site's identity and owner-only audience were not changed. GitHub updates do not deploy the hosted application.

## Completion by feature

| Feature | Implemented and verified locally | Data/platform limit or blocked dependency |
| --- | --- | --- |
| 1. Station guidance | Connected, provenance-bearing graph; original multi-floor schematic; facility list, zoom/recentre and text equivalent; manual checkpoints; constrained routing; original/revised paths and accepted route changes; lift/escalator/ambiguous/shared-failure/no-exit fixtures; server LTA v2 adapter | **Real verified accessible corridor is not implemented.** No retained source establishes a complete entrance–platform–interchange–exit graph. Current real layouts remain incomplete, so no real step-free route is offered. Live LTA call needs server AccountKey and reviewed facility IDs; escalator and future maintenance feeds are unavailable. |
| 2. Caregiver workflow | Recipient QR/copy/system share, explicit pairing, separate progress/location consent, proposed vs accepted routes, SQLite persistence, D1 provider/migration, role checks, hashed expiring credentials, revisions/idempotence, retention, revocation and reconnect protection; two isolated browser clients and backend restart tested | **Deployed service unverified.** Requires provisioned SHARING_DB, migration, scheduled handler, HTTPS and audience access for both users. No production settings were changed. Location is foreground and last-known only; browser coordinates do not prove underground position. |
| 3. Saved places/journeys | Named resolved-coordinate places, rename/reorder/delete, endpoint quick selection/swap, saved pairs/preferences, current selected date/time, reload, v1 migration, storage-error handling, export and separate deletion | Arbitrary coordinates remain unsupported for routing until a checked connection exists; text is never silently resolved. Known station endpoints reuse existing routers. No general-purpose geocoder or real address-to-address accessible corridor is claimed. |
| 4. Ongoing trip/notifications | Shared-state current/next action and ETA, expanded warnings, start/pause/resume/cancel/explicit finish, route revisions, offline restoration; Web Push subscribe/unsubscribe, denied/unsupported handling, server event outbox/retry/expiry, discreet previews, deduplication, in-app fallback; local transport and encryption tests | **External push delivery unverified:** VAPID_PUBLIC_KEY, VAPID_PRIVATE_JWK, VAPID_SUBJECT and supported deployed server required. Notifications are for paired shared journeys. Native Dynamic Island/ActivityKit is **not implemented**. iOS push needs supported Home Screen installation; ordinary browser journey remains usable. Delivery is not guaranteed. |
| 5. Fares/spending | Effective/versioned official standard-card rates; reviewed Paya Lebar→Bugis and Tampines→Bugis official distances; supported bus distance ledger; concessions and bounded transfer/pass checks; combined fare breakdown, integer cents, explicit completion once, actual/estimate reconciliation, manual entries, refunds/deletion/export, Singapore day/Monday-week/month totals, separate rehearsal ledger | Other official rail distance pairs and unsupported products are unavailable/manual. No private SimplyGo API or payment inference. Unconfirmed amounts are **estimates**, not actual card charges. Gate-changing or otherwise unsupported detours require reassessment. |
| 6. Toilets/detours | Graph-based ranking, separate toilet/entrance accessibility, scheduled arrival-time hours, unknown/stale states, manual station/floor selection, map candidate, planned stops, preview/accept/reach/return/resume/cancel, shared facility closure logic, persistent original destination, fare implications and consent isolation; connected fixture A→B replacement tested | **Verified real toilet-routing coverage is zero.** One incomplete OSM toilet node near Bugis is retained; entrance, floor, hours, fee, access and wheelchair attributes are unknown. No suitable real route is recommended. Real corridor needs checked toilets/entrances/connecting paths with reuse rights. No live occupancy, queue or comprehensive toilet-closure feed exists. |

The missing real corridor and verified toilets are substantive data dependencies, not completed capabilities. The workflow demonstration uses an original fictional graph with no geographic coordinates. Existing real exterior paths remain map-supported with unknown accessibility. A floor plan image or station footprint is not promoted into checked connections.

## Setup and migrations

Use Node **22.13+** (Node 24 tested), Python 3.10+, npm. From the repository:

```sh
npm ci
npm run check
npm run dev
```

Open http://localhost:4173. The build includes all new browser modules, data, offline assets and imported Worker modules. Rebuild after client changes; **restart the server after backend changes** because Node caches imported modules. SQLite migration runs automatically in the persistent local provider; its ignored file is `.local-data/sharing.sqlite`. `.env.example` lists placeholders only. To load local secrets explicitly use `node --env-file=.env scripts/serve.mjs`; the ordinary npm dev command uses process environment and does not automatically parse `.env`.

For the optional supported Cloudflare provider, copy/adapt `wrangler.sharing.example.jsonc`, create a D1 database and substitute its returned ID. Apply `migrations/0001_sharing.sql` with `npx wrangler d1 migrations apply commute-copilot-sharing --remote --config wrangler.sharing.example.jsonc`. Provision the three VAPID values as runtime secrets and install the 15-minute scheduled handler. Do not use the placeholder ID or assume these settings are active on the existing Sites project. See [sharing setup](SHARING.md) for access, retention, concurrency and push details. No deployment is included in this delivery.

## Verification commands

The clean-checkout results and exact application hashes are recorded in [verification evidence](UPGRADE_VERIFICATION.md).

```sh
npm run check
npm run test:sharing-http
npm run test:facilities-browser
npm run test:upgrades-browser
npm run test:sharing-privacy-browser
```

Browser commands require a browser installed for Playwright (`npx playwright install chromium`) or `BROWSER_EXECUTABLE` pointing to an installed compatible executable. The main integration script defaults to http://127.0.0.1:4186; set TEST_BASE_URL to the running server. The standalone facility/HTTP scripts start their own isolated loopback servers. Original browser suites remain available: test:browser (TEST_BASE_URL includes /replay.html), test:rail-browser, test:multimodal-browser and test:phase4-browser (base URL only). CAPTURE_DIR can put outputs in an ignored test-results folder.

See [the rehearsal](UPGRADE_DEMO.md), [source coverage](FACILITY_COVERAGE.md), [fare evidence](FARES.md), and [device checklist](../DEVICE_CHECKLIST.md). Automated browser emulation is recorded separately from physical iPhone Safari and Android Chrome, which were unavailable and remain NOT TESTED. A real-device journey, survey, live feed sample, or external delivery result has not been invented.

## Model and privacy

`journey-v2.js` owns the reusable plan, active instance, explicit checkpoints, optional stops, accepted revisions and permission state. Legacy planners supply route candidates; the Phase 4 reroute engine remains a routing context, with accepted changes bridged into the common state. Historical v1 snapshots are retained during migration. A timer never completes a journey or confirms a checkpoint. Local fare and saved-place deletion are separate from demo reset and sharing revocation.

Personal APIs are excluded from service-worker caches and carry private/no-store headers. Invitation credentials are fragments removed immediately, never query parameters. QR generation runs locally. Sharing stores only the latest authorised position/checkpoint and a bounded current plan; no permanent movement or separate toilet-use history is collected. Retention cleanup requires a running local server or the deployed scheduler. Revoke before deleting local browser data if access must end on the server.
