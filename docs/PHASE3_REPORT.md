# Phase 3 report — 18 September 2026

**Decision: local Phase 3 implementation complete within the bounded bus-estimate and map-supported walking pilot.** This is not a calibrated bus timetable, field-surveyed pedestrian product, physical-device acceptance or hosted release. The source checkout and both Phase 2 commits were preserved. No Phase 4 or EXTOL implementation began.

## Start, acceptance and prerequisites

Started from clean `codex/phase-2-rail-routing` at `d1a432b57bec2074bc05ee5c22f4d3f97c4ae5f2` in `C:\Users\simho\OneDrive\Documents\ChatGPT\Neblala\The-Rail-Pathfinders`. Origin remains `https://github.com/zephtzk/The-Rail-Pathfinders.git`. No repository or ancestor AGENTS.md was found. The older sibling `app/` and older main branch were not used.

Acceptance checks declared before implementation: repeatable complete imports; exact service/direction/occurrence identity; defensible bounded timing; evidenced pedestrian paths; useful direct/mixed/transfer routes; independently checked arithmetic; walking/deadline enforcement; live matching/freshness/failure handling; actual offline searches and reconnection; rail/replay/live regressions; measured combined performance. Targets were set before measurement: warm p95 ≤1 second, cold local browser result ≤3 seconds, compressed combined routing data ≤3 MiB and first-result browser JavaScript heap ≤150 MiB.

| Prerequisite at start | Classification | Outcome |
| --- | --- | --- |
| Correct history, source, pinned rail data, Node/Python/Edge | AVAILABLE | Verified and preserved |
| Current bus documentation, records and operating semantics | UNVERIFIED | Official v6.9 guide + observed records reviewed; unsupported calendar/window semantics excluded |
| Versioned bus source and repeatable import | MISSING | Complete pinned raw pages, compiler, manifest and independent hash checks added |
| Secure source access | UNVERIFIED | Existing authorized loopback session available; reused internally without extracting or persisting its key |
| Pedestrian paths | UNVERIFIED | Four exterior paths map-supported; no field, indoor or accessibility verification |
| Bus operating-time calibration | MISSING | Explicit uncalibrated estimate model, short weekday window; no timetable or guarantee claim |
| Physical phones, WAN/hosted release | UNVERIFIED | Remain NOT TESTED; no deployment authorized |

## Changes and exact local instructions

The rail page at `/` remains a scheduled rail planner, with a link to `/multimodal.html`. The pilot combines scheduled rail, frequency-based bus waits, estimated bus rides and only reviewed exterior paths. Preferences, deadline and total walking limits remain active. Current bus arrivals are an optional separate advisory panel; they never modify an itinerary, forecast a future date or propagate precise downstream ETAs. The original replay and Phase 1 live panel remain at `/replay.html`.

```powershell
cd C:\Users\simho\OneDrive\Documents\ChatGPT\Neblala\The-Rail-Pathfinders
npm ci
npm run check
$env:PORT='4176'
npm run dev
```

Open **http://127.0.0.1:4176/multimodal.html**. A key-free preview on that port was left running at handoff; choose another PORT if needed. The development server uses built output, so run `npm run build` after edits. No key is required for pinned import, rail/bus calculation or saved guidance.

At 10:00 on 18 September, 20 minutes walking and no deadline, try:

| Origin → destination | Mode / evidence |
| --- | --- |
| `bus:75009` → `bus:75059` | Bus only: service 23, 720s wait + 450s riding = 10:19:30 |
| `bus:75009` → `bus:81119` | Bus only: service 23 → 28 via the same roadside stop 75059 |
| `bus:75009` → `DT14` | Bus → rail to Bugis, including a reviewed Paya Lebar path |
| `DT14` → `bus:75009` | Rail → bus, boarding the correct opposite-direction stop 81111 |
| `DT14` → `bus:75009`, EWL-unavailable demonstration | Explicit synthetic fallback; no live closure claim |

Repeat verification:

