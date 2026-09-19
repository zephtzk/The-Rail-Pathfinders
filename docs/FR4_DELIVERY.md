# FR4 delivery

- Empty From/To searches show only My location and explicitly saved places. Whitespace is empty; typing restores station, bus-stop and address matches.
- Current-trip End, Pause/Resume and Cancel actions have matching icons and centered, wrapping alignment.
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
