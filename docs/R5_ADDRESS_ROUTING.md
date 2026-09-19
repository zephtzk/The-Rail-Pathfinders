# R5 address-routing boundary and verification

The address flow uses complete OneMap public-transport itineraries. It does not snap an address to a local rail station, invent an entrance-to-platform connection, or splice provider walking into the imported timetable. Existing Photon bookmarks remain usable as coordinate endpoints; Photon search remains an explicitly separate provider.

## Official contract checked 19 September 2026

- [OneMap routing](https://www.onemap.gov.sg/apidocs/routing): `GET /api/public/routingsvc/route`, token in `Authorization`, `routeType=pt`, `mode=transit`, WGS84 start/end, date `MM-DD-YYYY`, time `HH:MM:SS`, at most three itineraries. The documented future limit is one month. Walking-distance input is metres; returned travel time is seconds.
- [OneMap search](https://www.onemap.gov.sg/apidocs/search) and [API overview](https://www.onemap.gov.sg/apidocs/): token-authenticated address search with geometry and address details.
- [API terms](https://www.onemap.gov.sg/legal/apitermsofservice.html): retain confidential credentials and recognize that upstream operational monitoring may occur.
- [BFA documentation](https://www.onemap.gov.sg/apidocs/bfa): separate access approval is required. Ordinary public-transport routing does not establish a continuous accessible route.

The indexed official routing page specifies request inputs but does not supply a public-transport response specimen. The adapter validates a bounded `plan.itineraries[].legs[]` contract; unsupported actual response shapes fail closed. Synthetic tests are clearly identified as contract inputs and are not real itinerary evidence. The authenticated smoke check described below independently exercised the actual provider contract.

## Runtime and privacy

Set `ONEMAP_TOKEN` only in the server runtime using an authorized secret mechanism. There is no browser token, account login, password storage, automatic credential discovery, or public build-time variable. Do not paste tokens into chat, terminal command arguments or committed files. Expired/denied access returns a generic unavailable state; update the runtime secret separately.

| Endpoint | Input | Result |
| --- | --- | --- |
| `GET /api/address/status` | None | `configured` or `unavailable`; configuration alone does not attest successful routing |
| `POST /api/address/search` | `{query}` | Up to six normalized Singapore address candidates |
| `POST /api/address/route` | `{origin:{lat,lng},destination:{lat,lng},date,departureTime,preferences}` | At most three whitelisted provider itineraries, retrieval timestamp, explicit failure state |

POST bodies keep addresses/coordinates out of the application's request URL. Only the explicit search query, or chosen coordinates and provider routing inputs, reach OneMap. Private saved-place labels and the rest of the user's library never reach the provider. Upstream routing necessarily uses OneMap's documented query parameters over HTTPS. The application logs neither those URLs nor credentials; an external reverse proxy must apply equivalent redaction. Shared plans deliberately disclose selected public endpoints after the existing sharing action and consent flow.

Responses use `no-store, private` and `no-referrer`; cross-origin browser requests, URL query arguments and redirects are rejected. The server reads at most 4 KiB input / 512 KiB upstream response, permits two simultaneous upstream requests, limits each isolate to 40 requests per minute and backs off for 30 seconds after an upstream 429. These are bounded pilot limits, not a distributed abuse-control service. Personal queries/routes are not cached on the server. Search results use bounded page-memory caches only. Requests are cancellable, with 8-second server and 12-second client timeouts; stale completions cannot replace newer choices.

## Canonical journey behavior

`normalizeAddressItineraries()` produces the same version-2 `makePlan()` model used by accepted local journeys. Each walking, waiting and riding phase retains its canonical index. The main planner still requires explicit review and Start. Unknown fares remain unavailable, and general provider accessibility remains unknown; a step-free requirement is rejected without changing that saved preference.

The app's walking preference is cumulative minutes. The request deliberately omits the optional distance parameter rather than converting minutes to metres using an invented walking speed. Returned walking leg durations and the provider's total walking time, when present, are checked against the cumulative seconds allowance. A selected deadline is checked independently against actual returned times, using Singapore civil midnight across date rollover. Less walking/fewer transfers rankings respect the allowed extra time among returned options; crowding remains unknown. The server supports fresh requests from today through one clamped calendar month ahead; past historical routing is not offered as fresh guidance.

Missing or overlapping times, unsupported travel modes, missing transit service names, and disconnected successive/endpoint coordinates fail closed. Coordinates within 30 metres accommodate the precision/snap tolerance of geographic locations; this tolerance is not a verified doorway or walking link. No indoor floor, gate side, road crossing, terminal boarding bay or lift path is inferred.

`provider:'onemap'` identifies external routes. They have no fabricated `legacyRoute`, `legacyInput` or local `routingContext`. Current-checkpoint recalculation is explicitly unavailable for this provider until its consumed walking and checkpoint semantics are verified. The accepted directions remain available; planning a separately selected origin requires a new deliberate review. This limitation is visible in Current rather than silently hiding the tool or executing a local-provider reroute.

## Geometry, sharing and offline restoration

Each provider leg may carry decoded geographic geometry, with at most 192 points across 24 legs. The map helper draws those supplied segments only. Missing/malformed geometry uses an explicitly dashed schematic segment between the supplied endpoints. Geometry reduction never changes canonical instructions or checkpoint indices. It does not establish indoor or accessible guidance. The map shows OneMap/SLA attribution and the approximation notice.

Canonical restore validation and the sharing server both validate bounded geometry, Singapore coordinates and canonical step references. The existing 24 KiB sharing bound is measured in UTF-8 bytes, including multibyte labels. Optional geometry detail can be reduced to explicitly schematic endpoints before that bound is enforced; oversized instructions cause an explicit unsupported state, never silent instruction removal or a raised sharing limit. Accepted external plans persist through existing storage, invitation review and offline restore. Fresh provider search/routing remains unavailable offline.

## Verification record

Command: `node --test tests/address-routing.test.mjs tests/address-search.test.mjs tests/network-map.test.mjs tests/journey-v2.test.mjs tests/itinerary-display.test.mjs tests/sharing.test.mjs tests/sharing-client.test.mjs`.

The focused additions cover missing/expired credentials, private POST payloads, hardcoded upstream host/header-only token, date/month limits, request/concurrency bounds, malformed contracts, cumulative walking, disconnected legs, deadline rollover, public service labels, inert malicious text, geometry bounds, canonical progress, cancellation, offline restoration, OneMap search and durable sharing/UTF-8 byte limits. These tests use synthetic inputs and a real temporary SQLite sharing store. They do not attest live provider service, indoor paths, physical phone use or production deployment.

The user supplied an ordinary token through a separate secure runtime input. At **2026-09-19 03:26:33 SGT**, `node scripts/verify-address-live.mjs` called the R5 server on port 4195 without reading credentials. Actual searches for Bugis Junction and Tampines Mall returned HTTP 200, followed by a successful public-transport request for 19 September at 10:00 SGT. The resulting walking/East West Line/walking plan passed canonical validation, used 4,864 bytes, retained 104 supplied geometry points, counted 431 seconds cumulative walking, and restored from local accepted storage. Fare and accessibility remained unknown. These are observed sample results, not an ongoing service guarantee or a route recommendation.

[Sanitized live evidence](evidence/r5/address-live.json) records only public-location inputs, HTTP/status metadata, response hashes and normalized checks. The token was never read or printed by the verifier. The **94-test focused run passed**, including 21 new address tests and two share-deletion regression checks. Browser validation also exposed a retained creator-deletion bug: the creator's viewer token was being used where deletion requires editor authority. Deletion now reads the current revision using the editor/traveller capability before the explicit deletion, while viewer-only sessions remain unable to delete.

`node tests/r5-address-browser.mjs` passed **17 browser checks** against the separate nonsecret preview on port 4196. This suite uses clearly synthetic provider inputs and real local sharing requests in Edge at 390 × 844 with reduced motion. It verifies search, preview versus Start, coordinate-only payloads, saved endpoint reuse, public timeline labels, unknown evidence/fare, canonical boarding confirmation, automatic staff context, recipient review/acceptance with consent off, provider failure without route replacement, reload and an actual offline reload through the service worker. [Browser check record](evidence/r5/address-browser.json). Mobile current/staff screenshots were inspected and showed readable instructions and the source/geometry notice. This is emulation, not a physical-device result.

Runtime token expiry and provider outages still produce explicit unavailable states; a valid general OneMap token is not BFA approval and cannot unblock a verified indoor pilot. External checkpoint rerouting and end-to-end step-free address routing remain explicitly unsupported.
