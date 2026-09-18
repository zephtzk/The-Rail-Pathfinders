# Phase 2 milestone report — 18 September 2026

**Decision: Phase 2 engineering milestone ready within the declared imported coverage.** The general rail planner replaces predefined choices on the default page. The original corridor remains a labelled regression/demo experience at `/replay.html`. This is a scheduled-data milestone, not live disruption routing or a verified phone/hosted release. Bus and address-to-address support are not claimed.

## Starting point and prerequisites

Work started from clean `codex/phase-1-live-corridor`, commit `c7f71e5da3197640eb6bf0372e8669de7c41b6fa`, in the named `The-Rail-Pathfinders` checkout. Origin remains `https://github.com/zephtzk/The-Rail-Pathfinders.git`. The 48 existing tests passed before implementation. No repository/ancestor `AGENTS.md` was found. Work is on `codex/phase-2-rail-routing`.

| Prerequisite | Classification at start | Resolution |
| --- | --- | --- |
| Correct checkout, history, Node/Python/Edge | AVAILABLE | Existing checkout and baseline verified; older sibling copies untouched. |
| GTFS entitlement / earlier source validation | AVAILABLE | Phase 0 had successful access and parsing evidence. |
| Repeatable source archive | MISSING → AVAILABLE | Earlier audit kept metadata only. A single fresh acquisition used the existing credential-bearing loopback session without extracting its key. Download SHA exactly matched Phase 0. |
| Credentials for current acquisition | AVAILABLE | Existing local session; no new user secret, credential file or provider configuration needed. |
| Platform identities, calendars, transfers | UNVERIFIED → validated to stated boundary | Source references/times validated; explicit interchange rule ledger checked against LTA standard-interchange codes. Walking allowances remain assumptions. |
| Physical phones / hosted Phase 2 | NOT TESTED | Not required to establish this local scheduled-router milestone; no hosted change was made. |

## What changed and how to try it

Build with `npm run check`, then `npm run dev`; open the local root page. The current task also leaves a built, key-free preview at **http://127.0.0.1:4175**. Pick any of the imported station identities, an explicit civil departure/deadline date, walking limit and preference. Coverage, exceptions/omissions, provenance, timing breakdown and schematic are visible. The [README](../README.md) contains repeatable commands; the [coverage summary](RAIL_COVERAGE.md) lists line and interchange boundaries.

The pure engine uses a Pareto connection scan over timetable connections, preserving source stop, route, trip, service and direction identities. It accounts for intermediate dwell, boarding restrictions, explicit train-change connections, service calendars, previous-day times beyond 24:00 and next-day departures. Arrival, walking and number of boardings remain separate search criteria. Preferences select within the deadline and extra-time budget. Quieter falls back explicitly when comparable crowding is unavailable. Neither live advisory prose nor map geometry changes the graph.

Try 19 September, 08:10 departure, 11:00 deadline and 30 minutes walking:

| Journey | Scheduled station-exit arrival | Transfers |
| --- | --- | ---: |
| Yew Tee → Punggol Coast | 09:36:10 | 2 |
| Punggol Coast → Yew Tee | 09:34:40 | 2 |
| Somerset → Oasis | 09:11:20 | 2 |
| Oasis → Somerset | 09:11:20 | 2 |
| South View → Punggol Coast | 09:52:40 | 3 |
| Punggol Coast → South View | 09:46:10 | 3 |

These are outputs of the pinned schedule and declared walking assumptions, not observed train journeys. Every ride carries its source trip/direction/service-day provenance. All 34,410 distinct ordered station pairs are structurally connected; service and user constraints still govern timed feasibility.

## Acceptance checks

