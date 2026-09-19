# Station and toilet coverage

R5 update, 19 September 2026: source-linked SBS Transit location facts for Bugis, Tampines and Promenade are now available in the Station guide. They remain separate from this routing graph and do not enable a verified corridor or upgrade A/B exterior traces to lift access. Relevant instructions show indoor work-in-progress notices. See [R5 station guidance and remaining pilot dependency](R5_STATION_GUIDANCE.md).

Reviewed for this implementation on 18 September 2026. The graph engine and integrated workflows are implemented; **there is no verified real indoor accessible corridor or verified real toilet entrance route in the shipped dataset**. This is a data dependency, not a completed physical-routing claim. The UI blocks unverified directions and offers station assistance. A real door-to-door accessible demonstration remains blocked by the evidence listed below.

## Data actually retained

| Area | Evidence | Enabled guidance |
| --- | --- | --- |
| Tampines EW2 / DT32 | Existing rail timetable and station identities; no validated indoor graph | Station selection; no invented indoor route |
| Paya Lebar EW8 / CC9 | Existing rail interchange topology and reviewed exterior OSM traces; accessibility explicitly unknown | Station selection; no precise floor/location or step-free claim |
| Promenade CC4 / DT15 | Existing interchange topology only | Station selection; no indoor graph |
| Bugis EW12 / DT14 | Existing exterior footways; one retained OSM toilet point | Candidate marker and unknown-suitability details; no toilet directions |
| Training interchange | Original authored topology, facility states and assumed walking/lift durations | End-to-end rehearsal, explicitly fictional; never geographic guidance |

