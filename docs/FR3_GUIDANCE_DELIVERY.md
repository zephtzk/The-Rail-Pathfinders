# FR3 item 7 — dismissible instruction cards

Implemented in the prepared `The-Rail-Pathfinders-fr3-guidance` worktree from published FR3 v7, commit `641f0ba`. Static yellow guidance cards now have an accessible X button at the top right. Dismissals persist while using the same browser session, including navigation between app views, rerenders and page reloads when session storage is available. A new browser session shows the cards again.

## Card inventory

Dismissibility is explicitly assigned to approved cards; yellow styling alone never makes a notice dismissible.

| Session key | Card and location |
| --- | --- |
| `indoor-guidance` | Static indoor guidance in Current trip and Station guide, rendered by `src/station-guide.js`. Both presentations share one key so dismissal hides the repeated guidance in both views. Training/fixture notices do not receive this marker. |
| `travel-information` | The static travel-information WIP card in Settings, rendered by `src/commute-ui.js`. |
| `station-connections` | The static station-connections WIP card in Plan's “Where can I travel?” disclosure, rendered by `src/commute-ui.js`. Parallel cleanup removes this disclosure during integration; do not restore it. |
| `facility-station-coverage` | The static real-station coverage card in Station layout & toilets, rendered by `src/facility-ui.js`. All real stations share the same coverage text and key. The fictional training layout remains unmarked. |
| `planner-review-route` | The optional instruction to review a selected route and press Start journey. This branch includes the explicit planner hook; the parallel cleanup task removes the redundant instruction during integration. |
| `planner-alternative-departure` | The optional instruction after selecting an alternative departure. This branch includes the explicit planner hook; the parallel cleanup task removes the redundant instruction during integration. |

Loading and error messages, no-route results, active accessibility/crowding constraints, blocked Start journey messages, unavailable or stale predictions, incomplete spending totals, cancellation confirmations and proposed route changes retain their existing behavior. Dynamic facility warnings and training/fixture labels remain visible. Official and demo service notices continue to use their separate incident-aware dismissal and reopening controls.

## Implementation and retained guidance

`src/instruction-cards.js` contains the reusable session controller, renderer and static-card mounting helper. Static templates use `data-instruction-card` with a registered key. One `mountInstructionCards($('app'))` call in `src/commute-ui.js` enhances existing cards and observes replacements, so preference changes, location updates and view rerenders preserve dismissal. The planner hook explicitly resets instruction decoration before rendering another status or error in the same element.

`src/instruction-cards.css` supplies a 44 × 44 CSS-pixel close target, room for text beside the control, visible keyboard focus and forced-colour support. Buttons have accessible names of the form “Dismiss … for this session”; the X glyph is decorative. Dismissal moves focus to a visible heading or relevant route action. Duplicate cards with the same key disappear together.

Existing supporting information remains available: Station guide retains operator facts and “Other reviewed stations and coverage”; Station layout & toilets retains the full coverage limitation under “Coverage, source age & assistance” and its unavailable-layout state. Settings retains labelled preferences such as “Require a verified step-free route” and “Quieter (data unavailable)”, and route-specific blockers still explain why guidance cannot start. Start journey and the other functional controls keep their labels. Dismissal does not change a journey, travel preferences or routing constraints.

The session key is `commute-copilot-instruction-dismissals-v1`. Only nonempty string keys from a valid stored array are restored. Storage getter, read, write and malformed-data failures are caught. An in-memory set preserves dismissals through rerenders and app-view changes when storage is blocked. Because a reload replaces document memory, dismissal cannot survive that reload if session storage cannot retain it; cards safely return in that case. No local-storage persistence or permanent dismissal is introduced.

## Verification and handoff

| Check | Result at documentation handoff |
| --- | --- |
| `node --test tests/instruction-cards.test.mjs` | 7 passed: independent keys, restoration, new sessions, blocked storage, memory fallback and malformed data. |
| Relevant unit tests | 34 passed in total. |
| `node tests/fr3-instruction-cards-browser.mjs` | 27 passed, including keyboard focus, per-card dismissal, complete and same-node rerenders, reloads, new sessions, blocked storage, dynamic-state preservation, 390px mobile and 320px/200% text. |
| `node tests/r5-guidance-browser.mjs` | 34 passed: accepted journeys, checkpoint progression, staff cards, detours, station tabs, touch controls and enlarged text. |
| Services browser regression | 18 passed. |
| Build | 118 assets built. |
| `node --check src/facility-ui.js` | Passed. |

Evidence: [focused results](evidence/fr3-guidance/results.json), [guidance regression](evidence/fr3-guidance/guidance-regression.json), [Current trip with X](evidence/fr3-guidance/current-instruction-mobile.png), [Current trip after dismissal](evidence/fr3-guidance/current-dismissed-mobile.png), [Settings](evidence/fr3-guidance/settings-mobile.png), and [320px enlarged text](evidence/fr3-guidance/settings-320-large.png). Screenshots were visually inspected. On narrow screens, text uses the full width below the X.

The focused suite deliberately does not depend on the planner success paragraph or coverage-copy disclosure, so removal by the parallel cleanup task does not invalidate its checks.

The local preview uses port `4253` and installed Edge through `BROWSER_EXECUTABLE`. Browser checks use mobile emulation; they do not establish physical-device or screen-reader validation.

The parent task owns integration and deployment, including reconciliation with the parallel cleanup changes. This task does not deploy or change the text-size slider; publication of items 1–8 remains the parent's responsibility.
