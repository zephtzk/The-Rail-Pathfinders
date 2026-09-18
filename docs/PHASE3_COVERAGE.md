# Phase 3 coverage: bus, rail and walking

The pilot is station/stop-to-station/stop. Select exact five-digit bus stops, including leading zeros. Names and proximity never connect opposite sides of a road.

| Layer | Included | What inclusion establishes |
| --- | --- | --- |
| Raw bus acquisition | 5,208 stops; 26,823 route rows; 801 service rows | A complete paginated snapshot, not routable island-wide coverage |
| Accepted bus patterns | Full services 2 (both directions), 23 (loop), 28 (both directions); 291 ordered occurrences at 261 stops | Complete patterns, distinct variants/directions/visits and per-stop service spans |
| Supported bus timing | All five accepted patterns, weekdays 18 Sep–2 Oct 2026, 09:30–16:30 | Frequency-based waits and uncalibrated distance-based rides; no scheduled departures or deadline guarantee |
| Rail | Existing 186 station records, 434 platforms, 19 patterns, 17,575 trips | Scheduled routing for 18 Sep–31 Dec 2026 and genuine final-day carryover; original limitations remain |
| Exterior pedestrian links | Four bidirectional links below | Map-supported public footways; estimated duration; no field or accessibility verification |
| End-to-end journeys | Connected combinations of the above under the time, deadline, walk and transfer constraints | A feasible modelled itinerary; bus estimates can cause missed connections in reality |

The selected services extend beyond Tampines–Paya Lebar–Bugis to their full termini. Only the listed pedestrian links join buses to rail. This is not island-wide multimodal coverage.

| Bus stop | Entrance and rail platforms reached | Exterior distance assumption | Exterior + indoor allowance |
| --- | --- | ---: | ---: |
| 81111 | Paya Lebar B → CC9_A/B | 60 m | 90 + 120 = 210 s |
| 81119 | Paya Lebar C → CC9_A/B | 60 m | 90 + 120 = 210 s |
| 01059 | Bugis B → EW12_A/B | 50 m | 90 + 120 = 210 s |
| 01113 | Bugis A → EW12_A/B | 20 m | 60 + 120 = 180 s |

All links are bidirectional, remain on their reviewed road side, and contain no road crossing. The 2021 operator locality maps are corroborated with pinned, subsequently revised OSM footways and manually reviewed boarding-forecourt connectors. Sources, coordinates, way IDs/versions, instructions, barriers, position uncertainty and source hashes appear in the [walking ledger](../data/bus/walking-links.json), [visual path review](../data/bus/walking-evidence/path-review.html) and [walking documentation](WALKING_COVERAGE.md). These are map-supported paths, not surveyed paths or current closure inspections. Follow station signs; indoor layout, lifts and facilities remain unverified.

The exterior path includes one existing 120-second indoor allowance per transition. Reaching another rail line uses the existing reviewed rail interchange time separately. Station origin/destination allowances apply only to rail endpoint travel, and the router forbids entering then immediately exiting a station merely to connect two exterior paths. Rail station endpoints require an actual rail ride on the applicable side; bus-to-station-entrance-only routing is not implemented. This prevents double-counted indoor access.

Bus changes at a shared roadside stop use 60 seconds with zero additional walking. No distinct-stop bus-to-bus walking link is enabled. Transfers between buses at aggregate interchange/terminal IDs **75009, 52009, 99009, 10499** are disabled because bay paths are unverified. They remain selectable origins and destinations. The service 23 loop retains terminal occurrences 1 and 43; it is not an infinite circulator.

No Tampines bus/rail walk is enabled. The omitted Newton, Tampines and Bukit Panjang tap-out rail links remain omitted. Address search, geocoding, fare calculations, wheelchair routing, crowding comparisons, live closure inference, mid-journey rerouting and EXTOL are outside coverage.

Bus first/last clocks are audited, including `2400` and rollover, but they are not a departure timetable or a validated overnight calendar. Weekend, holiday, peak, last-service and overnight bus journey estimates are excluded. The 18 km/h + 30 seconds/stop riding model is uncalibrated. The maximum off-peak headway wait is an assumption and can be exceeded. A live prediction applies only to its current boarding stop and remains advisory; saved/cached predictions never become current offline.

Representative searches at 10:00 on 18 September 2026 (20-minute walking limit, no deadline):

- Bus only: `bus:75009` → `bus:75059`, service 23, estimate **10:19:30**.
- Bus transfer: `bus:75009` → `bus:81119`, services 23 → 28 via roadside stop 75059.
- Bus → rail: `bus:75009` → `DT14` (Bugis).
- Rail → bus: `DT14` → `bus:75009`, using Paya Lebar's direction-specific stop 81111.
- Wider rail remains independently available at `/`, e.g. Woodlands → Changi Airport.

The optional **synthetic EWL-unavailable fixture** removes only EWL scheduled trips for a fresh search. Its label stays with the result and saved guidance. It establishes a fallback test, not a detected closure or automatic rerouting.