| Requested check | Status | Evidence and boundary |
| --- | --- | --- |
| Repeatable import records source, version, dates and completeness | **PASS** | Two byte-identical imports in 4.533/4.565s; archive, metadata, rules, importer and output hashes recorded. [Import evidence](evidence/phase2/import.json). Builds reject stale/mismatched inputs. Exact-byte Git attributes preserve hash inputs across OS newline settings. Raw/included/excluded counts and reasoned quarantine are retained. |
| Visible validated coverage and useful unsupported-journey explanations | **PASS** | Picker/directory, source/licence/retrieval/build, per-service bounds, omitted transfers, excluded records/trip, station/date/walking/deadline messages. [29 browser checks](evidence/phase2/rail-browser.json); desktop Edge emulation, including 320px/390px and 200% text. |
| Beyond-corridor bidirectional and multiple-transfer routing | **PASS** | Actual imported-data tests assert two- and three-transfer routes both ways, exact trip continuity and directed interchange rules. Browser checks exercise Woodlands ↔ Changi Airport. [Representative queries](evidence/phase2/benchmark.json). |
| Service days, after-midnight, last services, disconnection and impossible deadlines | **PASS** | Reference tests cover weekdays/add/remove exceptions, first-date previous-day carryover, next-day service, final-date carryover, missed last trains, disconnected graphs, missing dates/stations and exit time against deadline. Actual BP cancellation and midnight browser journeys also checked. [Tests](../tests/rail-engine.test.mjs), [imported checks](../tests/rail-imported.test.mjs). No unsupported 2027 service is invented. |
| Arithmetic and interchange feasibility independently checked | **PASS** | Hand-computed reference network plus **100 seeded networks** compared against a separate event-state shortest-path oracle, with zero mismatches. Raw source corridor trip independently checked: access120 + wait320 + ride1860 + exit120 = 2,420s, arriving08:50:20. Interchange feasibility is checked against the documented assumed allowances, not claimed as field-measured walking. [Oracle](../tests/rail-oracle.test.mjs). |
| Representative latency and import size measured against target | **PASS on stated desktop profile** | Targets fixed before measurement: warm p95≤500ms, cold parse/index/query≤2s, compressed network≤2.5MiB. Observed p95 **40.53ms**, cold **246.89ms**, Worker-served gzip **1,947,956 bytes**. [Benchmark](evidence/phase2/benchmark.json), [HTTP/build checks](evidence/phase2/build.json). See device/network limits below. |
| Existing corridor behaviour explainable and tested | **PASS** | All48 prior Node tests preserved; **30 replay browser checks** and **23 synthetic live-panel browser checks** pass, including actual browser offline transitions. Replay timing remains31min/08:41; scheduled timing40m20s/08:50:20 is separately sourced. [Replay](evidence/phase2/replay-browser.json), [live panel](evidence/phase2/live-browser.json). |

Additional verification: `npm run check` passed **72 Node tests + 27 Python importer tests**, plus build. Browser suites passed **90 checks** (29 rail, 8 rail offline, 30 replay, 23 live panel), and **6 HTTP/build checks** passed. [Verification summary](evidence/phase2/verification.json). The original rail offline suite used real browser network disable/reload and checked saved guidance and reconnect state. Its new-search check only asserted that the button was enabled; it did **not** submit a new journey, so the historical evidence does not prove successful offline calculation. It made no live-adapter request. The [original evidence](evidence/phase2/rail-offline-browser.json) is retained unchanged.

**Phase 3 verification correction:** the expanded [offline browser check](../tests/rail-offline-browser.mjs) closes this specific gap by submitting a changed Tampines → Bugis journey after a genuine offline reload, checking `navigator.onLine === false` before and after calculation, independently checking 120s access + 320s waiting + 1,860s riding + 120s exit = 2,420s (08:50:20 arrival), and saving the new result. Reconnection and a subsequent online reload must preserve that selected guidance. [New execution evidence](evidence/phase3/rail-offline-results.json) records exact tested application/data hashes and results. This is desktop browser offline emulation, not a physical-phone test or evidence for offline bus/multimodal support.

## Data and import provenance

