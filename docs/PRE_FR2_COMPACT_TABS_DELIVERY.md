# Pre-FR2 refinement 1 — compact navigation

Implemented on `codex/pre-fr2-compact-tabs`, from integrated FR1 commit `0a3bfa1264dec93b2f7a5b58f8650c68224f84e9`. This is preparation for FR2; FR2 tester sessions have not run.

The eight direct destinations now occupy a 123px dock at 320/390px. The centered Current trip is 30% wider and 56px tall beside 48px primary tabs; utilities retain 44px targets. Each tab keeps its border, 6–8px separation, selected state and keyboard focus. Smaller primary icons, text-only utilities, less padding and removal of the redundant row divider recover space. Utility labels increase from `.7rem` to `.75rem`; no destination or label is removed. At 200% text, decorative primary icons disappear and labels wrap into additional rows. Short landscape uses content-sized utility widths.

Only navigation rules in `src/r5.css` changed. Navigation markup, application location/staff logic, `--nav-height` observation, journey-sheet code and independent safe-area padding remain unchanged.

## Measured result

The comparative browser test intercepts only the integrated FR1 `r5.css` for its before pass, then loads the actual new CSS. Both passes use the same screens and a labelled Current-trip layout fixture, with default sheet position and zero content scrolling.

| Viewport / text | Dock before → after | Default Plan/Current reading area before → after |
| --- | --- | --- |
| 390 × 844 | 174.9 → **123px** | 293.6 → **345.5px** |
| 320 × 844 | 224 → **123px** | 244.5 → **345.5px** |
| Desktop 1440 × 960 | 178.9 → **124px** | 600.1 → **655px** |
| 320 × 900 / 200% | 282.2 → **244.2px** | 187.4 → **225.4px** |
| 390 × 844 / 200% | 232.2 → **194.2px** | 229.3 → **267.3px** |
| 640 × 360 | 134 → **117px** | 53 → **70px** |
| 640 × 360 / 200% | 184 → **117px** | 29 → **40.1px** |

At 320px, Plan now fully shows its endpoint-help text, Current fully shows the current instruction, and Facilities fully shows the availability caveat without scrolling. At 390px, the address disclosure and Current's indoor-guidance warning title also become fully visible. Facilities gains 101px / 51.9px of reading area at 320 / 390px. [Measurements and content assertions](evidence/pre-fr2-compact-tabs/content-and-navigation-results.json) include all three views, enlarged-text setting and label geometry.

Visually reviewed: [Plan before](evidence/pre-fr2-compact-tabs/before-plan-320.png) / [after](evidence/pre-fr2-compact-tabs/plan-320.png), [Current before](evidence/pre-fr2-compact-tabs/before-current-320.png) / [after](evidence/pre-fr2-compact-tabs/current-320.png), [Facilities before](evidence/pre-fr2-compact-tabs/before-facilities-320.png) / [after](evidence/pre-fr2-compact-tabs/facilities-320.png), [desktop](evidence/pre-fr2-compact-tabs/plan-desktop.png), [200% text](evidence/pre-fr2-compact-tabs/plan-320-large.png), [landscape](evidence/pre-fr2-compact-tabs/plan-landscape.png), [landscape at 200%](evidence/pre-fr2-compact-tabs/plan-landscape-large.png), [safe areas](evidence/pre-fr2-compact-tabs/safe-area.png), and [focus](evidence/pre-fr2-compact-tabs/keyboard-focus.png).

## Checks and limits

- `npm run build`: passed, 99 assets. Application SHA-256 `f0e5fb2589a319994759cbd32b30f26e7ee032f7610ff5d75663776dded6900f`.
- `node tests/pre-fr2-compact-tabs-browser.mjs`: **156 checks**, including all eight destination activations, default content, borders, gaps, labels, touch targets and measured height.
- Existing FR1 navigation **81**, R5 journey sheet **39**, R5 bus-stop/large-text trip-preview **19**, and real-route FR1 integration **18** checks passed on the final build. The full FR1 suite also passed during implementation.
- `node --check tests/pre-fr2-compact-tabs-browser.mjs` and `git diff --check`: passed. Independent CSS/test review found no actionable issues.

Desktop Edge with touch/mobile, root-font 200% and safe-area emulation; street tiles deliberately blocked. The integration walkthrough uses the packaged CC26 → EW9 route; comparative Current screenshots use an explicit layout fixture. No physical-phone or live-provider success is claimed. At 200% portrait text and short landscape, default Plan/Current still show mainly headings; scrolling and, in portrait, sheet expansion remain necessary. The combined 640 × 360 / 200% reading area remains particularly constrained at about 40px. Broader header/map/content density is outside this navigation-only refinement.

Local preview: `http://localhost:4231/`. Repeat with `TEST_BASE_URL=http://127.0.0.1:4231`; the new comparison suite defaults to that port and reads the original FR1 CSS from Git. No push, PR or deployment was performed.
