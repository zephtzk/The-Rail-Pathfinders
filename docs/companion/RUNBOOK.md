# Candidate runbook

This branch is a review candidate. Do not merge it into main or deploy it to either protected production origin.

## Local preview

Use Node 22.13 or newer (verified with Node 24). In a fresh clone of `codex/nebula-companion-pivot`:

```sh
npm ci --ignore-scripts
npm run build
npm run dev:companion
```

Open **http://127.0.0.1:4187** in a fresh browser profile. The candidate launcher fixes the loopback host, port 4187 and `.local-data/companion/sharing.sqlite`; do not substitute a production subpath. SQLite is created empty and is ignored by Git. Do not copy production databases or browser profiles. Browser local storage, private recipient session storage and service-worker caches are confined to this origin. The otter preference additionally uses `nebula-companion:candidate:20260925:settings`.

Optional `LTA_ACCOUNT_KEY` and `ONEMAP_TOKEN` must be supplied explicitly to the server using authorised secure runtime configuration. Without them, the existing adapters report unavailable. The candidate does not copy credentials, promise live service, or infer API permissions from its branch. Configured is not proof of a successful live request.

## Walkthrough

1. Open the otter. Five separate labelled icons open Disruptions (the existing Service notices heading), Facilities (Services), Caregiver, Spending and Show to staff. The original eight navigation buttons and normal planner remain available.
2. Hide the companion from its controls. Use **Enable Nebula** to restore it, or toggle **Show Nebula companion** in Settings. Both controls share one state. Change text size from 80% to 200%; use Tab, Enter, arrow keys and Escape. Editable fields and modal dialogs temporarily suppress the otter.
3. Open Services → **Try the companion disruption demonstration** → **Prepare 25 September demonstration**. This prepares a labelled 25 September 2026, 10:00 SGT Paya Lebar → Bugis rehearsal using packaged timetable data. Review it and press **Start journey**. It never replaces an ongoing trip.
4. In Current trip, use **Open demonstration controls**, then **Demo: cancel next train**. Return to Current trip and choose **Keep current route** or **Accept revised route**. Cancellation only supplies a proposal; acceptance remains explicit. Keeping a route preserves the existing five-minute switching cooldown. To test acceptance immediately after testing Keep, cancel that rehearsal and prepare a fresh one. Synthetic events are short-lived and labelled.
5. The Current trip walking link uses only the accepted route's next boarding point. Google Maps opens separately in walking mode; returning leaves the accepted identity, route and manual progress intact. Rail coordinates are approximate station positions, with no verified entrance, bay or step-free path. Different platforms at the same station may correctly share the same Maps URL. Confirm boarding and indoor movement manually. Old dates, stale confirmations, unknown/onboard progress, paused trips and missing coordinates can suppress this link with an explanation.
6. Create a read-only recipient link from Caregiver. Its private capability is in the fragment and is stripped into session storage on opening. The recipient sees shared endpoints and route details, cannot edit the traveller's trip, and does not mount the companion or request location. Shared plans do contain location information in their endpoints.
7. Complete the rehearsal manually. Spending keeps replay entries separate from personal totals; explicitly enable the demo ledger to see them.

The fixed September 25 rehearsal is historical on later dates. The Maps handoff then asks for a journey dated today; this is intentional. Normal planning supports the packaged coverage window shown by the app.

## Checks

```sh
npm run check
npm run test:companion-browser
```

The second command requires the built candidate running on 4187. Its browser contexts and sharing records are synthetic; it intercepts Maps and does not prove a native app launch. `BROWSER_EXECUTABLE` can point to an installed Chromium-family browser. Results and screenshots are written to ignored `test-results/companion-integration`.

## Hosting

A new owner-private candidate was registered as `appgprj_6ab64ae86e2c81918f227a3960228317`, slug `nebula-companion-candidate-20260925`. The initial creation response had a transport error; a single read-only list resolved the same site with version 0, avoiding duplicate creation. Its ID is stored only in this candidate's manifest. The logical `SHARING_DB` binding and packaged Drizzle journal must provision a new writable D1 database for this new project, never reuse a production binding or data.

Hosting status is recorded in the final verification report. Registration is not deployment. Only the integration owner may use the supported Sites workflow to push source, package the exact commit and deploy this owner-private project. No production access, domain, database or credential changes are authorised.

## Capability boundaries

The companion is a web UI inside Nebula. It does not overlay other applications, detect installed apps, inject an exact transit itinerary into Google Maps, run as an OS widget or control-panel feature, or track progress in the background. Physical iOS/Android app launch, app-return behavior and OS accessibility need separate device testing. Browser tests establish URL contents, click/return preservation and web layouts only.
