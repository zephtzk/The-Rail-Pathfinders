# The Rail Pathfinders

**Cheah Kika | Jin Donghua | Zeph Tang Zhenkai | Zhang Yizhuo**

NEBULA X | Problem Statement 2 | FR4 | 19 September 2026

## Commute Copilot

*A little help along the way.*

### Persona: Mdm Lim, the occasional traveller

Our primary design target is Mdm Lim from the [competition persona brief](https://github.com/aochinwen/NebulaX-Hackathon-ProblemStatement/blob/main/PS2/PS2_README.md#22-the-commuter): an occasional traveller who walks slowly, avoids stairs and needs to plan an unfamiliar journey in advance. This is a design choice, not a finding from a user study.

We prioritise adjustable large text, Simple guidance, clear current and next steps, advance route review and a Show to staff message. Walking preferences and a read-only trip link support planning and assistance. The traveller stays in control of route changes. Our tested Paya Lebar-to-Bugis journey demonstrates these interactions; it does not validate Mdm Lim's hospital journey or prove that its paths are accessible.

### Architecture: how a route becomes guidance

**Browser:** HTML/CSS and JavaScript collect endpoints, time and preferences. A cancellable Web Worker runs the rail/bus routing engine over packaged schedules, bus patterns and walking links. Matching demo exclusions are applied before route ranking. Leaflet displays the route using attributed OpenStreetMap-derived geometry.

**State and services:** an accepted-journey state machine separates suggestions from active guidance. LocalStorage retains preferences, saved routes and progress until removed; a service worker caches the app and prepared guidance. A Cloudflare-compatible Worker serves the app and sharing API. Read-only trip links use persistent D1 storage. Optional server adapters call OneMap and LTA with credentials kept off the client. Deterministic rules perform the routing; no LLM is required.

### Assumptions we make explicit

The user supplies the correct endpoints, journey date and any deadline, and confirms actual progress. We interpret travel times in Singapore time and use service calendars within the packaged data's coverage. Walking allowances and preference presets are editable design defaults, not measured personal walking speeds.

The demonstration treats saved closures/cancellations as valid only for their stated service, direction, segment and time window. Simulated incidents are labelled. Missing live data means unknown or unavailable; it is not evidence of normal service. Offline guidance requires a successful readiness check while online.

### Known limitations

**Routing and data:** schedules are dated; bus ride/wait times and fares are estimates. Demo closures can change routes, but official notices remain advisory and delay scenarios do not produce validated revised arrivals. We have not established prediction accuracy, real-world time savings or superiority to another journey planner.

**Incomplete integrations and accessibility:** the submitted hosted configuration lacks OneMap and LTA arrival credentials, so address/GPS routing and live arrivals are unavailable. The demonstration uses station or bus-stop endpoints. Continuous step-free indoor paths, endpoint walks and current lift availability are unverified; advance lift warnings are not demonstrated. The accessibility preset blocks starting an unverified route. These remain gaps against Mdm Lim's needs; the demonstration does not certify an accessible journey. Crowding, shelter and cycling are also unverified.

**Use and privacy:** desktop automation and mobile emulation do not replace physical-phone or commuter trials. Coordinates cannot confirm a floor, boarding or arrival. Offline maps/live feeds are not guaranteed; journey notifications are off. Sharing sends planned endpoints and route geometry, not ongoing device-location tracking; access can be cancelled or expires, while inactive-server cleanup is not guaranteed at an exact time.

### What a judge can reproduce

**Automated checks: 555 JavaScript and 44 Python test cases.** These are the runner totals from the recorded FR4 `npm run check` execution, not percentages or counts of users/journeys. The Python total is **27 rail-import + 16 bus-import + 1 walking-metadata**. All passed; the same command also built the app. The [recorded results](https://github.com/zephtzk/The-Rail-Pathfinders/blob/d787c8d6501b3027d21cefd734e46cd726f5c65c/docs/evidence/fr4-addendum/verification.json) and [exact test commands](https://github.com/zephtzk/The-Rail-Pathfinders/blob/d787c8d6501b3027d21cefd734e46cd726f5c65c/package.json) are pinned to the source snapshot.

To check those totals: download the [pinned source](https://github.com/zephtzk/The-Rail-Pathfinders/archive/d787c8d6501b3027d21cefd734e46cd726f5c65c.zip), follow its README prerequisites, then run `npm ci` and `npm run check`. Compare the Node summary and the separate Python summaries; browser checks are additional and are not included in these totals.

**Route-change demonstration:** use Paya Lebar (EW8) to Bugis (EW12), 21 September 2026, 10:00 SGT. These are chosen test inputs. Record the baseline, save a whole-line EW closure covering that day, and search again. Verify the suggested route avoids EW and can be explicitly started. Reload and repeat the same search to verify that the saved closure still changes the suggestion. Resolve the incident and verify the baseline becomes eligible again. The appended guide gives the clicks; [the browser test](https://github.com/zephtzk/The-Rail-Pathfinders/blob/d787c8d6501b3027d21cefd734e46cd726f5c65c/tests/fr4-incident-planner-browser.mjs) checks the route IDs and accepted state. This proves fixture behaviour, not performance against live disruption outcomes.

**Try the app:** [Commute Copilot](https://commute-copilot-nebula.simhongmen.chatgpt.site) | **Source:** [The Rail Pathfinders](https://github.com/zephtzk/The-Rail-Pathfinders)

The illustrated user guide follows the two-page PDF writeup. FR4 application source: `f5fb04b9d5bb7a8a6ea2f94b7b825cf45869082e`; reproducible source snapshot: `d787c8d6501b3027d21cefd734e46cd726f5c65c` (19 September 2026).

[Detailed claim evidence and original test log](docs/WRITEUP_EVIDENCE.md).
