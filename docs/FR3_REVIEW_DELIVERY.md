# FR3 review changes

The user's FR3 feedback is integrated from three separate work tasks. This record covers changes requested during FR3; [the earlier release record](FR3_DELIVERY.md) describes the FR2 changes published for that review.

## Items 1–8

- Both endpoint selectors offer My location. Selection uses the shared permission flow and a recent, sufficiently accurate fix; routes, markers and saved snapshots remain consistent.
- Network state uses signal bars or crossed signal bars, with accessible status labels. An adjacent location icon expands service details and controls on every tab.
- Save route and Start journey directly follow the selected route card.
- Current trip exposes End trip, Pause trip (Resume trip when paused), and Cancel trip without a dropdown.
- Repeated explanatory paragraphs are removed throughout the tabs. Current trip keeps actual guidance and concise state, while Plan removes timing assumptions and sources.
- Where can I travel and About this route map are removed from the interface. Their contents remain in [the cleanup documentation](FR3_CLEANUP_DELIVERY.md).
- Static yellow usage and coverage cards have a top-right X. Dismissals persist across views, rerenders and reloads in the same browser session. New sessions restore the cards; blocked session storage retains them only within the current document. Active route blocks, incidents and errors retain their own behavior.
- The panel has a horizontal grabber above Map and Station guide. Integration reduced its full-width target to 24px, saving 20px over the task's initial layout; buttons retain their 44px targets and the grabber retains keyboard and swipe operation.

## Verification

The integrated build passes **536 JavaScript tests, 44 Python data tests and 426 browser checks**. These include the new location, cleanup and dismissal flows plus address-search, all-tab layout, current-step, sheet-gesture, location and privacy regressions. Mobile screenshots were inspected at 320px and 390px, with desktop and enlarged-text checks.

[Combined verification](evidence/fr3-review/verification.json) · [Plan](evidence/fr3-review/plan-mobile.png) · [Current trip](evidence/fr3-review/current-mobile.png) · [Location selector](evidence/fr3-review/location-320.png).

[Location delivery](FR3_LOCATION_DELIVERY.md) and [guidance delivery](FR3_GUIDANCE_DELIVERY.md) record detailed behavior and limits. Controlled Edge geolocation/provider fixtures do not establish physical-phone GPS accuracy or live provider availability. Existing public-runtime OneMap/LTA limits remain as documented in the previous release. Hosted sharing was still unconfigured at the first publication; the second release corrects that missing database binding.

## Staged publication

Items 1–8 were published successfully as public version 8 on 19 September 2026 at 05:57 UTC (13:57 SGT), from source d0a61c2835da0365a53f66c8304831150af67099 and merged PR #12. [Publication receipt](evidence/fr3-review/stage1-publication.json). Only after this successful publication was the Settings text-size extension started in its own task.

The second release adds [the 80–200% Settings slider and all-tab reflow](FR3_TEXT_SIZE_DELIVERY.md) and corrects [the reported recipient-link storage configuration](FR3_SHARING_FIX.md). Its integrated checks pass 549 JavaScript tests, 44 Python data tests and all 146 FR3 browser checks; the text-size task records another 2,079 focused checks across 284 rendered layouts. An independent maximum-size check also passes all eight tabs at 320×568 and 568×320, including focus/scroll reachability and every navigation target. Publication and deployed-sharing evidence are recorded separately after deployment.
