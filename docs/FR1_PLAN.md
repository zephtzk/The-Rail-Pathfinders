# Final Review 1 (FR1)

FR1 starts after publication of the public app and illustrated user guide. The historical R5 release record remains in [JUDGES_RELEASE.md](JUDGES_RELEASE.md).

## Baseline

- Application: [Commute Copilot](https://commute-copilot-nebula.simhongmen.chatgpt.site), Sites version 5.
- Published app: merged PR #7, commit `10a13aede150787e6de757e06c0463be40c31baf`.
- Published guide: merged PR #8. All FR1 branches start from fetched main `9c04b28f01b9ada8770e98906190699e1cc2e454`.
- Coordination task: `01a0b783-872c-7800-ac70-61e3993c404d`.
- Integration branch: `codex/fr1-integration`, isolated preview port 4207.

## Parallel implementation tasks

Each item has a separate task, Git branch and application worktree. The outer Neblala directory is an unrelated unborn Git wrapper; task tools use the saved project while implementation occurs only in the assigned nested application worktree.

| Item | Branch | Task | Preview port |
| --- | --- | --- | --- |
| Facilities nearby | `codex/fr1-facilities` | `01a0b790-5048-7912-9ad1-f1bfb0b9a406` | 4202 |
| Collapsible settings descriptions | `codex/fr1-settings` | `01a0b790-5e20-7303-a67c-0e7cff6d9dff` | 4201 |
| Simple guidance by default | `codex/fr1-simple-guidance` | `01a0b790-6a7f-7f42-840d-16e16a65ffaa` | 4203 |
| Finish journey wording | `codex/fr1-finish-label` | `01a0b790-75f8-72e1-b443-81a5f66508ca` | 4204 |
| Rounded map and station buttons | `codex/fr1-rounded-controls` | `01a0b790-83f3-76a3-8313-1e1610a8da12` | 4205 |
| Update current journey step | `codex/fr1-current-step` | `01a0b790-948b-78b1-8aac-ffb559abadf8` | 4206 |

## Acceptance criteria

1. Settings travel-style descriptions are hidden while collapsed and available through accessible disclosure controls; title and selection remain clear.
2. Facilities offers nearby toilet/lift discovery within a clearly stated fixed radius. Results show distance, location and source, with usable location-denied, empty, stale and offline states. Maintenance status is reported only when supported; unknown remains unknown. Fictional indoor fixtures do not appear as real facilities.
3. Clean/invalid presentation preferences default to Simple guidance. Explicit saved off/on choices persist and existing journeys remain intact.
4. Both full and simple guidance use the exact button label **Finish journey**.
5. Map and station controls use consistent rounded corners with visible focus and usable touch targets.
6. Current trip offers **Update my current step**, revealing the canonical journey-position selector with a compact accessible tick beside it. Selection alone does not advance progress. Staff assistance remains accessible from its own page.

## Integration and review

Feature tasks commit independently without pushing or deploying. Integration applies the finished commits sequentially, resolves shared UI files, runs the complete unit/import/build check and relevant R4/R5/facilities browser regressions, then inspects the combined narrow-screen UI. Physical-phone testing is recorded separately from browser emulation. FR1 implementation does not itself establish that the public deployment or PDF has been updated.

