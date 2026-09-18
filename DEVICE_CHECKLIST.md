# Phase 4 repeatable tester script

Allow about 20–30 minutes per device. Evaluate scheduled planning, acceptance, confirmed progress, offline guidance and **labelled synthetic** changes. Real-provider cancellation/delay/recovery routing is disabled and unfinished. These scenarios simulate travel; they do not require boarding a vehicle.

## Entry, access and build

- Start at `/multimodal.html` on the candidate host; `/` is the wider scheduled rail planner and `/replay.html` is the separate historical corridor replay.
- The existing [Site](https://commute-copilot-nebula.simhongmen.chatgpt.site) serves Phase 4 **version 3** with **owner-only access**. Sign in as the owner. External tester access must be explicitly approved after owner phone smoke tests; do not assume a public URL works without login.
- Local option: `npm ci`, `npm run check`, `npm run dev`; open `http://127.0.0.1:4173/multimodal.html`. Use a separate unused port if an existing session owns 4173. Local access needs no login.
- Match `/data/application-build.json` to the [publication report](docs/PHASE4_PUBLICATION.md) and record the deployed source commit and Worker hash from its acceptance receipt. Stop if the hosted identity differs. Later documentation commits do not change the deployed application identity.
- Record physical phone tests separately from desktop emulation. Android Chrome, iPhone Safari, mobile keyboards, OS large text and real airplane-mode behavior remain **NOT TESTED** until completed on actual devices.

All times are Asia/Singapore. Keep the fixture date **18 September 2026**, rather than today's date. Rail coverage is **18 September–31 December 2026**, subject to calendars/exceptions and genuine carryover. Bus services **2, 23, 28** operate in this pilot on ordinary weekdays **18 September–2 October 2026**, with boarding and alighting **09:30–16:30**. Bus timing is an uncalibrated estimate; four reviewed exterior links cover Paya Lebar/Bugis. No address search, fare, step-free guarantee, broader bus coverage or intermediate onboard alighting is supported.

No key is needed for this script. A missing `LTA_ACCOUNT_KEY` may show `not_configured` for optional advisory feeds; that is expected. Scheduled and synthetic tests do not validate live-provider rerouting.

## Fixture A and recording

Set **From stop or station** `DT14` (Bugis), **To stop or station** `NS22` (Orchard), **Travel date** `2026-09-18`, **Depart at** `10:00`, clear **Arrive by (optional)**, **Total walking limit** 20 minutes, **Preference** Fastest arrival, **Extra time for preferences** 15 minutes, **Modes** Bus + rail, **Demonstration** Normal pilot. Click **Find pilot journeys →**, then **Accept displayed search as new journey**.

Expected scheduled arrival: **10:24**, total walking **540 seconds**. EWL to City Hall, five-minute transfer, then NSL to Orchard. **Save pilot guidance** saves the preview in an older control; journey acceptance happens in **Accepted journey & confirmed progress**.

For every case, record device/model, OS, browser/version, timestamp/time zone, URL/access arrangement, candidate commit, application and Worker hashes, exact steps, expected result, actual result, **PASS / FAIL / NOT TESTED**, and **“Did you understand your next action?”** Include the tester's own words and an evidence/issue reference. Use [the CSV template](docs/TEST_RESULTS_TEMPLATE.csv). Never include keys, signed URLs or account screenshots. Ask about the next action before explaining the interface.

## Cases

1. **Accept → preview → reload.** Accept fixture A. Search `bus:75009` (Tampines Int) → `DT14` without accepting. Reload. The accepted Bugis → Orchard route, deadline and confirmed progress must remain intact; the search preview is independent. The tester should identify which instructions govern the accepted journey.

2. **Confirm waiting, onboard and transfer progress.** Retain or freshly accept fixture A before starting. Apply these rows in order using **Confirm progress**. Choosing a later step explicitly confirms earlier steps completed. Walking is cumulative and never resets.

   | Confirm your situation | Planned step | Time | Walking used (seconds) | Expected next action / allowance |
   | --- | --- | --- | ---: | --- |
   | Waiting at this exact stop/platform | 2, wait at EW12_B | 10:03:00 | 120 | Wait for EWL; original walking limit still applies. |
   | Onboard this planned ride | 3, EWL train | 10:04:00 | 120 | Remain onboard; confirm alighting at its planned end before recalculation. |
   | At the start of this transfer or exit | 4, EW13_B → NS25_A | 10:06:00 | 120 | Full transfer remains; 420 seconds remaining planned walking including exit. |
   | Waiting at this exact stop/platform | 5, wait at NS25_A | 10:12:00 | 420 | Wait for NSL; 120 seconds remaining planned walking. |

3. **Synthetic cancellation: compare and decline.** Freshly search and accept fixture A. Open **Synthetic rerouting demonstrations → Synthetic: cancel next rail trip**. Confirm **SYNTHETIC**, scoped trip/direction/service date and timestamps. Inspect continuation and alternative; choose **Keep accepted guidance**, reload, then **Compare from confirmed point**. Guidance and decline must persist; repeat the same cancellation and expect suppression of a duplicate offer. Complete within the event's **90-second validity**. If expired, trigger again and compare; expiry means unknown service state, not recovery.

4. **Synthetic cancellation: accept and persist.** Freshly search and accept fixture A as a separate case. Inject again, choose **Accept alternative guidance**, then reload. The explicitly accepted alternative and next step must persist. **Synthetic: recover last event** marks explicit scoped recovery; a missing or expired event must not claim recovery.

5. **Missed connection.** Freshly accept fixture A. Confirm **Waiting**, step **3**, **10:05:00**, walking **120**. Expect an explicit missed scheduled connection and a feasible alternative offer. The departed train must not move to the confirmed time.

6. **All alternatives late.** Search fixture A with same-date **Arrive by 10:30**, then accept. Confirm **Waiting**, step **3**, **10:31:00**, walking **120**. Expect **all-late**, alternative **10:49**, original deadline retained, and no acceptance button claiming an on-time result.

7. **No feasible route.** Freshly accept fixture A with deadline cleared. Confirm **Waiting**, step **3**, **10:05:00**, walking **1200** (deliberately simulating an exhausted 20-minute allowance). Expect **no-feasible** and retained instructions without a silently relaxed walking constraint. Progress cannot move backwards; use a fresh reviewed acceptance for each of cases 5–7.

8. **Offline reload and reconnect.** Freshly accept fixture A, confirm waiting or onboard progress using case 2, load completely, then reload once online. Enable airplane mode and disable Wi-Fi; reload `/multimodal.html`. Accepted next step and progress must survive with offline/no-current-disruption wording. Try unaccepted offline previews `bus:75009` → `bus:75059` in Bus only, `bus:75009` → `DT14` in Bus + rail, and fixture A. Reconnect twice. Guidance must remain unchanged, without repeated switching alerts caused solely by refresh. Advisory data may be unavailable/last-known; basemap tiles are not promised offline. Record an offline failure rather than assuming the cache was ready.

9. **Phone usability.** On physical iPhone Safari and Android Chrome, edit **Depart at** and progress **Confirmed time** with the keyboard open, scroll to submit, collapse/expand browser chrome and rotate. Controls must remain reachable. At 200% browser text / OS large text, check readable instructions and actions without clipping or horizontal page scrolling. In bright light, ask the tester to state the accepted next action and deadline impact within five seconds. Record phone results separately, including any screen-reader check actually performed.

## Current result boundary

Automated local results are desktop emulation and deterministic engineering checks. Hosted identity, owner-only access and the bounded desktop journey smoke passed, as recorded in the publication report. Hosted airplane-mode/reconnect behavior, physical owner phone smoke tests and external tester comprehension remain **NOT TESTED**. Do not convert these to PASS based on local or hosted desktop tests.

## Six-upgrade candidate: physical-device checks

This section applies to the new six-upgrade candidate and complements the historical Phase 4 script above. It does not claim the existing published site has been updated. Fare estimates, saved places and sharing now have candidate implementations; the older statement that no fare support exists describes Phase 4 only. Match the candidate commit and `/data/application-build.json` before testing. Use [the current end-to-end demo](docs/UPGRADE_DEMO.md) for exact control labels and setup, including optional local port 4186.

**Physical iPhone Safari and Android Chrome results for this candidate are NOT TESTED.** Headless Chromium/Edge at a mobile viewport, touch emulation and 200% CSS text are separate engineering evidence. They do not validate WebKit, an actual mobile keyboard, physical safe areas, OS permissions, battery restrictions, notification delivery, field accessibility or traveller comprehension.

The real-data limit is explicit: **no verified continuous step-free door-to-door corridor and no verified real toilet entrance path are enabled**. The retained real toilet candidate near Bugis is incomplete. The connected Lift A/Lift B/toilet workflow uses **Training interchange · fictional** and must remain labelled throughout. Do not use its diagrams or times to guide actual travel.

For each row below, create separate iPhone Safari and Android Chrome records using `docs/TEST_RESULTS_TEMPLATE.csv`. Record model, OS/browser version, normal tab versus installed Home Screen mode, timestamp/time zone, candidate source/build, reachable URL/audience, permission state, expected/actual result and **PASS / FAIL / NOT TESTED**. Keep credentials, recipient-link fragments, precise coordinates and personal address details out of screenshots and logs.

| Case | Actions and expected evidence | iPhone Safari | Android Chrome |
| --- | --- | --- | --- |
| Ordinary mobile tab | Open the candidate without Home Screen installation. Review a journey, open Station layout, use Saved places and manually check in. Core features must not require installation. | NOT TESTED | NOT TESTED |
| Saved places and preferences | Save resolved Paya Lebar/Bugis test places and a pair; rename/reorder, swap and reload. Choose a fresh date/time, replan and verify walking/step-free preferences persist. Unknown manual coordinates must not resolve silently to Bugis. Delete a referenced place and verify the pair is disabled honestly. | NOT TESTED | NOT TESTED |
| Cross-device preparation | Caregiver creates a reviewed training trip, shares recipient link/QR; traveller reviews and selects Accept this trip. Independent browser stores and the backend must show correct pairing. Both permissions start off. Viewer-only links cannot edit. | NOT TESTED | NOT TESTED |
| Progress without geographic sharing | Enable only Share progress and accepted route changes; confirm the platform and accept a revised detour. Caregiver sees the accepted update and ETA without coordinates. A preview/proposal must not silently replace the accepted route. | NOT TESTED | NOT TESTED |
| Location denial and inaccuracy | Deny browser geolocation; continue by manually choosing station/floor/checkpoint and I am here. Separately allow location and inspect accuracy/time, then test weak/no signal. Never show a precise underground floor from browser GPS. | NOT TESTED | NOT TESTED |
| Background and reconnect | Background/lock the device, return later and inspect last-known/stale/paused labels. Collection is foreground-constrained. Reconnect must not restart revoked uploads, resurrect old coordinates or silently accept a route. | NOT TESTED | NOT TESTED |
| Accessible toilet detour | In the fictional step-free training journey, confirm Platform, Find a toilet, inject closest toilet Lift A unavailable. A is excluded; B uses independent Lift B. Preview added time, walking, break duration and fare-gate implication, then explicitly accept. Original destination and separate sharing permissions remain. | NOT TESTED | NOT TESTED |
| Reach and resume | Press Reached toilet, then Resume journey. Return instructions remain until the platform is manually reconfirmed. The toilet stop does not finish the trip or add expenditure. Cancel stop and no-feasible-path assistance should also remain usable. | NOT TESTED | NOT TESTED |
| Real-data disclosure | Select real Bugis and inspect the incomplete OSM candidate. No verified directions or invented walking time. Missing layouts, ambiguous lift notices and stale/error feeds remain unknown; no escalator or future-maintenance claim appears without evidence. | NOT TESTED | NOT TESTED |
| Ongoing card and keyboard | During started/paused/rerouted/offline/completed/cancelled states, current/next action and ETA agree with the accepted journey. Open each date/time/amount field and keyboard, rotate, expand/collapse browser chrome, scroll to submit and inspect physical safe-area padding. The card must not cover essential controls. | NOT TESTED | NOT TESTED |
| Large text and screen reader | Use OS large text and 200% browser text where supported, VoiceOver/TalkBack, reduced motion and touch. Focus order, named controls, live status messages, floor diagram text equivalents and the next action remain understandable. Record only assistive technologies actually exercised. | NOT TESTED | NOT TESTED |
| Sharing pause/revocation | Pause sharing, refresh caregiver view, resume deliberately, then Remove caregiver access. Old links fail to expose live data; a delayed upload cannot revive consent. Offline revocation must distinguish locally stopped collection from pending server confirmation. | NOT TESTED | NOT TESTED |
| Completion and fare record | Finish the original destination explicitly. Repeated Record completed fare / retry saving and reload produce one record. Rehearsal stays in Show separate replay records and outside personal totals. On a separate real/manual record, confirm charge, refund, delete and export; confirm totals replace estimates once. | NOT TESTED | NOT TESTED |
| Singapore periods | Enter test records around Singapore midnight, Monday week rollover and month rollover. Totals use Singapore boundaries and visibly separate confirmed amounts, estimates and unpriced trips. Remove only test records afterward. | NOT TESTED | NOT TESTED |
| Offline/restart | Fully load and prepare guidance, then use actual airplane mode with Wi-Fi disabled and reload. Saved accepted state, layout/text/detour and source-age limits remain; APIs are not cached. Restart backend independently and check sharing survives. Reconnect requires fresh reports and retains acceptance. | NOT TESTED | NOT TESTED |
| Optional Web Push | With configured HTTPS/VAPID, subscribe using a user action; deny permission in a separate run; disable/re-enable; trigger a material change from the other client with the page closed. Record OS delivery or failure, deduplication and stale subscription recovery. iPhone/iPad requires supported Home Screen mode; test ordinary Safari fallback separately. | NOT TESTED | NOT TESTED |
| Personal deletion boundaries | Reset replay while saved places/fare records exist. Personal data and caregiver permissions remain. Test individual record deletion and the separate explicit all-data controls only on test data; verify sharing deletion does not clear local places/fares. | NOT TESTED | NOT TESTED |

Ask the traveller, before coaching: **“What should you do now, and what happens after the toilet stop?”** Record their words and whether they distinguish a training fixture, an estimate and a last-confirmed checkpoint. No user-study outcome is inferred from a screenshot.

Ordinary Web Push delivery is optional and not guaranteed. External vendor delivery remains unverified without an actual configured-device result. A local push test sink is not OS delivery. Browser background location remains constrained by visibility, permissions, signal and operating system. **Native Dynamic Island / ActivityKit / WidgetKit is outside this browser implementation and is not tested or implemented.**
