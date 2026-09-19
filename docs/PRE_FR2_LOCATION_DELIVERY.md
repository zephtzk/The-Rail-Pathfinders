# Pre-FR2 location assistance refinement

Implemented after the complete FR1 integration (`0a3bfa1264dec93b2f7a5b58f8650c68224f84e9`). FR2 tester sessions have **not** run. Work stays local on `codex/pre-fr2-location`; no push, PR or deployment.

## Behavior

- One app-level foreground browser location session starts at load, before a trip. Fresh positions and accuracy appear on the main map. The compact global status avoids a repeated explanation on every page; Settings contains full status and stop/retry controls.
- Facilities consumes the same session, automatically searching the fresh device area. Manual area overrides, filters, selected facilities and focused controls survive GPS updates. Station diagrams retain their explicit floor/checkpoint/toilet confirmations and consume shared location without implying indoor precision.
- Collection stops while hidden and resumes the same enabled foreground session with a new fix. Epoch checks reject late callbacks. Explicit disable survives reload and propagates across documents. Denied/unavailable states offer manual recovery without automatic retry loops. Finishing/cancelling stops the current session without saving a durable app opt-out.
- The main journey instruction may show an **Estimated outdoor step** when the position is at most 60 seconds old, accuracy is at most 50 m, and supported geometry is geographically and sequentially unambiguous. Actual provider traces and individually reviewed exterior paths retain canonical indices; schematic connections cannot establish progress. Boundaries, loops, overlapping paths, unknown transfers, indoor steps, waiting and rides do not infer boarding or completed travel.
- Estimates never mutate canonical checkpoints, accepted routes, detours, reroutes, fares or journey status. Current trip distinguishes estimates from accepted guidance; Show to staff presents the estimate separately from its accepted instruction and preserves the selected staff message during GPS refresh.
- Usable outdoor assistance removes repeated prominent checkpoint prompts. A compact correction disclosure remains; indoor/boarding confirmations and denied/unavailable recovery remain available. Modern route-check tools and the retained legacy multimodal page follow the same rule and preserve focused corrections.
- Caregiver permissions remain independent. Signal loss, suspension and explicit cross-document stop clear retained coordinates. Stop privacy updates remain pending when unavailable; request tokens prevent an earlier location-stop response from clearing a later cancellation/revocation request.

## Files

Core: `src/location-assistance.js`, `src/location-progress.js`, `src/location-ui.js`, `src/location.css`.
Consumers: `src/commute-ui.js`, `src/copilot-ui.js`, `src/facility-ui.js`, `src/nearby-facilities-ui.js`, `src/nearby-facilities.css`, `src/rerouting-ui.js`, `src/journey-ui.js`.
Tests add permission/lifecycle/projection coverage plus cross-tab, privacy, legacy and offline browser flows; superseded per-trip opt-in assertions were updated. `package.json` adds `test:pre-fr2-location-browser`.

## Verification

- `npm run check`: **454 JavaScript tests, 44 Python tests, 102-asset build passed**.
- `npm run test:pre-fr2-location-browser`: full location, Facilities, privacy, offline and legacy-control suites passed; individual counts are in [verification.json](evidence/pre-fr2-location/verification.json).
- Existing FR1 current-step **80**, real-route integration **18**, sharing privacy **8**, and current-trip cancellation/completion **8** checks passed. Existing indoor facilities browser flow passed.
- The browser suite exercises the actual browser Geolocation API with a browser-controlled position, then labelled synthetic route/GPS fixtures. Offline reload, service-worker cache verification and same-origin cross-document storage events are real browser operations. Controlled local sharing responses exercise failure/retry; local sharing tests exercise online and offline cancellation.
- Visually inspected [startup map](evidence/pre-fr2-location/startup-browser-position.png), [estimated outdoor step](evidence/pre-fr2-location/outdoor-estimated-step-mobile.png), [indoor confirmation](evidence/pre-fr2-location/indoor-confirmation-mobile.png), [320px/200% text](evidence/pre-fr2-location/large-text-current.png), [Facilities list](evidence/pre-fr2-location/facilities-mobile.png), [Facilities map fallback](evidence/pre-fr2-location/facilities-map-mobile.png), [enlarged Facilities](evidence/pre-fr2-location/facilities-large-text.png) and [pending privacy stop](evidence/pre-fr2-location/settings-pending-stop-mobile.png).

Run the built preview with `PORT=4233`, `HOST=127.0.0.1` and `node scripts/serve.mjs`; launch hidden on Windows. Set `TEST_BASE_URL=http://127.0.0.1:4233` and `BROWSER_EXECUTABLE` to installed Edge when running browser suites.

## Limits and integration notes

No physical phone, actual walking, provider location accuracy, live address routing or caregiver delivery was verified. Most packaged reviewed exterior links are short, so typical GPS is often insufficient for a step estimate; accepted guidance and manual correction remain the honest fallback. Enlarged text remains scrollable and controls reachable; the separate navigation refinement belongs to the parent integration.

The broad R5 run passed the product, arrivals and guidance sections, then timed out waiting for the address-route sharing invitation after Create recipient link. Its full suite is therefore **not** claimed passed; the parent will run combined regressions. An earlier arrivals-refresh regression from GPS render gating was fixed and the arrivals section passed on rerun.

The historical R2 browser suite passes five checks then stops at its obsolete expectation that bus directions appear inline in suggestions. The current R5 design exposes those details after selecting a stop. This unrelated baseline assertion was not weakened. Initial focused review caught and fixed the pending-permission visibility race, retained-coordinate privacy issue, GPS focus churn and cancellation privacy race; their regressions now pass.

The parent must combine the removed per-trip location checkbox and shared location attachment with the separately implemented direct Start journey path in `copilot-ui.js` / `commute-ui.js`. No navigation order CSS or staff tick markup was changed here.
