# Commute Copilot milestones

## Phase 0 — baseline and usable-data audit

**Decision after GTFS reassessment: ready to begin the original Phase 1 implementation; not ready for live release.
Timetable-based routing (Phase 2) is not ready.** Authentication, GTFS download access and basic parsing now **PASS**.
The original Phase 1 is notices and station crowding on the existing corridor, not timetable/network routing or bus integration.
The previous report incorrectly made timetable readiness a Phase 1 prerequisite and asked for a revised scope; that is corrected here.
Phase 0 retains **NOT TESTED** checks and is **not fully complete**: nonempty disruption-update semantics and remaining coverage
checks are outstanding, as detailed below. Its data-access prerequisites for original Phase 1 implementation are met.
The outstanding checks gate the capabilities that need them, not informational
notices/crowding development. No Phase 1 implementation, integration test or deployment was performed in this reassessment.

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

Reassessment prerequisites on 18 September 2026: source checkout, original phase plan, notices/crowding access evidence,
replacement-key authentication and GTFS download/parse evidence **AVAILABLE**. Exact corridor station/platform/direction
mapping, transfer feasibility, nonempty trip-update contracts and Phase 1 application behavior are **UNVERIFIED**.
Production `LTA_ACCOUNT_KEY` was **MISSING at the last hosting inspection**; configuration and hosted end-to-end verification
are pending, not prerequisites for this report or local implementation. Hosting identity/audience remain at the last verified
baseline; this reassessment does not re-query or mutate hosting. A new phase execution request is still required before implementation.

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
- Preserved the new [GTFS-only attempt 4](evidence/phase0/datamall-attempt4-gtfs.json) with unchanged JSON contents and LF
  line endings. Updated separate readiness assessments and the required expired-crowding behavior; no runtime/helper code changes
  were needed in this reassessment. The original user-run files remain unchanged.
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
| Build and appropriate existing tests reproduced, or failures explained | PASS | Baseline: offline clean install; `npm run check`: syntax, 30 unit/integration checks and Worker build; [browser-results.json](evidence/phase0/browser-results.json): 30 browser-emulation checks including network-disabled reload. Audit-tool regression tests previously PASS (13). No code changed, so suites were not rerun for this documentation/evidence reassessment. JSON integrity and source/archive content equality were checked. |
| API access and representative response contracts checked | PASS for sampled access/basic contracts; NOT TESTED for nonempty trip-update contract | Attempt 3: 17/17 API HTTP 200; 14 non-GTFS representative structures PASS. [Attempt 4](evidence/phase0/datamall-attempt4-gtfs.json): 3/3 metadata and 3/3 downloads HTTP 200/PARSED. Required schedule tables/selected headers and protobuf initialization pass. Empty trip-update feed supplies no representative update, cancellation, timestamp or schedule-match evidence. No blanket full-contract pass. |
| Geographic, temporal and freshness limits recorded per proposed feed | PASS | [DATA_SOURCES.md](DATA_SOURCES.md) and tables below record counts, aggregate calendar dates, one-day activity and source times. Crowd intervals had expired ~16 minutes before retrieval. Exact corridor mapping, complete calendar/network coverage and independent disruption semantics remain NOT TESTED. |
| DataMall and EXTOL credentials distinguished; no secrets exposed | PASS for audited artifacts and separation | User confirms replacement; new live authentication succeeds. Reviewed evidence contains no key, raw payload or signed URL. Earlier screenshot exposure is not undone; revocation of the old key was not independently checked. No provider secret was changed. |
| Phase 1 dependencies and exact user actions identified | PASS | Original Phase 1 recovered from the workspace master prompt and retained below. Notices/crowding implementation can begin when requested; its release checks remain pending. Timetable routing is Phase 2 and bus integration Phase 3, not added Phase 1 prerequisites. |

