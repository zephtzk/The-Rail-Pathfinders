# Caregiver sharing and Web Push

The sharing API is a persistent backend, not browser-to-browser localStorage. The local server uses SQLite WAL (`node:sqlite`, Node 22.13+ or Node 24). The deployed provider uses a Cloudflare D1 binding named `SHARING_DB`. The same API, authorization, revision and consent logic runs in both environments. The existing `.openai/hosting.json` project identity and audience are preserved; this change does **not** assert that its current hosted runtime has a database binding.

## Local setup

```sh
npm ci
npm run build
npm run dev
```

The server creates ignored `.local-data/sharing.sqlite`. Restarting it retains shares, scoped credential hashes, rate limits, subscription registrations and delivery jobs. `SHARING_SQLITE_PATH` can select another private writable file. Do not place the database in a public asset directory. Restrict its filesystem ACL to the server account; use encrypted storage on devices holding personal data. SQLite is the local provider; an in-memory map is never a production fallback.

Set `HOST=0.0.0.0` only for an intended local network demonstration. A second browser can review and accept the recipient link at the server's reachable address. Browser geolocation and push normally need HTTPS, with localhost exceptions; a LAN HTTP test verifies sharing and manual check-ins, not mobile geolocation or external push. Use an HTTPS development tunnel under your control for that device test.

## Cloudflare deployment prerequisite

Create a D1 database, apply the migration, and configure the binding in the runtime actually receiving API requests:

```sh
npx wrangler d1 create commute-copilot-sharing
npx wrangler d1 migrations apply commute-copilot-sharing --remote
```

Add the returned real ID to the deployment configuration, retaining the existing Worker/project identity:

```json
{
  "d1_databases": [{
    "binding": "SHARING_DB",
    "database_name": "commute-copilot-sharing",
    "database_id": "REPLACE_WITH_RETURNED_D1_DATABASE_ID",
    "migrations_dir": "migrations"
  }],
  "triggers": {"crons": ["*/15 * * * *"]}
}
```

The built Worker exposes a scheduled handler calling `runSharingMaintenance(env)`. The cron drains retries and deletes expired records even when no browser is open. The local server runs the same work once per minute. Monitor scheduled-handler failures. A stopped server cannot execute cleanup; starting the local server performs maintenance before accepting requests.

The binding/migration, working scheduled trigger, HTTPS origin, and an audience allowing both intended users are required for a deployed demonstration. An owner-private Sites audience blocks the second user before the app runs. A trip link cannot bypass it. No audience setting is changed by this implementation. If the existing host cannot bind D1 and a scheduled handler, deploy this same Worker to a supported Cloudflare environment as a separately authorized hosting decision; do not claim the existing site has working production sharing. Unconfigured API calls return 503 explicitly.

This is a bounded pilot provider: at most 20 retained shares, five subscriptions per role/share, 24 KiB per proposed/accepted plan, and 128 recent idempotency receipts. A D1 JSON document with an atomic conditional revision update contains the pilot state; it deliberately avoids partially committing consent versus a queued delivery. Scale-up requires partitioning with transactional coordination rather than removing these bounds. The SQL migration is `migrations/0001_sharing.sql`.

## Authentication and API

All API responses are `Cache-Control: no-store, private`, `Vary: Authorization`, and `Referrer-Policy: no-referrer`; service workers must exclude `/api/`. Every credential is a cryptographically generated 256-bit bearer secret (or a cryptographic acceptance derivation) and only its SHA-256 digest is stored. Secrets expire with the share after 1–168 hours (48 by default). Keep recipient/view links in a URL **fragment**, such as `#invite=ID.TOKEN`, and remove the fragment immediately after reading it. Never put credentials, addresses or coordinates in URL query strings, telemetry or logs. The local server logs neither headers nor request URLs. Apply equivalent access-log redaction at an external reverse proxy.

Use `Authorization: Bearer TOKEN`. All mutations, including DELETE, require `Content-Type: application/json`. Origin-bearing cross-origin requests are rejected; no cross-origin API permission is emitted. IDs are 22 base64url characters, credentials 43. All dates returned as `expiresAt`, `timestamp`, `updatedAt` and `confirmedAt` are epoch milliseconds unless embedded in the traveller's own plan.

