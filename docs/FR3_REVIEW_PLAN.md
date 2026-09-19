# FR3 review implementation

This phase implements the user's FR3 feedback on the public version 7 baseline (`641f0ba`). The earlier `FR3_DELIVERY.md` records publication of the FR2 changes for FR3 review; this document tracks the changes requested during that review.

## First release: items 1–8

- Select My location in both origin and destination address fields.
- Compact network status and expandable location-services icon in the top bar.
- Put Save route and Start journey immediately below Suggested route.
- Display End trip, Pause trip and Cancel trip directly in Current trip.
- Remove redundant interface explanations across tabs, including timing assumptions and sources; retain actionable errors, route state and estimate labels.
- Keep coverage and route-map explanatory sections in documentation only.
- Dismiss yellow usage-instruction cards for the current session through an accessible close control.
- Show a horizontal sheet grabber above the Map and Station guide controls; reduce control padding while retaining usable touch targets.

The implementation is divided into the My location/status, clean tabs/journey controls and session guidance work tasks. Each uses a separate checkout. The integration task verifies their combined behavior and publishes the first release.

## Second release: item 9

Only after the first release is successfully published, add a Settings text-size slider. Test every tab and important content states at compact, default and enlarged sizes on narrow phones, wider phones and desktop. Preserve preferences and the existing simple-guidance setting. Publish the extension after its checks pass.

## Verification

Run the repository checks, focused browser tests for new behavior, relevant journey/location/storage regressions and responsive layout checks. Use explicitly controlled browser geolocation fixtures for successful/denied/unavailable states; do not claim physical-device GPS validation. Save exact deployment receipts for both stages.
