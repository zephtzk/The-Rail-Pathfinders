# Commute Copilot milestones

## Phase 2 — imported rail network and general scheduled routing

**18 September 2026: ready within the declared imported schedule coverage.** Default planning now searches a validated
GTFS rail network instead of two predefined alternatives. Coverage is 186 source station records, 434 boarding stops,
19 service patterns and 17,575 accepted trips, for 18 September–31 December 2026 with exact service calendars/carryover.
One invalid trip is explicitly quarantined. Twenty-seven standard interchanges have reviewed topology and stated
walking assumptions; Newton, Tampines and Bukit Panjang tap-out links are omitted.

All seven requested milestone checks PASS for this bounded scheduled-data implementation. **72 Node tests, 27 importer
tests, 90 browser checks and 6 HTTP/build checks pass.** Two imports are byte-identical. Warm desktop query p95 is 40.53ms
against 500ms; compressed network is 1,947,956 bytes against 2.5MiB. The original corridor replay and Phase 1 panel remain
separate and regression-tested. No bus, address, entrance, live-rerouting or physical-device/hosted-release claim is made.

See the complete [Phase 2 report and acceptance ledger](PHASE2_REPORT.md), [coverage summary](RAIL_COVERAGE.md) and
[verification evidence](evidence/phase2/verification.json) for source hashes, counts, assumptions, holiday limitations,
performance profile, user requirements and Git status. Branch `codex/phase-2-rail-routing` is a local delivery;
no push, PR, deployment or hosting-audience change. No further user input is needed for these milestone checks.

The Phase 1/Phase 0 records below remain historical. Their statements that network routing had not begun describe those
earlier checkpoints; Phase 1's unobserved live variants remain unverified and have not been cleared by scheduled routing.

---

## Phase 1 — live information on the existing corridor

**18 September 2026 decision: implementation ready for local inspection; live-validation coverage remains incomplete.
Phase 1 is not declared fully complete.** The integrated application authenticated successfully and mapped all 19 crowd
station codes. All automated and browser checks pass. Actual fresh crowd intervals and nonempty affected-segment/disruption
variants were absent from the sampled responses, so those live checks remain NOT TESTED. They have not been replaced with
fixture evidence. No deployment, audience change, timetable routing, network expansion, bus integration or EXTOL work occurred.

### Starting milestone checks and prerequisites

The requested checks are the eleven acceptance rows below. This phase started from a clean
`codex/phase-0-baseline` at `6722f3fb8fb4921fdab89cf424dc1ef53efc5850`, after inspecting the source, instructions,
README, hosting configuration, latest ledger and both replacement-key/GTFS evidence files. The remote matched that
Phase 0 revision; `main` remained `4838c0458e95c89b16817eb89bcd49608f2d04ce`. The new branch is
`codex/phase-1-live-corridor`, preserving Phase 0 history. No `AGENTS.md` was found in the checkout or checked ancestors.

| Prerequisite at Phase 1 start | Classification | Resolution / boundary |
| --- | --- | --- |
| Correct checkout, Phase 0 history and Git write access | AVAILABLE | Named The-Rail-Pathfinders checkout, existing origin and authenticated `zephtzk` Git access. Older sibling `app/` was not used. |
| Local Node/npm, dependencies, Edge and baseline tests | AVAILABLE | Node 24.16.0, npm 11.13.0, Edge 153.0.4234.32; baseline reproduced before integration. |
| Current official contracts and sanitised successful audits | AVAILABLE | DataMall guide v6.9, observed lower-case bands, exact interval fields and source-time limitations. |
| Key in application runtime | MISSING → AVAILABLE | Prior audit entry did not configure the app. The first terminal prompt did not appear; the replacement masked desktop launcher accepted the key and started the application. No key file/provider secret was created. |
| Actual integrated corridor code coverage and live variants | UNVERIFIED → partly AVAILABLE | All 19 station codes validated. Fresh crowding and real nonempty notice segments remain NOT TESTED. |
| Existing hosting identity/access | AVAILABLE, read-only | Sites owner access, project `appgprj_6aad0ab90e5881919eca01b79f19aa24`, custom private access, version 2 confirmed. No deployment authorized in this phase. |
| Physical phones, native SDK key/OBU | UNVERIFIED | No physical tests. EXTOL is outside this browser phase and does not share the DataMall credential. |

