# FR3 recipient-link storage correction

The reported Create recipient link failure was a deployment configuration gap. The API correctly returned 503 because the published Worker had no `SHARING_DB` binding. Sites' database overview confirmed that no database was attached. A client change or refreshing browser storage cannot fix that cause.

The existing Sites hosting manifest now requests the `SHARING_DB` D1 binding. A generated Drizzle migration creates the existing sharing store schema, and the build packages its SQL, snapshot and journal at `dist/.openai/drizzle`. Deployment retains the same project, public audience and API authorization/consent rules. Runtime code continues to use durable compare-and-swap SQL; there is no in-memory production fallback.

`tests/sharing-deployment.test.mjs` executes the packaged schema's source journal and exercises creation and invitation review through separate handlers using the configured D1 binding contract. Existing sharing/push tests cover consent, authorization, revocation, rate limits and persistence. `tests/sharing-live.mjs` and `tests/fr3-sharing-link-browser.mjs` provide bounded deployment smoke checks: one synthetic share each, no actual location, private in-memory capabilities and deletion after completion. The browser test exercises the actual Caregiver button and a separate recipient browser context.

The combined second FR3 build passes 549 JavaScript tests, 44 Python data tests and the 146 existing FR3 browser checks. The text-size task separately records 2,079 checks across 284 rendered layouts in [its delivery record](FR3_TEXT_SIZE_DELIVERY.md). Exact publication and live-sharing outcomes are recorded in `evidence/fr3-review/stage2-publication.json` after deployment.

Recipient links and foreground sharing do not require Web Push credentials. Background push delivery remains unconfigured/unverified. Fixed-deadline cleanup during site inactivity also remains unverified because no scheduled trigger is confirmed for this Sites deployment; sharing API requests perform cleanup, expired credentials are rejected, and explicit deletion works immediately. See [sharing operations](SHARING.md).

## Deployed result

Sites version 9 published successfully at `2026-09-19T06:18:24.275902+00:00`. The live database overview reports binding `SHARING_DB` with table `sharing_state`. Both production smoke scripts passed: the API verified creation/review/consent/persistence/revocation/deletion, and the browser verified all 14 Create/Copy/recipient-review/acceptance/reload checks. Both synthetic shares were deleted. [Exact deployment receipt](evidence/fr3-review/stage2-publication.json).
