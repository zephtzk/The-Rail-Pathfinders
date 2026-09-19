# Final Review 3 delivery

FR2 feedback is implemented in five parallel work chats and combined on `codex/fr2-integration`. The already published FR2 baseline was reconciled with GitHub main in [PR #9](https://github.com/zephtzk/The-Rail-Pathfinders/pull/9). This record will be completed with the final integration checks and publication result.

## Changes for review

1. Removed the healthy “Location on ±” status card while retaining device location on the map and actionable permission/recovery information.
2. Moved street-address search into both journey endpoint fields alongside station, bus-stop and saved-place results. Clear, swap, keyboard selection and delayed-response cancellation preserve the selected endpoint accurately.
3. Removed the two requested caregiver paragraphs.
4. Fixed recipient-link button text contrast, including hover and pressed states.
5. Applied consistent spacing and more compact information display across the tabs, following Spending and Settings.
6. Added sourced card-fare estimates for rail, basic buses and mixed journeys. Approximate distance is labelled; actual charges, refunds, original calculation details and demo exclusion remain intact.
7. Put Map and Station guide beside the journey-panel expand control. The normal 390px header shrank from 97px to 53px and wraps at enlarged text sizes.
8. Simplified Demo controls to the journey scenario chooser. Judges can edit planned works or travel disruption details, save/edit/resolve incidents in a persistent local log, and run replay back in the main app. Services retains service information and nearby facilities after notices are dismissed. Simulated incidents remain visibly distinct from official notices.

## Review walkthrough

- Plan a station or bus-stop journey and inspect Route details, then Start journey.
- Open Demo controls, choose Planned track works or Disruption during travel, adjust details and save. Run automatic event replay to inspect the effect on the selected journey; accepted travel is preserved.
- Open Services, dismiss/reopen a notice, and inspect the incident log. Edit or resolve an incident and check the updated information.
- Finish a real journey to record its estimated fare in Spending; enter the actual charge to replace the estimate in totals. Demo replay does not add personal expenditure.

## Sources and retained service limits

Fare sources, effective dates, estimation method and validation are recorded in [FR2 fare delivery](FR2_FARES_DELIVERY.md). This is not a payment-account integration. Rail coordinate distances and provider distances can differ from charged fare distances; unsupported premium services and uncertain reroute costs require a manual amount.

The existing public runtime has no OneMap/LTA credentials, hosted sharing database or Web Push configuration. Local station/bus planning, fare estimates and demo incidents work without those integrations; online address lookups, official live feeds and hosted sharing retain explicit unavailable states. Search also rejects OneMap authentication errors returned with HTTP 200 instead of presenting them as empty results.

Data coverage remains the retained rail/bus snapshot, not a guarantee of live conditions. Browser emulation does not establish physical-phone GPS accuracy, indoor accessibility, payment accuracy or FR3 user acceptance.

## Implementation evidence

- [Unified search](FR2_SEARCH_DELIVERY.md)
- [Caregiver and layout](FR2_POLISH_DELIVERY.md)
- [Fares and expenditure](FR2_FARES_DELIVERY.md)
- [Demo authoring and incident log](FR2_DEMO_DELIVERY.md)
- Services/replay and combined verification are appended when integration finishes.