Evidence classifications: **automated unit/integration PASS (30)**; **browser emulation PASS (30)**;
**audit-tool synthetic tests PASS (13, from the previous code change)**; **live API authentication PASS (user-run evidence)**;
**non-GTFS representative structures PASS (14 requests)**; **GTFS downloads/basic parsing PASS (3)**;
**nonempty trip-update semantics and complete corridor/timetable validation NOT TESTED**;
**physical iPhone/Android checks NOT TESTED**; **native SDK/OBU checks NOT TESTED**.
Physical-device and OBU tests are not a substitute for the feed audit and are not claimed as Phase 0 achievements.

### Feed access outcome

| Feed | Current access outcome | Usability outcome |
| --- | --- | --- |
| TrainServiceAlerts | ACCESSIBLE; HTTP 200, basic status envelope PASS | Adapter accepts the status shape; 3 messages, 0 affected segments. CreatedDate samples span 18 April to 18 September 2026 without offsets. Content/validity was not retained; age alone does not establish irrelevance. Disruption/recovery variants and affected-station mapping NOT TESTED. |
| GTFSScheduleTrain | ACCESSIBLE; metadata/download HTTP 200; required tables and selected headers PARSED | Asia/Singapore; 19 route records, 17,576 trips, 1,211 stop records; 333,262 stop-time rows with zero orphan trip/stop references in those rows. Aggregate calendar bounds 1 Jan–31 Dec 2026, 12 calendar rows and 2 exception rows dated 20/27 September. For 18 September: 3 active service IDs and 6,032 referencing trips. These counts do not prove valid coverage for every date, line, direction or corridor journey. |
| GTFSRealTimeTrainServiceAlerts | ACCESSIBLE; metadata/download HTTP 200; initialized GTFS-RT 2.0 protobuf | Two entities/two alerts; reported header age 20 seconds. Informed entities, active periods, severity and corridor relevance not retained/validated. A fresh header does not prove every alert is currently applicable. |
| GTFSRealtimeTrainTripUpdates | ACCESSIBLE; metadata/download HTTP 200; initialized GTFS-RT 2.0 protobuf | Reported header age 22 seconds, zero entities/updates. Nonempty update/cancellation semantics and schedule matching NOT TESTED. Zero match counts are vacuous, not a passed or failed join. No continuous train-arrival or on-time-service claim. |
| PCDRealTime | ACCESSIBLE; EWL/CCL/DTL: 33/34/37 records, representative keys PASS | All sampled intervals 20:00–20:10 +08 on 18 September; fetched 20:25:57–20:26:00. Interval end was 957.924–960.193 seconds before retrieval: unsuitable for an unqualified current label. Station mappings, band values and completeness not established by type summaries. |
| PCDForecast | ACCESSIBLE; EWL/CCL/DTL: 33/34/37 stations in same-date forecast envelope | 48 distinct start timestamps spanning 00:00–23:30 +08 on 18 September, consistent with documented half-hour forecasts; spacing across every interval unverified. First station's interval array has 48 items. Forecast generation time, every station's intervals/bands and future dates unverified; forecast is not observation. |
| BusStops | ACCESSIBLE; 500 + 500 rows at `$skip=0,500` | Stop identifiers strings. Two full pages are a partial sample; overlap, uniqueness and target-area coverage unverified. |
| BusRoutes | ACCESSIBLE; 500 + 500 rows at `$skip=0,500` | Partial sample, required representative keys present; operating-time semantics, route continuity and joins unverified. |
| BusServices | ACCESSIBLE; 500 + 301 rows at `$skip=0,500` | Short second page is consistent with the end of this snapshot, but uniqueness/overlap not checked. 801 records do not mean 801 distinct services. |
| v3/BusArrival | ACCESSIBLE; stop `01012`, 11 services | 26 populated arrival slots; monitored values 0 and 1. 25 unique ETA timestamps span 20:25:21–21:06:45 +08. One stop only; no source-generation time, full semantic validation or corridor coverage proof. |

