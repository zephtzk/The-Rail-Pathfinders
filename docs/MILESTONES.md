# Commute Copilot milestones

## Phase 0 — baseline and usable-data audit

**Decision after replacement-key reassessment: Phase 0 NOT COMPLETE; Phase 1 NOT READY for live timetable routing.**
Authentication is now **PASS**: the user-run third audit received HTTP 200 for all 17 API requests.
Required GTFS content validation is still **NOT TESTED**, because the audit runner failed to recognise the live
lowercase `link` field and skipped all three downloads. This runner defect is fixed and synthetically tested;
the fix has not yet been exercised against live GTFS downloads. No Phase 1 integration or deployment was performed.

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

Reassessment prerequisites on 18 September 2026: source checkout and audit evidence **AVAILABLE**;
replacement DataMall key **AVAILABLE per user**, with accepted authentication evidenced by the supplied report;
GTFS archives/protobufs, calendar/corridor coverage and realtime scope **UNVERIFIED**;
Phase 1 scope/acceptance criteria **MISSING**. Hosting secret and audience remain at their last verified baseline;
no new hosting inspection or mutation was needed to assess this local audit.

### Changes and how to try them

- Added [data inventory and constraints](DATA_SOURCES.md), this milestone ledger, and [sanitised evidence](evidence/phase0/).
- Added `scripts/audit-datamall.py`: bounded read-only probes, masked input, no raw-feed/key/signed-link persistence.
- Added pinned audit-only Python dependencies and initially ten synthetic checks for safety, rejection/empty-response handling,
  authentication short-circuiting, calendar separation and identifier checks. Reassessment adds three regression checks:
  lowercase/uppercase GTFS links, a GTFS-only download run, and metadata success independent of download failure.
- Preserved [attempt 3](evidence/phase0/datamall-attempt3.json) from the user's ignored audit output with unchanged JSON contents
  and line endings normalised to LF for Git;
  corrected the audit helper to accept lowercase `link`, collect bounded lowercase `timestamp` samples, and support `--gtfs-only`.
  The original report's incorrect `UNAVAILABLE_NO_LINK` labels remain intact as historical evidence, not current conclusions.
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
| Build and appropriate existing tests reproduced, or failures explained | PASS | Baseline: offline clean install; `npm run check`: syntax, 30 unit/integration checks and Worker build; [browser-results.json](evidence/phase0/browser-results.json): 30 browser-emulation checks including network-disabled reload. Runtime is unchanged, so these were not rerun for this reassessment. Updated audit-tool tests: 13 PASS. |
| API access and representative response contracts checked | BLOCKED overall | Authentication PASS: [attempt 3](evidence/phase0/datamall-attempt3.json), 17/17 HTTP 200; 14 non-GTFS representative checks PASS. Three GTFS metadata shapes observed, but downloads/content contracts NOT TESTED due the now-fixed runner defect. A fresh GTFS run remains required. |
| Geographic, temporal and freshness limits recorded per proposed feed | PASS | [DATA_SOURCES.md](DATA_SOURCES.md) and table below record actual sampled counts and timestamps. Crowd intervals had expired ~16 minutes before retrieval. GTFS validity/corridor joins and full network coverage remain unverified; schedule and disruption updates are separate gates. |
| DataMall and EXTOL credentials distinguished; no secrets exposed | PASS for audited artifacts and separation | User confirms replacement; new live authentication succeeds. Reviewed evidence contains no key, raw payload or signed URL. Earlier screenshot exposure is not undone; revocation of the old key was not independently checked. No provider secret was changed. |
| Phase 1 dependencies and exact user actions identified | PASS | Action table below. A narrowly scoped notices/bus/crowd integration can now be considered, but scope and acceptance criteria are not yet selected; live timetable routing remains gated. |

Evidence classifications: **automated unit/integration PASS (30)**; **browser emulation PASS (30)**;
**audit-tool synthetic tests PASS (13, rerun for this change)**; **live API authentication PASS (user-run evidence)**;
**non-GTFS representative structures PASS (14 requests)**; **GTFS downloads/content NOT TESTED**;
**physical iPhone/Android checks NOT TESTED**; **native SDK/OBU checks NOT TESTED**.
Physical-device and OBU tests are not a substitute for the feed audit and are not claimed as Phase 0 achievements.

### Feed access outcome

