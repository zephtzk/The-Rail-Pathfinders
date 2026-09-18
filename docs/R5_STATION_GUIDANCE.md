# R5 station guidance, simple guidance and staff card

Reviewed 19 September 2026. R5 adds operator location facts, relevant indoor-coverage notices, shared current-instruction resolution, a locally saved simple-guidance preference and a separate Show-to-staff page. **The verified real indoor pilot is not complete: zero real corridors are enabled.** The existing fictional training graph remains available for rehearsal only.

## Reviewed evidence

| Station | Operator-documented information | Scope and remaining uncertainty |
| --- | --- | --- |
| [Bugis](https://www.sbstransit.com.sg/Service/TrainInformation?Station=BGS&TrainLine=DTL) | D/E street/concourse lifts, a concourse/platform lift, concourse toilets near E | Downtown Line facts. Existing A/B exterior traces do not prove access to D/E lifts. |
| [Tampines](https://www.sbstransit.com.sg/Service/TrainInformation?Station=TAM&TrainLine=DTL) | D/E lifts, concourse/platform lift and concourse toilets | Downtown Line facts. No full checked EW/DT transfer corridor is retained. |
| [Promenade](https://www.sbstransit.com.sg/Service/TrainInformation?Station=PMN&TrainLine=DTL) | A/C street/concourse lifts, concourse/platform lift access, concourse toilets near A | Downtown Line facts. A listed lift does not prove its live operational status. |

The official pages were rechecked by web retrieval on the review date. These are short attributed factual summaries, not copied plans or a route graph. Operator source-update dates were not supplied. Review date is not source age, survey date or live verification. Toilet doorway, fare-gate side, access restrictions, hours, fee and accessible fixtures remain unknown unless already supported by separate retained evidence. No existing toilet recommendation or facility-routing gate is relaxed.

[OneMap BFA documentation](https://www.onemap.gov.sg/apidocs/bfa), also rechecked, describes routes tested with wheelchair users in selected areas and limits API access to approved users by request. Ordinary routing credentials do not establish BFA approval. BFA exterior coverage cannot demonstrate the complete indoor platform/lift/toilet corridor.

[SBS Transit’s Waymap announcement](https://www.sbstransit.com.sg/news/sbs-transit-and-uks-waymap-launch-asia-pacifics-first-of-its-kind-wayfinding-app-to-help-the-visually-impaired-travel-with-confidence) describes a Tampines trial with facilities mapped for navigation. It does not provide permitted graph source bytes or a public graph-export contract for this application. No third-party graph or diagram was copied, and no application or message was sent to a provider.

## Exact remaining pilot dependency

Obtain permitted, inspectable evidence for one bounded corridor connecting the origin doorway, accessible gates, each floor/lift transition, platform and toilet doorway, then its required return/onward direction. Record stable nodes/edges, directionality, paid-area boundaries, access constraints, source/reuse terms, source age and review method. Distinguish a desk-reviewed static path from a field survey and from live operating status. No physical survey occurred during this implementation. A complete corridor must pass the existing facility/toilet gates before `VERIFIED_INDOOR_CORRIDORS` or the real routing dataset can be populated. Operator location facts are held separately and cannot be passed to the graph engine as edges.

## Presentation and canonical-state boundary

`resolveCurrentExecution` derives normal guidance, simple guidance and staff defaults from the same accepted route index or accepted detour index. Precedence is terminal state, pause, main path blocked, main path review, detour blocked, accepted detour phase, then canonical route phase. GPS, clock time, prepared searches and unaccepted route proposals never advance it. Facility instructions display public labels instead of internal fixture facility IDs.

The `commute-copilot-presentation-v1` key stores only the simple-guidance boolean and schema version. Travel preferences, saved plans, sharing and journey state are separate. Saving checks the read-back value and reports storage failure. Simple mode shows one current instruction with larger appropriate controls, collapses secondary actions, removes Next from the primary display and suppresses animated scrolling and motion. Route overview, manual checkpoint corrections, errors, evidence notices and explicit finish/cancel remain accessible. No speech or audio is included.

Staff cards are presentation only. The automatic message tracks the accepted instruction, including toilet outbound/return and pause/review/blocked/terminal states. Alternate platform, transfer, exit, lift and alighting requests reset to automatic when route/phase/current instruction changes. Unrelated location or permission revisions do not erase the choice. Card text is escaped; it contains no medical label or caregiver upload. Opening it does not dispatch a message, grant sharing permission or change progress.

The Map/Station guide tabs support click and arrow/Home/End keys. Horizontal swipe works on the labelled switching strip only; map dragging and vertical trip-sheet scrolling are untouched. On narrow screens Station guide uses the reading area above navigation; Map restores the trip sheet. Tab height is observed so enlarged text cannot cover station content. No floor geometry is invented. Work-in-progress notices appear for access, transfer and exit transitions involving rail/explicit indoor context and OneMap walking/waiting beside rail legs, including in simple guidance; train rides and ordinary bus-stop access are not blanket-labelled unsupported.

## Verification scope

Nine focused model tests cover exact original indices, accepted/proposed separation, detour outbound/return, paused/blocked/review/terminal precedence, presentation storage/reload/failure, alternate-card reset, malicious labels, public labels over private nicknames and selective local/external coverage notices. The 46 existing journey/facility/toilet tests and existing facility browser lifecycle also pass.

`node tests/guidance-r5-browser.mjs` passes 16 isolated UI checks. `node tests/r5-guidance-browser.mjs` passes 31 integrated checks against the R5 test preview on port 4196. These exercise actual clicks and keyboard input, CDP touch swipes, normal/simple toggles, accepted replacement while staff is open, a manually confirmed toilet arrival/return, paused/blocked/review/completed/cancelled cases, 320px/200% text and reduced-motion presentation. Fixtures are seeded as valid accepted snapshots before the app loads, then traveller actions use its controls. The tests never claim a seeded fixture establishes a real corridor.

Screenshots were inspected and used to fix primary contrast, overlapping enlarged tabs, map-notice placement and the narrow station reading pane. Durable samples and check summaries are in [guidance evidence](evidence/r5/guidance/). Browser verification is desktop Edge emulation; it does not establish physical-phone usability, actual facility status or field-verified corridors. See the R5 delivery/verification record for the final app-wide build and integration results.
