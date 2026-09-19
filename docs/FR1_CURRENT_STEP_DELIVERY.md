# FR1 feedback 6 — current-step update

Current trip now presents **Update my current step** in place of its prominent Staff shortcut and duplicate position-correction action. It expands one compact picker directly below the action. The labelled dropdown uses the existing canonical checkpoint choices; the adjacent tick is named **Confirm my current step** and has a 48 × 48 CSS-pixel target (56 × 56 in simple guidance). The separate **Show to staff** navigation page remains available.

Selecting a step does not change the accepted journey. Confirmation still calls the existing checkpoint controller, including explicit backward V2 corrections and invalidation of the older timetable progress seed. Invalid, empty and noncanonical option values are rejected. Pause, blocked-path, route-review and toilet-detour primary actions keep their existing handlers. Both Finish journey label occurrences are unchanged in this branch.

Routine refreshes preserve a valid pending selection, disclosure state and focus on the dropdown/tick. Focus is restored only when that control already had focus. A different journey, accepted route revision or confirmed checkpoint clears the pending choice; successful confirmation closes the picker and returns focus to current guidance.

## Verification

- `npm test`: 385 JavaScript tests passed.
- `npm run build`: 95 local assets and Worker built.
- `tests/fr1-current-step-browser.mjs`: **79 checks passed**, covering canonical indices, explicit confirmation, invalid/backward correction, pending selection/focus through routine refreshes and location updates, accepted-route replacement, keyboard, journey phases and layout; details are in [results.json](evidence/fr1-current-step/results.json).
- Existing browser suites passed on port **4206**: R3 unified app (36), R4 flow (33), R4 legacy (37), R5 address (17) and R5 guidance (31): **154 checks total**. Affected older selectors now use the Update action; canonical assertions remain intact.
- `git diff --check` passed. Browser runs reported no application exceptions.

Reviewed [full mobile picker](evidence/fr1-current-step/synthetic-full-mobile.png) and [simple guidance at 320px / 200% text](evidence/fr1-current-step/synthetic-simple-320-large-text.png). The picker and tick remain side by side without horizontal overflow. Long option text uses the native dropdown's available width.

## Limits and integration

The focused screenshots use explicitly labelled synthetic accepted-journey fixtures and desktop Edge mobile/touch emulation. They are not real travel, a physical-phone test, an indoor survey, or evidence of working hosted providers. Map tiles are deliberately blocked in browser tests. The R4 flow suite also exercises a genuinely planned static-network journey.

Implementation files are `src/copilot-ui.js` (shared action/picker/controller), `src/commute-ui.js` (remove duplicate shortcut) and scoped rules appended to `src/guidance.css`. No routing/state-model files changed. No push, PR, merge or deployment was performed; publication remains with the parent FR1 integration task.
