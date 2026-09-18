# Six-upgrade demonstration

This script demonstrates the implemented workflow, including a **fictional training interchange** for connected indoor paths and toilet detours. It does not demonstrate a verified real accessible corridor. The retained real data has **no verified continuous step-free door-to-door route and no verified real toilet entrance path**. The single OSM candidate near Bugis has unknown entrance/access attributes and must not receive invented directions. Training timings and facilities are authored fixtures, not live reports.

Allow approximately 15 minutes. Use two isolated browser profiles (caregiver and traveller), with test data and independent local storage. The caregiver's existing device can also show its authorised viewer state; a third profile opened with the caregiver-view link exercises viewer-only access. Do not open the recipient link in the caregiver's existing profile because that changes its current sharing role.

## Start the local candidate

Run from the repository root with Node **22.13+** (or Node 24) and Python available:

```sh
npm ci
npm run check
npm run dev
```

Default local URL: `http://127.0.0.1:4173/`. To use the separate demonstration port in PowerShell:

```powershell
$env:PORT = '4186'
npm run dev
```

Open `http://127.0.0.1:4186/` in both profiles; use the same hostname in copied links. `npm run dev` serves the built `dist` candidate, so rebuild after code changes. The server creates and migrates the ignored SQLite database `.local-data/sharing.sqlite`. Do not delete it between the two-client or restart checks. No LTA credential is required for the training incident; missing live credentials must show an unavailable feed.

For two physical devices, configure reachable **HTTPS** and an audience that admits both intended users. Localhost on a phone refers to the phone itself. A LAN HTTP address may test manual sharing but normally cannot establish browser geolocation or Web Push. See [sharing setup](SHARING.md) for `HOST`, SQLite, Cloudflare D1 migration, scheduled maintenance and VAPID configuration. Preserve the existing hosted project's identity and audience; the recipient link does not bypass owner-private access. This script does not deploy or change access.

## 1. Caregiver saves and reviews real station endpoints

In the caregiver profile, open **Saved places** in the companion navigation.

1. Under **Add a place**, enter **Home**, choose **Paya Lebar** under **Resolved location**, and press **Save place on this device**. This test label refers to the station coordinate, not a verified residential address or entrance.
2. Add **Hospital**, choosing **Bugis** as its resolved location. Again, the label is demonstration data; it does not establish a hospital entrance.
3. Under **Save a frequent journey**, enter **Appointment**, choose Home → Hospital, set the walking allowance, and press **Save journey pair**. To test preference preservation, select **Require step-free access**; the real trip will honestly refuse accessible guidance unless its complete path is verified.
4. Rename and reorder a place, try **Use as start**, **Use as destination**, and **Swap endpoints**, then restore Home → Hospital. Reload. Both places and the pair must survive.
5. In **Use a saved journey**, explicitly choose the current supported travel date and a departure such as **10:00**. Press **Plan with selected date & time**, then **Find rail journeys**, then **Review selected journey** in the companion. The template must not restore a prior replay date or stale route. If today's date is outside the retained schedule coverage, record the coverage warning and select a supported date explicitly for a labelled schedule replay; do not silently represent it as today's live trip.
6. Review both endpoints, the full journey and fare assumptions. For Paya Lebar → Bugis at standard times, the reviewed adult card estimate is **S$1.49** for the official **4.8 km fare distance**. Switching the fare category changes the estimate where supported. The real route's indoor accessibility remains unknown. Do not start it as a verified accessible journey.

The real saved pair and the following fictional interchange are deliberately separate. Completing the training scenario cannot establish real-world accessibility or a real fare payment.

## 2. Caregiver prepares and shares the labelled training journey

