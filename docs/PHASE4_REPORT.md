# Phase 4 — confirmed progress, resilient guidance and release verification

Current user-testing candidate and publication review: [PHASE4_READINESS.md](PHASE4_READINESS.md). This report retains the original Phase 4 evidence and hashes.
18 September 2026. **Local engineering acceptance PASS within the explicit scope below. Real live-routing validation NOT TESTED. Private deployment BLOCKED; release readiness NOT VERIFIED.** Real feed access/decoding is separately PASS. This is a locally committed release candidate, not a verified live release. No Phase 5 or EXTOL work began.

Branch: `codex/phase-4-live-rerouting`, created from the clean verified `38275dcac4d60153f8702eec9dda2582f6ee9969`. The Phase 3 history is preserved. Local commits only; no push, PR, merge, deployment, audience change or new project/service. The final handoff identifies the delivery commit; run `git rev-parse HEAD` in this checkout to resolve the exact report-bearing commit. Application/Worker hashes below identify the tested executable bytes independently of report-only commits.

## What changed

Walking provenance now uses the hash-pinned `data/bus/walking-evidence/acquisition.json`. All four original exact acquisition times are unknown: the prior values were filesystem mtimes, not acquisition logs. Those values remain as `legacyReportedRetrievedAt`; the first archive commit timestamp is separately labelled. SMRT's supported February 2021 source-date statement and OSM object edit timestamps remain intact. Regenerating copied files with mtimes in 2000 and 2040 produces identical ledgers and review HTML. Changing source bytes fails the acquisition hash gate. The four paths, geometry, allowances, unknown accessibility and no-field-survey limitations are unchanged; ledger version is `2026-09-18.2`.

The pilot now separates searched previews from accepted guidance. Explicit progress supports not departed, waiting at an exact planned stop/platform, onboard a planned leg, at the start of a transfer/exit, arrived, and unknown. Traveller confirmations, accepted guidance, walking used, completed boarding/exterior-link context and declined proposals persist. The router can begin at the confirmed platform without repeating station access or silently choosing another platform. Completed walking reduces the original allowance. Destination, deadline and preferences remain fixed during a comparison.

Onboard users keep the planned ride until they confirm alighting at its planned endpoint. Unknown progress asks for the minimum planned-leg/stop confirmation and retains instructions. No elapsed-time location, GPS, between-station exit, intermediate alighting promise or pedestrian shortcut is introduced. Current progress recalculation is limited to the accepted civil date; next-day progress retains instructions and requires a new dated search. The original rail planner's midnight carryover remains regression-tested.

Synthetic cancellation/segment/recovery events require exact schedule-build, active service day, trip, route, direction, segment where applicable, source/retrieval/validity timestamps and effective service-time scope. Prose, general line status, ambiguous mappings, stale/expired events and all real-provider events cannot change routing. Conflicting updates become unknown; older updates cannot override newer state. Missing updates and expiry are not all-clear.

Continuing and alternatives show supported arrival/deadline impact, remaining walking/waiting/transfers and changes. Infeasible continuation has no claimed arrival/deadline. Missed trains are not shifted forward. Late alternatives remain explicitly late, without an acceptance control. Ordinary switching needs at least five minutes of scheduled benefit. Uncalibrated bus timing cannot establish that benefit. Duplicate semantic effects and declines persist; five-minute cooldowns prevent repeated switching, while a newly applicable serious scope can surface. Every replacement needs traveller acceptance and revalidation.

Offline accepted instructions survive network loss, reload and even an individual missing routing asset. Cached new rail/bus/mixed searches preserve declared assumptions. Last-known notices/arrival health remain separate from routing, with saved/unavailable/offline age and provenance. Reconnection refreshes relevant sources immediately or once after the remaining minimum interval, invalidates earlier in-flight requests and preserves progress/guidance. Notice and bus adapters expose retry/last-success metadata and bounded growing failure backoff. Caches/coalescing are per process/isolate, **not distributed**. No continuous upstream polling was added.

## Prerequisites

