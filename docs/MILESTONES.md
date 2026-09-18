# Commute Copilot milestones

## Phase 0 — baseline and usable-data audit

**Decision: NOT READY / NOT COMPLETE.** Baseline reproduction and documentation are finished.
Required authenticated response, geographic coverage and freshness validation are **BLOCKED** by HTTP 401.
No Phase 1 feature integration or deployment was performed.

### Starting checks and prerequisites

Requested checks: identify source/deployed baselines; reproduce build/tests; inspect API access/contracts;
record feed geography/time/freshness; distinguish credentials without disclosure; identify Phase 1 requirements.

| Prerequisite at phase start | Classification | Observation |
| --- | --- | --- |
| Source checkout and Git access | AVAILABLE | Named `The-Rail-Pathfinders` checkout; clean `main`; remote re-read, not assumed. |
| Build/runtime and existing tests | AVAILABLE | Node 24.16.0, npm 11.13.0, cached packages, Edge 153.0.4234.32. |
| Repository instructions | AVAILABLE | README and deployment/test scripts inspected; no AGENTS.md found in checkout or checked ancestors. |
| Official references | AVAILABLE | DataMall v6.9 and EXTOL revision 1.6; licence and API/SDK terms reviewed. |
| DataMall local/hosted configuration | MISSING | No local `.env` or process key; Sites environment revision 0 has zero entries. |
| Actual DataMall account access | UNVERIFIED | Subsequently attempted through masked entry; requests rejected with 401. |
| Hosting identity/access | UNVERIFIED → AVAILABLE | Sites owner access, project identity and existing custom private audience inspected without mutation. |
| Physical phones / OBU / EXTOL key | UNVERIFIED | Not supplied or exercised; native SDK use is outside this phase. |

### Changes and how to try them

- Added [data inventory and constraints](DATA_SOURCES.md), this milestone ledger, and [sanitised evidence](evidence/phase0/).
- Added `scripts/audit-datamall.py`: bounded read-only probes, masked input, no raw-feed/key/signed-link persistence.
- Added pinned audit-only Python dependencies and ten synthetic checks for safety, rejection/empty-response handling,
  authentication short-circuiting, calendar separation and identifier checks.
- Added Python cache exclusions. Runtime app, route calculations, replay fixtures and deployment configuration are unchanged.

From this checkout, run `npm ci --ignore-scripts --offline` with a populated npm cache, then `npm run check` and
`npm run dev`; open `http://localhost:4173`. Without a cache, ordinary `npm ci --ignore-scripts` requires npm registry access.
The reproducible demonstration remains the README's 19 September 2026 scenario: 08:41 normal, planned closure alternative
08:59, and disruption 09:03 versus reroute 08:59. These are fixture calculations, not live observations.

