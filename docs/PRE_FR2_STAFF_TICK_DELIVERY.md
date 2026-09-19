# Pre-FR2 refinement — staff instruction tick

Implemented on `codex/pre-fr2-staff-tick`, based on the complete FR1 integration commit `0a3bfa1264dec93b2f7a5b58f8650c68224f84e9`. This is implementation verification before FR2; no FR2 tester session has run here.

## Changes

- `src/staff-card.js` replaces the visible reset label with the same decorative check icon used by **Update my current step**, beside the labelled message dropdown. The button retains the accessible name and tooltip **Use my current instruction** and appears only for manual requests.
- Manual requests still update the card immediately. The existing tick handler resets to the current instruction and returns focus to the dropdown. Routine refreshes preserve manual choices; confirmed step and accepted-route changes still reset automatically. No selection, journey, sharing or dispatch handlers changed.
- Staff-scoped rules in `src/guidance.css` match the FR1 tick's colours, border, radius and glyph, with 48px full-mode and 56px simple-mode targets, visible keyboard focus and forced-colour support. Dropdown text scales with enlarged root text. Global journey tick rules are unchanged.
- `tests/pre-fr2-staff-tick-browser.mjs` adds focused browser regression coverage.

## Evidence

| Check | Result |
| --- | --- |
| `npm run build` | 99 assets built |
| Syntax checks for staff component and new browser test | Passed |
| `node --test tests/guidance-r5.test.mjs tests/journey-v2.test.mjs tests/journey.test.mjs tests/preferences.test.mjs` | 51 passed |
| New staff browser suite | 50 passed |
| Existing `tests/fr1-current-step-browser.mjs` | 79 passed |
| `git diff --check` | Passed |

The staff suite verifies all five manual requests, immediate application, click/Enter/Space reset, focus and tooltip, conditional absence, default/simple/full modes, actual production step confirmation and controlled accepted-route replacement, refresh preservation, matching tick appearance, 48px/56px targets, and 320px with 200% root text (including 32px dropdown text). Staff actions dispatch no journey changes and make no sharing requests or network mutations. Both browser suites report no page exceptions.

Build SHA-256: `ce9bdd59eeebe649573e01123f211e083bb8777ce0812ebcd73698d93956e353`.

[Staff results](evidence/pre-fr2-staff-tick/results.json), [FR1 regression results](evidence/pre-fr2-staff-tick/fr1-regression-results.json). Visually inspected: [default simple](evidence/pre-fr2-staff-tick/default-simple-mobile.png), [keyboard focus](evidence/pre-fr2-staff-tick/keyboard-focus-mobile.png), [full](evidence/pre-fr2-staff-tick/full-mobile.png), [simple](evidence/pre-fr2-staff-tick/simple-mobile.png), [full enlarged text](evidence/pre-fr2-staff-tick/full-320-large-text.png), [simple enlarged text](evidence/pre-fr2-staff-tick/simple-320-large-text.png).

## Repeat and limits

The hidden local preview uses port **4232**. With the built app served there, run the new suite directly; run the existing FR1 suite with `TEST_BASE_URL=http://127.0.0.1:4232`. Both use installed desktop Edge by default and accept `BROWSER_EXECUTABLE` and `CAPTURE_DIR` overrides.

Evidence uses controlled accepted-journey fixtures in the production UI and desktop mobile/touch emulation. Map tiles were blocked. No physical-phone, screen-reader session, live-provider or real-travel validation is claimed. At 320px with enlarged text, native collapsed dropdowns truncate longer selected labels; the staff card keeps the full message and the reset remains reachable. No functional issue remains in this refinement.

An initial test compared the entire journey during a synthetic hidden-document event; the existing location handler legitimately changes geolocation permission to `stopped`. Refresh comparisons now normalize only that field; direct staff interactions still require exact unchanged journey state. No application change was needed for that test correction.

No push, PR or deployment was performed. Local integration and FR2 tester sessions remain with the parent task.