| Prerequisite | Classification | Result |
|---|---|---|
| Source checkout, history, imported data and dependencies | AVAILABLE | Correct Phase 3 base, clean start; pinned rail/bus sources retained |
| Existing credentialed localhost runtime | AVAILABLE | Reused server-held key without extraction; bounded genuine samples recorded |
| Current official contracts | AVAILABLE | LTA guide v6.9 and GTFS reference inspected |
| Nonempty, exactly matched live trip updates/cancellations/recovery | MISSING in bounded samples | Effects disabled; not replaced by fixture evidence |
| Existing Sites owner-private project and archive rollback | AVAILABLE | Owner-only custom audience, version 2 deployment succeeded |
| Supported Sites secret configuration mechanism | AVAILABLE | Runtime environment tool supports `is_secret:true` |
| Hosted `LTA_ACCOUNT_KEY` | MISSING | Environment revision 0, no entries |
| Authorization for Sites' required source push | MISSING | User expressly prohibited Git push; deployment cannot proceed |
| Candidate's hosted Worker/runtime behavior | UNVERIFIED | Candidate not deployed |
| Physical Android/iPhone and real mobile network | UNAVAILABLE / UNVERIFIED | No connected physical-device evidence |

## Acceptance ledger

The machine-readable evidence is under [evidence/phase4](evidence/phase4). **PASS refers only to the named evidence class.** No outstanding measured engineering FAIL remains after fixes. NOT TESTED means evidence was unavailable, not a fixture success.

| Acceptance check | Result | Evidence and limit |
|---|---|---|
| Correct base/history/branch; preserve newer work | PASS | Clean initial state at Phase 3 commit; branch created there |
| Pinned walking acquisition; copying/mtime invariance; reject source mutation | PASS | `tests.json`: real generator copied to temp checkout; 2000/2040 mtimes; acquisition-byte mismatch rejected |
| Preserve four paths, accessibility/field limits and source dates | PASS | Walking ledger diff, build provenance gate, generator comparison |
| Not-departed, waiting, onboard, transferring, arrived, unknown | PASS | `tests.json` / journey suite; `browser.json` for confirmed onboard/unknown |
| Feasible platform seed; no repeated access/instant platform jump | PASS | Independent 08:19 platform seed: 300s completed + 240s remaining = 540s |
| Onboard/unknown retain guidance and require confirmation | PASS | Unit and browser checks; intermediate alighting deliberately unsupported |
| Completed legs and cumulative walking allowance | PASS | 9-minute exact bound passes, 8-minute bound fails; completed context retained across acceptance |
| Applicable/irrelevant trips, routes, directions, dates and segments | PASS | Synthetic matching and effective-segment interval tests |
| Before-departure and transfer-stage disruptions | PASS | Synthetic unit checks and before-departure browser demonstration |
| Cancellation, explicit recovery, expiry and missing updates | PASS | Synthetic lifecycle checks; expiry/missing remain unknown |
| Duplicates, conflicting revisions and older/out-of-order updates | PASS | Synthetic event ordering plus sanitized client snapshot tests and adapter generation tests |
| Accepted and declined alternatives persist | PASS | Browser accept/decline/reload; stale acceptance rejected |
| Material thresholds, semantic duplicate suppression and cooldown | PASS | 300s inclusive; 240s suppressed; bus uncertainty suppressed; new serious scope bypass |
| Missed connections, all-late and no-feasible outcomes | PASS | Independent bus alighting: 10:17 + 210s misses 10:20 train; 10:52 arrival misses 10:45 by 420s |
| Deadline and walking limits never silently relaxed | PASS | Unit/oracle and rail/pilot browser regressions |
| Uncertain bus-to-rail connection and predictions advisory | PASS | Uncalibrated estimate labelling; bus/rail connection oracle and pilot browser checks |
| Authentication, rate limits, timeout, malformed/partial payloads | PASS | Synthetic adapter regressions; no deliberate provider error induced |
| Shared cache/coalescing and growing backoff | PASS | Per-isolate/process tests, not global infrastructure validation |
| Real browser network loss, offline reload, new rail/bus/mixed search | PASS | Desktop Edge with actual network disabled; `rail/rail-offline-results.json`, `pilot/multimodal-browser.json`, `browser.json` |
| Reconnection/repeated transitions preserve progress/next step | PASS | Phase 4 browser check; one immediate relevant request across repeated transitions |
| Missing routing asset retains accepted guidance | PASS | Browser deliberately aborts bus asset; saved active guidance survives and recalculation disables |
| Narrow screens, 200% text, keyboard focus, live status regions | PASS | Desktop Edge emulation at 390/320px; not physical assistive-technology certification |
| Preserved rail, replay, live-info and bus/walking behavior | PASS | 124 retained-experience browser checks on changed build |
| Complete changed startup/query/memory/transfer budgets | PASS | Desktop measurements below; no WAN/phone inference |
| Real notices authenticated/envelope decoded | PASS | `live-real.json`; status 1, three messages, zero affected segments |
| Real GTFS alert/update envelope/download/decoding | PASS | `gtfs-real.json`; two alert entities; update feed empty |
| Real bus boarding identity in both directions | PASS | Service 28 at 81119/81111; one ETA already past; freshness is checked separately |
| Real schedule-version/service-day/segment trip-update mapping | NOT TESTED | Empty trip updates; realtime feed_version absent; live effects disabled |
| Real relevant disruption/cancellation/delay/recovery | NOT TESTED | No fully applicable sample; no indefinite polling |
| Daytime bus calibration/downstream arrival confidence | NOT TESTED | Night-time samples cannot calibrate pilot estimates; no confidence percentages invented |
| Current Sites project/audience/version/rollback archive | PASS | `hosting-preflight.json`; owner-only custom access, version 2, successful stored deployment |
| Candidate source push/save/private deployment | BLOCKED | Sites requires pushed source; explicit no-push instruction retained |
| Hosted candidate exact source/build/private audience | NOT TESTED | No candidate deployment |
| Hosted assets/compression/runtime/secret/error behavior | NOT TESTED | Local Worker byte/HTTP checks PASS separately |
| Hosted saved guidance, offline/reconnection/feed health | NOT TESTED | Local browser results are not hosted evidence |
| Hosted real live adapter | BLOCKED | No runtime secret and no candidate deployment |
| Android Chrome / iPhone Safari / real airplane mode / mobile keyboard | NOT TESTED | Physical devices unavailable |
| Executed production rollback | NOT TESTED | Stored rollback target verified; no production change made |