For browser reproduction, set `BROWSER_EXECUTABLE` to an installed Edge/Chrome executable and run
`node tests/browser.mjs` while the local server is running. See [secure audit reproduction](DATA_SOURCES.md#reproduce-the-audit-securely)
for the separate live probe. Do not enter credentials in chat or shell command text.

### Acceptance checks

| Requested check | Status | Evidence / reason |
| --- | --- | --- |
| Correct repository, source checkout and deployed baseline identified | PASS | [baseline.json](evidence/phase0/baseline.json): source `4838c0458e95c89b16817eb89bcd49608f2d04ce`; `origin` is the requested repository; deployed version 2 is `f8546eef7e950ffb3e50f98a6867b4e73f3dedf2`. Only README differs between those baselines. |
| Build and appropriate existing tests reproduced, or failures explained | PASS | Offline clean dependency install; `npm run check`: syntax, 30 unit/integration checks and Worker build; [browser-results.json](evidence/phase0/browser-results.json): 30 browser-emulation checks, including network-disabled reload. Ten separate audit-tool checks also pass. No baseline failure found. |
| API access and representative response contracts checked | BLOCKED | [Attempt 1](evidence/phase0/datamall-attempt1.json): 16 HTTP 401s; arrivals not called. [Attempt 2](evidence/phase0/datamall-attempt2.json): one HTTP 401, then stopped. Documentation/fixtures do not prove access. No successful representative live payload or download was obtained. |
| Geographic, temporal and freshness limits recorded per proposed feed | PASS | [DATA_SOURCES.md](DATA_SOURCES.md) records intended scope and required checks. Actual live validation is BLOCKED: current calendars, station/trip mappings, network completeness and source ages remain unverified. Schedule and disruption-update coverage are separate gates. |
| DataMall and EXTOL credentials distinguished; no secrets exposed | BLOCKED overall | Credential separation and audit non-disclosure checks PASS. A key was visible in the user-supplied screenshot outside the repository; replacement/activation is not confirmed. No key, screenshot, raw payload or signed URL was committed, and no provider secret was changed. |
| Phase 1 dependencies and exact user actions identified | PASS | Action table below. Phase 1 has not started and needs an explicit request after resolving its access prerequisites. |

Evidence classifications: **automated unit/integration PASS (30)**; **browser emulation PASS (30)**;
**audit-tool synthetic tests PASS (10)**; **live API authentication FAIL / usable-data validation BLOCKED**;
**physical iPhone/Android checks NOT TESTED**; **native SDK/OBU checks NOT TESTED**.
Physical-device and OBU tests are not a substitute for the feed audit and are not claimed as Phase 0 achievements.

### Feed access outcome

| Feed | Current access outcome | Usability outcome |
| --- | --- | --- |
| TrainServiceAlerts | UNAVAILABLE to these attempts: 401 twice | Live notice contract/recovery forms unverified. Existing adapter still uses synthetic contract tests. |
| GTFSScheduleTrain | UNAVAILABLE to attempt 1: 401 | No archive; dates, calendars, tables, agency timezone, corridor coverage and joins unverified. |
| GTFSRealTimeTrainServiceAlerts | UNAVAILABLE to attempt 1: 401 | No protobuf; entity scope/validity/freshness unverified. |
| GTFSRealtimeTrainTripUpdates | UNAVAILABLE to attempt 1: 401 | No protobuf; disruption/trip coverage unverified. No continuous train-arrival claim. |
| PCDRealTime | UNAVAILABLE for EWL/CCL/DTL in attempt 1: 401 | Station bands/interval freshness/completeness unverified. |
| PCDForecast | UNAVAILABLE for EWL/CCL/DTL in attempt 1: 401 | Forecast dates/horizon/completeness unverified. |
| BusStops | UNAVAILABLE at `$skip=0,500`: 401 | Paging and stop coverage unverified. |
| BusRoutes | UNAVAILABLE at `$skip=0,500`: 401 | Paging, directions/sequence and operating-time encodings unverified. |
| BusServices | UNAVAILABLE at `$skip=0,500`: 401 | Paging, operators/services and frequency encodings unverified. |
| v3/BusArrival | UNVERIFIED / NOT TESTED | Directory failure prevented selecting a returned stop. |

The failure cause is unresolved. HTTP 401 does not distinguish incorrect entry, activation, replacement, account entitlement,
or an authentication-path issue. The account email's access statement is not proof of an accepted live request.
The audit made 17 authenticated GET attempts total across two runs, with no downloads or continuing polling.
The second runner stops after authentication rejection. A successful later sample will still not prove network-wide coverage.

### Exact user actions and next-phase prerequisites

| Item | Purpose | Secure place / action | Blocks |
| --- | --- | --- | --- |
| Replaced, activated DataMall API Access Key | Resolve screenshot exposure and 401 authentication failure | Use the DataMall account's official key-issuance/support process; confirm the credential is for DataMall APIs. Validate with the guide's authorised client setup using an `AccountKey` header. Enter only in the local masked audit prompt; no chat, Git, screenshot or literal command. | API acceptance; representative live schemas, calendar/network scope, freshness and Phase 1 live-data readiness. |
| Account activation / entitlement confirmation if 401 persists | Distinguish credential/activation from access-path failure | Check with DataMall through the account's official support channel yourself; share only non-secret outcome/status here. No support message was sent by the agent. | Same live-access checks. |
| Clarification of email hyperlink restriction where attribution requires links | Establish permitted public product attribution/linking | Ask LTA through the account channel before adding direct product-facing DataMall hyperlinks. No credential is needed for this question. | Later public data integration/attribution design, not the existing private replay build. |
| Explicit Phase 1 scope and acceptance criteria | Select the next bounded integration phase | State the next phase in this task after the audit blockers are resolved or explicitly redefine its scope. | Starting Phase 1. |
| Production DataMall secret, when a deployment phase requests it | Enable server-side notices/approved integrations in hosting | Existing Sites project's runtime secret settings: `LTA_ACCOUNT_KEY`, marked secret. Requires a later controlled deployment to apply; no secret configured in Phase 0. | Production live API checks; unnecessary for local masked smoke tests. |
| Separate EXTOL SDK key, target and OBU/phones only if native work is requested | Validate official native SDK initialization and OBU functions | Native app's protected local build/CI settings, using official SDK initialization; credential is distinct from DataMall. Physical registration/pairing and consent also required. | Future native SDK milestone only; not browser rail integration. |

### Coverage limits and remaining risks

The app still covers only Tampines or Paya Lebar to Bugis with two predefined routes. Journey/wait/walking/crowding values
and events are replay assumptions. OSM rail shapes do not establish surveyed indoor transfers or accessibility guarantees.
Offline saved steps/geometry were tested in desktop Edge emulation; cached public map tiles and new offline routing are not promised.
Live notices do not alter the replay engine. No live delay, calendar, crowding band, bus arrival or train arrival was verified.
The new audit helper validates only representative keys, required schedule tables/headers and bounded metadata;
it is not a production importer or complete semantic validator. Some guide examples were image-only and not independently
readable through the research interface; their complete wire serialization remains unverified pending authenticated samples.

### Git and deployment provenance

- Source of truth: `C:\Users\simho\OneDrive\Documents\ChatGPT\Neblala\The-Rail-Pathfinders`.
- Inspected/published baseline: [`4838c0458e95c89b16817eb89bcd49608f2d04ce`](https://github.com/zephtzk/The-Rail-Pathfinders/commit/4838c0458e95c89b16817eb89bcd49608f2d04ce).
- Phase 0 branch: `codex/phase-0-baseline`. The commit containing this document is the Phase 0 record; resolve with
  `git log -1 --format=%H -- docs/MILESTONES.md`. Exact publication SHA/status is also reported in the task handoff,
  avoiding a self-referential commit hash in the document.
- Existing hosted source: `f8546eef7e950ffb3e50f98a6867b4e73f3dedf2`, Sites version 2,
  deployment `appgdep_6aad11c6077881919115c818eff5f41a`, succeeded; environment revision 0.
- Existing project: `appgprj_6aad0ab90e5881919eca01b79f19aa24`.
  [Private preview](https://commute-copilot-nebula.simhongmen.chatgpt.site).
  Sites reports owner access, custom one-account audience, no groups or external visitors. Audience and identity were preserved.
- No Phase 0 deployment, environment mutation, new hosted project, or public audience change. Anonymous health GET returned 403;
  that response alone does not identify whether the gate or an intermediary rejected it. Authenticated production browser behavior
  was NOT TESTED in this phase; successful deployment metadata and local browser checks are distinct evidence.

**Boundary:** stop after this Phase 0 report and evidence. Resolve authenticated access, inspect actual feed scope/semantics,
and receive the next phase request before feature integration. No required blocked check is represented as complete.
