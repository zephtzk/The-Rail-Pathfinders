# FR2 demo incident authoring

Based on public FR2 v6 (`f78882b`), implemented in `codex/fr2-demo` only.

The main Demo panel now has one **Try a journey scenario** launcher. Main and legacy replay use the same accessible dialog. Planned track works and Disruption during travel open editable incident details, with service/line, segment or whole-service scope, direction, severity, type, SGT start/end times, delay and description. Saving opens the local incident log. The persistent `/demo-incidents.html` page supports add, edit, resolve and confirmed clear. A dialog log also lets users select saved incidents for replay after reload. Preview offline, Show stale data and their old handlers/explanatory paragraph are removed.

## Shared API and integration

`src/demo-incidents.js` exports:

- `DEMO_INCIDENTS_KEY = 'commute-copilot-demo-incidents-v1'`
- `loadIncidentLog(options = {})` → incident array; `{strict:true}` exposes storage/read errors (default safely returns `[]`).
- `createIncidentDraft(scenario, options = {})` → editable fields; optional `date` selects a Singapore civil date.
- `saveIncident(input, options = {})`, `updateIncident(id, patch, options = {})`, `resolveIncident(id, options = {})` → saved incident.
- `clearIncidentLog(options = {})` → `[]`.

Options can inject `storage`, `eventTarget` and `now` for testing. Storage envelope: `{schemaVersion:1, incidents:[...]}`. Every successful persisted mutation emits `window.CustomEvent('demo:incidents-changed', {detail:{incidents}})`. UI listens to this and native `storage` events.

Incident fields: `id`, `schemaVersion:1`, `demo:true`, `source:'demo'`, `scenario:planned|disruption`, `title`, `type:closure|delay|cancellation`, `severity:minor|major|severe`, `service`, `scope:service|segment`, `from`, `to`, `direction:both|forward|reverse`, `startsAt`, `endsAt`, `delayMinutes`, `details`, `status:active|resolved`, `revision`, `createdAt`, `updatedAt`, `resolvedAt`. Times normalize to ISO with seconds and explicit `+08:00`. Segment IDs accept public rail IDs and `bus:NNNNN`. Service scope clears endpoints; non-delay types store zero delay. Delay is an integer from 1 through 180. Provenance, identity and lifecycle cannot be overwritten by authored content. Log is bounded at 100 records; corrupt/future storage is preserved and mutation fails visibly.

`mountDemoIncidents({host,getNetwork,getDate,onNormal,page})` in `src/demo-incidents-ui.js` returns `{openScenario,openLog,destroy}` and loads its dedicated CSS. Normal main integration:

```js
mountDemoIncidents({
  host: $('demo-scenarios'),
  getNetwork: () => router?.network,
  getDate: () => input?.date
});
```

`#replay` closes the dialog and emits `window.CustomEvent('demo:run-replay',{detail:{incident}})` with the selected active record, or `null` for a normal rehearsal. **Services/replay task owns consuming this event, main-app routing, alerts and legacy redirection.** This branch does not apply incident effects itself. The hidden `#demo-routing` container remains for existing rerouting initialization until integration. `commute-ui.js` changes are limited to the demo import, panel, old handlers and mount; no general CSS changes.

## Verification

- `npm ci --offline` succeeded.
- `npm run check` passed: all modules parse, 472 JS tests (including 18 new incident model tests), 27 rail-import tests, 16 bus-import tests, walking metadata test, and production build (107 assets).
- `node tests/fr2-demo-browser.mjs` passed 31 assertions on Edge, port 4244. Covers main/legacy UI, modal focus and keyboard containment, field validation/recovery, bus IDs, edits/resolution, persistence after reload, cross-tab refresh, selected-incident replay event, inert authored HTML, confirmed clear, corrupt storage and no uncaught browser errors.
- Editor reflow checked at 390/320/1280 px, including 200% text at 320 px in both modal and log-page layouts. Mobile editor/log/dialog screenshots visually reviewed; generated evidence is in ignored `test-results/fr2-demo/`.

## Boundaries

Incidents remain labelled fictional, device-local data; no incident content is sent to a server. The authoring schema validates public ID syntax; the replay consumer must validate actual route/service membership and applicability. Browser storage is not atomic across simultaneous writes in separate tabs, although each mutation rereads the current log and normal cross-tab changes refresh. Standalone log has no replay execution button; select a saved incident from the main scenario dialog. No deployment, merge, remote PR, shared Git configuration or other worktree changes were performed.
