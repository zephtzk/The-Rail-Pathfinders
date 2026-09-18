# Data availability, integration and boundaries

## Phase 4 provenance and live-applicability correction

The [Phase 4 report](PHASE4_REPORT.md) is the current acceptance record. Walking ledger `2026-09-18.2` replaces mtime-derived retrieval claims with explicit hash-pinned acquisition metadata: original exact acquisition times are unknown, legacy values are retained as filesystem timestamps, and the first archive commit is separate. Supported SMRT source dates and OSM edit dates remain unchanged. Copy/checkout/mtime changes cannot renew provenance; all reviewed geometry and limitations remain.

Current bounded real samples are [GTFS metadata](evidence/phase4/gtfs-real.json) and [notices/bus arrivals](evidence/phase4/live-real.json). LTA guide v6.9 was checked. Two GTFS alerts are MODIFIED_SERVICE with route-only SK/BP selectors, no direction/stop/trip or impact period; realtime feed_version is absent. Trip updates are empty. Notices contain no affected segments. Bus service 28 matches the exact opposite stops/directions, but one ETA was already past and samples were outside the pilot daytime window. Real routing effects remain disabled; no closure/delay/restoration is extracted from prose or status codes. Source time, retrieval, effect interval and prediction time are distinct. Empty/stale/expired data is not normal-service proof.

Synthetic tests validate engineering only. Static rail/bus coverage and calendars are unchanged. No data refresh or date-window extension was necessary for supported examples. Genuine shared infrastructure limits, secure runtime configuration and future release gates are in [operations](PHASE4_OPERATIONS.md).


## Phase 3 — versioned bus data and reviewed exterior walking

The current source ledger is [BUS_DATA.md](BUS_DATA.md), with [WALKING_COVERAGE.md](WALKING_COVERAGE.md) and [end-to-end coverage](PHASE3_COVERAGE.md). BusStops, BusRoutes and BusServices were fully acquired and repeated against current official DataMall guide **v6.9 (3 August 2026)**. Raw/accepted/excluded counts, terminal pages, per-page hashes, service variants and ordered occurrences are retained. Five complete patterns of services 2, 23 and 28 support explicitly estimated weekday travel, not an invented departure timetable. The bounded ordinary-weekday date policy and unverified frequency day scope are documented.

Four exterior walks combine operator locality maps and exact OSM footway evidence. Attribution: © OpenStreetMap contributors, ODbL; operator map images retain their original rights and are evidence references, not application basemaps. Indoor allowances and accessibility are not verified. Build gates check all bus source hashes, source/public walking identity and referenced map hashes.

The server-only `LTA_ACCOUNT_KEY` enables optional BusArrival v3. Two real observations matched the pilot's exact stop/service/operator/termini/visit identities. Provider HTTP Date, retrieval time and predicted arrival are separate; no provider observation timestamp is supplied. All current arrivals stay advisory, including for future-date searches. Failure cases are synthetic evidence, not deliberately induced provider events. [Real arrival evidence](evidence/phase3/bus-live-real.json) is historical and is never loaded as live data.

The existing rail schedule provenance is in [PHASE2_REPORT.md](PHASE2_REPORT.md). The sections below retain historical Phase 1/0 boundaries; they do not describe the expanded Phase 3 planner. Outstanding Phase 1 live variants, physical-device checks and release constraints remain open.

Reviewed 18 September 2026. The Phase 1 section records the implemented corridor integration;
the Phase 0 inventory and audit evidence below remain historical access/contract evidence.
Documentation, synthetic tests, authenticated responses and physical-device observations are separate evidence classes.
See [MILESTONES.md](MILESTONES.md) for the acceptance decision and current live results.

## Phase 1 — integrated notices and station reports

The application now uses only `TrainServiceAlerts` and `PCDRealTime?TrainLine=EWL|CCL|DTL` (three separate line requests).
The latest [live application-adapter evidence](evidence/phase1/live-adapter.json) was recorded at
21:09:57 Singapore time on 18 September 2026. All four feeds had successful parsed HTTP 200 responses.
Crowd retrieval occurred at 21:07:20 and was reused from the unchanged ten-minute cache; the later report timestamp
is not an additional upstream crowd fetch or a new source observation. No credential, header, notice text or raw response is retained.