## Evidence, performance and identities

`tests.json`: **140 Node tests**, **27 rail importer**, **12 bus importer**, **1 walking metadata** check. `browser.json`: **29 Phase 4 browser checks**. Retained browser suites: rail 29, rail offline 15, replay 30, live information 23, pilot 27; **153 browser checks total**. `verification.json`: **15 complete-Worker/build/performance checks**. Synthetic inputs, pinned-data oracles, real APIs, desktop browser emulation and hosting control-plane evidence are stored separately.

Complete Phase 4 desktop Edge `153.0.4234.32` cold first usable panel: **480.99 ms** (budget 3,000 ms). First-result used JS heap: **34,220,744 bytes** (budget 150 MiB). Full remaining-journey comparison warm p95: **48.61 ms** (budget 1,000 ms; 20 comparisons across rail and mixed pairs). Compressed combined routing data: **1,972,408 bytes** (budget 3 MiB). Startup live requests: **0**. Immediate relevant notice requests during repeated reconnections: **1**. Deferred reconnect requests and shared upstream TTLs are described in operations. Measurements are desktop/loopback only.

| Artifact/data | Tested identity |
|---|---|
| Application SHA-256 | `e49211ee0f2947fa1290d079d0fe431bbdcdc02024eee34d865bea056eb25357` |
| Worker SHA-256 | `99c48a7adeb7e2fb934db150511f62cab56a48b1e42e01476a9fbb40adfa8af4` |
| Rail import build | `6880404c3da027e811f28de1d043f0c500b2b5b978073c8da29a5d4ffbd07bf2` |
| Rail network SHA-256 | `a7158eef5df2b5cbf345e3de03872205a61d9a4919f11b4745c192d4daf7b934` |
| Rail source ZIP SHA-256 | `b0fb41aea9696e864b0c5accfd05a06748566da392b6fac0392190c232d6b7a7`; feed_version `0.1` |
| Bus source version | `439b6cf16c91eb85e11f90dfb44bd477127842c1204bdc1139c35d8048cb181e` |
| Bus network SHA-256 | `7dae33ac2f4435a7a765eccc6f83fa4b188929fc7db1271eddf2515e50ad5bac` |
| Walking ledger | `2026-09-18.2`; exact SHA-256 in `verification.json.applicationBuild.walkingSha256` |