| Feed | Current access outcome | Usability outcome |
| --- | --- | --- |
| TrainServiceAlerts | ACCESSIBLE; HTTP 200, basic status envelope PASS | Adapter accepts the status shape; 3 messages, 0 affected segments. CreatedDate samples span 18 April to 18 September 2026 without offsets. Content/validity was not retained; age alone does not establish irrelevance. Disruption/recovery variants and affected-station mapping NOT TESTED. |
| GTFSScheduleTrain | Metadata ACCESSIBLE; HTTP 200, lowercase `timestamp`/`link` strings observed | Runner skipped download; archive, calendars, timezone, valid dates, corridor coverage and joins NOT TESTED. A string field does not prove a valid/downloadable URL. |
| GTFSRealTimeTrainServiceAlerts | Metadata ACCESSIBLE; HTTP 200, same observed envelope | Protobuf download, informed entities, validity periods and source freshness NOT TESTED. |
| GTFSRealtimeTrainTripUpdates | Metadata ACCESSIBLE; HTTP 200, same observed envelope | Protobuf download, disruption/trip scope and schedule joins NOT TESTED. No continuous train-arrival claim. |
| PCDRealTime | ACCESSIBLE; EWL/CCL/DTL: 33/34/37 records, representative keys PASS | All sampled intervals 20:00–20:10 +08 on 18 September; fetched 20:25:57–20:26:00. Interval end was 957.924–960.193 seconds before retrieval: unsuitable for an unqualified current label. Station mappings, band values and completeness not established by type summaries. |
| PCDForecast | ACCESSIBLE; EWL/CCL/DTL: 33/34/37 stations in same-date forecast envelope | 48 distinct start timestamps spanning 00:00–23:30 +08 on 18 September, consistent with documented half-hour forecasts; spacing across every interval unverified. First station's interval array has 48 items. Forecast generation time, every station's intervals/bands and future dates unverified; forecast is not observation. |
| BusStops | ACCESSIBLE; 500 + 500 rows at `$skip=0,500` | Stop identifiers strings. Two full pages are a partial sample; overlap, uniqueness and target-area coverage unverified. |
| BusRoutes | ACCESSIBLE; 500 + 500 rows at `$skip=0,500` | Partial sample, required representative keys present; operating-time semantics, route continuity and joins unverified. |
| BusServices | ACCESSIBLE; 500 + 301 rows at `$skip=0,500` | Short second page is consistent with the end of this snapshot, but uniqueness/overlap not checked. 801 records do not mean 801 distinct services. |
| v3/BusArrival | ACCESSIBLE; stop `01012`, 11 services | 26 populated arrival slots; monitored values 0 and 1. 25 unique ETA timestamps span 20:25:21–21:06:45 +08. One stop only; no source-generation time, full semantic validation or corridor coverage proof. |

[Attempt 1](evidence/phase0/datamall-attempt1.json) had 16 HTTP 401s; [attempt 2](evidence/phase0/datamall-attempt2.json)
had one HTTP 401 and stopped. The replacement-key run was recorded at 20:25:53–20:26:12 Singapore time on
18 September 2026 and clears the authentication blocker. Historical 401 causes remain unresolved, but no longer gate this account sample.
Across the three supplied runs: 34 authenticated API GET attempts, zero GTFS downloads, no polling.
This reassessment made no new live requests and did not read or request the replacement key.
The original third report's SHA-256 is `54aee9a01d5a213b8cc43a172404520e58262fc2031072b9875f4f50d2f0821b`;
the archive normalises line endings to LF, with parsed JSON equality verified. The user's original file is unchanged.

### Exact user actions and next-phase prerequisites

