# FR1: remove the map route legend card

The screenshot feedback at x 31.6%, y 17.6% identifies the white BP / Route details card. Remove this persistent overlay to expose more of the map.

## Implementation

- Normal maps no longer display the route legend or approximate-path disclosure over the map.
- The route key, geometry explanation and OneMap attribution remain available in a collapsed **About this route map** disclosure at the end of the Plan / Current trip journey panel.
- Route paths, service badges, endpoints and map controls are preserved. Map failure messaging and the deliberate **Retry street map** action still work.
- Independent branch: `codex/fr1-map-overlay`, based on FR1 baseline `9c04b28`. Integrate this commit into `codex/fr1-integration`; no standalone public deployment was made.

## Verification

- `node --check src/commute-ui.js`, `npm run build`, and `git diff --check` passed.
- Existing `tests/route-map-browser.mjs`, `tests/r3-map-browser.mjs`, and `tests/r5-address-browser.mjs` passed against port 4229. Checks include preview, accepted journey, restored journey, provider attribution, failed map tiles and successful retry.
- BP1 to BP10 visually inspected at 390 x 844. Also checked 1440 x 960 and 320 x 740 with 200% root text for absence of the card and horizontal document overflow. No application runtime errors.
- Screenshots: [mobile](evidence/fr1-map-overlay/bp-route-mobile.png), [desktop](evidence/fr1-map-overlay/bp-route-desktop.png). Browser emulation with neutral synthetic map tiles; not a physical-phone check.

## Integration notes

The production diff touches the shared `src/commute-ui.js` template/drawMap function and the three existing map-note CSS rules. Preserve the other FR1 navigation/settings/current-step changes. The address browser test changes only the map-details selector and assertion; preserve FR1's current-step selector adaptations when combining that test.
