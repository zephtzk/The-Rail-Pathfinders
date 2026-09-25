# Accepted journey handoff

Baseline: `c1d77d8a85c82a705995dd6143f28317b4d246bd`. These modules are pure presentation helpers: they perform no storage, network, navigation or state updates. They reuse the current journey validators, incident scope compiler and synthetic event validation. No routing engine or accepted-trip store is added.

## Integration contract

```js
import {deriveNebulaJourneyContext} from './nebula-journey-bridge.js';
const context = deriveNebulaJourneyContext({
  active: companion.getActive(),
  network: router.network,
  build: build.applicationSha256,
  incidents: loadIncidentLog(),
  online: navigator.onLine,
  now: Date.now(),
});
pet.update({notice: context.notice});
```

`notice` is null or `{label, severity, source}`; current severity is `warning`, source is `demo` or `stale`. Official notices in the baseline have only unscoped text and intentionally stripped segments; this adapter cannot truthfully label them relevant to a particular journey. Keep existing Services provider status and official notices visible. A null pet notice never means services are running normally. No live provider access is claimed.

`nextBoarding` is null or `{lat,lng,label,stopId,precision,url}`. `precision` is `station-centroid` or `stop-position`. `handoffReason` is useful visible explanatory text in either case. Use textContent/escaping for all display text. Both rail station positions and mapped bus stop positions lack verified accessible entrances/bays.

Read only `active.route.steps` and their original `source` legs, starting at canonical `active.progress.stepIndex`. Prepared routes, planner selections, route proposals, replay previews and device location never choose the target. Require a validated active state, today's Singapore service date, matching loaded timetable build, and a start/manual confirmation no more than five minutes old (matching the existing journey card warning). Completed/cancelled/arrived, paused, active station detour, blocked/review path, unknown noninitial progress and onboard states produce no link. Address-provider journeys without validated timetable mapping deliberately produce no guessed target. Confirmation while waiting at a ride permits its boarding point; onboard requires explicit alighting confirmation first. Clocks never advance progress or complete the trip.

Refresh on `copilot:state-changed`, `demo:incidents-changed`, relevant storage changes, focus, online/offline, and a modest timer so a displayed link cannot remain indefinitely past the five-minute confirmation boundary. Recompute synchronously at click time too; if invalid, prevent navigation and show `handoffReason`.

Render a normal anchor with wording **Open walking directions in Google Maps**, `target="_blank"`, `rel="noopener noreferrer"`, and the URL from the freshly derived accepted target. Show the target label and reason. Do not invoke automatically, probe installed apps, or intercept return/focus as progress. Keep the original Nebula tab and its private fragment unchanged. No share token, trip ID, origin or label is serialized into the outbound URL; only the public boarding coordinates are sent. This does not imply shared plans lack location information: their endpoints are locations, and caregiver sharing remains read-only.

## Keep and accept

The existing `rerouting-ui.js` flow calls `compareJourney`, then `decide(...,'declined')` for Keep current route or `decide(...,'accepted')`, `canonicalReroute`, `proposeRoute`, `acceptRoute` for Accept revised route. Retain those user actions and freshness checks. Recompute this adapter after `companion.update`. A proposal or a declined alternative retains the accepted boarding target. Acceptance derives the target from the newly accepted route while preserving active journey ID, destination, permissions and accumulated progress as handled by existing APIs. Opening Maps does not call any of these functions.

## Deterministic September 25 scenario

Use imported rail data (coverage 18 September–31 December 2026), **Paya Lebar → Bugis, 25 September 2026, 10:00 Singapore time**, walking allowance 30 minutes, arrive by 12:00. Router IDs are `CC9` and `DT14`; public EW8/EW12 names are aliases, not router station IDs.

1. Obtain the actual rail route with the existing router. Its first boarding stop is `EW8_B`.
2. Use the existing `createIncidentDraft('planned',{date:'2026-09-25'})`, changed to whole-service EW closure (`scope:'service',from:'',to:''`), as an explicitly labelled local demo incident. `replayJourney` returns an affected alternative whose first boarding stop is `CC9_B`; it leaves the accepted state unchanged. Both stops belong to Paya Lebar, so the station-centroid URL can remain the same even though the accepted platform changes. The link never purports to route to that platform.
3. Personal accepted trips receive “Demo scenario overlaps your route · personal trip unchanged”. Replay previews cannot be auto-accepted. Use a separately labelled rehearsal for synthetic cancellation and explicit keep/accept testing.
4. For the existing fictional-next-train control, create the timetable plan with `routeFromLegacy(route,input,{mode:'real'})`, then mark the plan `mode='replay'` before starting. The converter's `mode:'replay'` option is for the old minute-based legacy demo, not imported second-based legs. Existing `ingestEvents`/`compareJourney`/`decide` then supply the fictional cancellation review. Invalid, expired or conflicting synthetic evidence is `stale`, never an all-clear.

The focused tests run the actual imported network, both saved-closure replay and synthetic comparison, proposal/keep/accept, second boarding after manual progress, terminal/stale/invalid states, strict coordinates, URL encoding and deep state nonmutation.

## Maps semantics and limits

[Official Google Maps URLs directions documentation](https://developers.google.com/maps/documentation/urls/get-started#directions) specifies the fixed HTTPS directions URL, `api=1`, coordinate destination and `travelmode=walking`. Standard URLSearchParams encodes the coordinate comma. `label` is display-only because directions has no documented custom destination-label parameter.

A user click may open the Google Maps app where supported, otherwise the browser. This supplies one walking destination, not an exact transit itinerary, a verified accessible entrance or a guaranteed closed-line exclusion. No native-device handoff success has been observed or claimed. Nebula's accepted journey, manual progress, sharing permissions and private URL fragment remain in Nebula.

## Isolation and validation

This owner edited only new modules, focused tests and this document. No AGENTS.md files or GitHub Actions workflows are tracked at the pinned baseline; `.openai/hosting.json` exists and is intentionally untouched here. No deploy/build/publish command runs from this branch. Hosting, runtime, shared UI and candidate database isolation belong to the integration owner. No production data or credentials are copied.

Run `node --test tests/nebula-handoff.test.mjs tests/nebula-journey-bridge.test.mjs`. Browser UI and device handoff verification must be performed against the separately isolated integrated candidate; module tests do not claim that verification.
