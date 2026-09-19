# FR1 feedback 4: Finish journey label

Branch: `codex/fr1-finish-label`  
Base: `9c04b28f01b9ada8770e98906190699e1cc2e454`

Changed exactly two strings in `src/copilot-ui.js` to **Finish journey**: the current-trip finish button and the shared primary-action label at the final exit step. Full and simple guidance use these controls. Destination explanatory text, markup structure, and click handlers are unchanged. No existing test expectations required updates.

Verification on 19 September 2026:

- JavaScript syntax check and `git diff --check`: passed.
- Existing `journey-v2` and `guidance-r5` unit suites: 27 passed.
- `npm run build`: passed; 95 assets built.
- Existing `r5-guidance-browser.mjs`: 31 checks passed, no browser exceptions.
- Temporary browser walkthrough: 11 checks passed; selected a real static Bugis–Promenade timetable route through the UI, manually confirmed its final exit checkpoint, verified both labels and destination text in full/simple guidance, and completed the journey with the shared primary button.
- Visually inspected three 390 × 900 screenshots: full guidance, simple primary action, and simple disclosed actions. Local ignored evidence is in `test-results/fr1-finish-label/`; existing browser results are in `test-results/r5-guidance-integrated/`.

Browser verification used desktop Edge with mobile/touch emulation and blocked map tiles. It does not establish physical-phone behavior or actual travel. The existing browser suite uses explicitly seeded test fixtures; the temporary walkthrough selected a packaged timetable route. Preview used only port 4204 and was stopped afterward. No push, PR, merge, or deployment was performed.
