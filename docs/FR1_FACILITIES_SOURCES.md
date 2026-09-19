# FR1 nearby facility directory sources

Reviewed **19 September 2026**. The packaged directory contains **182 source-listed locations**: 112 lift exit locations and 70 toilet locations. It covers 50 distinct Downtown/North East Line station sites and 18 NParks toilet points. This is partial coverage. No location comes from `FIXTURE_LAYOUT`, and this addition does not alter station guidance or toilet-detour data.

## What the pins mean

- **Station lifts:** SBS Transit explicitly lists the lift's exit. The pin is an official coordinate for that named exit, not a surveyed lift doorway. The label and `locationNote` state this distinction. Punggol's paired exits A/B and C/D each produce one location, not two claimed lifts.
- **Station toilets:** the operator lists a concourse/street location, often near an exit or passenger service centre. A named exit is used as a reference where available; otherwise the relevant line's station/platform reference point is used. No indoor toilet coordinate is invented. Two separately described toilet zones at Chinatown and Little India are retained.
- **NParks toilets:** these are actual toilet point features published by NParks. Most are named only “Toilet”. The UI preserves the source record ID rather than inventing a park name. Source coordinates do not establish a checked entrance or accessible approach.

`coordinateAccuracy: "site"` is used for every station record, and `"point"` for NParks point features. `coordinateReference` further distinguishes `exit`, `station`, and `facility`. Distances and a fixed-radius filter apply to these reference points; they are not walking distances or assurance that the actual doorway lies inside the radius.

## Sources and retained evidence

| Source | What it establishes | Dates and retained evidence |
| --- | --- | --- |
| [SBS Transit station information](https://www.sbstransit.com.sg/Service/TrainInformation) | Explicit lift exits and public toilet descriptions, from 35 DTL and 17 NEL pages. Each entry links to its own station page. | Checked 19 September 2026. No page publication/update date is provided, so `sourceTime` is `null`. Structured factual extraction: `data/facilities/sbs-station-facts.json`. |
| [LTA MRT Station Exit](https://data.gov.sg/datasets/d_b39d3a0871985372d7e1637193335da5/view) | Named station exit coordinates. Used for 136 records. | Portal coverage: August 2025. Individual `FMEL_UPD_D` record dates are retained separately; some are later than that coverage month. Full public download: `data/facilities/lta-mrt-exits.geojson`. |
| [LTA GTFS Schedule (Train)](https://datamall.lta.gov.sg/content/datamall/en/dynamic-data.html) | Exact named entrance coordinates where the exit GeoJSON is missing/ambiguous, plus station reference coordinates and interchange codes. Used for 28 records. | Existing approved project source downloaded 18 September 2026: `data/rail/sources/lta-train-2026-09-18.zip` and accompanying JSON metadata. No additional API key is needed at runtime. |
| [NParks Central Nature Reserve Amenities](https://data.gov.sg/datasets/d_19a87bbb86b2c14601a1745076812438/view) | 18 point features whose published `BUILD_NAME` contains “Toilet”. Other amenity types are excluded. | Portal coverage: October 2025; these rows' `FMEL_UPD_D` values are 22 January 2025. Full public download: `data/facilities/nparks-central-nature-reserve.geojson`. |

Government location data is reused under the [Singapore Open Data Licence v1.0](https://data.gov.sg/open-data-licence). SBS page facts are compiled with per-entry attribution; source prose and site artwork are not republished. `data/facilities/source-manifest.json` records SHA-256 hashes and public source URLs. Signed download URLs and credentials are not retained.

## Selection and review method

1. Read the official DTL and NEL station selectors and the lift/toilet sections of all 52 pages. Account for singular “Lift” at Stevens and the “Toilets” heading at Bencoolen.
2. Record named exits, toilet level, exit/landmark relation and source URL as structured facts. Deduplicate the identical DTL/NEL descriptions at Chinatown and Little India.
3. Join the station name and literal exit label to the LTA exit dataset. Where a label has multiple locations or is absent, use an unambiguous GTFS entrance with the relevant parent station. Do not substitute a same-letter LRT exit for a DTL exit at Bukit Panjang. Punggol's paired MRT/LRT exit descriptions are explicitly retained as pairs.
4. Omit a lift exit if neither source can supply an unambiguous match. The omitted cases are **Bukit Panjang A1 and C**, and **Dhoby Ghaut G**. Their existence is not denied; the directory simply lacks a defensible location match.
5. Preserve all interchange `stop_code` values from GTFS platforms, not just the parent-station ID. For example Bayfront has both CC34 and DT16, with DT16 primary for the SBS DTL record.
6. Retain NParks toilet source points without assigning unsupported hours, fees, suitability, park names or current state.

## Status and precision limits

Every packaged record starts with `operatingStatus: "unknown"`. A directory page saying that lifts/toilets are “available” establishes listed provision, not a current operational observation. `checkedAt` means a source review, not an on-site inspection or maintenance check. An older location record date is not a stale operating report.

The existing `/api/facilities` feed supplies LTA lift-maintenance notices only. The public hosted runtime has no LTA key. These new location records have **no inferred provider LiftID**, and a station-level notice cannot identify an individual lift without a reviewed mapping. Absence of a maintenance notice does not confirm operation. No toilet status feed is available here.

No complete step-free corridor, doorway, fare-area boundary, opening schedule, toilet fee or wheelchair suitability has been verified by this work. Discovery is useful for finding a station exit or mapped park toilet to investigate, while the source description and staff assistance remain necessary for the exact facility. The directory is static and requires a new sourced build to update its locations.

## Research alternatives

[OneMap's official Themes API](https://www.onemap.gov.sg/apidocs/themes) can expose agency facility layers, but requires authentication. [OneMap's API introduction](https://www.onemap.gov.sg/apidocs/) now also states that search needs a token. The public runtime therefore cannot silently use those services as a no-key live facility feed.

LTA and MOT publish lift-installation programmes and general accessibility information, but programme announcements alone do not provide a maintained set of precise lift doorways. They were not converted into invented geographic lift points. The selected operator/LTA join gives useful, traceable city coverage within the current runtime's constraints.
