# Commute Copilot - The Rail Pathfinders

**For judges - final assessment write-up:** [FINAL_ASSESSMENT_WRITEUP.pdf](FINAL_ASSESSMENT_WRITEUP.pdf) (2-page write-up + 14-page illustrated user guide). [Text version](FINAL_ASSESSMENT_WRITEUP.md).

A phone-friendly Singapore public-transport companion for NEBULA X PS2: plan a journey, compare options, follow one accepted trip, and get understandable help along the way.

**Open the app:** [Commute Copilot](https://commute-copilot-nebula.simhongmen.chatgpt.site)

**View the source:** [Public GitHub repository](https://github.com/zephtzk/The-Rail-Pathfinders) · [Browser application](https://github.com/zephtzk/The-Rail-Pathfinders/tree/main/src) · [Server integrations](https://github.com/zephtzk/The-Rail-Pathfinders/tree/main/server) · [Download source ZIP](https://github.com/zephtzk/The-Rail-Pathfinders/archive/refs/heads/main.zip)

**For judges:** follow the walkthrough below, open the [illustrated user guide (PDF)](docs/Commute_Copilot_Judges_User_Guide.pdf), or use the [source-code guide](docs/SOURCE_GUIDE.md) to inspect the implementation. No GitHub account or API key is needed to browse the code or run the core static-data demonstration. The ZIP includes source, pinned data, tests and setup instructions.

**Release and verification:** [Implementation and verification record](docs/FR4_DELIVERY.md), following [FR3 review changes](docs/FR3_REVIEW_DELIVERY.md). The [R5 release record](docs/JUDGES_RELEASE.md) is historical. GitHub's `main` branch is the submission source; later documentation commits can differ from the deployed application commit. The source-code guide explains how to inspect an exact revision.

The current app includes focused address search, My location, direct trip actions, an 80–200% text-size setting, custom Show to staff messages and read-only caregiver links with persistent storage. Journey notifications are disabled. The app opens in a phone browser without an app account, APK or mandatory installation. Use Safari on iPhone or Chrome on Android. Internet is needed for the first load. If an earlier installation shows old controls, refresh, wait for loading/update, then refresh again; clearing browser data would remove local saved information.

## Three-minute walkthrough

1. Open **Plan**. Enter **Tampines (EW2)** and **Bugis (EW12)**, selecting each suggestion.
2. Choose **Depart later**, **21 September 2026**, **10:00** (Singapore time), then **Find my route**. This fixed example uses the included dated dataset; it is not live travel advice.
3. Compare arrival, transfers and walking. Select a route and tap **Start journey**. Expand **Route details** first if you want to inspect its instructions, fare estimate and sources.
4. Open **Current trip**. Confirm the step you want to demonstrate using **Update my current step** and **I am here**. The app does not infer boarding or arrival from time or GPS.
5. Try **Settings > Simple guidance**, then **Show to staff**. Open **Station guide** to see station facts and their coverage limits.
6. Try **Save route**, **Pin commute**, or **Spending > Set a budget**. Fares are estimates until you enter the actual charge; the app does not connect to a payment account.
7. Open **Demo controls** and try a journey scenario. Edit planned works or a travel disruption, save it to **Incident logs**, then run automatic event replay. Return to **Services** to inspect incidents and reopen information after dismissing a notice. All edited incidents remain explicitly simulated.

For the guide's transfer example, choose **Fewer transfers** with a **15-minute extra-time allowance** in Settings, then plan **Haw Par Villa (CC26) to Aljunied (EW9)** on the same date/time. The example changes at Buona Vista; another preference may produce a different route. Leave **Require a verified step-free route** off for this demonstration: no complete real indoor accessible corridor has been verified.

## What works in the hosted release

| Capability | Availability and boundary |
| --- | --- |
| Rail and bus-stop planning | Included static schedules/frequency estimates; no API key needed for the core demonstration. Select a suggestion to confirm an endpoint. |
| Island-wide bus directory | All 5,208 stops in the retained source. 798 directional patterns and 602 exact service numbers are listed. Timed routing covers 776 patterns, 583 services and 5,206 stops on at least one eligible day. Availability still depends on the selected time/date. |
| Route map | Dotted walking, patterned blue bus paths, service-coloured trains and clear labels. Geometry may be approximate. Same-terminal bay changes are labelled estimates, not verified indoor paths. |
| Accepted journey | One-click start for a selected route, manual progress, pause/resume, simple guidance, staff assistance card, and local restore. |
| Saved commutes and spending | Browser-local saved routes/places, fresh commute shortcuts, optional weekly/monthly budgets, charges/estimates/refunds and history. No card-account or payment connection. |
| Offline guidance | Prepare an accepted trip online and use **Check offline availability**. Only proceed when the app reports readiness. Live feeds/new address requests and street-map tiles are not promised offline. |
| Station information | Operator facts for selected stations; indoor directions remain work in progress. No verified working-lift, platform-door or step-free guarantee. |
| Services and demo incidents | Nearby facilities, service notices and persistent local demo incident logs. Simulated closures can be replayed against the selected route and current packaged data; official notices remain separately identified. |
| Live bus arrivals and street-address itineraries | Server-side LTA/OneMap integrations. Availability depends on the configured credentials and provider response; use the app's current status. The core station/bus-stop demonstration does not require these integrations. |
| Caregiver sharing | Read-only recipient links with persistent hosted storage. Recipients can view the shared plan; the provider can refresh it or cancel sharing. Links share the selected journey and its endpoints; they do not grant trip controls or provide ongoing device-location tracking. Journey notifications are disabled. |

The bus snapshot is dated **18 September 2026**, with a reviewed window of **18 September-2 October 2026**. Rail coverage is **18 September-31 December 2026**, subject to source calendars and exceptions. All displayed planning times use **Asia/Singapore**. Bus ride/wait times are estimates, not a complete timetable or a guarantee of arrival.

## Run from source

Use Node.js **22.13 or later** (Node 24 tested). Python **3.10 or later** is needed for import/full validation, not for the basic browser demonstration.

```sh
git clone https://github.com/zephtzk/The-Rail-Pathfinders.git
cd The-Rail-Pathfinders
npm ci
npm run build
npm run dev
```

Open `http://localhost:4173`. The development server serves the last build; run `npm run build` after source changes. The local sharing database is created under ignored `.local-data/`; keep it private.

To open this local server on a phone using the same trusted Wi-Fi, run in PowerShell:

```powershell
$env:HOST='0.0.0.0'
$env:PORT='4173'
npm run dev
```

Keep the computer/server awake. Open `http://<computer-LAN-IPv4>:4173/` on the phone, replacing the placeholder with the computer's actual LAN address. `localhost` on the phone refers to the phone, not the computer. If prompted, allow the server only on the intended private network. LAN HTTP supports the core/manual demo; use the hosted HTTPS URL for secure-context offline readiness or optional geolocation.

Optional integrations use server environment values, never browser source: `LTA_ACCOUNT_KEY` for arrivals and `ONEMAP_TOKEN` for address search/routing. See [sharing setup](docs/SHARING.md) for local SQLite and hosted D1 requirements. Never commit keys, tokens, local databases or personal share links.

## Verification and limitations

The release record identifies the exact application revision, build identity and checks performed. Desktop browser automation includes mobile/touch and enlarged-text layouts; it does not establish physical iPhone/Android performance. Real-phone checks remain to be performed.

```sh
npm run check
npm run test:r5-browser
npm run test:r4-browser
```

Browser tests need an installed browser and a running built server. Set `BROWSER_EXECUTABLE` and `TEST_BASE_URL` as documented in [R5 verification](docs/R5_VERIFICATION.md). Some tests deliberately use synthetic provider responses or historical scenarios; those are separate from the real static-data screenshots in the guide.

Useful references: [R5 delivery](docs/R5_DELIVERY.md), [bus coverage](docs/R5_BUS_COVERAGE.md), [station guidance](docs/R5_STATION_GUIDANCE.md), [address routing](docs/R5_ADDRESS_ROUTING.md), [fares](docs/FARES.md), [privacy and sharing](docs/SHARING.md), and [third-party notices](THIRD_PARTY_NOTICES.md).

Historical R2/R3/R4 and earlier publication records remain for provenance. They describe earlier releases, not the current hosted app. GitHub merges and hosted deployments are separate operations.

## Competition submission

The NEBULA X participant pack (page 25) asks for a hosted prototype, GitHub repository/README, a 2-3 minute explanatory video, a short write-up and a results ZIP. The illustrated guide supports judging; it does not replace those other submission items. The organiser does not prescribe an APK, PWA installation or a particular phone OS. [Official competition site](https://nebulax.com.sg/)
