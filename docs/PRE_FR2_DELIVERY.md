# FR1 refinements ready for FR2

The four follow-up implementations are combined on `codex/pre-fr2-integration`, from completed FR1 `0a3bfa1`. Local preview: **http://localhost:4227/**. The existing browser origin and local sharing database are preserved. FR2 tester sessions have not run. The user subsequently authorized publication; this candidate is now public as **Sites version 6**. See [FR2 publication](FR2_PUBLICATION.md).

## Delivered

1. **Shorter navigation:** all eight direct destinations fit a 123px dock at 320px and 390px standard text (previously 224px and 174.9px). Current trip stays centered, 30% wider and taller than adjacent tabs. Touch targets, borders, rounded corners, focus and safe areas remain. Standard mobile reading area increases by 101px / 51.9px. Duplicate location status is omitted where the view already explains it, and Facilities fallback text stays concise.
2. **Staff tick:** the text reset becomes an adjacent tick matching the journey-step picker. Its accessible name, manual-message reset semantics and keyboard focus remain intact.
3. **Startup location:** one foreground browser-location request/session serves the map and Facilities before starting a trip. Fresh usable fixes remove redundant location prompts; reliable supported exterior geometry can show explicitly estimated steps. Accepted checkpoints, indoor transfers, floors, waiting/boarding and explicit Finish remain separate. Denial, unavailable/stale/inaccurate signals and explicit Stop retain manual recovery. Caregiver sharing is never enabled by local location permission.
4. **One-click Start journey:** the modern selected route starts directly, preserving source/fare/accessibility details, preferences and canonical route geometry. Active/paused replacement, stale-selection and double-start guards remain. White text/icons have at least 6.22:1 contrast across tested states. Legacy and labelled-replay preparation keep their intentional flows.

## Parallel branches

| Implementation | Local feature branch | Feature commit |
| --- | --- | --- |
| Compact tabs | `codex/pre-fr2-compact-tabs` | `586bc102701d3d97c5713d07f0e94d214d6f35c9` |
| Staff tick | `codex/pre-fr2-staff-tick` | `e4e8681d49b73a6e0cfe540337c2ee395a03a8ea` |
| Startup location | `codex/pre-fr2-location` | `c4474bc6d893a74dd963e742f24f6e852957059b` |
| Direct Start | `codex/pre-fr2-start-journey` | `981fe0d4ba9f32af0bc41228b6f25aedab3b3353` |

The parent reconciled shared planner/companion start wiring, removed the obsolete per-trip location checkbox, and retained both the location attachment and selected-route guards. Independent reviews checked the start path and location lifecycle. Integration also fixed a reproduced delayed-blur race that hid endpoint suggestions after rapid refocus; its browser regression waits past the original timeout and selects a suggestion normally.

## Verification

- Final `npm run check`: **454 JavaScript tests, 44 Python tests and a 102-asset build passed**.
- **1,046 browser checks** across the new features, FR1, R2/R3/R4/R5, location/privacy/offline and map suites. The full R4/R5 suites and modern R2 flow pass, superseding the isolated location branch's historical-suite limitations.
- Final affected reruns passed after density/focus refinements: navigation 156, direct Start 29 (including startup location attachment), Facilities 46, location 50, combined FR1 18. Start does not grant caregiver consent or confirm the first step merely because GPS is available.
- **Five preview smoke checks** on port 4227 verified the final application hash, eight compact tabs, location before a journey, shared Facilities discovery and zero browser exceptions. Browser-local user records were not changed by these isolated checks.

Final application SHA-256: `f40a6cc434ca66816c57ab3bd4edfe213336c3ede0ad73bd2424112a4bc54670`.

[Verification matrix and logs](evidence/pre-fr2-integration/verification.json), [navigation measurements](evidence/pre-fr2-integration/navigation-measurements.json), [startup location](evidence/pre-fr2-integration/startup-location-mobile.png), [Current trip](evidence/pre-fr2-integration/current-390.png), [Facilities at 320px](evidence/pre-fr2-integration/facilities-320.png), [desktop](evidence/pre-fr2-integration/plan-desktop.png), [200% text](evidence/pre-fr2-integration/plan-320-large.png).

Evidence uses installed desktop Edge, viewport/touch/text emulation and explicitly controlled location/provider responses. It does not establish physical-phone GPS accuracy, indoor paths, live maintenance availability or FR2 user acceptance. At 200% text and short landscape, scrolling or panel expansion remains necessary. Most packaged rail geometry is schematic and cannot support a reliable GPS step estimate; the app keeps accepted guidance and manual recovery instead.

Repeat feature checks with `TEST_BASE_URL=http://127.0.0.1:4234`, installed Edge in `BROWSER_EXECUTABLE`, then `npm run test:pre-fr2-browser`. The local candidate server remains on 4234; the user-facing preview is 4227. At the implementation handoff, publication approval was outstanding. The later authorized Sites source push and successful public deployment are recorded in [FR2 publication](FR2_PUBLICATION.md); GitHub was not changed by that publication.
