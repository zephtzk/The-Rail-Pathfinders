# FR3 items 1–2: location and connectivity

Implemented in the prepared `codex/fr3-location` worktree from published FR3 v7 (`641f0ba`). Integration and deployment belong to the parent task.

## Delivered behavior

- Both **Starting from** and **Where to?** offer **My location** in their suggestions, including when an endpoint is already selected. Pointer and combobox keyboard selection work. Opening suggestions does not enable location or send an address lookup.
- An explicit location selection reuses the existing foreground geolocation session and its consent, stop, denied, unavailable and visibility handling. Pending selections cancel on editing, clearing, switching fields, Escape, or switching views, without stopping other consumers of that session.
- Only a fresh position with accuracy at most 50 metres, age at most 60 seconds, and coordinates inside the supported Singapore area can be selected. Routing rechecks the service and the captured position. A newer device fix cannot silently move the selected endpoint or its map marker. Errors preserve manual place entry and explicit retry.
- Coordinates reach OneMap only when the user requests a route. Device accuracy, fix timestamp and private endpoint labels are absent from the request. Offline coordinate routing retains the existing explicit connection requirement.
- Saved routes keep the reviewed coordinates under a dated **Selected location** label. Reopening a saved route cannot mistake old coordinates for the device's current position. Device selections do not appear as reusable saved-place suggestions.
- The header shows full signal bars for online and bars crossed with an X for offline, with accessible status names and announcements. The adjacent location icon expands a popover with state, accuracy, privacy information, enable/retry and stop. Escape restores trigger focus; outside interaction closes it. Status remains visible within the popover on every tab.
- Header stop uses the existing companion privacy-revocation path. Caregiver permissions remain separate.

## Files and integration scope

New implementation modules: `src/location-endpoint.js`, `src/location-controls.js`, and dedicated `src/location-controls.css`.

`src/address-ui.js` adds the endpoint action and cancellation lifecycle. `src/commute-ui.js` changes the header/location wiring, endpoint selection and validation, boot-safe endpoint catalog, and reviewed-location snapshot saving. Its other tab content and journey-sheet behavior are unchanged. `src/location.css` scopes the obsolete banner-hide selector to the old banner class so it cannot hide popover status.

The two older browser tests were updated only for the moved location controls and the additional keyboard option. There is no text-size slider work.

## Verification

- `npm ci --offline` and `npm run build` pass.
- `npm test`: **529 passed**, including 15 new location-endpoint tests covering boundaries, explicit retries, shared-watch reuse, cancellation, timeout, denial, suspension and synchronous subscription cleanup.
- `TEST_BASE_URL=http://127.0.0.1:4251 node tests/fr2-search-browser.mjs` passes: local/address planning, keyboard operation, request cancellation, clear/swap, cache/offline behavior, provider failure and enlarged text.
- `TEST_BASE_URL=http://127.0.0.1:4251 node tests/pre-fr2-location-browser.mjs` passes: actual browser Geolocation API with controlled coordinates, startup, foreground lifecycle, accepted-step invariants, manual corrections, denied/unavailable recovery and narrow enlarged-text layout.
- `TEST_BASE_URL=http://127.0.0.1:4251 node tests/location-privacy-browser.mjs` passes unchanged: cross-tab disable, late callbacks, coordinate clearing, caregiver revocation and pending-server privacy failure handling.
- `TEST_BASE_URL=http://127.0.0.1:4251 node tests/fr3-location-browser.mjs`: **66 checks passed**, zero scenario failures and zero browser errors. It covers both endpoint roles, captured-fix routing and saving, stale/low-accuracy/error/offline cases, cancellation, all-tab popovers, signal accessibility, keyboard focus and selection before routing data finishes loading. See [verification.json](evidence/fr3-location/verification.json), [320px selector](evidence/fr3-location/endpoint-selector-320.png), [320px popover](evidence/fr3-location/popover-320.png) and [200% text actions](evidence/fr3-location/popover-320-large-text-actions.png).

Browser runs use installed Edge with controlled GPS and OneMap responses, mobile viewports and blocked map tiles. Screenshots were visually inspected. They are not evidence of physical-phone travel or live OneMap performance. Existing approximate-location, indoor, boarding and route-coverage limitations remain.
