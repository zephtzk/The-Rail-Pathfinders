# Judges' release - 19 September 2026

> Historical R5 release record. For the current submission, start with the [README](../README.md), [FR4 delivery record](FR4_DELIVERY.md) and [source-code guide](SOURCE_GUIDE.md). The version, interface and configuration observations below describe the earlier R5 deployment.

The public app URL is [Commute Copilot](https://commute-copilot-nebula.simhongmen.chatgpt.site). Open it in Safari on iPhone or Chrome on Android; no account or installation is required. The [illustrated PDF guide](Commute_Copilot_Judges_User_Guide.pdf) provides a judging walkthrough, phone setup and limitations. The [physical-phone checklist](../DEVICE_CHECKLIST.md) is ready for a human rehearsal.

## Exact application snapshot

- Application PR: [#7 - Complete R5 planning, island-wide bus discovery and clear journey guidance](https://github.com/zephtzk/The-Rail-Pathfinders/pull/7), merged by `zephtzk`.
- GitHub application merge: `10a13aede150787e6de757e06c0463be40c31baf`.
- Verified candidate and screenshot source: `ff78e06fb92584ad85872cdf190aaa20a75c6625`. The merge has an identical source tree.
- Application SHA-256: `ad81331b6d39a1ce521862e4ba7119a6aff5a191287f871ac3a5116618a3b8d4`.
- Built Worker SHA-256: `99c1edf4e46931ecf5bb5b4bb6aa9933a7bf510ea31a8393b1e372198faa6a59`.
- Hosted version: **Sites 5**, successful publication at **19 September 2026, 10:26 SGT**.
- Audience: **public**, access revision 3. Anonymous browser-like HTTP requests to `/` and `/data/application-build.json` returned 200; the deployed application hash exactly matched the screenshots.

This includes R5, the journey-panel fixes, compact bus-stop details, all-source bus discovery and wider timing estimates, distinct route paths, service-coloured train instructions, and independent bus/train map-layer icons. Subsequent documentation-only commits do not change the application build.

## Verification

| Check | Result |
| --- | --- |
| Final isolated `npm run check` | 385 JavaScript tests, 44 Python tests, 95-asset build passed |
| R5 browser suite | 159 checks passed |
| R4 flow, planner, spending and legacy suite | 116 checks passed |
| Final route-map browser suite | 24 checks passed |
| Train instruction colours | 22 checks passed |
| Offline/location browser lifecycle | 11 checks passed |
| Final island/map-layer browser suite | 28 checks passed |
| Screenshot walkthrough | 30 checks, 22 real app captures, no JavaScript errors |
| Public hosted walkthrough | Fresh anonymous mobile browser: plan, review, start and staff page passed; no runtime errors |
| Expanded-network benchmark and inside-search probe | Passed existing time/payload/150 MiB sampled-heap limits |

The R5, R4, colour and offline suites passed before the final map-control-only follow-up. After that follow-up, the combined source passed the complete unit/import/build check, route-map tests, map-layer tests and fresh screenshot walkthrough. The feature owner additionally passed 39 journey-sheet checks for the final controls. Independent source review found no remaining actionable blocker. These are local checks, not a claim of configured GitHub Actions checks.

The screenshots use genuine UI actions and real static routes at 390 x 900 CSS pixels (2x capture), desktop Edge mobile/touch emulation, real street-map tiles, and explicitly entered example spending. They do not inject a synthetic itinerary or mock a successful live provider. The labelled disruption replay and integration-test fixtures remain separate. The transfer illustration uses Fewer transfers with a 15-minute allowance, from Haw Par Villa to Aljunied via Buona Vista.

Physical iPhone and Android testing remains **NOT TESTED**. Desktop timing and mobile emulation do not establish physical-phone performance. The [release metadata](evidence/judges-release.json) preserves source/build identity and check totals.

The [public browser verification](evidence/judges-public-browser-smoke.json) confirms the deployed build through a fresh anonymous browser context. The final PDF contains 13 pages and 12 real app screenshots; all pages were rendered and visually reviewed. PDF SHA-256: `77fdc2a82199eedc19524a3cfd8f17965ec45e282fb5d3c8121500419d474cf3`.

## Hosted capabilities and limits

Core station and bus-stop planning uses packaged data and needs no provider keys. The directory contains all **5,208** source stops, **798** directional patterns and **602** exact service numbers. Timed routing covers **776** patterns, **583** services and **5,206** stops on at least one eligible day. Directory presence does not guarantee a route for every selected date/time.

Bus review window: **18 September-2 October 2026**, with genuine service carryover where supported. Rail window: **18 September-31 December 2026**, subject to calendars and exceptions. Bus ride/wait times and same-terminal bay changes are estimates. No complete real indoor/step-free corridor has been verified.

The hosted runtime has no OneMap/LTA secrets and no caregiver-sharing D1 binding. Therefore street-address itineraries, live arrivals and hosted caregiver sharing remain unavailable. External background push is not configured. Local sharing and provider integration implementations exist, with setup and evidence in their own documents; the guide does not claim them as working hosted services.

Saved routes, preferences and spending belong to the current browser/origin. Offline guidance requires an accepted trip and a successful online **Check offline availability**. Fresh provider data and street-map tiles are not promised offline. If a previous installation displays old controls after an update, refresh, wait for loading, then refresh again; avoid clearing browser data unless local records should be removed.

## Competition alignment

The supplied NEBULA X participant pack, page 25, asks for a hosted prototype and GitHub/README alongside a 2-3 minute explanatory video, short write-up and results ZIP. It does not prescribe an APK, PWA install or phone OS. This guide supports the phone web-app demonstration and does not replace the other submission items. No passkeys, event Wi-Fi credentials or private participant information are included.
