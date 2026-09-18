# Features R5 delivery

R5 runs in the isolated `The-Rail-Pathfinders-r5` application worktree on `codex/features-r5`, starting from freshly fetched main `73bba30de14faddc08ec8f15b862655f888cbbd8`. The unrelated Neblala wrapper and R4 source/preview were preserved. No production deployment or audience expansion is included.

## Delivered experience

| Request | Result and boundary |
| --- | --- |
| Saved commutes | Up to four pinned/recent cards appear before Plan. Check routes and Reverse restore authoritative preferences and recalculate Leave now. Neither accepts a journey. Saved routes retain their existing timing controls and warn about expired deadlines. |
| Live arrivals | Planning and accepted bus boarding phases offer an explicit stop request. Up to three predictions show service, matched direction/destination, live-estimate versus operator-schedule basis, local last-check time, stale/offline/unavailable states and source detail. No stop polling or downstream ETA inference. Unmatched provider boarding IDs remain unavailable. |
| Address routing | Explicit OneMap search and complete provider itineraries enter the canonical review/Start flow with bounded street geometry. Public labels, cumulative walking and deadlines are validated; private bookmark names never enter provider requests. A live ordinary-token sample succeeded. Fresh checkpoint rerouting remains explicitly unsupported while accepted guidance remains available. |
| Broader bus coverage | 391 directional patterns across 297 service numbers and 4,826 stops have at least one eligible service day, from the retained 18 September snapshot. The registry retains 416 patterns; 37 short origin-day spans are withheld pending service-specific evidence. Weekday/Saturday/Sunday windows, supported frequency bands and previous-service-day handling replace the five-pattern daytime pilot. Every metadata pattern has an inclusion/exclusion audit. Coverage is not complete and expires after 2 October 2026; holiday mapping and missing headways remain gated. |
| Station guidance | Map/Station guide pages, keyboard controls and a dedicated swipe strip; operator facts for Bugis, Tampines and Promenade are separate from route graphs. Relevant enclosed transitions display Work in progress notices, including in simple guidance. |
| Verified indoor pilot | **Not complete: no permitted complete real corridor evidence is available.** No real indoor graph was fabricated. The exact doorway/gate/floor/lift/platform/toilet and return-path evidence dependency is in [station guidance](R5_STATION_GUIDANCE.md). |
| Simple guidance | Persistent Settings preference, independent of routing preferences: one current instruction, large appropriate controls, secondary actions disclosed and reduced map/scroll/CSS motion. Canonical indices, accepted plans and detour phases remain unchanged. No audio. |
| Show to staff | Separate navigation page, automatic accepted-instruction message and selectable requests. Route/phase changes reset stale alternates. Paused, blocked, review, detour and terminal states are explicit. Opening the page sends nothing and grants no sharing permissions. |
| Commute budget | Optional positive SGD weekly/monthly setting; Singapore calendar dates, recorded-total progress, remaining/overrun and confirmed/estimated/unpriced breakdown. Existing refunds, charge replacement and deletion tombstones apply. All spending history stays reachable; setting changes never remove transactions. |
| Departure flexibility | Compact optional 15/30/60-minute comparison. Only recalculated feasible choices can be selected; past/deadline-invalid alternatives are omitted. Travel constraints and accepted-trip protection remain. Fare hints distinguish possible scheme eligibility from unknown actual savings. |
| Calendar and colour | App-styled date dialogs across current, saved and legacy planning with civil-date/month keyboard navigation, Apply/Cancel/Escape and focus return. Blue actions, restrained red accents and white/grey surfaces; semantic amber WIP and error notices remain distinct. Official rail line identities are retained. |

## Evidence and practical limits

See [verification](R5_VERIFICATION.md), [bus audit](R5_BUS_COVERAGE.md), [address integration](R5_ADDRESS_ROUTING.md) and [station guidance](R5_STATION_GUIDANCE.md). Real OneMap search/routing succeeded through a masked, process-only runtime. Real LTA arrival requests returned valid empty feeds around 03:20 SGT; this validates the connection/empty contract, not live vehicle predictions during service. Synthetic prediction tests are labelled separately.

The bus dataset is geographically broad but incomplete. Published headways and first/last-stop spans do not create a timetable; riding remains a distance/speed/dwell estimate. Reviewed road crossings, terminal bays and indoor transfers are not inferred from proximity. Desktop timing and mobile browser emulation do not establish physical-phone memory, responsiveness or navigation reliability. Unknown fares and accessibility remain unknown.

The user-authorized extension clarified that budgets track the existing recorded total, including estimates until actual charges replace them. The progress bar states that basis and reports unknown-price trips separately. Prospective fare incentives never reduce ledger records.

## Published fare and visual references

[PTC morning fare rules](https://www.ptc.gov.sg/fares/morning-pre-peak-fares/) and [LTA's north-east scheme](https://www.lta.gov.sg/content/ltagov/en/newsroom/2025/10/news-releases/free_morning_off-peak_rail_rides.html) were checked on 19 September 2026. Eligibility relates to actual rail tap-in, weekday/public-holiday status and the relevant station/payment conditions. A planned departure or train boarding time does not verify tap-in or the charged saving. The two schemes are assessed separately; no rewards backend was added.

Visual references were checked against [LTA](https://www.lta.gov.sg/content/ltagov/en/who_we_are.html), [SBS Transit](https://www.sbstransit.com.sg/about-us) and [SMRT](https://www.smrt.com.sg/). SBS describes its corporate mark as orange/purple; the app follows the user's requested blue/red/white/grey direction as an original palette, without claiming official hex specifications or adding operator logos. No endorsement is implied.

## Local previews

R5 credential-enabled local preview: `http://localhost:4195/`, started by the user's masked provider-entry window. Keep that window open to retain its process-only access; closing it stops that server. The independent test preview uses port 4196. R4 remains separate on its original port 4194. Credentials were not copied into source, browser assets, evidence or Git.