### What changed and how to try it

The server now reads TrainServiceAlerts and station reports for EWL/CCL/DTL with bounded requests, shared caches and backoff.
A separate live panel displays notices and 19 station positions, exact source intervals, retrieval/receipt times and unavailable,
expired or offline states. Notice prose and crowd bands do not modify replay journeys. Saved guidance retains live-source metadata
without making it current after reload. The reproducible demo, existing preferences and route calculation engine are preserved.

From this checkout, run `npm ci` if dependencies are absent, then `npm run check`.
For the demo, `npm run dev` serves `http://localhost:4173`. For live data, stop any server on that port and run
`python scripts/run-live-local.py --gui` using Python 3.10+ with Tkinter. Enter the DataMall key only in the masked local field.
The current task's live session already has the replacement key in memory; no further key entry is needed while it stays running.
Open `http://localhost:4173` and select **View live corridor notices and station reports**. Close the masked-entry window to
terminate its server. On this machine Python is available at
`C:\Users\simho\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe` if `python` is not on PATH.

Use **Reset demo**, **Planned track works**, **Disruption during travel**, **Compare options**, **Use this route**, then
**Save for offline** to reproduce the labelled scenarios. Disconnect and reload after “Offline app ready”; reconnect without
losing the selected route. The currently hosted private preview still has the older implementation and cannot demonstrate Phase 1.

### Acceptance ledger

Evidence classes: **automated** means synthetic unit/integration tests; **browser** means desktop Edge with emulated viewports
and actual browser network-offline transitions; **live API** means the real built application's adapter using the masked key;
**physical** means an actual phone/OBU. One class never substitutes for another.

