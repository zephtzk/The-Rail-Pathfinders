# Phase 2 rail coverage

**186 GTFS station records, 434 boarding stop IDs, 19 service patterns, 17,575 accepted trips and 333,231 stop times.** Station records are source identities, not a deduplicated count of physical complexes. Separate Choa Chu Kang and Bukit Panjang identities remain distinguishable by code in the picker.

| Source code | Patterns | Station records served | Platform IDs | Accepted trips |
| --- | ---: | ---: | ---: | ---: |
| NS | 1 | 27 | 54 | 1,322 |
| EW | 1 | 33 | 66 | 1,397 |
| CG | 1 | 3 | 6 | 664 |
| NE | 1 | 17 | 34 | 1,415 |
| CC | 10 | 33 | 66 | 2,623 |
| DT | 1 | 35 | 70 | 1,475 |
| TE | 1 | 27 | 54 | 1,387 |
| BP | 1 | 13 | 26 | 1,248 |
| SK | 1 | 14 | 28 | 3,109 |
| PG | 1 | 15 | 30 | 2,935 |

Station counts overlap across lines and must not be summed. Circle patterns include loop, branch and first-train variants, some individually unidirectional. All 34,410 distinct ordered station pairs connect structurally through accepted rides and reviewed transfers. A structural path does not guarantee a timed journey within the user's constraints.

**Query dates: 18 September–31 December 2026, Asia/Singapore.** Raw source calendars start earlier, but the current topology is not claimed as validated historical coverage. Previous-day services supply after-midnight travel on the first supported date. On 1 January 2027 only real 31 December carryover can operate; no new 2027 timetable is invented. The maximum source time is **26:05:08**.

Weekday flags and the two supplied exceptions are applied literally. BP Sunday service is removed on **20 and 27 September**. Some Sengkang patterns start **19 October**; other patterns operate earlier. `SERVICE_PH` is not holiday logic: substitutions absent from explicit source exceptions remain unverified. Service-level bounds and exceptions are recorded in the [manifest](../public/data/rail-manifest.json).

## Reviewed interchanges and walking assumptions

The [LTA system map SM-26-01-EN, 21 July 2026](https://www.lta.gov.sg/content/dam/ltagov/getting_around/public_transport/rail_network/pdf/SM_EN_(Ver210726)_CCL6.pdf) identifies standard interchange codes. Those codes were checked against exact GTFS platform IDs. **Topology is validated; durations are assumptions.** A map stroke, shared name, shared parent or proximity never creates a walking edge.

| Assumed interchange walking | Standard interchanges |
| --- | --- |
| 4 minutes | Paya Lebar, Promenade |
| 5 minutes | Jurong East, Bishan, City Hall, Raffles Place, Tanah Merah, Buona Vista, HarbourFront, Chinatown, Little India, Serangoon, Sengkang, Punggol, MacPherson, Bayfront |
| 7 minutes | Woodlands, Orchard, Bugis, Expo, Caldecott, Botanic Gardens, Stevens, Choa Chu Kang |
| 8 minutes | Dhoby Ghaut, Marina Bay, Outram Park |

These 27 groups supply **378 directed different-platform rules**. Another **434 identical-platform rules** permit a new train after 60 assumed seconds, with no extra walking. Remaining aboard one trip incurs its scheduled dwell and no interchange allowance. Changing trains requires a recorded rule.

Access and exit each assume **2 minutes**, included in the walking limit. A station endpoint does not select a verified entrance. Indoor paths, lift availability, accessibility and walking distance have not been validated. Follow station signs.

**Omitted transfers:** Newton NS21–DT11, Tampines EW2–DT32 and Bukit Panjang BP6–DT1 are tap-out connections whose walking paths are not validated here. Their lines remain usable as endpoints; a longer rail path may be found. No outside-station shortcut is inferred.

## Completeness and exclusions

- Source 1,211 stops = 186 stations + 434 platforms + **591 entrances**. Entrances are explicitly excluded from routing; no entrance-to-platform pedestrian network is supplied.
- Source 17,576 trips / 333,262 stop times. **`CCL_Clockwise_Loop_WD_1` and 31 rows are quarantined**: CC10_B departure and CC9_B arrival both equal 07:06:40. No timing was invented.
- All 19 routes are included. Eleven referenced service calendars are used from twelve raw records; an unused calendar does not invent a service.
- No shapes, transfers or frequency table exists in this archive. The UI uses an expressly labelled rail schematic from platform coordinates; it draws no walking paths.
- Stations absent from the source are unsupported. Examples: Xilin, Sungei Bedok, Bedok South and Ten Mile Junction. The UI lists all supported station IDs; the manifest lists exclusions and reasons.

The model is **pinned scheduled rail**, with no bus, address, fare, entrance, step-free, live disruption, carriage occupancy or seating support. Quieter preferences explicitly fall back to fastest. Phase 1 live observations remain separate in the original corridor experience. Offline caching retains original dates and provenance; refreshing does not make the snapshot newer. Reference and source checks establish implementation consistency, not measured walking time or future operational reliability.
