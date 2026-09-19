# FR1 feedback 3: simple guidance by default

Simple guidance now defaults to on when the presentation preference is missing,
uninitialized, invalid, or unreadable. A valid saved `simpleGuidance: false`
still selects full guidance. Reading preferences does not write or migrate
storage; both explicit settings persist through reloads.

The only production change is the default in `src/presentation-preferences.js`.
Both readers (`commute-ui.js` and `copilot-ui.js`) already use that shared API.
Settings markup, accepted journeys, travel preferences, and route logic are
unchanged.

## Verification

- `npm test`: 387 passed, including 11 guidance tests covering invalid/missing
  preferences, both explicit values, independent journey storage, rejected input,
  and failed writes.
- `npm run build`: passed, 95 assets.
- All eight R5 browser suites: 163 checks passed. Integrated guidance covers a
  fresh default, real toggles both ways, reload persistence, and preservation of
  the accepted journey. Full-guidance suites opt in explicitly where they test
  controls or the trip peek that simple guidance intentionally hides.
- `npm run test:r4-browser`: 116 checks passed.
- `tests/r3-browser.mjs`: 36 checks passed.
- `tests/upgrades-browser.mjs`: 18 checks passed.
- Inspected mobile screenshots of the fresh simple default and restored full
  guidance, plus the reachable primary action at 320px / 200% text. No browser
  runtime errors were reported by the passing suites.

App checks used the hidden local preview on port 4203. The standalone guidance
fixture also used 4203 after stopping that preview, via `GUIDANCE_TEST_PORT`.
Its default remains an ephemeral port for normal suite execution. Existing R4
spending tests additionally manage their own isolated fixture server.

Reload naturally marks geolocation as stopped through the existing visibility
privacy handler. Reload assertions allow only that field to change; immediate
toggle assertions require the entire saved journey to remain identical.

## Remaining limits

`tests/r2-browser.mjs` stops at its existing “bus suggestions include terminal
direction and code” assertion. The same failure was reproduced with the original
HEAD test and original full-guidance default module, before reaching the changed
journey controls. This unrelated assertion was not changed.

Full-guidance setup was also adapted in `r3-current-trip-browser`,
`location-offline-browser`, and `sharing-privacy-browser`; those three lifecycle
suites were not rerun. Browser verification uses desktop Edge with mobile/touch
and enlarged-text emulation, not physical devices. Synthetic accepted journeys
and provider fixtures remain test fixtures. Logs and captures are local ignored
artifacts under `test-results/`.

No push, pull request, merge, or deployment was performed. Parent FR1 integration
owns publication.
