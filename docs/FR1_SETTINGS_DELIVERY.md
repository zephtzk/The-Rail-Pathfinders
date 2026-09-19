# FR1 settings disclosures

Implemented on `codex/fr1-settings`, based on `9c04b28f01b9ada8770e98906190699e1cc2e454`.

The three travel-style cards initially show their titles and controls only. Each title remains a preference-selection button; its separate chevron expands or collapses the description without selecting a style, changing stored preferences, discarding draft form values, or invalidating a planned route. Expanded descriptions survive settings redraws and navigation, and reset on page reload. Selected preferences still persist across reloads.

Disclosure buttons have names, `aria-expanded`, associated `aria-controls` targets, native Enter/Space behavior, visible focus and 44px-wide targets. Selection retains `aria-pressed`, restores focus after redraw, and has a checkmark plus a forced-colors indicator. Scoped CSS preserves equal card padding on narrow screens.

## Files and integration

- `src/commute-ui.js`: travel-style markup, disclosure events, transient expanded state and selection focus.
- `src/commute.css`: scoped travel-card layout and disclosure styling.
- `docs/evidence/fr1-settings/`: browser check results and reviewed screenshots.

The guidance-display setting and its default are unchanged. If another FR1 item changes the same long `renderPreferences` template line, retain its guidance-display changes alongside this travel-style fragment. No preference, routing, storage or accepted-journey model changed.

## Verification

- `node --check src/commute-ui.js`: passed.
- `node --test tests/preferences.test.mjs tests/legacy-planner-preferences.test.mjs`: **12 passed**.
- `npm run build`: passed, **95 assets**.
- Ad hoc Playwright verification against port **4201**: **36 passed**, no browser runtime errors; [check results](evidence/fr1-settings/browser.json). Covered all three disclosures, Enter/Space/Tab, draft inputs, independent selection and expansion, save/reload, retained search results, and an actual packaged-timetable EW2-to-EW12 trip on 21 September 2026 at 10:00 SGT. Disclosure, selection and Save each preserved its accepted route and accepted preferences.
- Visually reviewed [collapsed mobile](evidence/fr1-settings/collapsed-mobile.png), [expanded mobile](evidence/fr1-settings/expanded-mobile.png), [desktop](evidence/fr1-settings/desktop.png), and 320px/200%-text [collapsed](evidence/fr1-settings/large-text-collapsed.png) / [expanded](evidence/fr1-settings/large-text-expanded.png) captures. No horizontal card/page overflow; selected and unselected narrow cards retain equal padding.

Two existing broader suites were attempted without modifying them: `r2-browser.mjs` passed 5 checks then stopped at line 23 because it expects terminal directions inside the now-compact bus suggestion; `r4-planner-browser.mjs` passed 15 checks then timed out at line 59 waiting for a route card. Both stopped before their Settings checks. They are not reported as passing. Focused Settings verification independently completed the real-route flow above.

Checks used installed desktop Edge with mobile/touch, keyboard, enlarged-text and forced-colors emulation. Street-map tiles were blocked for deterministic captures. Physical phones and screen-reader output were not tested. No push, PR, merge or deployment was performed.