Rail remains 186 source station records / 434 boarding stops / 19 service patterns / 17,575 trips, service dates **18 September–31 December 2026**, with actual calendars/exceptions/carryover and prior exclusions. Bus remains services **2, 23, 28**, five patterns, 261 stops, ordinary weekdays **18 September–2 October 2026, 09:30–16:30** for both boarding and alighting. No current use silently extends those dates/window; the chosen demonstration date is supported. Four exterior links remain at Paya Lebar/Bugis. Frequency/riding/walking assumptions are not calibrated measurements. No addresses, broader bus coverage, opposite-stop crossing, unreviewed shortcut or EXTOL.

## Real-data result and release decision

Bounded sampling around **22:17 SGT** reused the existing server-held key. GTFS feeds were readable with source header approximately 47 seconds before retrieval; both omitted realtime `feed_version`. The two alerts have effect `MODIFIED_SERVICE`, route-only `SK`/`BP` selectors, no direction/stop/trip and no impact period. They cannot establish whole-line closure, precise delay or restoration. `FULL_DATASET` with zero trip updates supplies no on-time/all-clear proof. Bus service 28 matched both directions, but one boarding prediction had already passed and downstream arrivals remain uncalibrated. These observations do not validate daytime travel, timetable-version mapping or live rerouting. Contracts: [LTA DataMall API guide v6.9](https://datamall.lta.gov.sg/content/dam/datamall/datasets/LTA_DataMall_API_User_Guide.pdf), [official GTFS realtime reference](https://gtfs.org/documentation/realtime/reference/).

Data-use handling: retained LTA/source provenance, OpenStreetMap contributor/ODbL attribution and original map rights; no raw credential/signed-link payloads were published. The earlier account-channel hyperlink/publication follow-up remains a future public-product condition in the historical ledger. No new public release was attempted, and that unrelated future condition was not used to block local engineering. No legal/publication clearance is inferred from these engineering checks.

1. **Rerouting engineering correctness: PASS for confirmed same-day progress and deterministic scoped events, with conservative onboard/unknown handling.** No claim that real-provider routing effects work; they are disabled.
2. **Real live-data validation: access/decoding and advisory bus matching PASS; routing semantics NOT TESTED.** Representative nonempty correctly mapped updates/disruption/recovery are still required.
3. **Release readiness: local candidate ready for review; hosted/private/mobile release NOT VERIFIED.** Deployment is blocked by the push authorization conflict. Missing hosted secret and physical devices are separate unmet prerequisites.

## Delivery and remaining user requirements

Use [PHASE4_OPERATIONS.md](PHASE4_OPERATIONS.md) for exact normal/synthetic/offline steps, command checks, cache/request limits, secure configuration and concrete rollback.

- If deployment is desired, authorize the **Sites source push required by its publishing contract**, while retaining owner-private access. This task has not inferred an exception to the explicit no-push instruction.
- Configure **`LTA_ACCOUNT_KEY` as a secret** in the runtime environment of existing Sites project `appgprj_6aad0ab90e5881919eca01b79f19aa24`. Do not send the value through chat. It blocks hosted real adapter checks, not local scheduled/replay operation.
- Provide physical Android Chrome and iPhone Safari access for actual mobile keyboard/large-text/airplane-mode tests. Desktop emulation is not a substitute.
- Representative provider trip/disruption/recovery samples must occur before real routing effects can be enabled. No further secret is needed for existing local bounded sampling; another routine empty sample would not satisfy this gate.

The existing site remains **version 2**, source `f8546eef7e950ffb3e50f98a6867b4e73f3dedf2`, at [the unchanged private site](https://commute-copilot-nebula.simhongmen.chatgpt.site). It does **not** contain Phase 4. Stored rollback version ID: `appgprj_6aad0ab90e5881919eca01b79f19aa24~appgver_4f9eae0b43848191bd9dea16d542d2be`. A future rollback can redeploy that archive without rebuilding; actual rollback was not executed.