| Integrated feed | Actual observed contract / mapping | What it supports and remaining limits |
| --- | --- | --- |
| TrainServiceAlerts | `value` object; numeric `Status:1`; three `Message` records with text and `CreatedDate`; empty `AffectedSegments`; no missing expected fields or malformed records. | Display source advisories. Status 1 includes minor delays. Message timestamps lack timezone offsets; one retained timestamp dates from April. The response supplies no message expiry or message-to-segment association. Current applicability, real nonempty affected-segment mapping and disruption/recovery variants remain NOT TESTED. |
| EWL PCDRealTime | 33 rows; all 11 corridor codes EW2–EW12 matched exactly. | Station-level reports for Tampines, Simei, Tanah Merah, Bedok, Kembangan, Eunos, Paya Lebar, Aljunied, Kallang, Lavender and Bugis. Other line rows are outside the implemented corridor. |
| CCL PCDRealTime | 34 rows; all six corridor codes CC4–CC9 matched exactly. | Promenade, Nicoll Highway, Stadium, Mountbatten, Dakota and Paya Lebar. Counts include separate line-specific interchange positions; they are not distinct physical station counts. |
| DTL PCDRealTime | 37 rows; both DT14/DT15 matched exactly. | Bugis and Promenade only. Does not expand routing to the rest of DTL. |

Every matched crowd record in this sample had band `l` and interval **20:40–20:50 +08**. At upstream retrieval,
that interval had already expired by about 17 minutes 20 seconds. Source access and exact code mapping PASS;
fresh live observation availability is NOT TESTED. Bands `m`, `h`, `NA`, malformed records and conflicts are covered by
synthetic tests, not claimed as observed variants. A station reporting interval is not an individual observation instant,
train position, carriage load, seat count or forecast for a later planned departure.

The implementation accepts the documented/observed single station code. It does not split an unvalidated compound code
or infer a code range. Structured notice lists match exact codes on their stated line. Supported-line notices with no
stations are line-only; unknown/range/prose identifiers remain unmapped rather than being declared irrelevant.
General messages remain separately labelled with corridor relevance unconfirmed. No source text is turned into delay minutes,
closures or changes to route ranking. Live information is informational; the existing route engine remains replay.

### Runtime freshness, caching and persistence

- Current crowding requires a recognised band, valid explicit-offset timestamps, `StartTime <= now < EndTime`,
  an online successful source and a retrieval time between interval start and now. At the exact end it becomes expired.
  A report fetched before its stated start cannot become observed merely because the clock advances.
- Expired bands can remain visible only as **last reported**, with the original interval and age; current crowding is unavailable.
  Missing, reversed, conflicting, future and NA values never become a quiet/current observation. Freshness uses real time,
  independently of the replay date. Local device/server clock errors remain a limitation.
- Notice retrieval establishes when a response arrived, not when a notice expires. Source `CreatedDate` without an offset is
  displayed as timezone/format unconfirmed. A recently connected source is not a proof of current notice applicability.
- Each of four fixed upstream requests is limited to six seconds and 2 MiB. Redirects are rejected and the key is sent only
  in the HTTPS `AccountKey` header. Returned fields are bounded/allowlisted; reflected key values and raw error bodies are excluded.
- Per-process/Worker-isolate caches coalesce simultaneous requests: notices 60 seconds; crowding 600 seconds.
  General failures retry no sooner than 60 seconds, authentication failures 300 seconds; 429 respects a longer numeric/date
  Retry-After. Cache hits and failures preserve the original successful retrieval/interval, not an invented refresh time.
  Failed refreshes cannot pass the live verifier using a previously successful HTTP status. No persistent/global rate limiter is claimed.
