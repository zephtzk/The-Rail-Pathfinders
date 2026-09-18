# R2 publication and R3 starting point

Published 19 September 2026 Singapore time (18 September 2026 UTC), following the owner's explicit request to deploy R2 and make the necessary PRs and merges.

## Live release

- [Commute Copilot](https://commute-copilot-nebula.simhongmen.chatgpt.site) now serves **Sites version 4**. The native deployment response reported **succeeded** at `2026-09-18T16:58:37.041297Z`.
- [PR #3 — Features R2: map-first planning and Waze-inspired UI](https://github.com/zephtzk/The-Rail-Pathfinders/pull/3) was merged into `main` by **zephtzk** at `2026-09-18T16:56:13Z`.
- Deployed source: [`caf24113ff54560c975a5fac8683ec075c108798`](https://github.com/zephtzk/The-Rail-Pathfinders/commit/caf24113ff54560c975a5fac8683ec075c108798). Its Git tree is identical to tested R2 head `1649d71510cb841af830fc21eb7ce905eeed09e0`; the underlying runtime commit is `72786954b89279b4217c6060cc887b41a253dc1a`.
- The same merged source was pushed to the existing Sites source repository's `main` branch before saving and deploying the version. GitHub publication alone does not update Sites.
- Existing project `appgprj_6aad0ab90e5881919eca01b79f19aa24` and URL are retained. Access was rechecked after deployment: **custom, revision 2; owner plus three existing external viewers; no groups**. No invitations or access changes were made. The older Phase 4 document's owner-only description is historical.
- Runtime environment revision remains **0**. This release does not configure a provider credential, D1 database or push service.

Later commits recording this release are documentation only and are not a separate application deployment.

## Release evidence

The clean PR was mergeable and had no outstanding reviews or failing checks; no GitHub check runs were configured. The committed local acceptance evidence remains the testing basis: **259 JavaScript tests, 40 Python tests, 35 unified R2 browser checks**, retained planner/privacy/offline regressions, and an identical committed-source rebuild. See [R2 verification](R2_VERIFICATION.md).

| Artifact | SHA-256 |
| --- | --- |
| Application | `279031d5b91b9c35e15e1c202bd59ac20f120ea1b1156fdf5c348489291bc749` |
| Worker | `e343583b4a2d86bc4d1d12712e786aac72830d00d5d876486349a97c409c4a30` |
| Submitted gzip archive | `17c3e5bbf659ac6f7eb75c69539636d8fcc8a1bdcc5aef75f4c30d20e01d436c` |

The existing successful build was reused because the merged source tree was unchanged. Packaging validated the application/Worker identities, matching source and built hosting manifests, all imported Worker siblings, and the top-level `dist/` layout. The archive contains 75 files. The Sites shell helper could not run in this Windows shell environment; Python's standard `tarfile` produced and reopened the validated equivalent build-output archive. No source tree or credentials were included.

Sites stored the uploaded archive as tar, with a separately reported content hash; it is not asserted to equal the submitted gzip representation. The saved-version source and successful deployment bind the release to the merged commit. See the [sanitized publication receipt](evidence/r2/publication.json).

Deployment completion and unchanged access were verified through Sites, and a browser handoff to the live URL was requested. This release did **not** rerun a hosted browser journey or claim new physical-device, hosted offline, live-provider or multi-user delivery evidence; historical hosted checks belong to version 3.

## R3 baseline and remaining limits

Start R3 from refreshed `main`, ensuring it contains `caf24113ff54560c975a5fac8683ec075c108798`. Keep new implementation isolated from the deployed R2 release. No specific R3 features were supplied with the deployment request.

- Hosted caregiver sharing remains unavailable without the declared/configured D1 binding. Local durable sharing tests are not hosted D1 evidence. External Web Push and live LTA access remain unverified.
- Verified real toilet routes remain zero, and there is no verified continuous accessible indoor/door-to-door corridor. Fixture routes remain visibly labelled.
- Arrive by filters a chosen departure against a deadline; it is not a latest-departure optimizer.
- Foreground GPS is opt-in and cannot prove boarding, underground position or arrival. Offline readiness covers measured local shell/accepted-trip state, not live feeds, sharing APIs or external tiles.
- Physical Android/iPhone testing, mobile keyboard/permission behavior and real tester comprehension remain outstanding.

Use [R2 delivery](R2_DELIVERY.md), [R2 verification](R2_VERIFICATION.md) and the updated README as the implementation starting point. Preserve the existing audience unless the owner requests a change. Sites version 3 remains the preceding release; rollback was not exercised during this deployment.
