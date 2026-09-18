# Phase 4 repeatable tester script

Allow about 20–30 minutes per device. Evaluate scheduled planning, acceptance, confirmed progress, offline guidance and **labelled synthetic** changes. Real-provider cancellation/delay/recovery routing is disabled and unfinished. These scenarios simulate travel; they do not require boarding a vehicle.

## Entry, access and build

- Start at `/multimodal.html` on the candidate host; `/` is the wider scheduled rail planner and `/replay.html` is the separate historical corridor replay.
- The existing [Site](https://commute-copilot-nebula.simhongmen.chatgpt.site) currently serves older **version 2** with **owner-only access**. It is not the Phase 4 candidate. After separately authorized publication, sign in with the approved owner/tester account. External tester access must be explicitly approved; do not assume a public URL works without login.
- Local option: `npm ci`, `npm run check`, `npm run dev`; open `http://127.0.0.1:4173/multimodal.html`. Use a separate unused port if an existing session owns 4173. Local access needs no login.
- Match `/data/application-build.json` to the [readiness report](docs/PHASE4_READINESS.md) and record the candidate commit and Worker hash from its acceptance receipt. Stop if the hosted identity differs.
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

Automated local results in the readiness report are desktop emulation and deterministic engineering checks. Hosted candidate identity/access, owner phone smoke tests and external tester comprehension remain **NOT TESTED**. Do not convert these to PASS based on local tests.