| Endpoint | Credential / body | Result |
| --- | --- | --- |
| `POST /api/shares` | `{plan, expiresInHours?}` | `{id, revision:1, expiresAt, inviteToken, editorToken, viewerToken}` |
| `GET /api/shares/:id` | invite, editor, traveller or viewer | Role-filtered view below |
| `POST /api/shares/:id/accept` | invite; `{eventId, expectedRevision, consent:{progress,location}}` | Consumes invitation, explicitly pairs one traveller, returns `travellerToken` and traveller view |
| `PATCH /api/shares/:id/plan` | editor; `{eventId, expectedRevision, plan}` | Stores a proposed plan only; never replaces the accepted plan |
| `PATCH /api/shares/:id/progress` | traveller; progress body below | Stores authorized minimal update; sends a discreet event for material accepted changes |
| `PATCH /api/shares/:id/permissions` | traveller; `{eventId, expectedRevision, consent:{progress,location}, paused?:boolean}` | Changes consent, advances sharing epoch, clears unauthorized stored location/progress and queued viewer delivery |
| `DELETE /api/shares/:id/access` | traveller; `{eventId, expectedRevision}` | Revokes caregiver editor/viewer and invitation powers permanently; keeps traveller record for deletion/completion |
| `DELETE /api/shares/:id` | traveller or editor; `{eventId, expectedRevision}` | Deletes shared data, subscription and delivery records |
| `GET /api/push/config` | no credential | Configuration, public key, transport, missing prerequisites; no private secrets |
| `POST /api/push/subscriptions` | traveller or viewer; `{shareId,subscription}` | Validates/stores a browser `PushSubscription.toJSON()` |
| `DELETE /api/push/subscriptions` | same role credential; `{shareId,endpoint}` | Unsubscribes that role/device and clears its pending events |

Plans are bounded JSON with `schemaVersion:2`, `origin` and `destination` objects. They may contain the shared journey model's route, departure date/time, accessibility preferences, optional stops and estimate provenance. Sharing a plan is an explicit disclosure of its endpoints. Do not attach unrelated saved addresses or fare history.

Progress body:

```json
{
  "eventId": "fresh-random-client-event-id",
  "expectedRevision": 2,
  "sharingEpoch": 0,
  "routeRevision": 1,
  "status": "started",
  "checkpoint": {"id":"manually-confirmed-facility","confirmedAt":1790000000000},
  "eta": "2026-09-18T12:30:00Z",
  "acceptedPlan": {"schemaVersion":2,"origin":{},"destination":{},"route":{}},
  "location": {"latitude":1.3,"longitude":103.8,"accuracy":80,"timestamp":1790000000000}
}
```

`acceptedPlan` is optional and is sent only following traveller acceptance. `location` is optional, separately authorized, cannot be older than five minutes or more than ten seconds in the future, and contains only the latest coordinates, timestamp and horizontal accuracy. Browser coordinates never establish an indoor floor. Status is one of `accepted`, `started`, `active`, `paused`, `completed`, `cancelled`. Completion/cancellation immediately removes location, advances the epoch and rejects further progress collection.

Every mutation event needs a stable random `eventId` of 8–100 letters, digits, `_` or `-`. Retry the **same** payload and ID after a lost response. A different payload under the same event ID is rejected. Concurrent writes use compare-and-swap; conflicts return 409 with `currentRevision`. Fetch current state and obtain a new explicit decision as necessary; never silently overwrite a route. Acceptance retries with the same invitation and event ID recover the same claimant token, but the consumed invitation cannot review live data or accept a second claimant. Keep that acceptance event ID until the response is durable locally.

The view includes `revision`, `sharingEpoch`, `expiresAt`, `role`, `paired`, and role-appropriate data. Invite/editor views include `proposedPlan`, `planRevision`, and pairing status only. Traveller view includes proposed and accepted plans. Viewer `acceptedPlan` and `progress` require progress consent and unpaused sharing. Viewer `location` separately requires location consent and unpaused sharing. No consent is implied by pairing; omitted acceptance consent defaults to both off. `locationState` is `not-shared`, `paused`, `unknown`, `stale` (older than two minutes) or `last-known`.

On pause, consent change, or revocation discard all pending location uploads in the browser. The server requires the exact `sharingEpoch` on progress uploads as a second guard, so old queued coordinates cannot restart collection after resume. Revocation cannot be reversed using the old credentials; create and explicitly accept a new share. The server cannot recall a generic push request already in flight, but it contains no coordinates, toilet use, addresses or medical details.

Durable limits are ten creations/hour/IP, 120 accesses/minute/credential/IP and 600 requests/minute/IP. The local server replaces caller-supplied IP headers with its socket address. In production the Cloudflare edge supplies `CF-Connecting-IP`. Do not trust that header on an unprotected alternative proxy.

## Retention and deletion

Only the latest location and latest authorized checkpoint/ETA are retained; there is no movement or toilet-use trail. Permission removal clears unauthorized data immediately. Completion removes location immediately. Shared plans, role hashes and state are removed 23 hours after completion or expiry; the 15-minute cron leaves margin inside the 24-hour target. Related subscriptions and outbox records are removed together. Expired credentials are rejected regardless of whether cleanup has run. Rate buckets expire after their interval. Idempotency receipts retain only event IDs and payload hashes, not previous coordinates. Local saved places and fare records have separate user-controlled deletion.