```powershell
npm run import:bus
npm run test:bus-import
python scripts/verify-walking.py
npm run benchmark:multimodal
$env:BROWSER_EXECUTABLE='C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
$env:TEST_BASE_URL='http://127.0.0.1:4176'
npm run test:multimodal-browser
node tests/rail-offline-browser.mjs
npm run test:rail-browser
$env:TEST_BASE_URL='http://127.0.0.1:4176/replay.html'
npm run test:browser
node tests/live-browser.mjs
```

Browser suites use desktop Edge emulation. `CAPTURE_DIR` can direct fresh evidence to an ignored directory rather than overwrite checked-in evidence.

## Coverage and estimation limits

Raw acquisition covers 5,208 stops, 26,823 routes rows and 801 service records. **Routing accepts only complete services 2, 23 and 28: five patterns, 291 occurrences, 261 stops.** Full routes extend beyond the pilot corridor; they are never truncated at its geographic boundary. All five patterns support only ordinary weekdays **18 September–2 October 2026, 09:30–16:30**. Boarding and alighting must fit that window and per-stop first/last bounds. Weekend, holiday, peak, last-service and overnight bus routing are excluded; their source clocks remain auditable.

Waiting assumes each direction's maximum published off-peak headway. The guide does not specify a separate day calendar for these ranges; ordinary-weekday applicability is an explicit project assumption. Riding uses cumulative-distance differences at **18 km/h plus 30 seconds per traversed stop**. Neither quantity is measured or guaranteed. First/last records do not become a synthetic timetable. Estimated bus arrival can invalidate a scheduled rail connection; an estimated deadline outcome is not guaranteed. Crowding comparisons are unavailable and quieter falls back explicitly.

Four bidirectional exterior walks join stops **81111/81119** to Paya Lebar **CC9_A/B** via B/C, and **01059/01113** to Bugis **EW12_A/B** via B/A. Exterior allowances are 90/90/90/60 seconds, plus one 120-second indoor allowance. Other rail lines require the existing rail interchange allowance. Exact paths, crossing/barrier review, source dates/hashes, coordinates and limitations are in [WALKING_COVERAGE.md](WALKING_COVERAGE.md) and the [visual path review](../data/bus/walking-evidence/path-review.html). Operator maps carry a 2021 date caveat and are corroborated with pinned 2025/2026 OSM footway revisions. Paths are map-supported, not field surveyed. Indoor facilities/accessibility remain unknown.

The router prevents consecutive exterior paths creating an unreviewed station shortcut and avoids charging station access/exit twice. Rail endpoints require a train ride on their applicable side. No bus-to-station-entrance-only journey is enabled. Shared roadside-stop bus changes use a 60-second non-walking allowance. Bus transfers at aggregate terminal IDs 75009, 52009, 99009 and 10499 are excluded because bay paths are unverified; these remain endpoints. No distinct-stop bus-to-bus walking connection is enabled.

The wider rail network and its **18 September–31 December 2026** calendar/carryover rules remain. Newton, Tampines and Bukit Panjang tap-out connections remain omitted. No Tampines bus/rail path, address search, geocoding, paid service, new account, accessibility routing or fare calculation was added. See [complete coverage](PHASE3_COVERAGE.md) and [source/timing contract](BUS_DATA.md).

## Acceptance ledger

