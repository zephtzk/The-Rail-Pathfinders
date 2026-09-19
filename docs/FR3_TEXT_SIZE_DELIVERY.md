# FR3 item 9 — Settings text size

The Settings text-size slider supports **80–200% in 10% steps**, with a visible percentage, Compact / Normal 100% / Larger cues and a keyboard-operable Reset to default button. It applies immediately across all eight navigation views. The requested range was retained.

The publication prerequisite was satisfied before implementation: Sites v8 succeeded at `2026-09-19T05:57:34.467Z`, source `d0a61c2835da0365a53f66c8304831150af67099`. See [the publication receipt](evidence/fr3-review/stage1-publication.json). Work took place only in the prepared `codex/fr3-text-size` checkout, starting at `326d9c0761150f1620e6badd84f0d44b75608a52`. The parent task owns integration and publication.

## Behavior and storage

- A labelled native range supports arrows, Home, End and normal Tab navigation. Dragging updates the existing control without replacing it or losing focus. Its touch area is at least 44 CSS pixels high.
- Percentage-based root sizing respects the browser's default text size; inherited body text and app-owned map labels also scale. Legacy `.large-text` selectors cannot override an active slider.
- The existing `commute-copilot-presentation-v1` storage key now holds schema 2: `{schemaVersion:2,simpleGuidance:true,textSizePercent:100}`. Schema 1 preserves its guidance choice and reads as 100%, without a read-time write. Invalid fields default independently.
- Simple guidance, route preferences, accepted journeys and instruction-card dismissals remain independent. Reset changes text size only.
- Corrupt or unavailable storage cannot prevent startup. Failed or unconfirmed writes still apply for this page session and display a save-failure message. The companion receives the same in-memory display preference even when accessing the localStorage property itself throws. Persistence across reload requires working browser storage.

## Reflow

Header clearance is measured for every view, including tool tabs. Navigation height and journey/map measurements update after text changes. Labels, cards and form pairs wrap; the location popover retains its existing measured viewport fit.

On mobile screens no taller than 540px, the journey panel becomes the single scroller, allowing its map tabs to scroll out of the reading area. At 640×360 and 200%, the measured usable area improves from 49px to 145px. Station guide joins this scroller in short landscape, then returns to its map surface after rotation. All eight main navigation destinations remain reachable. These changes support enlarged text without changing routing or journey progression.

## Verification

The native slider drives the entire matrix: **320×844, 390×844, 640×360 and 1440×960**, each at **80%, 100%, 140% and 200%**, for all eight rendered tabs with both a planned and an active journey. Coverage includes long synthetic addresses, saved cards, expanded disclosures, dismissible cards, location popovers, keyboard input, reset/reload, migration, corrupt and blocked storage, guidance independence and accepted-journey preservation.

| Check | Result |
| --- | --- |
| `npm ci --offline` | Passed; four packages installed |
| Preference and guidance unit tests | 23 passed |
| `npm test` | 548 passed |
| `npm run test:fr3-browser` | 146 passed; existing location, cleanup and instruction-card behavior retained |
| Text-size browser matrix | 2,011 checks passed; 276 rendered measurements; no uncaught browser errors |
| Focused Station guide and rotation | 16 passed |
| Actual enlarged Edge default font | 52 passed across eight views at 320×844 |
| `npm run build` | Passed; 122 assets |

Evidence and selected visually inspected screenshots are in [evidence/fr3-text-size](evidence/fr3-text-size/results.json). Full diagnostic measurements remain in ignored `test-results/fr3-text-size/`. Reproduce with installed Edge, `BROWSER_EXECUTABLE=C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe`, `PORT=4254`, `TEST_BASE_URL=http://127.0.0.1:4254`, then `npm run test:fr3-text-size-browser`. The test supports `FR3_TEXT_SIZE_SCENARIO` and `CAPTURE_DIR` for focused reruns.

The text-size checks total **2,079 passes and 284 rendered layouts**, with 20 screenshots captured. A fresh isolated Edge profile sets its actual default font to 32px: the 100% slider produces 32px root/body text, 80% produces 25.6px, and Reset restores 32px without injected CSS. This runs separately from the explicitly labelled supplemental root-text emulation.

Browser tests use installed Edge and Playwright viewport/touch emulation, a fixed supported rail date, blocked street tiles and labelled synthetic address responses. They do not establish physical-device, screen-reader, live-provider or OS text-scaling validation.
