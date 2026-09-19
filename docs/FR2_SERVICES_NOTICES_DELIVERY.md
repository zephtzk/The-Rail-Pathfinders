# FR2 Services notices controller

## Integration

`mountServices({host, noticeHost, loadIncidents, getContext, onReplay, onOpenServices})` in `src/services-ui.js` mounts a service-notice list and a separate dismissible entry notice. Keep the existing nearby-facilities host as a sibling below `host`. The controller loads its own `src/services.css`.

- `loadIncidents()` returns the persistent demo log array. Only records with `demo: true` or `source: 'demo'` enter the simulated section.
- `getContext()` may return `{input, active}`. An active demo alerts immediately. A future scheduled demo alerts only if the selected input date (or active routing-context input date) overlaps its window. Resolved and ended records remain in the list without alerts or replay buttons.
- `onReplay(incident)` receives the complete selected record. The controller never changes routes itself.
- `onOpenServices()` opens the Services view. The controller then focuses its heading.
- Returned `refresh()` checks official notices and reloads the demo log. `render()` refreshes presentation/context without a request; call it after changing the selected journey/date. `setIncidents(array)` updates the local view. `destroy()` removes listeners and aborts an outstanding fetch.
- Listens for `demo:incidents-changed`. Mount performs one `/api/notices` request; subsequent requests require the foreground Refresh notices button or explicit `refresh()`. Focus and connectivity changes update presentation without polling.

Official advisories pass existing `noticeSnapshot` and `newerSnapshot` validation. Only actual nonempty notices retrieved within two minutes can produce an official entry alert. Missing, unavailable, expired, offline and stale states cannot imply a real service failure or normal service. Advisory text remains informational. Demo data and official data have distinct headings and labels.

Dismissal is stored only in session storage, keyed by incident revision/content or official text. Unchanged retrieval timestamps do not repeat an alert. Changed/new incidents can alert, while dismissed records remain in Services and can reopen the entry notice. Storage failure falls back to the controller's in-memory dismissal set.

## Verification

- `node --test tests/services-model.test.mjs`: 4 passed.
- `node --check src/services-ui.js`: passed.
- `node tests/services-ui-browser.mjs`: 18 controller assertions passed in installed Edge, including 320px layout, session reload, dismiss/reopen, updates/resolution, selected replay callback, official vs simulated labels, stale data, escaped content, preserved facility sibling and no automatic route changes/polling.

The browser test is a controller fixture using the actual modules, controlled notice responses and a simulated record. The parent owns testing the final integrated commute/replay flow. Live official operation is not claimed by these controlled tests.