| Acceptance check | Status | Evidence and boundary |
| --- | --- | --- |
| Correct source/history and Phase 2 attributes preserved | PASS | Branch ancestry and unchanged pinned rail inputs; clean original base |
| Specific Phase 2 offline gap closed | PASS | [15 real offline checks](evidence/phase3/rail-offline-results.json): disable networking, reload, submit changed origin/destination; 120+320+1860+120=2420s, 08:50:20; continued offline state; reconnect and reload preserve new guidance. Historical overclaim corrected. |
| Complete reproducible bus acquisition | PASS | All 70 pages including empty terminal pages; [second full acquisition](evidence/phase3/bus-acquisition-repeat.json) identical; pinned reimport byte-identical |
| Pagination, duplicate/orphan, leading zero, variants, ordered occurrences, loops, termini | PASS | 12 Python importer tests + 3 Node acquisition tests; raw/accepted/excluded audit; five full clean patterns; three outside-pilot metadata orphans recorded |
| Applicable operating-day/first-last/overnight semantics bounded honestly | PASS | Original clocks and rollover retained; unsupported dates/windows excluded. Overnight calendar semantics are not claimed validated. |
| Correct service/direction/visit matching | PASS | Synthetic exact/ambiguous/unmatched cases; [two real v3 samples](evidence/phase3/bus-live-real.json) each contain three uniquely matched pilot predictions |
| Useful direct bus, bus→rail, rail→bus and bus transfer | PASS | Actual imported-data tests and [27 browser checks](evidence/phase3/multimodal-browser.json); full pattern occurrences retained |
| Every enabled exterior path has reviewable provenance | PASS | [Four path validations](evidence/phase3/walking-validation.json), source map/way hashes, directions, crossings/barriers, distance/time assumptions and exclusions |
| Walking limits and no double indoor allowance | PASS | Synthetic and imported tests include exact budget, directed/disabled links, blocked station-through shortcuts and endpoint allowances |
| Independent arithmetic and transfer feasibility | PASS | Hand-calculated synthetic bus/mixed cases, imported decimal-distance regression, [36-pair independent bus solver](evidence/phase3/bus-oracle.json); 100-network rail oracle retained. One floating-point extra-second defect fixed. |
| Opposite stops, loops, missed connections, last bounds, overnight, impossible deadlines | PASS | Synthetic edge cases + real occurrences. Unsupported bus overnight/weekend is rejected; scheduled rail overnight remains supported. |
| Live key remains server-side; bounded shared requests/cache/backoff | PASS | 19 adapter tests; 2 simultaneous upstream requests maximum, 40 cached stops, 30s success refresh, 60s general failures, 5min authentication backoff, bounded Retry-After. No browser key or persistent secret. |
| Fresh/empty/unavailable/unmatched/expired distinctions | PASS | Client/server validation tests; provider observation timestamp absent, HTTP Date/retrieval/prediction separate; invalid timestamps fail closed. Live values stay advisory. |
| Authentication/rate-limit/timeout/malformed/partial failure behavior | PASS | Synthetic only; provider was not deliberately stressed |
| Actual offline bus and mixed calculations, saved guidance, reconnect | PASS | Browser networking disabled and reloaded; new bus-only destination and new mixed-mode search submitted; arithmetic checked; reconnect/reload preserve selected route. API responses never cached or saved as current. |
| Disruption fallback | PASS | Explicit EWL-unavailable fixture; no advisory-prose interpretation or automatic rerouting |
| Rail/replay/Phase 1 regressions | PASS | [97 preserved checks](evidence/phase3/preserved-browser-regressions.json): 29 rail, 15 rail offline, 30 replay, 23 synthetic live-panel; original corridor timing preserved |
| Combined size/cold load/query latency/browser memory | PASS, desktop profile only | Measurements below; no extrapolation from earlier rail-only benchmarks |
| Narrow UI, 200% text, saved/live malformed data | PASS | 320/390px desktop emulation, zero horizontal overflow, explicit nested payload validation; no browser exceptions |
| Field-surveyed paths, indoor access, lift/step-free facilities | NOT TESTED | Map evidence only; not represented as verified accessibility |
| Calibrated bus rides/waits, real missed-connection reliability | NOT TESTED | Model assumptions disclosed; no guarantee |
| Real adverse provider failures and all service/variant samples | NOT TESTED | Bounded two-stop real sampling, synthetic failure cases |
| Phase 1 fresh crowd interval/nonempty disruption variants | NOT TESTED | Historical gaps remain; bus observations do not clear them |
| Physical Android/iOS, slow WAN, sustained mobile memory | NOT TESTED | Desktop emulation only |
| Hosted release / public attribution constraints / production live config | BLOCKED for release | Outside authorization; existing identity/audience untouched; earlier attribution and credential-lifecycle follow-ups remain open |

**Automated total: 122 Node tests, 27 rail-import tests and 12 bus-import tests pass, plus 10 built-Worker checks, source integrity and pedestrian validation. Browser total: 124 checks pass.** [Full check output](evidence/phase3/check-output.txt); [built-Worker evidence](evidence/phase3/build.json) checks compression, no-key/unsupported-stop fallbacks, no-store headers and absence of the temporary acquisition handler. No unresolved failure remains inside the declared local acceptance scope.

## Performance and tested identity

