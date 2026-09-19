# FR2 Services and route-aware replay

Branch: `codex/fr2-services`, based on `f78882b`. Integrate after the demo authoring commits; no deployment or other worktree changes were made here.

## Delivered

- Main Facilities tab is now Services; its nearby lifts/toilets controller is retained below service notices.
- Entry notices clearly distinguish saved simulations from actual fresh official advisory text. Dismissal persists for this session, records remain accessible, and Services can reopen the notice. Missing/offline/stale official data never establishes normal service or a real outage.
- `demo:run-replay` with `{incident}` returns to Plan or Current and displays separate simulated directions. A selected preview or accepted journey takes priority. Populated endpoint fields are searched when no preview exists. A blank fresh session gets an explicitly labelled example from the incident boundaries or loaded timetable, without setting a personal journey.
- Legacy `/replay.html` carries the currently chosen corridor input through a short-lived session handoff to `/#replay`. It does not reset to an unrelated scenario. Existing active main journey wins over legacy input.
- Closure/cancellation effects use loaded service IDs, directed consecutive segment edges and Singapore time windows. Rail connections outside the segment and half-open time boundaries remain usable. Bus estimates wait until closure expiry and reapply ordinary headway, service-day and final-service bounds; there is no invented bus at the exact reopening instant.
- Remaining-route replay uses confirmed progress, remaining walking allowance and original deadline. Onboard/unknown progress cannot invent alighting. Affected routes without a supported alternative show clear assistance/replanning instructions. Late alternatives are labelled late.
- Accepted journey, selected endpoints, sharing and permissions are never changed by replay. Delay simulations are advisory: no fabricated delayed timetable, cancellation or precise revised arrival. Resolved/unrelated incidents leave selected directions alone. Completed legs are omitted from remaining guidance.
- Incident changes in another tab, focus return, selected route changes and accepted progress changes invalidate stale replay directions. Services rereads the persistent incident log.

## Integration interfaces

- Depends on the demo task's `src/demo-incidents.js` export `loadIncidentLog()` and shared authoring UI. The demo task owns the main demo launcher/dialog shell and `#replay`; this branch intentionally leaves that baseline shell alone.
- `src/demo-replay.js`: `mountDemoReplay`, `replayJourney`, `installLegacyReplayBridge`, `REPLAY_HANDOFF_KEY`.
- `src/demo-closures.js`: pure closure compilation and matching. New `input.demoClosures` is only supplied by simulated replay searches; official notices cannot become routing effects.
- Small shared changes: Services hosts/imports/boot in `commute-ui.js`; bridge import/init in `app.js`; scoped rail and bus closure exclusion in `rail-engine.js`. Merge adjacent demo author boot/handler edits while retaining both mounts.
- `docs/FR2_SERVICES_NOTICES_DELIVERY.md` documents the independent notice controller.

## Verification

- Full `npm test`: 475 tests passed in this worktree (includes 13 replay boundary/progress tests, 4 bus closure retry tests and 4 notice model tests).
- `npm run build`: passed against the combined demo modules/shell used for integration testing.
- `node tests/fr2-services-browser.mjs`: 16 integrated Edge checks passed on port 4245, including fresh replay, selected closure alternate, unchanged accepted route/privacy, Services facility controls, alert dismiss/reopen, cross-tab real log resolution, route-option invalidation, 320px layout, and legacy return.
- `node tests/services-ui-browser.mjs`: 18 controller browser assertions passed with controlled official feed responses.
- `git diff --check` and changed module syntax checks passed.
- Local captures: `test-results/fr2-services/replay-320.png`, `services-320.png`. Browser emulation is not evidence from a physical phone or a live provider outage.

## Limits

Timetables, imported transfers and uncalibrated bus estimates retain existing coverage/accessibility limits. Segment bus closures conservatively overlap the whole estimated ride time because per-edge live times are unavailable. Looping segments with repeated boundary visits and directional whole-service records are declined instead of guessed. Real official alerts remain informational until provider-to-routing semantics are validated. Replays offer separate directions and never automatically accept a replacement journey.
