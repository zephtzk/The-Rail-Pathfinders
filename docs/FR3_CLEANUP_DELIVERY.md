# FR3 layout and copy cleanup

Implemented items 3, 4, 5, 6 and 8 from the FR3 review in `codex/fr3-cleanup`, based on published v7 commit `641f0ba`. Integration and publication belong to the parent task. This branch does not add a text-size slider or change header search/location behavior or instruction-card dismissal.

## Changes

- Save route and Start journey immediately follow the selected route card, before other route information. Initially this is Suggested route. Selecting another option moves the same controls beneath that option, so the accepted route remains explicit.
- Current trip always exposes End trip, Pause trip and Cancel trip in both guidance modes. Paused journeys show Resume trip. The More journey actions disclosure is removed; cancellation confirmation and trip state transitions are retained.
- Removed tab introduction paragraphs, repeated save/start instructions, redundant empty-state how-to copy, the Timing assumptions & sources disclosure, and nonessential explanations in Saved routes, Services, Spending and Show to staff.
- Removed the unconfirmed-position paragraph and fallback location explanation before Update my current step. Actual location estimates remain labelled. Last-confirmed checkpoint information is inside the step picker. Arrival remains labelled estimated in the trip summary; the duplicate sentence below the actions is removed.
- Removed Where can I travel and About this route map from the DOM and removed their render writes. Their content is retained below. Route geometry, service badges and source details remain. OneMap/SLA attribution is retained on provider maps, which also have an accessible approximate/indoor-unverified label.
- The mobile journey panel has a horizontal grabber above Map / Station guide. Its text label is visually hidden; dynamic accessible names, state, keyboard controls, pointer gestures and a 44px target remain.
- Reduced common button vertical padding by 2px per side. Standard controls retain a 44px minimum, while Start journey and simple-guidance controls retain their larger minimums.

## Retained coverage reference: Where can I travel?

This is the content moved out of the UI, using the existing packaged data, not a new provider-data claim.

- Rail timetable: 18 September–31 December 2026. Times use Asia/Singapore. Dates outside supported coverage remain unavailable.
- All 5,208 source bus stops remain searchable. The directory has 798 route directions across 602 service numbers.
- 776 bus patterns across 583 service numbers have at least one supported service day, 18 September–2 October 2026. Supported weekday, Saturday and Sunday service windows are applied per stop. Holiday routing requires a separately verified operator calendar; no automatic Sunday fallback applies. Services without usable frequency data remain in the directory without journey estimates. Bus timings are bounded estimates rather than live vehicle arrivals.
- Same-terminal bus changes use an estimated five-minute walking allowance; passengers must confirm the boarding bay. Bus/rail walking links require reviewed exterior connections. Indoor accessibility, door-to-door paths, crowding, shelter and actual toilet paths remain unverified.
- Bus stops can still be selected from the map when zoomed in. Removing the coverage section does not alter stop search, map layers, route availability checks or their actionable errors.

Source snapshots: [rail network](../public/data/rail-network.json), [bus network](../public/data/bus-network.json), [walking links](../public/data/walking-links.json).

## Retained map reference: About this route map

Local transit paths connect stops schematically; they do not show exact roads or tracks. Dotted paths show walking, including reviewed exterior links where available. Indoor guidance remains unverified.

OneMap/SLA routes use approximate street geometry, and some paths may connect stops schematically. Indoor guidance remains unverified. Provider attribution remains on the map.

The removed route key described dotted grey walking paths, solid rail paths in their service colours and blue bus paths. Existing route rendering retains these styles, white bus centre marks, service badges and transfer-stop markers. Route colours and map rendering are defined in [rail-service-style.js](../src/rail-service-style.js) and [route-map.js](../src/route-map.js).

## Verification

- `npm ci --offline` and `npm run build` passed; 116 local client assets and Worker built.
- All 514 JavaScript tests passed.
- 461 browser assertions passed across cleanup (53), sheet gestures/keyboard (39), layout/contrast (69), direct start (29), current-step correction (91), integration (18), guidance (37), location (50), route map (30), provider address flows (17) and bus directory (28).
- Updated earlier browser assertions that intentionally expected the removed disclosure/sections or the former same-row journey header; route-state, consent, keyboard, touch, geometry and recovery checks remain.
- Inspected 390px and 320px mobile screenshots plus 200% text. Reflow keeps all tabs scrollable and above navigation; trip controls remain at least 44px. The grabber/tab stack is 93px at ordinary mobile text sizes because the grabber and tabs each retain a 44px target.

[Verification details](evidence/fr3-cleanup/verification.json) · [Plan controls](evidence/fr3-cleanup/plan-mobile.png) · [Trip controls](evidence/fr3-cleanup/trip-actions-mobile.png) · [320px enlarged text](evidence/fr3-cleanup/current-320-large.png).

Browser evidence uses installed Edge with desktop, mobile/touch and enlarged-text emulation. Address/location responses are controlled fixtures where required, and street tiles are blocked or substituted for deterministic checks. This does not establish physical-phone GPS behavior, indoor path safety, live-provider availability or user acceptance. No publication was performed.

## Integration notes

Primary shared files are `src/commute-ui.js`, `src/commute.css`, `src/r5.css` and `src/copilot-ui.js`; other UI changes are small copy removals. Preserve the location task's header/search changes and the guidance task's instruction-card dismissal changes when integrating. The location regression update intentionally hides non-estimate fallback text and scrolls the current summary instead of the hidden estimate node.
