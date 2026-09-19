# Refinements before FR2

These changes extend completed local FR1 `0a3bfa1264dec93b2f7a5b58f8650c68224f84e9` before the next test-user review. FR2 testing has not been performed by this work. Each implementation runs in an isolated task and application worktree; the outer Neblala directory is not the application repository.

| Item | Branch | Task |
| --- | --- | --- |
| location | `codex/pre-fr2-location` | `01a0b7a8-ec63-73d1-a301-c86af53fdfb3` |
| compact-tabs | `codex/pre-fr2-compact-tabs` | `01a0b7a8-fcb7-79c1-bd6e-4a79b19f36de` |
| staff-tick | `codex/pre-fr2-staff-tick` | `01a0b7a9-0b8d-74f1-ab17-2bdb0a5df1b9` |
| start-journey | `codex/pre-fr2-start-journey` | `01a0b7a9-e7d7-7700-9385-d5cec442febd` |

Integration branch: `codex/pre-fr2-integration`. Candidate test preview: port 4234. After verification, update the existing local preview at port 4227 so browser-local records remain on the same origin.

## Acceptance

1. Reduce total navigation height substantially while retaining the centered, somewhat larger Current trip, separate tab areas, all eight direct destinations, focus/selected states and usable touch targets. Check the visible main content, safe areas, narrow widths and enlarged text.
2. Replace Staff's visible **Use my current instruction** text button with the compact tick adjacent to the message selector. Retain its accessible name and reset-to-current-instruction behavior; it does not confirm a physical location or contact staff.
3. Request foreground browser location at app load, including before a journey starts. Show fresh local position on the map and reuse it across views. Respect permission denial, explicit off, accuracy/freshness, hidden-page lifecycle and late callbacks. Reduce duplicate location/confirmation prompts while a usable fix is available; preserve enclosed-station/floor/platform/detour confirmations and recovery when positioning is unavailable. Estimated outdoor progress is distinct from confirmed boarding/arrival, never auto-completes a trip, and never enables caregiver upload permission.
4. Replace modern planner's redundant Continue/confirmation/Start sequence with one explicit **Start journey** action for a valid selected route. Retain stale/invalid/active-trip guards and selected preferences/geometry. Make Start text/icons clearly contrast against their backgrounds in every state.

## Integration checks

Review overlapping planner/companion changes from location and direct Start together. Adapt tests whose old two-click start or opt-in-per-trip behavior has intentionally changed while retaining their route/progress/privacy assertions. Run the complete unit/import/build check and relevant browser flows with clean storage, denied/usable/stale location, real packaged routes, indoor transitions, Staff reset, and navigation measurements. Visually inspect mobile, desktop and 200% text. Record browser emulation separately from physical tester results.

GitHub publication was previously rejected by automatic approval review; no later remote-export approval has been received. Keep this implementation local and do not attempt pushes, PR creation or deployment as part of these refinements.