| Item | Purpose | Secure place / action | Blocks |
| --- | --- | --- | --- |
| One fresh GTFS-only run using the working replacement DataMall key | Exercise the corrected helper against fresh metadata URLs; inspect archive/protobuf contracts, dates, calendars and independent realtime scope | From this checkout run `python scripts/audit-datamall.py --prompt --gtfs-only --output test-results/phase0/datamall-gtfs-smoke.json`. Enter the key only into its masked local prompt. No need to configure hosting or provide the key in chat. | Remaining API acceptance and Phase 1 live timetable/corridor readiness. A successful parse alone will not prove routing coverage. |
| Ensure the old exposed key is revoked, if replacement did not already revoke it | Close the earlier screenshot exposure | DataMall account's official key/support channel; report only the non-secret outcome. Replacement is confirmed by the user, but revocation was not independently verified. | Credential lifecycle follow-up; the new key's accepted authentication is already PASS. |
| Clarification of email hyperlink restriction where attribution requires links | Establish permitted public product attribution/linking | Ask LTA through the account channel before adding direct product-facing DataMall hyperlinks. No credential is needed for this question. | Later public data integration/attribution design, not the existing private replay build. |
| Explicit Phase 1 scope and acceptance criteria | Select the next bounded integration phase | State the phase in this task after GTFS validation, or explicitly select a narrower notices/bus/crowd scope with timestamp/staleness handling and replay separation. | Starting Phase 1; no phase was inferred from a successful key test. |
| Production DataMall secret, when a deployment phase requests it | Enable server-side notices/approved integrations in hosting | Existing Sites project's runtime secret settings: `LTA_ACCOUNT_KEY`, marked secret. Requires a later controlled deployment to apply; no secret configured in Phase 0. | Production live API checks; unnecessary for local masked smoke tests. |
| Separate EXTOL SDK key, target and OBU/phones only if native work is requested | Validate official native SDK initialization and OBU functions | Native app's protected local build/CI settings, using official SDK initialization; credential is distinct from DataMall. Physical registration/pairing and consent also required. | Future native SDK milestone only; not browser rail integration. |

### Coverage limits and remaining risks

The app still covers only Tampines or Paya Lebar to Bugis with two predefined routes. Journey/wait/walking/crowding values
and events are replay assumptions. OSM rail shapes do not establish surveyed indoor transfers or accessibility guarantees.
Offline saved steps/geometry were tested in desktop Edge emulation; cached public map tiles and new offline routing are not promised.
Live notices do not alter the replay engine. The new audit verifies API reachability and selected structures/counts/timestamps,
not an integrated live app. No train timetable, live train arrival, numerical delay, calibrated crowding value or bus journey was verified.
The new audit helper validates only representative keys, required schedule tables/headers and bounded metadata;
it is not a production importer or complete semantic validator. Some guide examples were image-only and not independently
readable through the research interface. New type summaries clarify selected structures, but are not complete raw response contracts.
An HTTP Date is a transport response time, not proof of dataset generation time. One successful snapshot is not an availability SLA.

### Git and deployment provenance

- Source of truth: `C:\Users\simho\OneDrive\Documents\ChatGPT\Neblala\The-Rail-Pathfinders`.
- Inspected/published baseline: [`4838c0458e95c89b16817eb89bcd49608f2d04ce`](https://github.com/zephtzk/The-Rail-Pathfinders/commit/4838c0458e95c89b16817eb89bcd49608f2d04ce).
- Phase 0 branch: `codex/phase-0-baseline`. The commit containing this document is the Phase 0 record; resolve with
  `git log -1 --format=%H -- docs/MILESTONES.md`. Exact publication SHA/status is also reported in the task handoff,
  avoiding a self-referential commit hash in the document.
- Reassessment started with a clean tree at `c2c7f89e1cdf4aa54827f9cba02020655c87e3b1` on that branch and rechecked
  `origin` as the requested repository. Initial Phase 0 evidence is retained; application/runtime and hosting config are unchanged.
- Existing hosted source: `f8546eef7e950ffb3e50f98a6867b4e73f3dedf2`, Sites version 2,
  deployment `appgdep_6aad11c6077881919115c818eff5f41a`, succeeded; environment revision 0.
- Existing project: `appgprj_6aad0ab90e5881919eca01b79f19aa24`.
  [Private preview](https://commute-copilot-nebula.simhongmen.chatgpt.site).
  At the initial Phase 0 inspection, Sites reported owner access, custom one-account audience, no groups or external visitors.
  This reassessment did not re-query hosting or alter its identity, audience, environment, or deployment.
- No Phase 0 deployment, environment mutation, new hosted project, or public audience change. Anonymous health GET returned 403;
  that response alone does not identify whether the gate or an intermediary rejected it. Authenticated production browser behavior
  was NOT TESTED in this phase; successful deployment metadata and local browser checks are distinct evidence.

**Boundary:** stop after this Phase 0 reassessment and audit-helper correction. Authentication is resolved; validate the
outstanding GTFS downloads and actual service scope, then receive the next phase request before feature integration.
Phase 1 live timetable routing is not ready. A narrower feed-display phase can be considered only with an explicit revised
scope and acceptance criteria; the current Phase 0 acceptance gate is not being silently waived.
