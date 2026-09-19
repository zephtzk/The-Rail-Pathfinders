# FR2 public testing release

**Commute Copilot version 6 is public:** https://commute-copilot-nebula.simhongmen.chatgpt.site

Published and independently checked on 19 September 2026 following the user's explicit request to publish the current version for FR2. This includes all integrated FR1 changes and the four pre-FR2 refinements described in [PRE_FR2_DELIVERY.md](PRE_FR2_DELIVERY.md). FR2 tester sessions and physical-phone testing have not been run by this release process.

## Exact release

- Sites version: **6**, deployment status **succeeded**.
- Site: `appgprj_6aad0ab90e5881919eca01b79f19aa24`.
- Version ID: `appgprj_6aad0ab90e5881919eca01b79f19aa24~appgver_64474e08e7008191944b2bcfba50a257`.
- Deployment ID: `appgdep_6aae05a6e7048191ad7782172890db0c`.
- Source commit: `08493a74c12254ed1a6cdc4acce32a51d3ca7452`, pushed and verified at the existing Sites source repository's `main` before saving the version.
- Application SHA-256: `f40a6cc434ca66816c57ab3bd4edfe213336c3ede0ad73bd2424112a4bc54670`.
- Worker SHA-256: `cfa66148e820fce55ec1b9c43cf78c7225a0ebfb7096479bbd399ba0e9e70296`.
- Existing public audience preserved at access revision **3**; runtime environment revision remains **0**.

The deployment archive contains only validated `dist/` output, 113 files. Every archive file was checked against that built output. The existing GitHub repository was not pushed or merged as part of Sites publication; Sites has its own configured source remote. This documentation commit records the release and does not change the deployed application.

## Public verification

A fresh anonymous desktop Edge browser at 390×844 with touch/mobile emulation passed **15 checks** against the public URL: no sign-in, exact application hash, updated service-worker cache, eight compact tabs, default simple guidance, collapsed settings descriptions, real packaged CC26→EW9 planning, one-click Start, white Start text, independent caregiver permissions, retained indoor correction tick, Staff reset tick, sourced nearby lifts/toilets, truthful unavailable maintenance status, preserved journey identity and no runtime errors. The count groups related checks as recorded in the [public browser evidence](evidence/fr2-publication/public-browser-verification.json).

The verified local foundation remains 454 JavaScript tests, 44 Python tests and 1,046 browser checks. Publication did not provision OneMap/LTA secrets, a hosted sharing database or Web Push; those existing unavailable-service states remain explicit. The earlier illustrated judges guide remains the historical R5 guide and was not rewritten for this FR2 deployment.

If a returning installation shows old controls, refresh, allow the app to finish loading, then refresh once more. Keep existing browser data to retain saved routes, preferences and spending. Allow browser location when prompted to test location assistance; browser permission is separate from caregiver sharing.

[Publication metadata](evidence/fr2-publication/publication.json) · [Validated package](evidence/fr2-publication/package-manifest.json).