Windows desktop, Node 24.16.0, Edge 153.0.4234.32, loopback network without CPU/network throttling. [Benchmark](evidence/phase3/benchmark.json) records CPU, sample pairs and process memory. The 24 warm mixed queries have p95 **66.46 ms**; cold Node parse/index/first query **231.93 ms**. A fresh browser result took **441.80 ms** and used **58,329,920 bytes** of JavaScript heap. These are point samples, not sustained memory or physical-phone measurements.

The three routing artifacts total **13,561,691 uncompressed bytes**, **1,972,266 gzip bytes**. The browser actually received **2,070,825 encoded bytes / 13,660,250 decoded bytes** across routing data and both source manifests. Raw source pages are not sent to browsers. The generated Worker is about 3,160 KiB; cloud deployment limits were not tested. The combined-data targets passed on this explicitly measured desktop profile.

| Identity | SHA-256 |
| --- | --- |
| Tested application content (client assets + server adapters) | `e0d5673312d049b91c102fd64d371be61c5d8f366bc16cb59ecb0f6887ca77fc` |
| Tested generated Worker | `e5e2c4d0b68ceec0637dda3aeb2a82ef7ac5cb559d138b085d23ec3661e83533` |
| Rail network, preserved | `a7158eef5df2b5cbf345e3de03872205a61d9a4919f11b4745c192d4daf7b934` |
| Combined canonical raw bus source | `439b6cf16c91eb85e11f90dfb44bd477127842c1204bdc1139c35d8048cb181e` |
| Compiled bus network | `7dae33ac2f4435a7a765eccc6f83fa4b188929fc7db1271eddf2515e50ad5bac` |
| Walking ledger | `262856a9824a27088ec6f42b5877d74fa0572bc9dfbf40e75195ec20ccc12620` |

The app identity is generated at `/data/application-build.json`. A final build after tests reproduced that identity. Importer/rules/raw-page/map hashes are separately pinned and checked. Browser evidence records the tested application and Worker identities, not merely the earlier Git base or an enabled search control.

## User requirements, secure configuration and Phase 4

No user input is needed for the completed local pilot or pinned imports. Optional fresh arrivals use **`LTA_ACCOUNT_KEY` in server process memory**. The existing authorized local session was reused for this work; later sessions can run `python scripts/run-live-local.py --gui --port 4173` and enter the key in its masked local field. A new bus snapshot uses `python scripts/download-bus.py --gui`. Never enter keys in chat, screenshots, Git or literal shell commands. No persistent secret or hosting environment was changed.

| Remaining requirement | What it blocks |
| --- | --- |
| Physical-device/WAN checks and representative bus/walk observation | Release/performance/accessibility claims beyond this desktop estimate pilot |
| Reviewed paths for any additional stop, entrance or terminal bay | Enabling those connections; current four links remain usable |
| New DataMall source review after 2 October, expanded timing calendars or calibrated travel model | Extended bus dates/windows and stronger timing claims |
| Phase 1 real fresh crowding and nonempty disruption variants | Clearing historical live-data acceptance gaps |
| Confirmation of prior exposed-key revocation, if still outstanding; public attribution/link permission follow-up | Earlier credential lifecycle and public-release conditions; not pinned local calculation |
| Explicit later release authorization and existing-project runtime secret if live hosting is desired | Hosted publication; no deployment performed here |

The implementation provides a tested base for separately scoped Phase 4 work. **It is not ready for unattended live dynamic rerouting or a public release.** That phase needs validated time-applicable incident semantics, a policy for uncertain bus connections, continued honest offline behavior, and remaining device/release checks. No automatic mid-journey rerouting or optional EXTOL work was started.

## Local delivery

Branch: **`codex/phase-3-bus-walking`**. Base: `d1a432b57bec2074bc05ee5c22f4d3f97c4ae5f2`. The commit containing this report is the local delivery revision; obtain its exact SHA with `git log -1 --format=%H -- docs/PHASE3_REPORT.md`. The exact final SHA is also supplied in the task handoff, avoiding a self-referential hash in this file.

No push, PR, merge, deployment, hosting visibility change or replacement repository/project was made. Existing private hosting remains the older release. This work stops at this Phase 3 report.