## Web Push configuration and verification

Delivery is implemented with RFC 8291 `aes128gcm` encryption and RFC 8292 ES256 VAPID using Web Crypto, compatible with the Worker runtime. Accepted route changes, status changes and caregiver proposals enqueue durable server events. Viewer notifications require current progress consent at queue time and immediately before dispatch. The server uses leases and bounded retries; 404/410 removes expired subscriptions. Each device retains at most one in-flight and one latest pending generic event; older pending updates are coalesced and acknowledged jobs are deleted. Delivery is at-least-once around a server crash, so the service worker also deduplicates the stable `eventId` in IndexedDB. Push text is always “Journey updated”; it contains no destination, coordinate, toilet stop or sensitive capability URL. Supported push service hosts are explicitly allowed; redirects and arbitrary/private endpoints are rejected.

Generate credentials once into an ignored file (treat the output as private):

```sh
node scripts/generate-vapid.mjs > .env.push
```

Set a real contact `VAPID_SUBJECT`, then supply these exact runtime values:

- `VAPID_PUBLIC_KEY`: uncompressed P-256 public key, base64url.
- `VAPID_PRIVATE_JWK`: the matching private EC JWK JSON string; server-only secret.
- `VAPID_SUBJECT`: valid operator `mailto:` or HTTPS contact URL.

For local use, `node --env-file=.env.push scripts/serve.mjs` loads that file. In Cloudflare use runtime variables/secrets (`npx wrangler secret put VAPID_PRIVATE_JWK`); never bake the private value into the build. Browser subscription uses the public key returned by `/api/push/config` and must follow a user gesture. Disable/unsubscribe both locally in `PushManager` and on the server. `pushsubscriptionchange` cannot safely invent a role credential in a service worker; renew registration on the next authorized foreground visit.

`PUSH_TRANSPORT=test` enables an explicitly labelled local test transport. It persists delivered generic events in `.local-data/push-test.jsonl` without contacting an external push service. Automated tests use real generated subscription/VAPID keys and independently decrypt and verify the produced HTTP body and JWT. This verifies cryptographic formatting and server delivery behavior, **not** real Apple/Google/Mozilla delivery. Production delivery remains unverified until real VAPID credentials, a supported browser subscription and the deployed HTTPS runtime are exercised. Missing credentials produce an explicit unavailable result and the in-app fallback remains usable.

iOS/iPadOS Web Push requires a supported Home Screen web app and permission requested from a user interaction. Normal browser tabs retain core planning and manual sharing. OS permission denial, device state and vendor push services can prevent/delay delivery. Web Push is not a native Dynamic Island/ActivityKit Live Activity. Browser location is foreground/permission/signal dependent; this backend does not imply continuous background tracking.

References: [RFC 8291 encryption](https://datatracker.ietf.org/doc/html/rfc8291), [RFC 8292 VAPID](https://datatracker.ietf.org/doc/html/rfc8292), [D1 prepared statements](https://developers.cloudflare.com/d1/worker-api/prepared-statements/), [WebKit Home Screen push requirements](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/).

## Reproduce the local checks

```sh
node --test tests/sharing.test.mjs tests/sharing-client.test.mjs tests/push.test.mjs
npm run build
node tests/sharing-http.mjs
```

The tests use separate scoped client credentials against a real temporary SQLite database, a second provider reopening the file, concurrent revisions, consent denial and revocation, token/hash checks, expiry cleanup, durable rate limits, a D1-compatible SQL binding contract, expired subscriptions and a local delivery sink. Client tests cover lost acceptance responses recovered after reload, identical progress retries, an in-flight upload racing a pause, discarded offline coordinates and rejected stale permission epochs. Encryption and VAPID are verified with independent Node HMAC/AES/signature operations. The HTTP script starts the actual built local server on a random loopback port, uses two independent Playwright API clients, restarts the process, checks the authorized accepted route survives, checks viewer editing and revoked access fail, and confirms a deployed Worker without D1 responds 503. This is automated local evidence, not physical-device or deployed-D1 evidence.

For a real two-device check: configure reachable HTTPS and audience; caregiver creates a dated plan and shares only the recipient link; traveller reviews and accepts, leaving both permissions off; verify the caregiver sees no progress/location; explicitly enable progress, confirm a checkpoint and accept a revised route; verify only that accepted version appears; enable location separately and check accuracy/time; pause/revoke and retry an old queued upload (must fail); finish once and verify collection stops; restart the local server and verify retained state; delete the share and verify all credentials fail. On a real Home Screen iPhone and Android Chrome, separately subscribe, close the page, trigger a material event from the other device and record whether the OS actually displays it. No physical-device outcome is claimed here.
