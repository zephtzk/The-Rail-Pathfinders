# Phase 0 — data availability and boundaries

Reviewed 18 September 2026. This is an access/contract audit, not feature integration.
Documentation, synthetic tests, authenticated responses and physical-device observations are separate evidence classes.
See [MILESTONES.md](MILESTONES.md) for the acceptance decision and current live results.

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

## What must be demonstrated before use

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
not provider unavailability. No ZIP/protobuf was fetched. Version 3 accepts both forms and captures bounded timestamp strings;
13 synthetic tests pass, but fresh download access, schedule validity and realtime contents remain NOT TESTED.
The sanitised report cannot reconstruct the original URLs or their timestamp values, and was preserved without relabelling it.

Observed non-GTFS limits: EWL/CCL/DTL crowd intervals had ended 957.924–960.193 seconds before retrieval;
same-day forecasts had 48 distinct start timestamps spanning 00:00–23:30 +08, consistent with documented half-hour
forecasts but without proof of every interval's spacing; bus stops/routes were two full 500-row sample pages each;
bus services returned 500 + 301 records without a uniqueness/overlap check; arrivals were sampled at only `01012`
(11 services, 26 populated slots, both monitored and scheduled values). These do not establish network/corridor completeness.
Train notices included three message timestamps ranging from April to September with no timezone offset;
retained metadata cannot decide their ongoing relevance. Full details and next-phase gates are in [MILESTONES.md](MILESTONES.md).

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
Retain dataset/access-date attribution when integrating later. The email's hyperlink restriction and the licence's required
attribution links need clarification from LTA if a public product links directly to DataMall. Until clarified, do not add
product-facing API/download hyperlinks; documentation citations here are research references, not a new product feature.
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

For the remaining GTFS validation only, use the corrected version 3 runner. This makes three metadata requests and
at most three downloads, retaining the existing full audit output separately:

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