- The visible online browser refreshes its application source on a 60-second timer and explicit/resume events; upstream caching
  still applies. It re-evaluates visible expiry each second and on resume/offline/reconnection. These are implementation limits,
  not LTA service-level guarantees or permission to load-test the shared resource.
- Saved snapshots retain bounded normalised notices/station reports and their provenance separately from replay timestamps.
  Offline reports are saved information, never labelled current. The service worker excludes API responses; the app shell,
  saved journey steps and bundled geometry remain available. Standard map tiles are not an offline promise.

Use the masked launcher in the [README](../README.md#run); the DataMall key is present only in local process memory during a session.
This phase did not configure a hosting secret or deploy a version. EXTOL uses its separate native SDK Account Key and is not integrated.

The product credits LTA DataMall and links to the official [Singapore Open Data Licence v1.0](https://data.gov.sg/open-data-licence),
without linking directly to DataMall APIs/downloads. Both official licence pages require source acknowledgement plus a licence link;
the source acknowledgement need not itself be a hyperlink. This is an implementation reading, not a definitive LTA interpretation of
the account email. Any later direct product link to DataMall still needs that account restriction resolved; no LTA contact occurred.

Timetable routing, forecasts, bus feeds, GTFS trip effects and wider geographic coverage remain outside Phase 1. The following
inventory retains the Phase 0 observations and unperformed checks; deferred checks have not been promoted to PASS.

## Official references and contract digest

The [DataMall guide v6.9, 3 August 2026](https://datamall.lta.gov.sg/content/dam/datamall/datasets/LTA_DataMall_API_User_Guide.pdf)
and [dynamic dataset catalogue](https://datamall.lta.gov.sg/content/datamall/en/dynamic-data.html) define these feeds.
Pages below are printed page numbers. Endpoint suffixes follow `https://datamall2.mytransport.sg/ltaodataservice/`.

| Endpoint / guide section | Representative documented fields | Cadence / scope |
| --- | --- | --- |
| `TrainServiceAlerts`, 2.11 pp30–31 | Status; affected lines/directions/stations; Message.Content/CreatedDate | Ad hoc; notices. Status 1 includes minor delays. |
| `GTFSScheduleTrain`, 2.31 p55 | Link → GTFS ZIP | Ad hoc; schedules. |
| `GTFSRealTimeTrainServiceAlerts`, 2.32 p56 | Link → protobuf alerts | Ad hoc; advisories. |
| `GTFSRealtimeTrainTripUpdates`, 2.33 p57 | Link → protobuf trip updates | Ad hoc; disruption predictions/cancellations. |
| `PCDRealTime`, 2.24 p45 | Station,StartTime,EndTime,CrowdLevel | 10 minutes; station bands. |
| `PCDForecast`, 2.25 p46 | Date,Station,Start,CrowdLevel | Daily; 30-minute forecasts. |
| `BusStops`, 2.4 p23 | BusStopCode,RoadName,Description,Latitude,Longitude | Ad hoc; served stops. |
| `BusRoutes`, 2.3 p22 | ServiceNo,Direction,StopSequence,BusStopCode,Distance,first/last-bus times | Ad hoc; ordered routes. |
| `BusServices`, 2.2 pp20–21 | ServiceNo,Operator,Direction,origin/destination,frequency ranges | Ad hoc; service metadata. |
| `v3/BusArrival`, 2.1 pp13–19 | BusStopCode,Services,NextBus/2/3,EstimatedArrival,Monitored | 20 seconds; requested stop. |

GET authentication uses `AccountKey`. Collection pagination uses `$skip`, up to 500 records.
Bus arrival requires `BusStopCode`; `ServiceNo` is optional. Crowd feeds require `TrainLine`;
this audit selects EWL/CCL/DTL. GTFS download links expire after 15 minutes.
These are producer cadences, not polling entitlements. [Guide, §§1–2](https://datamall.lta.gov.sg/content/dam/datamall/datasets/LTA_DataMall_API_User_Guide.pdf)

## Phase 0 inventory: what must be demonstrated before use

The following are project acceptance requirements, not claims that the provider has met them.
The Phase 0 probe checks selected envelopes and field presence; it is not a full schema validator.
Unrecognised structures are retained only as type summaries and require investigation, not silent coercion.

| Feed | Proposed safe use after validation | Geographic, temporal and freshness checks still needed |
| --- | --- | --- |
| TrainServiceAlerts | Display attributed notices separately from calculated journeys. | Verify affected station/direction mapping, normal/recovery/disruption forms, message-time timezone and message age. Do not turn prose into an invented delay or restoration time. |
| Train schedule | Compute **scheduled** itineraries within validated coverage. | Inspect archive tables, agency timezone, effective calendars/exceptions, route/stop/trip joins and Tampines/Paya Lebar–Bugis coverage; validate transfers independently. Retrieval date does not prove valid service dates. |
| GTFS alerts | Overlay relevant advisories with their validity period. | Match informed entities to the same schedule version; inspect active periods, optional fields and header age. No affected entity must remain unknown, not globally clear. |
| GTFS trip updates | Apply a matched disruption update to a specific trip. | Validate trip identity, service date, stop sequence, cancellation semantics and source timestamps separately from schedule coverage. Missing updates are no evidence of punctuality. No continuous network-wide train-arrival promise. |
| Current crowding | Show a station-level band for a returned interval. | Check each requested line/station, interval expiry, unknown/NA handling and response completeness. No carriage, door, seating or boarding guarantee. |
| Crowd forecasts | Show explicitly labelled predictions for returned dates/intervals. | Inspect forecast horizon and generated/valid times. Do not relabel a forecast as a live observation. |
| Bus stops | Directory lookup and map points. | Page the required directory, preserve leading-zero identifiers and verify target stops. Coordinates do not establish safe pedestrian access or walking duration. |
| Bus routes | Ordered service-stop links and operating-window checks. | Preserve direction and repeated visits; inspect missing times, overnight and holiday rules. Two sample pages cannot establish network completeness or end-to-end journey timing. |
| Bus services | Display service metadata and labelled frequency assumptions. | Join directions/stop codes, validate frequency strings and applicable time bands. Headways are not individual departure or arrival predictions. |
| Bus arrivals | Show returned upcoming arrivals at a selected stop. | Inspect offset-bearing ETA, monitored/scheduled distinction, empty bus slots, service coverage and age. A single stop sample does not prove a complete bus itinerary. |

[GTFS Schedule](https://gtfs.org/documentation/schedule/reference/) defines service-day times, including times beyond 24:00,
agency timezone, weekly calendars and date exceptions. The audit counts calendar coverage and identifier joins independently;
station-name matches are only a discovery aid.
[GTFS Realtime](https://gtfs.org/documentation/realtime/reference/) uses POSIX timestamps and optional fields whose absence matters.
The [official protobuf schema](https://github.com/google/transit/blob/master/gtfs-realtime/proto/gtfs-realtime.proto)
and standard Python bindings are used for decoding, not as proof of LTA's actual field coverage.
The audit reports source ages without inventing an LTA freshness SLA.

## Access evidence and bounded sampling

The initial authenticated attempt is in [datamall-attempt1.json](evidence/phase0/datamall-attempt1.json).
It received HTTP 401 for 16 requests. No successful feed body or signed download was obtained.
Bus arrivals was not requested because a stop identifier could not be obtained from the directory.
This is evidence of rejected authentication, not proof that the feeds do not exist or that an account lacks every entitlement.
The [replacement-key attempt 3](evidence/phase0/datamall-attempt3.json), recorded 18 September 2026 at
20:25:53–20:26:12 Singapore time, received HTTP 200 for all 17 API requests. Authentication is now verified for this sample;
14 non-GTFS representative structure checks passed. This is a user-run live audit, not fixture evidence or a new agent-run probe.

All three GTFS endpoints returned a one-row `value` array containing lowercase `timestamp` and `link` string fields.
Audit version 2 incorrectly recognised only `Link`, so its `UNAVAILABLE_NO_LINK` labels describe an audit defect,
not provider unavailability. No ZIP/protobuf was fetched in that run. Version 3 accepts both forms and captures bounded timestamp
strings; its 13 synthetic tests passed. Attempt 3 cannot reconstruct the original URLs/timestamps and remains unchanged.

The [GTFS-only attempt 4](evidence/phase0/datamall-attempt4-gtfs.json) now verifies all three metadata requests and downloads
with HTTP 200 and successful basic parsing. The schedule reports Asia/Singapore, 19 route records, 17,576 trips and 1,211 stop
records; 333,262 stop-time rows have zero orphan trip/stop references. Calendar bounds aggregate to 1 January–31 December 2026;
3 active service IDs and 6,032 referencing trips were counted for 18 September only. This is not full-year/all-line validation.
There are 7,065 stop-time rows with at least one time at or after 24:00; service-day handling remains to be validated in a router.
Station substring counts are discovery hints, not exact platform/direction/transfer mappings or routable journeys.

The alert protobuf contains two alerts (header age reported as 20 seconds). Trip updates contains zero entities (header age
22 seconds). Download/protobuf initialization PASS; alert validity/relevance and nonempty update/cancellation/schedule matching
remain NOT TESTED. Zero trip matches when no trip updates exist does not validate compatibility and does not indicate punctuality.
Metadata timestamps, file Last-Modified and header freshness are separate from individual entity validity and usable schedule dates.
The new report is preserved with JSON contents unchanged and LF line endings; no raw blob, signed link or credential was retained.

Observed non-GTFS limits: EWL/CCL/DTL crowd intervals had ended 957.924–960.193 seconds before retrieval;
same-day forecasts had 48 distinct start timestamps spanning 00:00–23:30 +08, consistent with documented half-hour
forecasts but without proof of every interval's spacing; bus stops/routes were two full 500-row sample pages each;
bus services returned 500 + 301 records without a uniqueness/overlap check; arrivals were sampled at only `01012`
(11 services, 26 populated slots, both monitored and scheduled values). These do not establish network/corridor completeness.
Train notices included three message timestamps ranging from April to September with no timezone offset;
retained metadata cannot decide their ongoing relevance. Full details and next-phase gates are in [MILESTONES.md](MILESTONES.md).

At the end of Phase 0, data access was sufficient to begin the original Phase 1 notices/station-crowding implementation;
the runtime behavior was then untested. The Phase 1 section above now records its implementation and evidence separately.
Its [required crowding behavior](MILESTONES.md#required-expired-crowding-behavior-for-phase-1) is implemented and tested:
expired bands become unavailable-current, optionally retained as historical; fetching them again does not renew source time.
Unknown/NA is not quiet. Forecast integration and timetable/network routing remain later work.

The reusable runner requests one notice snapshot, three GTFS metadata responses and at most three downloads,
current/forecast crowding for three corridor lines, two pages of each bus directory, and arrivals at one returned stop.
It makes sequential requests with at least one second between API calls, no automatic retry/poll loop,
and stops after an API 401/403. Limits: 32 MiB per response, 256 MiB declared expanded ZIP size, 25-second request timeout.
These are deliberately conservative audit choices, not published provider limits.
The original failed attempt predated the stop-after-auth-failure improvement; its HTTP outcomes are unaffected.

Raw responses remain in process memory. The saved report contains status codes, types/counts, selected time ranges,
archive hashes, schedule counts and bounded coverage summaries. It excludes keys, raw vehicle positions,
notice text, signed URLs and request headers. An HTTP 200 error envelope fails the contract check;
an empty collection supplies no representative record; an empty ZIP is not accepted as a schedule.
Metadata access, download success, parsing, freshness and usable coverage remain separate checks.

## Data-use and account constraints

The user-supplied account email requires confidential credentials, reasonable request frequency, compliance with the
licence/terms, and no direct hyperlinking of products/services to DataMall. Its screenshot contains a credential and is
excluded from this repository and evidence. The user confirms a replacement key and the new audit authenticates successfully;
revocation of the old exposed key was not independently checked. Ensure it is revoked through DataMall if replacement did not do so.
No request has been made to modify account terms or send messages to LTA.

The [API terms](https://datamall.lta.gov.sg/content/datamall/en/api-terms-of-service.html) allow commercial/noncommercial API use,
state a changeable 10-million-calls/day threshold, require confidential credentials and permit additional API-specific
conditions. That threshold is not a throughput guarantee. Availability and accuracy are not guaranteed.
No universal per-second quota or blanket cache-retention deadline was established in this review.
The replacement-key sample demonstrates accepted API authentication; account-specific restrictions still apply.

The [Singapore Open Data Licence](https://datamall.lta.gov.sg/content/datamall/en/SingaporeOpenDataLicence.html)
requires source attribution and a licence link, permits reuse of covered datasets, excludes personal data and certain
third-party rights, and prohibits implying endorsement. LTA datasets do not become MIT-licensed project code.
Phase 1 retains dataset/access-date attribution with the official data.gov.sg licence link as described above. The email's
hyperlink restriction needs clarification from LTA if a later public product links directly to DataMall. Until clarified, do not
add product-facing DataMall API/download hyperlinks; documentation citations here remain research references.
Signed-link expiry is not schedule validity or a retention policy.

## DataMall versus EXTOL

The [EXTOL developer guide revision 1.6, 27 July 2026](https://datamall.lta.gov.sg/content/dam/datamall/pdf/Extended_OBU_Library_SDK_Developer_Guide.pdf)
explicitly separates the DataMall API Access Key from the SDK Account Key (§2.1 p19).
EXTOL initializes its key inside native Android/iOS SDK code (§3.8.1 pp23–24, §4.6.1 p52).
It must not be modelled as a backend-only DataMall credential or embedded in browser JavaScript.

Native requirements include Android API26+ or iOS13+, Bluetooth, a compatible nearby paired OBU,
phone registration and motorist consent. Android scanning also requires location services.
EXTOL supplies OBU/motorist functions, not the browser rail feeds audited here.
Its mock modes are not physical OBU verification. [Guide §§2–4](https://datamall.lta.gov.sg/content/dam/datamall/pdf/Extended_OBU_Library_SDK_Developer_Guide.pdf)

For a future explicitly requested native phase, provision the separate SDK key through protected native build/CI configuration,
then pass it using the official native initialization API. This is an engineering recommendation; the guide establishes
native placement, not a promise that packaged native credentials can never be extracted.
Review the SDK licence, sample-code licence, consent, OBU access and physical devices before implementation.
No EXTOL credential, SDK, phone or OBU was used in Phase 0.

## Reproduce the audit securely

Use Python 3.10+ in a real local terminal. Install the pinned audit-only dependencies; they do not change `package.json`.

```powershell
python -m pip install --target test-results/audit-deps -r scripts/audit-requirements.txt
python scripts/test-audit-datamall.py
python scripts/audit-datamall.py --prompt
```

To reproduce the completed GTFS access/basic-parse smoke test when needed, use the corrected version 3 runner. This makes
three metadata requests and at most three downloads. The following was the attempt-4 command; use a new output filename for a
future run to preserve earlier local evidence. No repeat run or key entry is needed merely to review the saved reports:

```powershell
python scripts/audit-datamall.py --prompt --gtfs-only --output test-results/phase0/datamall-gtfs-smoke.json
```

The DataMall API key is required at that masked prompt; EXTOL credentials are not needed. Do not interpret successful
synthetic parser tests or HTTP 200 metadata as a passed live download/calendar/coverage check.

The prompt hides input and stores the key only in the audit process. No `.env` or persistent credential is created.
An existing process-only `LTA_ACCOUNT_KEY` may be used without `--prompt` in a controlled runner; do not type a literal
key into a command, chat, Git file or shell history. Reports default to ignored `test-results/phase0/`.
Review sanitised evidence before copying it into `docs/evidence/phase0/`.
Future production DataMall configuration belongs in the existing provider's runtime secret settings as `LTA_ACCOUNT_KEY`;
that is a later deployment action and was not performed here.