[Attempt 1](evidence/phase0/datamall-attempt1.json) had 16 HTTP 401s; [attempt 2](evidence/phase0/datamall-attempt2.json)
had one HTTP 401 and stopped. The replacement-key run was recorded at 20:25:53–20:26:12 Singapore time on
18 September 2026 and clears the authentication blocker. Historical 401 causes remain unresolved, but no longer gate this account sample.
The fourth run used the corrected helper at approximately 20:36:21–20:36:26 Singapore time on 18 September and
successfully downloaded all three GTFS files. Report/HTTP clocks differ slightly; recorded header ages are approximate.
Across the four supplied runs: 37 authenticated API GET attempts plus 3 downloads, no polling.
This reassessment made no new live requests and did not read or request the replacement key.
The original third report's SHA-256 is `54aee9a01d5a213b8cc43a172404520e58262fc2031072b9875f4f50d2f0821b`;
the archive normalises line endings to LF, with parsed JSON equality verified. The user's original file is unchanged.
The original fourth report's SHA-256 is `db34596714268155ecc4b9f1e52239976a6692686bd2702fecb726b5f399ba41`;
the LF evidence archive is `f73d6ea202bd6832587697ad15477dcdce7e8d1785b2fc347718be4ad6e2ced4`.

### Original Phase 1 scope and separate readiness decisions

Scope reference: workspace `MASTER_DEVELOPMENT_PROMPTS.md`, Phase 1, lines 68–87. This section preserves that plan;
it does not execute the prompt or replace it with a reduced phase. Phase 1 extends the backend/UI for relevant service notices
and station crowding on Tampines/Paya Lebar–Bugis and its existing EWL/CCL/DTL alternative. It retains explicit live,
schedule/estimate, unavailable and replay states, source/freshness times, server-only DataMall secrets, bounded requests,
caching/rate-limit handling, the reproducible demo and saved offline guidance. Station crowding is not carriage occupancy or seating.
Live closure/timing changes remain conditional on reliable service, direction, station and timing mapping; otherwise notices
remain informational. No delay minutes may be inferred from prose. Stop before network expansion. General timetable/network
routing remains Phase 2; bus/walking integration remains Phase 3.

| Capability | Ready to begin? | Ready for live use / outstanding gates |
| --- | --- | --- |
| Phase 1: live notices and station crowding on the current corridor | YES, implementation prerequisites available; await the user's Phase 1 execution request | NO. App integration, exact station-code/band mapping, relevant/irrelevant notice behavior, source-time handling, failure/cache/rate-limit handling and integration/browser checks NOT TESTED. Hosting secret absent at last inspection; hosted live verification BLOCKED until securely configured and the authorized implementation is deployed. GTFS timetable routing and nonempty trip updates are not prerequisites for informational notices/crowding. |
| Phase 2: timetable-based routing | Data acquisition/basic parsing available; a separate phase request is needed | NOT READY. Reproducible versioned import, complete trip→route/service checks, exact stations/platforms/directions, ordered/valid stop times, service-date and overnight evaluation, validated transfers and independently checked routable journeys NOT TESTED. Calendar/name counts are not route validation. |
| Optional live timing effects within those scopes | Access to the trip-update feed available | NOT TESTED: no actual trip updates were returned. Reliable matching/semantics are required before applying such effects. This does not block static scheduled routing once its separate checks pass, or the informational fallback already required by Phase 1. |

The original Phase 1 acceptance checks are retained verbatim below. These statuses describe current evidence, not work
performed or accepted in a phase that has not started.

| Original Phase 1 check | Status | Evidence / remaining work |
| --- | --- | --- |
| Authenticated live requests succeed when credentials are available; otherwise mark live verification blocked. | PASS for standalone smoke requests; NOT TESTED for integrated Phase 1; BLOCKED for hosted verification | User-run notices/crowding probes succeeded. The new backend/UI and provider secret configuration are not verified. |
| Relevant and irrelevant notices are handled correctly. | NOT TESTED | Basic notice shape only; actual route/station/direction/validity mapping and filtering are pending. |
| Source time, freshness and live/replay distinctions are visible and accurate. | NOT TESTED | Expired crowd intervals have been identified; the behavior specified below is not yet implemented or tested. |
| Invalid keys, rate limits, timeouts, empty, malformed and stale responses fail gracefully without leaking secrets. | NOT TESTED for Phase 1 | Prior adapter/audit tests cover a subset; no complete integrated notices/crowding failure matrix exists. |
| Existing route scenarios and actual offline reload still work. | PASS for unchanged baseline; NOT TESTED after Phase 1 changes | Prior 30 unit/integration and 30 browser-emulation checks include actual network-disabled reload. Physical phones remain NOT TESTED. |
| Any change to route recommendations is traceable to validated evidence. | NOT TESTED for live changes | No live route adjustment was made. Preserve informational notices wherever impact cannot be validated; do not claim that absence of a change proves a future adjustment correct. |

