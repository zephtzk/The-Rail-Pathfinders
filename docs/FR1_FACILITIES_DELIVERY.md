# FR1 Facilities delivery

Branch: `codex/fr1-facilities`, based on `9c04b28f01b9ada8770e98906190699e1cc2e454`. Local implementation only; no push, PR, merge or deployment.

## Delivered

The new **Facilities** tab finds listed lifts and toilets within a fixed **1 km straight-line radius**, sorted by distance. It provides explicit Locate me / Locate again and Refresh status actions, manual area selection from the existing station/bus-stop directory, All/Lifts/Toilets filters, and a keyboard-accessible map/list view. Location requests are one-shot and stay in memory. Manual selection supersedes a pending location request. Existing accepted journeys, saved places, station guidance and toilet detours are untouched.

The packaged directory has **182 sourced locations**: 112 operator-listed lift exit references and 70 toilet locations (52 station toilet zones plus 18 NParks points), covering 50 DTL/NEL station sites. SBS Transit descriptions are joined to official LTA exit/GTFS coordinates. Station pins are visibly approximate exit/station references, not invented facility doorway coordinates. Each card distinguishes the facility listing source from the coordinate source and shows available dates. See [source audit and exclusions](FR1_FACILITIES_SOURCES.md).

The existing `/api/facilities` service is queried without requiring a browser key. Its public unconfigured state is explicit. No packaged record claims current operation. Toilet availability remains unknown. Station-only lift reports produce a warning without identifying a particular lift as closed; exact maintenance matches require a reviewed provider ID, which this directory does not invent. Absence of a notice never means operating. Old/offline reports and device positions are labelled stale. Sourced operating observations have a separate, expiring model state, but none are fabricated for this directory.

## Verification

- Final `npm run check`: **413 JavaScript tests, 44 Python tests, 99-asset build passed**.
- New discovery/status tests: 18; repeatable source-provenance tests: 10. Every coordinate and retained hash is checked against official evidence, including GTFS fallback joins and omitted ambiguous exits.
- `node tests/nearby-facilities-browser.mjs`: **40 checks passed**, no runtime errors. Real Bugis directory and actual unconfigured local maintenance service; separately labelled controlled denial, location race/expiry, empty area, HTTP failures/stale/station notices, offline and blocked-tile cases. Accepted-trip and all localStorage records remain unchanged.
- Edge desktop/mobile/touch emulation: 390 × 900, 1440 × 960, and 320 px at 200% root text. Screenshots visually inspected. Not physical-phone or on-site verification.
- The real, unmocked street-map provider was unavailable in this environment. Map pins, selection, 1 km circle and list fallback worked; successful tile delivery is not claimed.

Reviewed screenshots and browser results are under [evidence/fr1-facilities](evidence/fr1-facilities/). Full local logs and all captures are in the ignored `test-results/fr1-facilities/` directory. Preview was run hidden on assigned port **4202**.

## Integration and remaining limits

The only production entry changes in `src/commute-ui.js` are one import, a Facilities section/nav entry (`data-view="facilities"`), module mounting and view activation. Styling is isolated in `src/nearby-facilities.css`. The separate FR1 navigation task owns the final eight-destination layout; these isolated screenshots still show the inherited seven-column navigation wrapping the last destination. No main-navigation CSS is changed here.

Coverage is partial and static. Empty results do not establish that no facilities exist. Distances/radius inclusion use source reference pins, so actual doorway positions and walking distances may differ. Three ambiguous lift exits are deliberately omitted. Opening hours, access fees, wheelchair suitability, exact entrances and complete step-free paths remain unverified. Status snapshots persist only in the open page; offline discovery was verified after loading the page, not as a guarantee of a fresh offline installation. The hosted runtime still needs an LTA server key for real maintenance retrieval and has no toilet status feed.
