# The Rail Pathfinders

**Cheah Kika | Jin Donghua | Zeph Tang Zhenkai | Zhang Yizhuo**

NEBULA X | Problem Statement 2 | FR4 | 19 September 2026

## Commute Copilot

*A little help along the way.*

### The solution

Commute Copilot is a phone-friendly Singapore public-transport companion that helps commuters plan a journey, understand their next step and respond to service changes. It opens in a browser without an app account or mandatory installation. The current prototype compares rail and bus options using included transport data, with route preferences and clearly labelled estimates.

Users select stations or bus stops, choose when to travel, compare arrival, transfers, walking and estimated fares, then explicitly start a route. Fixed-schedule and flexible-departure choices support different needs. Current trip keeps the accepted journey and next instruction visible; travellers confirm progress manually and can pause, resume, end or cancel. Saved routes and pinned commutes make repeat planning easier.

### What makes the approach distinctive

**Relevant disruption, explained response.** Saved unresolved demo closures and cancellations affect the planner only where service, direction, segment and time overlap. Affected connections are excluded; eligible alternatives are suggested. Resolving the incident restores eligible routes. Users decide which route to start.

**Guidance that reduces effort.** A journey strip, map and current-step instructions work together. Simple guidance and an 80-200% text-size setting support readability. Show to staff turns the next action or a custom request into a large message; selected station facts provide useful context.

**Continuity and traveller control.** Accepted instructions can be prepared for offline use. Local saved routes and spending records support everyday travel. A recipient link shows a read-only planned trip; its owner can refresh the shared plan or cancel access.

**The core demonstration:** Plan a route → save a matching demo closure → return to Plan → compare and start an unaffected alternative → resolve the incident and check again.

## Implementation, evidence and scope

### Technology stack

The app uses vanilla JavaScript ES modules, HTML/CSS and Leaflet 1.9.4, with attributed OpenStreetMap-derived route geometry. Included rail schedules and bus service patterns feed the routing engines. LocalStorage retains local journeys and preferences; a service worker caches the app shell and prepared route data without prefetching street-map tiles. Node.js builds a Cloudflare-compatible Worker. Hosted trip sharing uses persistent database storage. No LLM is required for planning or guidance.

Optional server-side adapters support LTA DataMall notices/arrivals and OneMap address routing while keeping credentials out of browser assets. Automated verification uses Node.js domain tests, Python data tests and Playwright browser checks.

### What the current release demonstrates

FR4 connects every active saved demo closure to ordinary route and flexible-departure searches. A saved East West Line closure changes the tested Paya Lebar (EW8) to Bugis (EW12) suggestion, persists after reload and restores the baseline route after resolution. The walkthrough also checks explicitly starting the unaffected alternative. Multiple closures are combined rather than relying only on the incident selected for replay.

The interface keeps End, Pause/Resume and Cancel in one row, removes duplicate current-trip sections and centres the demo controls. App zoom gestures are guarded while the map keeps its zoom controls and text remains adjustable. The release passed **555 JavaScript tests, 44 Python data tests and the production build**, plus focused browser checks for incidents, route activation, sharing, narrow layouts and map zoom. These are automated desktop-browser checks, including mobile emulation; physical-phone validation remains outstanding.

### Clear prototype boundaries

**Data and disruption evidence.** Planning uses dated static data and estimated bus ride/wait times and fares. Demo incidents are synthetic; official service notices stay separately identified and advisory. Delay scenarios do not establish validated revised arrival times.

**Online integrations.** This hosted release has no configured OneMap token or LTA live-arrival credentials. Address/GPS routing and live arrivals must report unavailable. During synthetic closures, demonstrations use station or bus-stop endpoints.

**Guidance, offline and privacy.** Progress is manually confirmed. Station facts are not verified indoor or step-free navigation. Offline guidance requires readiness to be checked while online; live feeds and street-map tiles are not promised offline. Sharing is a read-only plan view, not live tracking; journey notifications are off.

**Try the public app:** [Commute Copilot](https://commute-copilot-nebula.simhongmen.chatgpt.site) | **Source:** [GitHub repository](https://github.com/zephtzk/The-Rail-Pathfinders)

The illustrated user guide follows the two-page PDF writeup. Its final two pages explain the demo controls, returning to the main page, verifying disrupted services and starting the alternative route.

Release reference: FR4, public version 13, source `f5fb04b9d5bb7a8a6ea2f94b7b825cf45869082e` (19 September 2026).