The real toilet candidate is [OSM node 7103685386](https://www.openstreetmap.org/node/7103685386), at 1.3014362, 103.8571167, from `data/bus/walking-evidence/osm-bugis.osm`. The retained version is 1, last edited 2020-01-03T03:08:24Z, tagged only `amenity=toilets`. The raw extract was archived by 2026-09-18T22:04:33+08:00; its actual retrieval time is unknown (see the existing acquisition ledger). Reviewing that retained record today is **not** a new survey or current verification. Its venue, floor, entrance, fare-gate side, public-access restrictions, hours, fee, wheelchair provision, seated provision and grab rails remain explicitly `null`. No entrance or connecting edge is invented from the point's proximity to a street. No route time is displayed for this candidate.

OSM-derived records are available under [ODbL 1.0, © OpenStreetMap contributors](https://www.openstreetmap.org/copyright). The project retains attribution and original source IDs. No new Overpass requests, tile prefetches or restricted operator-plan imports are needed. The [OSM toilet tagging reference](https://wiki.openstreetmap.org/wiki/Tag:amenity%3Dtoilets) was consulted to interpret explicit tags; missing tags were not converted to positive attributes. The [Restroom Association Singapore directory](https://www.toilet.org.sg/loomapdirectory) was consulted as a reference only; no listings were imported because no unrestricted reuse licence/API contract was established.

## What enables a real route

Before enabling a real corridor, supply permitted, checked evidence for each exterior doorway, same-floor passage, platform, accessible gate, lift boarding point and floor transition. Include stable IDs, source/reuse terms, review/verification date, pedestrian directionality, fare-area boundaries, width/access constraints, wheelchair suitability and measured or disclosed estimated costs. Inspect entrance/exit access in both directions. A station outline or line interchange does not establish those connections. Validate the origin doorway, required interchange and final destination doorway together.

A real toilet additionally needs a checked entrance node connected to that graph, toilet accessibility distinct from access-route suitability, explicit access restrictions, opening schedule with timezone, fee (or unknown), floor and fare-gate side. Unknown required attributes remain unknown. A new listing is not evidence that it is open or occupied now. No queue lengths, vacant cubicles or occupancy estimates are generated.

## Lift adapter

The online [LTA DataMall API User Guide](https://datamall.lta.gov.sg/content/dam/datamall/datasets/LTA_DataMall_API_User_Guide.pdf) was checked for this change: version 6.9, 3 August 2026, section 2.23 / page 44. The adapter calls `v2/FacilitiesMaintenance` using a server-only `LTA_ACCOUNT_KEY`. Its documented fields are `Line`, `StationCode`, `StationName`, optional `LiftID`, and `LiftDesc`; records arrive in the DataMall `value` array. Missing or null IDs remain unresolved. The documentation does not supply future start/end dates or source timestamps, so these remain null. `fetchedAt` records the separate successful server fetch time. No maintenance window is extrapolated from the current feed.

Mapping requires an exact provider ID scoped to its station, or an individual reviewed description mapping with a review date. Duplicate or absent matches remain unresolved. There are currently no verified real facility IDs to map. A station with an unresolved notice gets no clear lift-status claim. The endpoint does not cover escalators; their live status remains unknown.

The server coalesces concurrent requests, caches successful reads for 60 seconds, bounds response size to 2 MiB and timeout to 6 seconds, and backs off after errors. Errors retain the previous successful report and its original fetch time; they do not replace it with a training incident or normal-service state. The client retains permitted non-personal reports locally for offline source-age display. A failed/stale report never reopens a previously unavailable lift. `no-maintenance-report` means only absence from a fresh, complete feed; it is distinct from verified availability. No current source credential was available to validate an actual upstream response. The adapter is verified with contract fixtures; external delivery is unverified.

## Graph and toilet behaviour

`src/facility-engine.js` validates nodes, positive time costs, explicit floor connections and paid/unpaid boundaries. It excludes stairs/escalators for step-free profiles, inaccessible/unknown gates, restricted paths and unusable facility reports. Pareto labels preserve slower low-walking alternatives when a hard walking allowance applies. All returned edges connect consecutive returned nodes. A fallback sharing a blocked lift is rejected. Unknown/stale reports cannot produce a currently verified-accessible result.

`src/toilet-engine.js` filters required toilet attributes independently of the route; computes the actual outward and onward graph paths; applies the round-trip walking budget; checks normalized opening hours at estimated arrival in Asia/Singapore; and distinguishes scheduled, recently reported, closed and unknown states. Unknown OSM hours expressions must be manually normalized and reviewed before use. Onboard context restricts candidates to confirmed reachable upcoming stations; proximity to a moving GPS coordinate does not create a reachable option. Future boarding/alighting routing requires additional validated transit connections, so incomplete contexts fail closed.

Preview includes explicit editable break time, source timestamp, facilities, out/return text, arrival impact and gate-related fare consequences. Acceptance is a separate action and preserves the original destination. Gate re-entry is never promised free. Reaching the toilet and resuming are manual actions; the timer cannot complete a stop or journey. Root journey state owns lifecycle, sharing permissions and expenditure; the facility view does not keep a second trip simulation. A changed incident warns about the accepted path and offers alternatives for acceptance. It cannot silently accept a replacement.

## Rehearsal and evidence

1. Open Station layout & toilets; choose **Training interchange · fictional** and expand **Labelled incident rehearsal**.
2. Choose **Prepare training journey**, then review and start it in the shared journey section (or create a recipient link first). Manually confirm **B2 · Platform · toward destination**. The entire diagram and its times are authored test data.
3. Find a toilet. Toilet A is initially closest (80 seconds out, 80 seconds back in the fixture), using Lift A. Preview is separate from acceptance.
4. Inject **closest toilet lift A unavailable**. The one-way concourse passage cannot provide a reverse shortcut into Toilet A; its only supported inbound lift is blocked. Toilet B becomes the first suitable option through independent Lift B.
5. Review Toilet B's out/return instructions, walking and break allowance; accept it. The shared current/next card updates through the canonical journey callback. Existing caregiver permissions remain unchanged.
6. Confirm **Reached toilet**, then choose **Resume journey** when ready. Read the return directions and manually confirm the onward platform. Only a separate final-arrival action completes the overall journey.
7. Other scenarios cover an escalator outage for a walking profile, an ambiguous lift notice, exits A and B sharing failed Lift C, and no supported step-free street exit.

Run `node --test tests/facilities.test.mjs tests/toilets.test.mjs` (28 tests at implementation handoff). These include real-data guards, floor/gate invariants, both directions, walking limits, inaccessible and ambiguous outages, shared-lift false alternatives, source expiry and network errors, rate-limit retry timing, truncated-feed handling, closing-before-arrival, midnight/overnight schedule boundaries, unknown toilet attributes, no GPS checkpoint, onboard restrictions, detour proposal and unchanged original destination.

Run `node tests/facilities-browser.mjs` for a self-contained local browser integration test. It passed using installed desktop Microsoft Edge with a 390×844 viewport and no geolocation permission; it covers the unknown real candidate marker, manual checkpoint, blocked closest toilet, independent alternative, preview/accept/reach/return/onward confirmation, original destination and consent preservation, planned-stop recheck without auto-position, and no horizontal page overflow. The environment lacked Playwright's downloaded Chromium, so the run used PowerShell `$env:BROWSER_EXECUTABLE='C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'`. This is browser emulation, not a physical-phone result. No physical survey, iPhone/Android device result or live LTA credential result is claimed here.

Offline support caches the module-backed permitted records and layouts with the app shell, and the canonical saved journey retains accepted prepared paths and source ages. Unknown new real paths cannot be created offline. Fixture scenarios remain clearly labelled when offline.