### Required expired-crowding behavior for Phase 1

This is the implementation/acceptance rule to carry into the original Phase 1, not an implemented feature or an LTA SLA.

1. Use validated source `StartTime`/`EndTime` with explicit offsets and real time, independently of the replay clock.
   A mapped station with a recognised observed band is eligible for a current label only while `StartTime <= now < EndTime`.
   A live snapshot must not be presented as an observation for a future planned departure.
2. At `EndTime`, current crowding becomes **unavailable/unknown**. If a previous band is retained, show it separately as
   **last reported / expired**, with its original Singapore-time interval and age. Example from attempt 3: interval
   20:00–20:10, fetched around 20:26, already about 16 minutes expired. Do not display it as current or as evidence of a quieter route.
3. Re-fetching the same interval, updating `checkedAt`, a cache hit or reconnecting must not renew source freshness.
   Expire displayed observations without waiting for a successful network refresh, and re-evaluate on resume/offline reload.
   Keep fetch/connection state distinct from observation validity. Do not silently turn unavailable or expired data into replay data.
4. Missing/unmapped stations, `NA`, malformed timestamps/bands, reversed or future intervals and clock inconsistencies are
   unknown, not quiet. Expired/unknown observations must not earn a crowding preference benefit or trigger rerouting;
   if current crowding cannot support a comparison, disclose that limit and retain the otherwise valid route basis.
5. A separately validated, time-applicable forecast may be displayed as **forecast**, with its own date/interval and source;
   it must never silently replace an observation or appear as live measured crowding. Station bands never imply carriage occupancy,
   seat availability, door guidance or boarding certainty.
6. Keep upstream requests shared/bounded, cache by source/line without extending source validity, and handle rate limits/backoff.
   Use the documented 10-minute crowd update cadence as input to the refresh design, not as permission to poll every user interaction
   or as proof that every response is current. Test interval boundaries, repeated expired responses, missing/NA/malformed data,
   future intervals, source outages, reconnect and offline expiry. All these new behavior checks remain **NOT TESTED**.

### Exact user actions and next-phase prerequisites

| Item | Purpose | Secure place / action | Blocks |
| --- | --- | --- | --- |
| Phase 1 execution request using its existing scope | Authorize the next bounded implementation phase | Request Phase 1 in this task; no revised scope or credential is needed for this decision. | Starting implementation; this turn is report-only. |
| Replacement DataMall key for later integrated local/live validation | Test exact corridor notice/crowd values and behavior when integration is implemented | Use a masked local entry mechanism/process-only server environment; never chat, Git or a literal shell command. No key or repeat GTFS smoke run is required for this report. | Future integrated live checks only; standalone access/download checks already PASS. |
| Ensure the old exposed key is revoked, if replacement did not already revoke it | Close the earlier screenshot exposure | DataMall account's official key/support channel; report only the non-secret outcome. Replacement is confirmed by the user, but revocation was not independently verified. | Credential lifecycle follow-up; the new key's accepted authentication is already PASS. |
| Clarification of email hyperlink restriction where attribution requires links | Establish permitted public product attribution/linking | Ask LTA through the account channel before adding direct product-facing DataMall hyperlinks. No credential is needed for this question. | Later public data integration/attribution design, not the existing private replay build. |
| Production DataMall secret, when a deployment phase requests it | Enable server-side notices/approved integrations in hosting | Existing Sites project's runtime secret settings: `LTA_ACCOUNT_KEY`, marked secret. Requires a later controlled deployment to apply; no secret configured in Phase 0. | Production live API checks; unnecessary for local masked smoke tests. |
| Separate EXTOL SDK key, target and OBU/phones only if native work is requested | Validate official native SDK initialization and OBU functions | Native app's protected local build/CI settings, using official SDK initialization; credential is distinct from DataMall. Physical registration/pairing and consent also required. | Future native SDK milestone only; not browser rail integration. |