- Source: LTA DataMall **GTFS Schedule (Train)**, archive retrieved **2026-09-18T13:21:49.530Z**, feed version **0.1**. Provider metadata timestamp is a distinct field, not an invented schedule-generation time.
- Archive: **2,348,183 bytes**, SHA-256 `b0fb41aea9696e864b0c5accfd05a06748566da392b6fac0392190c232d6b7a7`, exactly matching the Phase 0 audit.
- Importer: **2.0.0**; build ID `6880404c3da027e811f28de1d043f0c500b2b5b978073c8da29a5d4ffbd07bf2`.
- Network SHA-256: `a7158eef5df2b5cbf345e3de03872205a61d9a4919f11b4745c192d4daf7b934`; **13,426,545 uncompressed bytes**. Python's recorded gzip and Node's served gzip differ slightly by compression implementation; both exact sizes are separately recorded.
- Raw source:19 routes,12 calendars,2 exceptions,1,211 stop records,17,576 trips,333,262 stop times. Accepted:19 routes,11 referenced calendars,186 station records,434 platforms,17,575 trips,333,231 times. Excluded:591 entrances,1 invalid trip/31 time rows. All exclusions are explicit.
- No transfers or shapes table supplied. Separately versioned rules contain812 directed transfers:378 between reviewed platforms at27 standard interchanges,434 identical-platform reboarding rules. No unverified tap-out shortcut is added.
- The acquisition saved the licensed dataset and sanitised metadata. Credentials, request headers and signed URLs were not retained. A reusable bounded downloader supports future masked entry, while pinned reimport is entirely offline.

Importer validation rejects duplicate/orphan identifiers, invalid parent relationships, unsupported semantics, malformed/out-of-order times, nonpositive rides, inconsistent source/date metadata, unknown reviewed transfer IDs and source transfer constraints contradicted by direct or multi-hop walking paths. It does not silently fix schedule defects.

## Performance, limitations and evidence classes

The 64-query desktop sample spans the corridor, long cross-network journeys, two/three transfers, reverse directions, walking constraints, cancellation, late departure and impossible deadline. Runtime: Node24 on Windows, CPU recorded in the evidence. Its sampled process RSS was about **537MiB**, including raw parsing, cached date indexes and query allocations; this is not a browser heap estimate or an asserted mobile memory bound.

A separate fresh **desktop Edge** load over loopback reached its first result in **457.62ms**, transferred **1,947,956 compressed network bytes**, and recorded about **66.1MB used JavaScript heap** at that point. [Browser load evidence](evidence/phase2/browser-load.json). There was no bandwidth/CPU throttling. WAN startup, sustained device memory, low-end phones and physical iOS/Android remain **NOT TESTED**. No cloud deployment-size or hosted-runtime acceptance is claimed from local Worker execution.

Source calendars are applied literally: absent public-holiday substitutions remain unverified, even though service names include `PH`. One impossible Circle trip remains quarantined. Access/exit and all transfer durations are estimates; actual indoor routes, accessibility and particular entrances are unverified. Newton, Tampines and Bukit Panjang tap-out transfers are intentionally unavailable. Future source changes require a reviewed reimport, not automatic extrapolation.

**Evidence classes:** source acquisition was an authenticated real API/download check; routing/import/oracle checks are automated; browser checks use desktop Edge emulation with actual browser offline mode; live-panel regression feeds are synthetic. No new real disruption-update semantics, field-timed walks, physical phones or deployed Phase 2 were verified. Phase 1's outstanding real fresh-crowd/nonempty-disruption cases remain open in its historical ledger.

## Remaining user requirements and phase boundary

No user action or new credential is required for the completed Phase 2 checks or the pinned local planner. A later timetable update needs DataMall access through `download-rail.py --gui` or hidden terminal entry, then source/rule review. It does not require an EXTOL key.

Before any later release: test representative physical phones and real-network loading; obtain verified pedestrian paths if enabling tap-out transfers or entrances; validate any desired holiday/service amendments against supplied source data; obtain explicit hosting authorization while preserving the existing project/audience. Phase 3 bus/pedestrian coverage and Phase 4 live rerouting are separate work and have **not** begun.

## Git and hosting delivery

Branch: `codex/phase-2-rail-routing`, parent `c7f71e5da3197640eb6bf0372e8669de7c41b6fa`. The commit containing this report is the local delivery revision; resolve it with `git log -1 --format=%H -- docs/PHASE2_REPORT.md`. Its exact SHA is also reported in the task handoff to avoid a self-referential commit hash in this document. **Local commit only; no push or PR is part of this delivery.**

The existing Sites project, `.openai/hosting.json`, hosting credentials, deployed version and private audience were not changed. The [private hosted preview](https://commute-copilot-nebula.simhongmen.chatgpt.site) does not show Phase 2. This task stops at the rail-import/router milestone.
