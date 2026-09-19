# FR4 delivery

- Empty From/To searches show only My location and explicitly saved places. Whitespace is empty; typing restores station, bus-stop and address matches.
- Current-trip End, Pause/Resume and Cancel actions have matching icons and centered single-row alignment.
- Show to staff includes a Custom message option, a 500-character editor and a large literal-text preview. Drafts stay in page memory and clear when the trip context changes or the page reloads.
- New recipient links use a read-only plan-view capability. The recipient sees only the provider's shared planned trip and Refresh trip, with no acceptance, journey controls, other tabs, location collection or writes. Viewer credentials cannot edit/delete or read another share. The recipient session is isolated in sessionStorage from local journeys. The provider can explicitly update the shared plan or delete the link. Existing legacy handoff capabilities retain their previous consent rules.
- Bus/train map toggles have a small grey Map View caption.

Validation: 553 JavaScript tests and 44 Python data tests pass. Focused browser verification passes 10 search checks, 10 custom-message checks, 14 read-only sharing checks, and action-icon/alignment/map-caption checks. Staff text was also checked at 320px and 200% size. Sharing checks exercise the real local API, including server write denial, owner updates, reload, no GPS, storage isolation and synthetic-share cleanup. Desktop Edge automation is not physical-device validation.

The public site retains its existing identity, audience and persistent sharing database. The Nebula mascot and minimal loading screen remain in place.

## Follow-up fixes

- After creating a recipient link, the provider has exactly two actions: Refresh shared trip and Cancel sharing. The link is copied once where clipboard access is available and remains selectable for manual copying. Refresh publishes the currently selected planned trip using a fresh server revision; cancel invalidates the link without cancelling the provider's own journey.
- Older invitation shares retain their original consent semantics and are never labelled as read-only links. Their provider can cancel and create a new read-only link.
- Journey notifications stay off, including old subscriptions; there is no notification toggle in the interface.
- My location already supplies the device coordinates correctly. Address and GPS routing require a valid server-side `ONEMAP_TOKEN`; configuration and live routing verification are deployment tasks. The credential must never enter tracked files, client assets, or logs.

Follow-up validation: `npm run check` passes. The built app passes 19 provider-control browser checks and 14 recipient/API checks, including clipboard denial, legacy invitation handling, refresh, cancellation, viewer write denial, reload and storage isolation. Notification tests confirm no permission prompt, subscription, queued event or delivery, and cleanup of old subscriptions without deleting shares.

## Trip and incident follow-up

Implemented in three parallel work chats: trip cleanup, incident routing, and map/app zoom.

- End, Pause/Resume and Cancel remain in one row, including narrow screens.
- App zoom gestures and shortcuts are guarded; map pinch/wheel/buttons and app text-size settings remain available. Browser menus and OS magnification remain outside web-app control.
- Saved unresolved closure/cancellation incidents affect all planner and flexible-departure searches, honoring service, direction, segment and incident time window. Incident log changes refresh suggestions and resolving incidents restores eligible routes. Delay scenarios remain explicitly advisory.
- Address-provider routes request station or bus-stop endpoints while synthetic closures are active because external routing cannot enforce those exclusions.
- Choose saved incident is full width, centered alongside the centered Open incident log action.
- Removed duplicate Location settings from Update my current step, and Route checks/manual correction and Service notices from Current trip. Alternate-route proposals and acceptance remain available.

Validation: full npm run check passes, including JavaScript/data tests and production build. Focused tests cover multiple closures, alternatives and resolution; real Leaflet zoom behavior; and trip controls at 320/390/1440px with zero runtime errors.

Published to the existing public site on 19 September 2026 at 15:17:57 SGT (version 13), after explicit publication approval. Source: `f5fb04b9d5bb7a8a6ea2f94b7b825cf45869082e`. [Publication receipt](evidence/fr4-addendum/publication.json).

The full check passed 555 JavaScript tests and 44 Python data tests. Additional browser verification confirms that saving a closure preserves an already accepted trip; Cancel trip, Yes, cancel trip, Plan another journey, Find my route and Start journey then activate the closure-free route with the same destination. All 33 existing demo-control browser checks pass. Browser emulation is not physical-device validation.

## Submission documents

The [updated submission PDF](../FINAL_ASSESSMENT_WRITEUP.pdf) has exactly two writeup pages followed by the complete 14-page [illustrated user guide](Commute_Copilot_Judges_User_Guide.pdf). It names The Rail Pathfinders, Cheah Kika, Jin Donghua, Zeph Tang Zhenkai and Zhang Yizhuo, with the app otter logo at the top right. [Editable writeup](../FINAL_ASSESSMENT_WRITEUP.md).

The organisers/maintainers appendix was replaced with a reproducible demo: save an East West Line closure, return to Plan, check the changed route, explicitly start the alternative, and resolve/reset the incident. The guide uses refreshed FR4 screens and correct sharing controls. All 16 combined PDF pages were rendered and visually checked; the appended guide preserves every source page's text and drawing content. [PDF verification](evidence/fr4-addendum/submission-qa.json).

The submission writeup was subsequently revised to declare Mdm Lim as the primary design persona, explain architecture and assumptions, disclose known accessibility and integration gaps, and link reproducible numerical evidence. Its two-page writeup and unchanged 14-page guide remain a 16-page PDF. See [claim evidence](WRITEUP_EVIDENCE.md).
