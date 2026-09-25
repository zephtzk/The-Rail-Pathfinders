# Companion candidate: final parent review

Reviewed on 25 September 2026 after all three GPT-6 Astra / Medium work chats completed. The candidate branches from public main `c1d77d8a85c82a705995dd6143f28317b4d246bd`. Main and the existing production deployments are not changed by this work.

## Corrections after integration

The integrated candidate at `4771cbed7bf93e409a181264935b839408b517df` exposed two navigation gaps. Facilities opened the top of Services rather than its actual facility controls. Disruptions opened general notices even when a reroute comparison required the traveller's decision. Both failures were reproduced with browser assertions before correction.

Facilities now scrolls to and focuses an accessible Nearby lifts and toilets region. Disruptions focuses the current trip comparison when available, and otherwise focuses official service notices. Regression assertions cover both mobile widths and the cancel/accept flow.

## Validation

- `npm run check`: 563 JavaScript tests, 44 Python tests (27 rail, 16 bus, 1 walking), and production build passed; 132 assets built.
- Parent integrated browser suite: 119 checks passed, zero failures and zero runtime errors. Fresh contexts covered 320/390 px, 80–200% text, keyboard controls, persistent Settings, separate feature icons, keep/accept behaviour, accepted-only Maps links, sharing privacy/recipient isolation, spending and synthetic share cleanup.
- Integration owner separately reported all 33 existing FR2 demonstration browser checks passed before the two parent navigation corrections.
- `git diff --check` passed. Parent visually checked the built candidate and the focused facility region.

Parent browser command (PowerShell, with the reviewed build served locally):

```powershell
$env:TEST_BASE_URL='http://127.0.0.1:4186'
$env:CAPTURE_DIR='test-results/parent-review'
npm run test:companion-browser
```

Port 4186 was used for the final independent review to avoid the earlier integration server on 4187. Normal candidate startup remains `npm run dev:companion` on 4187. Review SQLite storage was separate and synthetic. An earlier review on port 4190 failed because Node's HTTP client prohibits that port; its synthetic database was removed after stopping that server. The full suite then passed on 4186. Test logs and screenshots are generated in ignored `test-results`, not committed as application source.

## Actual delivery limits

The runnable local candidate and public source are ready for review. The separate owner-private Sites project is registered at version 0 but remains unpublished. Its new D1 binding has not been provisioned or verified. The Sites hosting skill listed in this session was missing at its declared location and was not found in the installed plugin cache, so the parent review did not attempt an unsupported deployment.

Live OneMap, LTA notices and LTA facilities checks returned explicit unavailable states because their runtime credentials are not configured in this isolated candidate. Existing adapters remain intact; credentials and production data were not copied. Static-data planning and the labelled disruption rehearsal remain testable without keys. Configuring a candidate credential is separate from proving a successful live API response.

Maps tests verify the explicit user-clicked walking URL for the accepted next boarding point and unchanged journey/progress after return. They intercept the external navigation and do not prove a physical native-app launch. Cross-app overlays, home-screen/control-panel toggles and exact transit-itinerary injection are not implemented. The companion operates inside the web app.

The 25 September rehearsal becomes historical on later dates; the handoff then requires a supported journey dated today. Do not present the fixed rehearsal as current live travel advice.
