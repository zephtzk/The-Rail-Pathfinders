# Six-upgrade audit and implementation plan

18 September 2026. Remote refs fetched before edits. Main remains `4838c04`; the clean local and remote `codex/phase-4-live-rerouting` branch is `551b266`. Work starts from the latter on `codex/commute-six-upgrades`, preserving its rail timetable, bus pilot, pedestrian evidence, and confirmed-progress tests. No applicable AGENTS.md was found in the workspace ancestry or repository.

Baseline `npm run check`: 140 Node tests, 27 rail-import tests, 12 bus-import tests, one walking-metadata test and build passed. Existing implementation already exceeds the supplied main-branch audit: default page is the rail planner; original map/replay remains `/replay.html`; bus and walking pilot has persisted confirmed progress. None has a validated indoor accessible graph or toilet route. Existing four exterior walking links explicitly do not establish step-free access. No sharing backend, push delivery, saved-place library or expenditure ledger exists.

Plan:
1. Introduce a shared version-2 plan/active/completed journey model, preserving and safely importing version-1 state. Mount its companion controls into all existing planners and reuse their routes.
2. Implement connected station/toilet graph routing, provenance, manual checkpoints and fixture incident cases; keep unsupported real indoor coverage fail-closed.
3. Add durable role-scoped sharing, explicit acceptance/consent, local provider and deployed D1 adapter, event-triggered Web Push and privacy-safe service worker handling.
4. Add local saved places/templates, official bounded fare estimation, completion-only ledger and Singapore spending periods.
5. Integrate the ongoing card, opt-in foreground geolocation, lifecycle/detours, cache coverage, build/server fixes and clear data limits.
6. Run original regressions plus meaningful model/API/two-client browser/offline checks; deliver commits, patch, setup/migrations, coverage, demo and physical-device checklist. No production deployment or access change is part of this branch.

Sources consulted: PS2/PS2_README.md and PS2/submission/README.md on the competition repository; current LTA DataMall API guide; W3C Geolocation; WebKit iOS Web Push; Apple ActivityKit. External data must establish physical connections before any real route is described as verified accessible. Native ActivityKit is outside this browser build.