1. Open **Station & toilets**. In **Station**, select **Training interchange · fictional**.
2. Expand **Labelled incident rehearsal**, then press **Prepare training journey**. The review panel must say **LABELLED REPLAY** and show Rehearsal entrance → Rehearsal destination entrance. The fixture uses a 60-minute walking allowance and requires step-free access.
3. Optional preparation check: confirm the training platform, choose **Find a toilet**, preview Toilet A, then **Add planned toilet stop**. This adds a planned stop to the proposed plan; the traveller must later confirm a checkpoint, recheck and accept its directions. For the shortest core demonstration, leave the plan without a stop and request it after acceptance instead.
4. Review **Full journey for review**, then press **Create recipient link**. Do not press **Accept and start journey** in the caregiver profile.
5. Use **Copy recipient link**, the system **Share invite link** control where supported, or **Show invite QR**. The QR is generated locally. Give only the recipient link to the traveller. The separate **Copy caregiver view link** is for a viewer and does not permit plan editing.

## 3. Traveller explicitly accepts, with separate permissions

1. Open the recipient link in the traveller's isolated profile. Its credential fragment should disappear from the address bar after the app reads it.
2. Review the fictional endpoints, date/time, steps and planned stop if present. Press **Accept this trip · sharing stays off**. This accepts and starts the traveller's canonical journey; a second start action is not required.
3. Confirm both **Share progress and accepted route changes** and **Share geographic location (accuracy and timestamp)** are unchecked. In the caregiver profile press **Refresh shared trip**; it must not show live checkpoint or location details without consent.
4. In the traveller profile, check **Share progress and accepted route changes** only and press **Apply permissions**. Leave geographic sharing off for the core demonstration. No GPS permission is needed.
5. In **Station layout & toilets**, ensure Station is Training interchange, choose **B2 · Platform · toward destination** under **Choose a visible checkpoint**, then press that panel's **I am here**. This is a deliberate training check-in, not a GPS or timer inference. Refresh the caregiver view and verify authorised progress is visible without geographic coordinates.

## 4. Lift A blocks the closest toilet; accept the independent alternative

1. Press **Find a toilet** on the journey map, or expand the ongoing-trip card and use its equivalent action. Keep the **Step-free; wheelchair toilet** profile. The unmodified graph should offer **Toilet A · training fixture** first.
2. Keep the default **Assumed break (minutes)** at **5**, or change it explicitly. No diagnosis or medical information is requested.
3. In **Labelled incident rehearsal → Injected condition**, choose **Training: closest toilet lift A unavailable**. The comparison should describe the original/revised station paths and added walking/time. Toilet A must now be **Excluded from directions**. **Toilet B · training fixture** remains reachable through **Lift B**; stairs/escalators are not a step-free substitute.
4. In the journey actions, review **Proposed route change** and press **Accept revised route**. Then, under Toilet B, press **Preview directions & onward journey**. Review the outbound path, return to the platform, break allowance and unchanged original destination. With the default fixture values, the path to B is 185 seconds, the return is 185 seconds, and the five-minute break adds 300 seconds: **670 seconds (about 11.2 minutes) added**, with **270 seconds (4.5 minutes) walking**. These are fixture values, not measured station times.
5. Press **Accept toilet detour**. The ongoing-trip card and expanded details must reflect the accepted stop and revised ETA. Rehearsal destination entrance must remain the original destination. This action must not enable geographic sharing or create a fare record.
6. In the caregiver profile press **Refresh shared trip**. Verify that the accepted revision/checkpoint/ETA is available under progress consent, and geographic location remains absent. Before acceptance, a proposed or merely previewed option must not silently replace the accepted route.

If a previously accepted stop becomes blocked, its retained path is comparison evidence, not safe directions. Use **Cancel stop**, review the feasible replacement and explicitly accept it. If no supported route remains, use **Station assistance / check in**; do not invent a fallback.

## 5. Reach the toilet, return, stop sharing and finish once

