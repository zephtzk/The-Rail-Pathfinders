# Pre-FR2 feedback 4 — direct Start journey

Implemented on `codex/pre-fr2-start-journey`, based on complete FR1 `0a3bfa1264dec93b2f7a5b58f8650c68224f84e9`. Local delivery only; no push, PR or deployment.

The modern planner's selected route now has **Start journey** beside Save route. One intentional press starts that itinerary and opens Current trip. Searches, route selection, flexible departure and saved-commute shortcuts never start automatically. The old planner Continue → Confirm your trip → Start sequence is removed. Legacy and labelled-replay preparation keep their deliberate flows.

Fare, accessibility, provenance and timing assumptions remain available in Route details before starting. Estimate/accessibility limits and independent caregiver-sharing defaults are visible beside Start. The copy says to check indoor changes and vehicle boarding yourself and explicitly finish the journey on arrival, ready for integration with the parallel location work.

## Implementation and integration

- `src/commute-ui.js`: direct action at the existing `#review-route` ID, selected route/input/search-generation guard, immediate input invalidation, route disclosures, active-trip blocker and status refresh. The ID is retained for existing planner integrations; its accessible label is Start journey.
- `src/copilot-ui.js`: `selectedJourney()` preserves the existing canonical local/provider construction; `inspectSelected()` supplies disclosure and blocker state without preparing or starting. Both direct `startSelected()` and prepared `#start-companion` actions use synchronous `startPlan()` → `startJourney()` → context copy → `commit()`. Active and paused trips block replacement; duplicate activation cannot create a second accepted journey.
- `src/commute.css`: scoped `.journey-start` styles fix the moved companion section's dark-text override and cover normal, hover, focus, pressed and disabled states. White text/icon contrast is 7.93:1 normal, 10.47:1 hover, 14.27:1 pressed and 6.22:1 disabled. Disabled opacity is 1. Simple guidance retains a larger target, and keyboard focus remains visible.
- Tests: two new focused browser suites plus modern-flow migrations in R2/R3/R4/R5, FR1 integration, route-map and service-colour suites. Legacy/replay start controls are retained. R5 product assertions inspect stored accepted state, proving shortcut/flexible selections do not auto-start.

The location task overlaps `copilot-ui.js` and `commute-ui.js`. Keep its global/startup location lifecycle in `commit()` and reconcile its removal of `enable-local-assistance` with the shared `startPlan()` handler. The modern direct action neither renders nor depends on that checkbox. The prepared handler tolerates its absence. Caregiver progress and geographic sharing remain independent and off by default. No navigation-height or staff-action source changes are included.

## Verification

Final application SHA-256: `966e2caf655528724f842852caeb208cb7c61a99ed83c3aafb28dedb8097e343`.

| Check | Result |
| --- | --- |
| `npm run check` | 415 JavaScript tests, 44 Python tests, 99-asset build passed |
| Direct-start safeguards | 27 checks passed |
| Contrast and layout | 85 checks passed |
| R4 flow / R4 legacy | 34 / 37 checks passed |
| FR1 integration | 18 checks passed |
| R5 address / product / bus / bus-stop | 17 / 22 / 8 / 19 checks passed |
| R2 / R3 | 36 / 36 checks passed |
| Route map / service colours | 28 / 20 checks passed |

Total: **387 browser checks**, zero application errors on the final runs. Safeguards exercise the non-default selected local option, canonical route/context identity and preferences, double activation, stale detached actions, endpoint/date/time/preferences invalidation, active/paused replacement blocking, cancellation restoring a pending Start, unverified step-free rejection, save/disclosures, and an intentionally delayed successful provider reply after editing. Provider acceptance preserves geometry, source timestamps, civil timing and independent sharing defaults. Existing address coverage also checks actual offline restoration and recipient acceptance.

Computed styles cover full/simple guidance at desktop, 390px mobile and 320px with 200% text; targets fit without horizontal overflow or clipping. Visually reviewed captures: [mobile](evidence/pre-fr2-start-journey/simple-mobile.png), [desktop](evidence/pre-fr2-start-journey/full-desktop.png), [large text](evidence/pre-fr2-start-journey/simple-large-text.png), [disabled](evidence/pre-fr2-start-journey/full-mobile-disabled.png). [Verification metadata](evidence/pre-fr2-start-journey/verification.json), [computed contrast samples](evidence/pre-fr2-start-journey/contrast.json) and [safeguards](evidence/pre-fr2-start-journey/safeguards.json) retain the evidence.

Two setup-only failures were corrected: the legacy suite initially omitted the installed Edge executable, and the new safeguard helper initially relied on keyboard suggestion timing after invalid input. Final runs use installed Edge and explicit visible suggestion selection. R2's pre-existing seven-tab and suggestion-direction expectations were updated to the delivered eight destinations and selected bus-stop disclosure.

## Repeat and limits

Preview port is **4235**. Build with `npm run build`, set `PORT=4235`, and run `node scripts/serve.mjs`. For browser checks set `TEST_BASE_URL=http://127.0.0.1:4235` and `BROWSER_EXECUTABLE=C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe`, then run `node tests/pre-fr2-start-journey-browser.mjs` and `node tests/pre-fr2-start-contrast-browser.mjs`. Dependencies use the authorized absolute-target junction to `The-Rail-Pathfinders-judges/node_modules`.

Evidence uses installed desktop Edge with viewport/touch emulation and blocked street-map tiles. OneMap results are explicitly labelled controlled fixtures. Physical phones and live provider success were not tested. Existing indoor/accessibility/timing coverage limitations remain visible; the parallel navigation-height and location lifecycle refinements require the parent's combined integration check.