| Requested acceptance check | Status | Evidence / limits |
| --- | --- | --- |
| The application adapter successfully retrieves the required live feeds using securely configured credentials. | PASS | **Live API:** all four required feeds returned parsed HTTP 200 with no error. Key injected only into the loopback Node process, never the browser or Git. [Live evidence](evidence/phase1/live-adapter.json). |
| Actual response fields and corridor station mappings are validated. | PASS for observed envelopes and all 19 crowd codes; NOT TESTED for nonempty live affected-segment mapping | **Live API:** notices Status 1, three messages, empty affected segments; EWL/CCL/DTL source counts 33/34/37, exact matches 11/6/2, no missing corridor codes or invalid records. All sampled crowd bands `l`. **Automated:** other bands, exact code/line matching, malformed/compound identifiers and conflicts. A real nonempty affected-segment contract was not observed. |
| Normal service, relevant notices, irrelevant notices and valid empty responses behave correctly. | PASS in automated/browser tests; NOT TESTED for live nonempty disruption/recovery variants | **Automated/browser:** status 1 includes minor delays, status 2, relevant/outside/line-only/unmapped segments, empty/missing/malformed distinction and escaped prose. **Live API:** status 1 and three general messages only. Messages are never assigned to segments by array order or guessed meaning. |
| Fresh, expired, missing-timestamp and future-timestamp cases are handled accurately. | PASS in automated/browser tests; PASS for observed expired live intervals; NOT TESTED for fresh live intervals | Inclusive start/exclusive end, expiry while page stays open, refetch/reconnect without renewed source time, NA/conflicts, missing offsets, impossible/reversed dates and future-report maturation prevention tested. Actual 20:40–20:50 +08 intervals were already about 17m20s expired at retrieval. No freshness threshold was widened. |
| Authentication errors, rate limits, timeouts, malformed responses and partial feed failures degrade gracefully without leaking secrets. | PASS in automated/browser tests | Synthetic auth failures, changed/missing keys, 429 Retry-After, bounded timeout/body/redirect handling, one-feed failure, corrupt snapshot, HTML escaping and reflected-key redaction. Preserved records after a failed refresh cannot falsely pass live validation. Deliberate live failure injection/rate-limit triggering was NOT TESTED. |
| Live information and replay calculations remain visibly distinct. | PASS | **Browser:** separate live panel, real source times and replay-calculated timestamp; route calculations retain their replay labels. Actual live report provenance is separate from the demo's 19 September journey date. No assertion that today's observations validate another date's itinerary. |
| Existing route calculations, preferences and demonstration scenarios remain functional. | PASS | **Automated/browser:** existing engine scenarios, walking limits, preference behavior, direct/Circle alternatives and route acceptance. Live refresh/failure leaves the selected replay route and its timed legs unchanged. Engine/data fixtures were not changed. |
| Actual browser network loss, offline reload and reconnection preserve useful saved guidance. | PASS in browser emulation | Network disabled through the browser context, page reloaded, selected instructions/arrival/geometry and original source metadata restored, editing disabled offline, no current-live claim, reconnection preserves selection. Tests include absent/corrupt saved state. This is not airplane-mode testing on physical phones. |
| Appropriate existing regression suites and meaningful new integration/browser tests pass. | PASS | `npm run check`: 48 tests (30 existing + 18 Phase 1), zero failures; 16-asset Worker build. Existing browser suite 30 PASS; new live UI suite 23 PASS. [Verification summary](evidence/phase1/verification.json), [browser](evidence/phase1/browser-results.json), [live UI browser](evidence/phase1/live-browser-results.json). |
| Physical-device results are reported separately from browser emulation. | NOT TESTED on physical devices; reporting requirement satisfied | No physical iPhone Safari or Android Chrome available/exercised in this task. 320/390px and 200% text are browser emulation only. Native EXTOL/OBU testing is outside scope. |
| No unsupported claims about live arrival times, carriage crowding or expanded coverage are introduced. | PASS | Static/automated/browser review: station bands expressly exclude carriage/door/seat meaning; advisory data cannot change replay ranking, delays or closures. No train-arrival endpoint, GTFS router, bus router or network expansion added. |

The independent read-only review found two defects during development (corrupt scalar band names causing a UI crash and
failed refreshes preserving an old HTTP success in evidence). Both were fixed and regression-tested before the final passes.
Initial new browser test failures were collapsed-details locator assumptions; the corrected suite opens the appropriate panels
and passes. The Sites generic build helper failed on this Windows installation's npm wrapper resolution; the repository's
direct `C:\Program Files\nodejs\npm.cmd run check` succeeded. This helper issue is not hidden as a passed helper check.

### Live sample, freshness and known coverage limits

The final report was recorded at **21:09:57 SGT on 18 September 2026**. Notices were retrieved then; the crowd cache holds
the successful **21:07:20 SGT** retrieval. All crowd intervals are **20:40–20:50 +08**. At report time they were approximately
20 minutes expired. Upstream retrieval, report recording and source interval times remain distinct in the archived JSON.
General notice timestamps have no offset/expiry; one dates from April. No notice-to-segment association or validity is invented.

At the interval end, the current band becomes unavailable immediately; a retained band is labelled last reported/expired with
its original interval and age. A fetch/cache hit does not reset that age. Offline and failed-source reports cannot claim current
observations. Future, missing, conflicting and NA values never earn a comfort preference benefit. All recommendation values,
walk/wait/ride durations, closures and replay crowd levels remain simulated. There is no live routing effect to validate or promise.

Remaining risks: source omissions/lag/availability, unidentified future contract variants, local clock accuracy, unsurveyed indoor
transfer walking, desktop-to-phone differences and per-isolate caching rather than a global distributed rate limiter. The app
covers only the two existing predefined alternatives. No ongoing polling campaign or provider load test was performed; local
preview refreshes use the bounded adapter. A successful snapshot is not an availability or freshness SLA.

### Exact remaining user actions and next phase

