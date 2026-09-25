# Nebula companion UI handoff

This module is a **web companion inside Nebula**. It does not draw over other apps, detect installed apps, inject a native transit route, or implement an OS widget. It reuses the approved `public/icon.svg` otter. It has no dependencies, timers, network requests, provider logic, or parallel journey state.

## Integration

Import `src/nebula-companion.js` and load `src/nebula-companion.css` once. Mount once in a dedicated host directly under `body`, outside transformed, clipped, or inert app panels. Do not remount on each screen render.

```js
import { mountNebulaCompanion } from './nebula-companion.js';

const pet = mountNebulaCompanion({
  host: document.querySelector('#nebula-companion-host'),
  storageKey: 'nebula-companion:candidate:20260925:settings',
  onNavigate(destination) {
    // Map ONLY to the existing screen/actions. Retain their safety checks,
    // accepted-trip source, private sharing fragments and reroute confirmation.
    navigateExistingApp(destination);
  },
});
```

`host`, `onNavigate`, and a nonempty `storageKey` are required. The allowlisted destination strings are exactly `disruptions`, `facilities`, `caregiver`, `spending`, `staff`. Their visible labels are Disruptions, Facilities, Caregiver, Spending, Show to staff. Each is a separate icon button; the action group has no enclosing card or rectangular popup background. Before calling `onNavigate`, the module collapses and returns focus to its trigger. The existing destination handler should then focus its own heading/dialog as appropriate. No callback changes a trip within this module.

The module owns **one** injected key, storing only `{version:1,enabled,dock}`. Do not independently write that key from Settings. No production key is assumed; no other storage is read or cleared. A separate candidate origin and service-worker scope are still the integration owner's responsibility. This fixture does not provision hosting or a sharing database.

## Synchronous API

| Method | Behaviour |
| --- | --- |
| `getState()` | Returns a frozen snapshot `{enabled,dock,expanded,persistent}`. Defaults on, dock right, collapsed. `persistent` indicates whether the last storage access succeeded; a failed write/read falls back to in-memory state. |
| `setEnabled(boolean)` | Saves preference, collapses actions, returns snapshot. Off leaves a visible **Enable Nebula** button. Calling with current state does nothing. |
| `setDock('left' \| 'right')` | Saves dock preference and returns snapshot. Dock can also be changed using Move left/Move right alongside the expanded actions. Drag is unnecessary. |
| `subscribe(listener)` | Immediately calls the listener with a snapshot, then on state changes. Returns an unsubscribe function. Listeners should only update Settings presentation, without writing storage or calling setters recursively. |
| `update(context)` | Applies only supplied context properties. No return value. Does not change the enabled/dock preference. |
| `destroy()` | Idempotently removes the root, listeners, observer and subscriptions. Later updates/setters do not remount it. |

For Settings, read `getState().enabled`, handle checkbox changes with `setEnabled(checked)`, and use `subscribe` to update the checkbox. Unsubscribe before destroying the Settings view. Both the pet and Settings stay synchronized, including storage events from another tab on the same candidate origin.

## Context contract

```js
pet.update({
  notice: null, // or { label: '...', severity: 'info', source: 'demo' }
  suppressed: isReadOnlyRecipientView,
  dialogOpen: isAppDialogOpen,
  keyboardOpen: false,
  bottomInset: measuredNavigationHeight + 8,
});
```

- `notice` is `null` or `{label,severity,source}`. A nonempty label and explicit source (`live`, `demo`, `stale`) are required; invalid/unknown sources hide the notice. Supported severities are `info`, `warning`, `critical`; unknown severity renders as information. Labels use `textContent`, never HTML. The caller must derive relevant evidence from the actual accepted journey/incidents and must not relabel demo/unavailable evidence as live. Visible source text is **Live update**, **Demo notice**, or **Stale information**. Notices use polite status, no alert sound, animation, or fabricated event.
- Dismissal hides only the current exact `{label,severity,source}` for this mount. Repeating the same update stays dismissed. Changed evidence or a `null` followed by a notice can show again. Dismissal is not persisted and does not change the incident source. Unrelated updates do not rewrite status text or repeat announcements.
- `suppressed`, `dialogOpen`, `keyboardOpen` are booleans. Any true value hides **all** companion UI, including the re-enable button, and collapses actions without changing enabled. Use `suppressed` for the read-only caregiver recipient view. Set flags back to false when leaving that state.
- `bottomInset` is a finite number of CSS pixels, default 88, clamped 0–400. Include the measured bottom-navigation/control clearance and desired gap, **excluding** the safe-area inset, which CSS adds separately. Update after responsive navigation/text-size changes; the component cannot infer app-specific overlays. Do not hard-code desktop navigation height for a 200% text mobile view.

The component also automatically hides while focus is in a text-editable field/select outside itself, while a visible `dialog[open]` or `[aria-modal="true"]` exists, or during a large unzoomed visual-viewport height reduction. Custom CSS-only dialogs should also set `dialogOpen` explicitly. Hiding never focuses a hidden control or steals focus from the app.

## Interaction and layout

Button activation opens actions. Enter/Space activation moves focus to the first action; ArrowUp from the collapsed trigger does likewise. Native Tab order is retained, without a focus trap. Escape inside expanded controls collapses and returns focus. An outside click/focus collapses without cancelling the app event. Every button has a minimum 44px target. The notice has a separately named dismiss button. Off/re-enable and left/right docking are available without dragging.

The fixed region reserves bottom and side safe areas. Only its active controls/shelf accept pointer events, never a full-screen backdrop. It does not lock document scroll. Expanded controls/long notices scroll inside the available height on small or landscape screens, including 80–200% root text settings; labels wrap rather than truncate. The otter is decorative with an empty `alt`, and its button has an accessible name. There are no animations; reduced-motion and forced-colour preferences are respected.

## Focused fixture and checks

From a clean clone with existing project dev dependencies installed:

```sh
node --check src/nebula-companion.js
node tests/nebula-companion-ui-browser.mjs
```

The runner starts a strictly allowlisted static fixture on `http://127.0.0.1:4188`, opens a fresh Playwright browser context with service workers blocked, uses synthetic data only, and closes browser/server afterward. It does not start the application server, read credentials/user data, or call provider/sharing APIs. It uses installed Edge on Windows or Playwright Chromium elsewhere (`PLAYWRIGHT_EXECUTABLE_PATH` can override). Screenshots/results go outside the repository to `../nebula-companion-ui-evidence`, or `NEBULA_UI_SCREENSHOT_DIR`.

Coverage: API and required key; all five callbacks; keyboard/focus/Escape; Settings and persistent off/re-enable/dock; unchanged, changed, demo/stale/live-source synthetic notices and dismissal; recipient/keyboard/dialog suppression; actual editable/native-dialog exclusion; mobile 390×844, small 320×568, landscape 844×390, 200% text at 320×568 and 667×375, 80% text; hit targets/reachability; page scrolling; zero provider/service-worker requests; unsubscribe/destroy/global-listener cleanup; blocked-storage fallback.

This is module-level evidence, not real app integration verification. The integration owner must check actual navigation mappings, recipient mode suppression, overlay order, bottom-inset measurement at 80–200%, real provider provenance, and accepted-trip/reroute preservation in the combined candidate. No deployment, assessment-document, provider-adapter, sharing, global CSS, entry, Settings, build, or journey file is changed by this UI branch. At the pinned baseline, no `.github` workflow, repository `AGENTS.md`, or configured Git hooks path was present; inherited `.openai/hosting.json` refers to production and is never used for deployment here.
