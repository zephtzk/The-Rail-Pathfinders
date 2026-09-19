# FR2 search delivery

Based on `f78882b`, branch `codex/fr2-search`, assigned worktree `The-Rail-Pathfinders-fr2-search`. No deployment, shared Git configuration, or other worktree changes.

## Delivered

- Removed the healthy “Location on · ±…” banner while retaining the shared location watch, approximate map marker, guidance estimation and Settings controls. Denied/unavailable/off/low-accuracy states retain an explanation and a direct Location settings action. Location never enables caregiver sharing.
- Removed the separate street-address card. Starting from and Where to now share one station/bus/saved-place/address suggestion flow. Each dropdown includes an explicit OneMap lookup of its current query. Typing and selecting local saved labels do not send them to a provider. Local bus road-name matching remains supported by the existing source catalog.
- Added clear controls and accessible arrow/Enter/Escape behavior, independent origin/destination search cancellation, stale result rejection after edit/clear/blur/swap/view changes, and cancellation-safe loading messages. Selected addresses retain full public address text and actual coordinates; no station snapping or inferred accessibility.
- Existing `calculate()` routes two local endpoints through the local multimodal planner and any selected address through OneMap with both endpoint coordinates and travel settings. Provider plans retain their original provenance and estimated/unverified states. Cached search results are explicitly labelled; cached address selection does not imply offline route calculation.
- Address layout rules are isolated in `src/address.css`; the swap button has its own space so clear controls remain usable. No general journey-sheet styling changed.

## Integration interfaces

`src/address-ui.js` exports `mountEndpointSearch({field, box, status, clear, getSuggestions, isSelected, onEdit, onChoose, search?})`, returning `reset`, `refresh`, and `close`. Each field owns a OneMap client. Search is deliberately explicit to preserve the existing saved-place privacy contract.

Browser selectors: `#origin` / `#destination`; `#<role>-address-search`; `#<role>-suggestions [data-address-index="0"]`; `#<role>-clear`; `#<role>-search-status`. `#app-location-status` retains `data-usable` for lifecycle observation but is hidden when usable. Legacy browser tests were updated to the new controls and hidden-success status contract.

`src/address-search.js` adds `searchCached: true` only to cloned cached OneMap results. `src/address-routing.js` and all fare logic are untouched for the fare branch. Shared-file changes in `src/commute-ui.js` are limited to search imports/state/template, endpoint handlers, view/reset integration, and the location status subscriber.

## Validation

- `npm ci --offline` succeeded.
- `npm run check` passed: 458 Node tests, rail/bus import and walking metadata tests, syntax/upgrade checks, and build.
- `tests/fr2-search-browser.mjs`: 24 checks covering local station pairs, station/address in both directions, two addresses, selected coordinate swap, clear/unconfirmed input, delayed edit/clear/swap, cached offline selection, honest offline route fallback, provider failure/retry, keyboard selection, blur cancellation, hidden success location status, denial recovery, and 320px enlarged text.
- Browser regressions passed: `r5-address-browser` (17), `pre-fr2-location-browser` (50), `pre-fr2-start-journey-browser` (29), `route-map-browser` (28), `train-service-colours-browser` (20). `pre-fr2-compact-tabs-browser` received only the removed-disclosure selector update and syntax validation.
- Edge executable: `C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe`; dedicated server: `http://127.0.0.1:4241`. Evidence and screenshots: ignored `test-results/fr2-search/`; build output remains ignored.

## Limits

Browser address results/routes are explicitly synthetic provider fixtures. No live OneMap, physical phone, or real-travel validation is claimed. Fresh street-address search and routing require the existing server OneMap credential; absent credentials retain the provider-unavailable message and local station/bus fallback. There is no credential provisioning in this branch. The existing adapter can normalize an upstream HTTP-200 error envelope as an empty search result; that pre-existing adapter concern is outside this UI change and should be considered when credentials are configured.
