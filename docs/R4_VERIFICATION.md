# R4 verification

19 September 2026. Application worktree `The-Rail-Pathfinders-r4`, branch `codex/features-r4`, starting at R3 `20513f636f2db339f9a02c1a6f1297d9ea8516bf`.

## Final candidate

- Application SHA-256: `ba7a5d331214217873db84a0f33a3f16cffad3dad6a3def0ac2c9f3c0560283a`
- Worker SHA-256: `091a6c07d8ccedd5e865f504b3699be34fcbf12beb2c5a60b2e3a53170091d3b`
- 72 local build assets; rail, bus, walking and original imported source bytes are unchanged from R3.
- `npm run check`: **306 JavaScript tests, 40 Python tests, syntax checks and build passed**. The final legacy CSS positioning repair then received a successful build and actual-click legacy browser verification.
- New R4 browser suites: **94 passing checks** (33 integrated flow, 24 planner/picker, 21 spending, 16 legacy compatibility), zero reported browser exceptions.
- Expanded saved-place browser suite: **20 passing checks**, including ambiguous older records shared by imported/deliberate routes, deletion and reload.

Focused suites were rerun after their relevant fixes. The final integrated flow and legacy browser captures use the final candidate above; earlier planner/spending evidence predates only unrelated legacy CSS changes. Durable summaries are in [verification.json](evidence/r4/verification.json). Complete local outputs remain under `test-results/r4*`.

## Behavioral coverage

The presentation-model tests freeze route inputs, account for every original index once, retain same-station transfers, preserve exact current phase indices inside grouped choices, and confirm every phase followed by reload without changing accepted legs. Times, overnight notation, public label fallbacks and escaped names are covered.

The integrated browser test performs a Circle-to-East West trip through Buona Vista, preserves senior preferences, confirms the original transfer index, verifies actual sheet scroll/focus, rejects an invalid checkpoint without scrolling, checks paused guidance, shares and explicitly accepts a human-readable invitation with permissions off, reloads the active trip and prepares a new trip while another is active. Ending the current trip restores Start for the prepared one. Six pages are checked at desktop and 320px/200% text, with screenshots visually inspected.

Planner coverage includes deduplicated rail codes, both Bus 28 terminal directions, the Bus 23 loop, unknown full-route terminal names on partial patterns, single-control time selection, pointer/keyboard scrolling, Apply/Cancel/Escape/focus return, arrival/departure independence, saved civil deadlines and supported causes for route feedback. Large-text picker actions remain reachable through scrolling.

Spending tests cover Singapore midnight, Monday and month boundaries, adjustment attribution to original trip periods, pending amounts, overlapping period rows, one editor at a time, charge replacement, refund removal, demo separation, deletion tombstones, reload and Spending → Saved routes → Spending deletion. That cross-page action does not mutate personal routes.

Legacy tests reopen saved step-free/senior routes in rail, pilot and replay planners, retain preferences absent from their visible forms, allow subsequent explicit walking changes, remove stale Start controls and preserve the real step-free gate. Actual pointer clicks verify the legacy planner's form no longer jumps during focus.

## Retained suites

| Suite | Result |
| --- | --- |
| R2 unified | 35 checks passed |
| R3 unified | 36 checks passed |
| R3 current trip/privacy | 8 groups passed |
| R3 map/referrer/403 gating | 4 checks passed |
| Original replay | 30 checks passed |
| Original rail | 29 checks passed |
| Original multimodal | 27 checks passed |
| Phase 4 rerouting | 39 checks passed |
| Integrated upgrades | 18 checks passed |
| Sharing privacy | 8 groups passed |
| Location/offline lifecycle | 11 groups passed |
| Standalone facilities | Complete checkpoint/detour/reach/return/resume flow passed |
| Two-client sharing HTTP | Auth, consent, revised route, restart persistence and revocation passed |

Retained tests use the new picker or disclosures where the UI intentionally changed; original behavioral assertions remain. Two initial failures were test setup/expectation issues: the replay suite was first pointed at the root instead of `/replay.html`, and the old places test expected ambiguous bookmarks to be hidden. Both were corrected and rerun. Legacy fixtures use actual canonical station IDs and a deadline-valid replay departure. No event-injection workaround replaces the actual Find journeys click.

## Reproduce and preview

Locked dependencies were copied from the clean R3 `node_modules`; this is not a fresh registry install. Environment: Windows, Node 24.16.0, Edge 153.0.4234.32, desktop/mobile/touch emulation. Physical phones, native background execution, external push delivery and live crowding remain unverified.

```powershell
npm run check
$env:PORT='4194'
npm run dev
# Separate shell; verify this is the R4 server first:
$env:TEST_BASE_URL='http://127.0.0.1:4194'
$env:BROWSER_EXECUTABLE='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
npm run test:r4-browser
node tests/r3-places-browser.mjs
```

The original replay suite requires `TEST_BASE_URL=http://127.0.0.1:4194/replay.html`. Other suites use the origin or spawn their own isolated local server. Map failure captures deliberately abort or return HTTP 403 for external tiles; none is evidence of an actual provider outage. Privacy fixture credentials are local test data and are not included in release artifacts.