Remaining engineering checks need no new user-provided data source or scope change now: implement/validate the Phase 1
mapping/freshness/error behavior within its scope; validate the GTFS import/calendar/topology/routing when Phase 2 is requested.
A representative nonempty live disruption update depends on provider availability and remains NOT TESTED. Do not repeatedly poll
to manufacture that evidence, or count a fixture as live proof. If none is available, retain the informational/static fallback and
report the live-adjustment check as untested; it is not a blocker to Phase 1's permitted informational behavior.

### Coverage limits and remaining risks

The app still covers only Tampines or Paya Lebar to Bugis with two predefined routes. Journey/wait/walking/crowding values
and events are replay assumptions. OSM rail shapes do not establish surveyed indoor transfers or accessibility guarantees.
Offline saved steps/geometry were tested in desktop Edge emulation; cached public map tiles and new offline routing are not promised.
Live notices do not alter the replay engine. The new audit verifies API reachability and selected structures/counts/timestamps,
not an integrated live app. The schedule was downloaded and basic integrity checked; no timetable-derived journey, live train arrival,
numerical delay, calibrated crowding value or bus journey was verified. The schedule's 7,065 `timesBeyond24Hours` count means
stop-time rows with at least one arrival/departure hour >=24, not individual timestamps. Calendar bounds are aggregate extremes,
not an all-line/full-year coverage guarantee. Only service activity on 18 September was counted; the demo's 19 September date,
the 20/27 September exceptions, last trains and next-day service handling have not been validated for routing.
Name matches (Tampines 11, Paya Lebar 5, Bugis 5, Promenade 5) are substring matches, not unique station/platform mappings.
No `transfers.txt` was listed in the archive; absence of that file does not establish transfer feasibility or impossibility.
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
- Replacement-key reassessment started at `c2c7f89e1cdf4aa54827f9cba02020655c87e3b1` and was published as
  `23db3c12582f674a2467e411806adfadfc4a28a8`. This GTFS review started with a clean tree at `23db3c1`; local and remote
  Phase 0 branch matched, and remote `main` remained `4838c04`. Source instructions, implementation and original phase plan
  were inspected again. Initial evidence is retained; runtime, helper code and hosting configuration are unchanged in this review.
- Existing hosted source: `f8546eef7e950ffb3e50f98a6867b4e73f3dedf2`, Sites version 2,
  deployment `appgdep_6aad11c6077881919115c818eff5f41a`, succeeded; environment revision 0.
- Existing project: `appgprj_6aad0ab90e5881919eca01b79f19aa24`.
  [Private preview](https://commute-copilot-nebula.simhongmen.chatgpt.site).
  At the initial Phase 0 inspection, Sites reported owner access, custom one-account audience, no groups or external visitors.
  This reassessment did not re-query hosting or alter its identity, audience, environment, or deployment.
- No Phase 0 deployment, environment mutation, new hosted project, or public audience change. Anonymous health GET returned 403;
  that response alone does not identify whether the gate or an intermediary rejected it. Authenticated production browser behavior
  was NOT TESTED in this phase; successful deployment metadata and local browser checks are distinct evidence.

**Boundary:** stop after this Phase 0 report/evidence update. Phase 1 notices/crowding implementation is ready to start on request
under its original scope; its acceptance and release are not complete. Timetable-based routing is a separate Phase 2 readiness
decision and is not ready for use. Nonempty disruption semantics, route/transfer coverage and unperformed integration/device checks
remain NOT TESTED rather than being promoted to PASS or removed from their applicable acceptance gates.