| Item | Purpose | Secure place / action | Check it blocks |
| --- | --- | --- | --- |
| No new credential needed for the running local session | Inspect the completed implementation | Use localhost while its masked-entry window stays open. On restart, re-enter the replacement DataMall key in `scripts/run-live-local.py --gui`; no chat or key-bearing command. | None currently. After shutdown, authenticated application checks need a new local session. |
| Confirm old exposed key revocation, if replacement did not revoke it | Finish credential lifecycle follow-up | DataMall account's official key/support channel; report only whether revocation succeeded. No key needed in this task. | Security follow-up remains UNVERIFIED; current replacement-key authentication already PASS. |
| Representative fresh crowd interval and nonempty affected-segment/disruption/recovery response | Close remaining live-variant validation | Provider availability; when appropriate, make a bounded local application check and retain only sanitised metadata. Do not paste raw notices/credentials or repeatedly poll to force an event. | Fresh-live and real affected-segment checks remain NOT TESTED. Synthetic passes do not clear them. No new dataset request is needed. |
| Separate Phase 2 execution request | Authorize timetable-based routing work | Request Phase 2 in this task with its milestone boundary. No extra key is needed merely to authorize it; a repeat download later uses secure local entry. | Starting Phase 2. It has not begun. |
| Hosting secret and deployment authorization, only in a later hosting phase | Enable this code in the existing private hosted project | Existing Sites runtime secret settings, `LTA_ACCOUNT_KEY`, marked secret; preserve project/audience. Never use an EXTOL key here. | Hosted Phase 1 verification is NOT TESTED and out of this authorized phase. No deployment action is required now. |
| Physical iOS/Android checks for later release | Validate real-device display and offline/reconnect behavior | Authorized HTTPS build and actual phones; no extra credential in browser code. | Physical release acceptance remains NOT TESTED, independently of browser passes. |

**Phase 2 readiness is separate:** the earlier schedule download/basic parsing evidence is available, so its engineering work
can be scoped on request. Timetable-based routing itself is not ready. It still needs a reproducible versioned importer,
trip→route/service validation, exact platform/direction identities, ordered/valid stop times, service-date/exception/overnight
handling, validated transfers and independently checked journeys. Empty trip updates do not establish live timing semantics;
continuous network-wide real-time arrivals remain unsupported. These deferred checks do not block the informational Phase 1
implementation and have not been counted as passed. No EXTOL credential or native work is needed for Phase 2 rail schedules.

### Git and hosting provenance

- Source: `C:\Users\simho\OneDrive\Documents\ChatGPT\Neblala\The-Rail-Pathfinders`; origin
  `https://github.com/zephtzk/The-Rail-Pathfinders.git`.
- Parent: `6722f3fb8fb4921fdab89cf424dc1ef53efc5850`. Delivery branch: `codex/phase-1-live-corridor`.
  The commit containing this Phase 1 section is the delivery revision; resolve it with
  `git log -1 --format=%H -- docs/MILESTONES.md`. Exact commit/push outcome is reported in the task handoff to avoid a
  self-referential hash. No PR was created as part of this milestone.
- Existing Sites project `appgprj_6aad0ab90e5881919eca01b79f19aa24` was inspected read-only: owner access, custom/private,
  latest version 2. Hosted source remains `f8546eef7e950ffb3e50f98a6867b4e73f3dedf2`, deployment
  `appgdep_6aad11c6077881919115c818eff5f41a`. [Private preview](https://commute-copilot-nebula.simhongmen.chatgpt.site).
- `.openai/hosting.json`, hosting secrets, hosted versions and access audience were not changed. **Phase 1 is not deployed.**

**Boundary:** stop after this local implementation, Git delivery and report. Full live-validation sign-off remains open;
unobserved live variants and physical/hosted checks retain their stated statuses. No deferred check is silently accepted.

---

The Phase 0 record below is retained as historical evidence. Its references to Phase 1 not yet started describe that earlier
checkpoint; the Phase 1 section above is the current status.

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
