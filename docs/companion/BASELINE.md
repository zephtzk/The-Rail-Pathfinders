# Nebula companion candidate — 25 September 2026

## Source and ownership

Fresh isolated clone of `https://github.com/zephtzk/The-Rail-Pathfinders.git` pinned to `c1d77d8a85c82a705995dd6143f28317b4d246bd`. Integration branch: `codex/nebula-companion-pivot`. No existing checkout was reused. No applicable AGENTS.md or GitHub Actions workflows were present in this baseline. No Cloud Run deployment configuration was found. A branch is source isolation, not permission to use providers or production storage.

## Protected resources

- Sites production: https://commute-copilot-nebula.simhongmen.chatgpt.site — project `appgprj_6aad0ab90e5881919eca01b79f19aa24`.
- Cloud Run production: https://commute-copilot-gcl7x5kbbq-as.a.run.app/.
- Existing mascot, FR4 and API integrations, caregiver privacy, manual progress, demo/personal spending separation and final assessment documents.

The inherited production project association was removed **only in this fresh clone** before any publishing. No production deployment, domain, access, credentials or data may be modified. Candidate hosting must be a new origin and its own writable sharing database; a production subpath is insufficient. Never merge this branch into main as part of this task.

## Candidate isolation

Local origin: `http://127.0.0.1:4187`. Sharing database: `.local-data/companion/sharing.sqlite`, newly created and ignored by Git. Tests use new browser contexts/profiles and synthetic trips, never copied user data. Local storage and service workers are origin scoped. Companion preference key: `nebula-companion:candidate:20260925:settings`. No `localStorage.clear()` in product code. Server-only provider configuration may be supplied explicitly; no credentials are inherited from a Git branch or copied from production.

## Shared interfaces

- `src/nebula-companion.js`: `mountNebulaCompanion({host,onNavigate,storageKey})` returns synchronous `update(context)`, `destroy()`, `getState()`, `setEnabled(boolean)`, `setDock('left'|'right')`, `subscribe(listener)`.
- Destinations: exactly `disruptions`, `facilities`, `caregiver`, `spending`, `staff`.
- `context.notice`: null or `{label,severity,source}`, where source is `live`, `demo`, or `stale`. `context.suppressed` hides UI for recipient-only views without changing the preference.
- `src/nebula-handoff.js`: `createMapsWalkingUrl({lat,lng,label})` returns a fixed HTTPS Google Maps directions URL with `api=1` and `travelmode=walking`, or null for invalid/missing coordinates.
- `src/nebula-journey-bridge.js`: adapter over the actual accepted trip and incidents. It must not introduce a second accepted trip state. Proposed reroutes remain proposals until explicitly accepted.

The integration owner edits existing app/settings/runtime/build files. UI and journey owners contribute additive modules and their own handoff documents. The normal full app remains available. Web companion and Maps walking handoff do not claim native overlays, widgets, app detection or transit-route injection.
