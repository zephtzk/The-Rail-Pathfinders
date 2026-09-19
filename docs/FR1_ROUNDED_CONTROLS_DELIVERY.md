# FR1 feedback 5: rounded map and station controls

Implemented on `codex/fr1-rounded-controls`, based on `9c04b28f01b9ada8770e98906190699e1cc2e454`. Application changes are confined to `src/commute.css`.

Leaflet's later touch stylesheet reduced zoom links to 30px with 2px end corners. Scoped selectors now retain 44px targets, a 15px group outline, rounded outer link corners and a straight shared divider. An inset keyboard outline stays visible inside the clipped group; Leaflet's disabled colours remain intact.

Bus-stop popup actions, their close control, the Map/Station guide tabs and map retry control have consistent 12px corners. Popup actions and retry have 44px minimum heights. Existing selected states, keyboard navigation and actions are preserved. Mobile recenter moves below the taller zoom group only above 540px viewport height, where zoom is shown. No JavaScript, Facilities styles, map tile/canvas corners, text or routing data changed.

## Verification

- `npm run build`: passed, 95 assets.
- `node --test tests/network-map.test.mjs tests/bus-stop-map.test.mjs tests/guidance-r5.test.mjs tests/route-map.test.mjs`: 24 passed.
- Existing `tests/r5-journey-sheet-browser.mjs`: 39 checks passed, including touch/keyboard, Map/Station guide switching, desktop and 320px large text.
- Existing `tests/island-bus-browser.mjs`: 28 checks passed, including map-layer states and real Canvas popup interactions. A temporary copy redirected evidence into ignored `test-results`; assertions were unchanged.
- Existing `tests/r3-map-browser.mjs`: 5 checks passed for map fallback/retry and browser errors.
- Temporary rendered-control inspection: 25 checks passed; [results](evidence/fr1-rounded-controls/verification.json) include computed radii/targets, focus, selected/disabled states, real packaged stop selection, unrounded canvas and zero browser runtime errors.
- Final viewport spot check: 390×568 uses recenter top 198px; 390×450 and 390×360 retain baseline top 165px with zoom hidden.
- `git diff --check`: passed. Independent CSS review completed.

All browser checks used the local build at `http://127.0.0.1:4205` in headless installed Edge. Final application SHA-256: `9b4027f3fa8b2b3268a6f176670e1203573cbb8b5bf07e87069475bfb05eccc7`. Desktop captures are 1280×900; mobile captures use 390×900 touch emulation. Images below were opened and visually inspected. Map tiles were deliberately blocked for deterministic fallback; popup labels are real packaged bus stops. Existing regression suites use their explicitly labelled integration fixtures.

| Surface | Desktop | Mobile |
| --- | --- | --- |
| Map and keyboard zoom focus | [Image](evidence/fr1-rounded-controls/after-desktop-map-focus.png) | [Image](evidence/fr1-rounded-controls/after-mobile-map-focus.png) |
| Station tab selection/focus | [Image](evidence/fr1-rounded-controls/after-desktop-station-focus.png) | [Image](evidence/fr1-rounded-controls/after-mobile-station-focus.png) |
| Rounded popup actions/focus | [Image](evidence/fr1-rounded-controls/after-desktop-popup-focus.png) | [Image](evidence/fr1-rounded-controls/after-mobile-popup-focus.png) |

## Limits and integration

Physical phones, Safari and live providers were not tested. Existing very short/landscape viewports can place recenter over the journey sheet; this baseline behaviour is unchanged and is outside this radius fix. The mobile popup capture uses the existing compact sheet to show the full popup clearly. Full application check suites were not rerun for this CSS-only change.

No push, PR, merge or deployment was performed. The parent FR1 task owns integration and publication; the public baseline is unchanged.