1. Press **Reached toilet**. The journey remains active; the card should identify the toilet stop and wait for the traveller's next action.
2. Press **Resume journey** when ready. Read the return instructions. Status becomes **returning**; a timer does not establish that the traveller is back on the platform.
3. Open **Station layout**, choose **B2 · Platform · toward destination** again, and press that panel's **I am here**. The stop becomes **resumed** and the original journey continues.
4. Exercise **Pause journey** and **Resume journey**. Confirm the same ongoing-trip card updates. With the app fully loaded and its service worker active, try an offline reload; the accepted state, training condition and prepared guidance should remain with an offline warning. Reconnect and refresh sharing without silently accepting a new route.
5. In **Caregiver**, use **Pause sharing** to test temporary suspension, then resume if desired. Finally press **Remove caregiver access**. Refresh the caregiver view and verify old credentials no longer expose progress/location. If the request fails offline, keep collection stopped locally and retry revocation after reconnect; do not claim the server has revoked access until its response confirms it.
6. Only after explicitly confirming the original destination, press **I have arrived · Finish journey**. Location collection stops. A toilet stop alone never finishes this trip.
7. In **Spending**, check **Show separate replay records**. There must be exactly one completed rehearsal record, normally **Awaiting amount** because the fictional route has no official fare. Press **Record completed fare / retry saving**, then reload and check again: there must still be one record. Personal day/week/month totals must remain unchanged.
8. In the separate replay ledger, optionally enter a clearly labelled test amount using **Enter/edit charge or adjustment**, confirm it, add a refund and export the history. This is a rehearsal record, not an actual charge. A real finished journey follows the same idempotent record flow in the personal ledger; the traveller must enter or confirm the actual charged amount.

## Additional checks and evidence

- **Real coverage:** Select Bugis and **Find a toilet**. The OSM candidate must say **Unknown suitability** with no verified route button or exact walking time. Tampines, Paya Lebar and Promenade must disclose missing indoor coverage. **Check live lift reports** must preserve unknown/stale/unavailable states when appropriate and never substitute a training incident.
- **Other injected incidents:** Test **Training: ambiguous lift notice** (no arbitrary lift closure), **Training: both apparent exits need failed lift C** (shared failed lift is not a fallback), and **Training: no supported accessible street exit** (assistance instead of unsafe guidance). For **Training: escalator unavailable (walking profile)**, use a plan that does not require step-free access; the selected profile cannot weaken an already accepted step-free requirement.
- **Revocation/deletion:** Test **Delete shared data** only for the test share. It removes backend sharing data; saved places and spending each have their own explicit local deletion controls. Resetting replay must not erase personal data.
- **Persistence:** Restart the server, refresh the two clients and verify retained authorised state; then repeat denial/revocation checks. Expiry and retention require server maintenance, not a browser timer.
- **Optional location:** On a secure origin, separately opt into geographic sharing, verify displayed accuracy and timestamp, deny permission in another run, background the page and test a stale position. Always retain manual checkpoint usability. This is foreground browser location; it does not establish a floor or guarantee background tracking.
- **Optional notifications:** Use **Enable journey notifications** only after configuring VAPID and a supported secure-origin browser. Denial/unsupported/missing configuration must leave the in-app workflow usable. `PUSH_TRANSPORT=test` exercises a local delivery sink, not OS notification delivery. A real Home Screen iPhone/iPad push test is separate from a normal Safari tab. **Native Dynamic Island / ActivityKit is not implemented.**

Automated reproduction, with the local candidate server already running on 4186:

```powershell
$env:TEST_BASE_URL = 'http://127.0.0.1:4186'
node tests/upgrades-browser.mjs
node tests/facilities-browser.mjs
node --test tests/personal.test.mjs tests/fares.test.mjs tests/fare-ledger.test.mjs tests/journey-v2.test.mjs tests/facilities.test.mjs tests/toilets.test.mjs tests/sharing.test.mjs tests/push.test.mjs
```

If Playwright has no Chromium runtime, set `BROWSER_EXECUTABLE` to a known installed Chromium/Edge executable or install the project-supported browser runtime. The upgrade browser test uses isolated contexts and produces `test-results/upgrades/browser.json` plus a screenshot. Record results only after the command actually succeeds. These tests are **desktop mobile emulation**, not physical iPhone Safari/Android Chrome evidence, field surveys, deployed D1 validation or live push delivery. Use [the physical-device checklist](../DEVICE_CHECKLIST.md) to record those separately.

If the main station path is also affected, review **Proposed route change** and choose **Accept revised route** before accepting a toilet detour. The original and proposed paths and walking/arrival impact remain visible until that decision.
