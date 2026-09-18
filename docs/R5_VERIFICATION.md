# R5 verification

19 September 2026. Isolated application branch `codex/features-r5`, based on freshly fetched main `73bba30de14faddc08ec8f15b862655f888cbbd8`. R4 and the unrelated Neblala wrapper were preserved.

## Candidate verification

Final machine-readable identities and check totals are recorded in [verification.json](evidence/r5/verification.json). `npm run check` covers JavaScript unit/integration tests, Python rail/bus/walking import checks and the application/Worker build. Focused R5 browser suites use actual clicks, keyboard and touch-emulated gestures. The final check passed 359 JavaScript tests, 42 Python tests and the build; 101 R5 browser checks and 139 legacy calendar/planner checks passed. Their screenshots were visually inspected, including 320px with enlarged root text and desktop layout. Runtime line endings were then normalized to the repository LF rules and rebuilt without semantic changes.

| Verification area | Covered behavior |
| --- | --- |
| Budgets/history | Calendar boundaries, confirmed/estimated replacement, refunds, overrun geometry/text, pending prices, demo separation, all-history actions, period changes/disable preserving history, reload and unreadable ledger. |
| Calendar | Singapore dates with an America/Los_Angeles browser timezone, day/month/leap/year boundaries, keyboard navigation, Apply/Cancel/Escape, focus return, departure/deadline independence and narrow layout. |
| Saved commutes | Fresh Leave now calculation, explicit reverse, pinned/recent order, no automatic acceptance, inert custom labels, deleted-pin capacity and retained R4 bookmark visibility. |
| Flexibility | Feasible recomputation, past/deadline filtering, original constraints retained, explicit selection, unknown exact savings and source-linked scheme boundaries. |
| Bus arrivals | Exact service/operator/termini/loop occurrence, three predictions, actual direction, live estimate versus schedule, timestamp, staleness/offline, manual refresh bound and unchanged accepted indices. Confirmed onboard state hides the departed boarding stop. |
| Bus routing | Deterministic all-record audit, source spans/calendars, no fabricated missing headways/fixed trips, previous service days, bounded search, independent oracle pairs and worker cancellation/restart. |
| Guidance/staff | Canonical phases, accepted detour outbound/reached/return, blocked/review/pause/terminal precedence, presentation persistence, primary-action priority, alternative reset, no dispatch/sharing side effects, WIP notices and no raw executable labels. |
| Station pages | Explicit tabs, keyboard Home/End/arrows, dedicated swipe strip, no interference with map gestures, linked operator facts, evidence separation and usable enlarged-text scroll area. |
| Address provider | Real public-location API smoke, malformed/oversized/offline/unavailable results, cumulative walking/deadlines, provider geometry, accepted checkpoints, save/reload, caregiver invitation/acceptance with consents off and actual offline browser reload. |

Independent review corrected stale pinned IDs, budget conclusions from unreadable storage, onboard arrival context, a worker initialization/cancellation race, early bus departures missing a later feasible bus and terminal evidence derived too narrowly from included patterns. Each correction has a regression check. No review was treated as verification of real indoor paths.

## Retained regression evidence

R2 unified flow, R3 unified flow, R4 current/confirmation flow, planner, spending, legacy preference compatibility, legacy multimodal, facilities, caregiver privacy, location/offline lifecycle and two-client persistent sharing HTTP tests were rerun. Tests use the public date picker where that interaction changed. The final [legacy calendar audit](R5_DATE_ENTRYPOINTS.md) records 139 passing checks and the corrected offline test entry URL. Original semantic assertions remain; weekend bus checks now assert actual supported Saturday behavior and source-date expiry instead of the removed pilot-only restriction.

The creator share-deletion regression is repaired: deletion uses the actual editor/traveller capability, retrieves the current revision, and rejects viewer-only sessions. Existing consent separation, offline privacy retries, tombstones and accepted-state validation are retained. No new background-delivery capability or credentials were added.

## Live and physical evidence boundaries

- [OneMap live smoke](evidence/r5/address-live.json): authenticated searches and a complete public-location itinerary through the user-supplied, process-only runtime. This is one observed contract sample, not general coverage or a continuing availability guarantee.
- [LTA arrival smoke](evidence/r5/bus-live.json): HTTP 200, valid empty feeds around 03:20 SGT. Synthetic matched-prediction UI checks are separate; these empty feeds do not prove no buses operate.
- [Bus benchmark](evidence/r5/bus-benchmark.json): CPU/payload and transient/retained memory are recorded separately. The transient Node heap target remains unmet; its nonzero benchmark result is disclosed, not counted as a passing release check. Desktop worker responsiveness and cancellation passed in browser emulation. Physical-phone performance remains unverified.
- No field survey, verified indoor pilot, live lift inventory, BFA approval, production deployment, audience expansion or physical-phone test is claimed.

## Reproduce

Locked dependencies were copied from the clean R4 `node_modules`; no fresh registry install is claimed. Runtime: Windows, Node 24.16.0 and desktop Edge with mobile/touch/large-text emulation.

```powershell
npm run check
$env:PORT='4196'
npm run dev
# In a separate shell:
$env:TEST_BASE_URL='http://127.0.0.1:4196'
$env:BROWSER_EXECUTABLE='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
npm run test:r5-browser
npm run test:r4-browser
node tests/sharing-privacy-browser.mjs
node tests/location-offline-browser.mjs
node tests/sharing-http.mjs
node --expose-gc scripts/benchmark-r5-bus.mjs
```

The optional secure runtime launcher is `python scripts/run-r5-live-local.py`; its masked form accepts an ordinary OneMap token and optional LTA key, starts port 4195 and writes only sanitized session metadata under ignored `test-results`. The R4 preview uses its own port 4194 and source tree. Never paste credentials into chat or pass them as command arguments.
