# FR1 feedback 7 — prominent Current trip and distinct tabs

Based on published main `9c04b28f01b9ada8770e98906190699e1cc2e454`, on `codex/fr1-current-tab`. Preview: `http://localhost:4208`. Navigation layout only; Facilities content belongs to the separate FR1 task.

## Result

- Primary row: **Plan · Current trip · Saved routes**. Current trip stays geometrically centered, 30% wider than either neighbor, with a 76px minimum height and 28px icon in regular portrait/desktop layouts.
- Every destination has a separate bordered surface. Primary gaps are 8px; utility gaps are 6px. At 320px, utilities wrap into roomy rows instead of touching neighboring labels. No horizontal navigation scrolling or More menu.
- Current trip remains outlined when another page is selected; only the selected Current trip fills blue. Existing `aria-current`, heading focus, keyboard order and visible focus rings remain intact.
- Desktop retains the existing side-panel navigation dock. At 200% text, utility labels remain visible while their decorative icons are omitted to preserve content space. Every target remains at least 44 × 44px.
- Measured navigation height still drives the journey sheet and trip preview. Toasts clear the taller dock. Mobile padding honors independent left/right and bottom safe areas.

## Tribecar reference

Inspected Tribecar Pte Ltd's [official Google Play screenshots](https://play.google.com/store/apps/details?id=com.tribecar.app), especially the “Just Passed Your Test? Drive Today!” visual, on 19 September 2026. Its enlarged blue central Home control inspired the prominence. This implementation uses this app's own rounded shape, explicit Current trip label, palette and accessible spacing; it does not claim exact Tribecar dimensions or copy its artwork.

## Facilities integration

Add `['facilities', '<the Facilities icon key>', 'Facilities']` first in the `tools` group at the navigation template in `src/commute-ui.js`, then remove its integration comment. Preserve the three `journey` destinations and the measured `--nav-height` observer. All current navigation handlers already select descendants of `.app-nav`.

The branch ships the seven working destinations. The browser suite also intercepts only the navigation template to render an eighth Facilities button for spacing checks. It never clicks that fixture or pretends to supply Facilities content. After integration the suite reuses the real Facilities navigation entry. Parent must verify the real Facilities page and revise any older seven-button assertion in `tests/r3-browser.mjs`.

## Verification

- `npm run build`: passed, 95 assets. Application SHA-256: `55331f63180017a80cae8eba58caf5109caa0266a65cdf9f2f8c30db3cc4d2fe`.
- `node tests/fr1-current-tab-browser.mjs`: **81 checks passed**, covering actual seven destinations and the eight-destination layout; desktop 1440 × 960, 390 × 844, 320 × 844, 320/390 at 200% text, existing large-text CSS, 640 × 360, keyboard activation, heading focus, selected state, label bounds, 6px separation, touch targets, desktop toast placement and asymmetric safe-area emulation (12px left / 20px right / 34px bottom).
- `TEST_BASE_URL=http://127.0.0.1:4208 node tests/r5-journey-sheet-browser.mjs`: **39 checks passed**. Existing pointer/touch/keyboard, normal/expanded/compact, trip preservation and enlarged-text checks remain valid. Two old tests now wait for measured navigation height instead of assuming three CSS grid columns.
- `TEST_BASE_URL=http://127.0.0.1:4208 node tests/r5-bus-stop-browser.mjs`: **19 checks passed**. An independent rerun with the eighth navigation-only Facilities fixture passed the same **19 checks**, including the complete long service-direction text above the current-trip preview at 320px / 200% text. [Eight-destination results](evidence/fr1-current-tab/bus-stop-eight-layout-results.json) and [readable direction screenshot](evidence/fr1-current-tab/eight-layout-readable-direction.png) preserve this check.
- `node --check src/commute-ui.js` and `git diff --check`: passed.

Browser screenshots were visually inspected, including [desktop](evidence/fr1-current-tab/application-desktop.png), [390px application](evidence/fr1-current-tab/application-390.png), [eight destinations at 390px](evidence/fr1-current-tab/eight-layout-390.png), [eight at 320px](evidence/fr1-current-tab/eight-layout-320.png), [eight at 320px / 200%](evidence/fr1-current-tab/eight-layout-320-large.png), and [keyboard focus](evidence/fr1-current-tab/eight-layout-focus.png). [Detailed navigation results](evidence/fr1-current-tab/navigation-results.json) record measured geometry.

Evidence uses desktop Edge touch/mobile emulation with a controlled street-map fallback. Physical iPhone/Android testing remains **NOT TESTED**. Facilities screenshots are explicitly navigation-only fixtures. No push, PR, merge or deployment was performed.
