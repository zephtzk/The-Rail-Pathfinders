# Final Review 1 — integrated candidate

All eight FR1 changes are implemented together on `codex/fr1-integration`, from published main `9c04b28f01b9ada8770e98906190699e1cc2e454`. Each implementation has its own task, branch and retained delivery note; [FR1_PLAN.md](FR1_PLAN.md) lists them. The public R5 deployment and illustrated PDF remain the historical baseline. This candidate has not been deployed publicly or incorporated into that PDF.

## Result

- Settings travel-style cards show descriptions only when expanded. Expansion is independent of preference selection.
- Facilities offers a fixed 1 km search, nearest-first list/map, lift/toilet filters, explicit location and manual area selection. The directory contains 182 sourced records: 112 lift-exit references and 70 toilet locations.
- Simple guidance defaults on. Explicit saved on/off choices survive reloads.
- Journey completion controls say **Finish journey**.
- Map and station controls have consistent rounded outer corners, usable targets and visible focus.
- **Update my current step** opens a dropdown with a compact adjacent confirmation tick. Pending selection and focus survive routine refreshes; only confirmation changes progress. Staff assistance remains available separately.
- Current trip is larger and centered, with clearly separated tab areas. The real Facilities destination is integrated into the utility group; all eight destinations remain directly accessible.
- The oversized route-details map overlay is removed. **About this route map** keeps route information and attribution in a collapsed panel disclosure; failed-map retry remains available.

## Verification

The final application SHA-256 is `ed7492027e418df0d7b6802eb67fc325ed9f75f47801303cdbcf36812bca4a45`.

| Combined-build check | Result |
| --- | --- |
| `npm run check` | 415 JavaScript tests, 44 Python tests, 99-asset build passed |
| FR1 current-step / nearby-facilities / navigation / real-route walkthrough | 79 / 40 / 81 / 18 checks passed |
| R4 browser suites | 116 checks passed |
| R5 browser suites | 163 checks passed |
| R3 app, route-map, map-retry and location/offline suites | 80 checks passed |
| Existing station/toilet facilities browser flow | Passed |
| Independent final integration review | No actionable findings |

The 577 counted browser checks cover both actual packaged routes and explicitly labelled controlled fixtures. The combined walkthrough plans CC26 to EW9 for 21 September 2026 at 10:00 SGT, updates its canonical checkpoint, opens real Bugis facilities without changing the accepted journey, verifies all eight destinations, and finishes the trip. One initial walkthrough assertion read rendered text from inside closed details; it was corrected to inspect text content and the final walkthrough passed. No application change was needed for that assertion correction.

Browser evidence uses installed desktop Edge with mobile/touch, keyboard, offline, 320px/200% text and safe-area emulation. Street-map tiles were deliberately blocked in combined captures. Physical iPhone/Android testing is not recorded. Earlier per-feature attempts and their baseline-only failures remain documented in the feature notes; the final combined R4/R5 runs passed.

[Verification metadata](evidence/fr1-integration/verification.json) records counts and build identity. Visually reviewed captures: [current-step picker](evidence/fr1-integration/current-trip-mobile.png), [Facilities list](evidence/fr1-integration/facilities-list-mobile.png), [Facilities map fallback](evidence/fr1-integration/facilities-map-mobile.png), [enlarged text](evidence/fr1-integration/combined-large-text.png), [desktop](evidence/fr1-integration/combined-desktop.png), and [Settings](evidence/fr1-integration/settings-mobile.png).

## Review and repeat

The local preview is `http://localhost:4227/`. Start the built app with `PORT=4227` in the environment and `node scripts/serve.mjs`. Run browser suites with `TEST_BASE_URL=http://127.0.0.1:4227` and, when needed, `BROWSER_EXECUTABLE` pointing to installed Edge. `npm run test:fr1-browser` runs all four FR1 browser suites. `npm run test:r4-browser` and `npm run test:r5-browser` retain the broader regressions.

Facilities coverage is partial and static. Station pins represent sourced station/exit references, while NParks toilet pins are published points; these are not verified walking directions. The hosted runtime has no LTA maintenance key, individual provider lift IDs have not been invented, and no toilet-status feed is available. The UI preserves unknown/stale status instead of implying operation. Details and source exclusions are in [FR1_FACILITIES_SOURCES.md](FR1_FACILITIES_SOURCES.md).

## Source branches

| Implementation | Source commit |
| --- | --- |
| Settings | `19033b49cc32f4af06bf70b2c860f77f0b667373` |
| Facilities | `6f2c9928ee26545d477fe24fdc2887bd52146ab3` |
| Simple default | `0f180073b9712514075efbd075d488982f0abf79` |
| Finish label | `5a291149142708e67104fb7198d6a4e9420fdebe` |
| Rounded controls | `ec17f0c367b29528a53bc30825eb70bcab53e8fb` |
| Current step | `dfde679f6ba6c6f1766ca9a5870fdc9dd34b48ba` |
| Current trip tab | `b88cc74ad84a3da6ae329a1e37c5fa464c73d5ef` |
| Map overlay | `9111fd689d0834b6e8295d829fcab403ac042032` |
