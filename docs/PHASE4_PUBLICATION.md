# Phase 4 publication and owner testing handoff

Recorded 18 September 2026 UTC and Singapore time. The owner authorized the original branch push and existing Site publication after confirming written redistribution permission for the two locality-map JPEGs. Original Git history and copyright attribution are preserved. This supersedes the prepublication status in the historical readiness report. No Phase 5 work or real-provider routing effects are included.

## Published application

- GitHub release commit: [`32d97e39172827cd31916f62aa39603c2cb3e5b3`](https://github.com/zephtzk/The-Rail-Pathfinders/commit/32d97e39172827cd31916f62aa39603c2cb3e5b3), on [`codex/phase-4-live-rerouting`](https://github.com/zephtzk/The-Rail-Pathfinders/tree/codex/phase-4-live-rerouting). Later documentation/evidence commits on this branch describe this release; they are not a new application deployment.
- Sites source: `https://git.chatgpt-team.site/87da70e4-fc14-4ba8-8070-27f1291fe023/appgprj_6aad0ab90e5881919eca01b79f19aa24.git`, branch **main**, fast-forwarded to the same release commit. A GitHub push alone does not update Sites.
- Existing Site: [Commute Copilot](https://commute-copilot-nebula.simhongmen.chatgpt.site/multimodal.html), **version 3**, deployment **succeeded**. Existing project `appgprj_6aad0ab90e5881919eca01b79f19aa24` and URL are unchanged.
- Access remains **owner-only**, revision 1: one owner, no groups or external visitors. An anonymous application-data request returned HTTP 403. No invitations or access changes were made.
- Runtime environment remains revision 0 with no configured key. Optional advisory endpoints correctly report `not_configured`; scheduled and synthetic tests work without `LTA_ACCOUNT_KEY`.

| Identity | SHA-256 |
| --- | --- |
| Application | `c24517f7ea8f2d4b797d7ab7b88083a327ab6e1bc59f3c9c82de312be725def9` |
| Worker | `8980fe6564cffe5679f6dd747e8c0f9f68372c2b3803094888b9f50ae2c6ccff` |
| Rail network | `a7158eef5df2b5cbf345e3de03872205a61d9a4919f11b4745c192d4daf7b934` |
| Bus network | `7dae33ac2f4435a7a765eccc6f83fa4b188929fc7db1271eddf2515e50ad5bac` |
| Walking data | `19299cbf9daf2014bb590b7b4c415311c2c996780fafd7bdb0cebd1f2c795598` |

The Worker hash was checked in the verified local build and submitted archive; the hosted Worker is not publicly downloadable. Sites provenance binds version 3 to the exact source commit. Hosted application metadata and the three served data files match the local candidate. The local submitted gzip archive hash and Sites' stored tar content hash are recorded separately in the publication receipt; they are different archive representations and are not asserted to be byte-identical.

## Evidence and limits

The clean release acceptance run passed: **180 unit/import tests**, **163 browser assertions**, **18 Worker/build/performance checks** and **four reviewed walking paths**. A fresh Git archive build reproduced the application and Worker bytes. Performance checks include normal, scoped synthetic cancellation and confirmed missed-connection comparisons, each with 20 warm samples and a 1,000 ms p95 budget. These are local engineering measurements, not phone or hosted-latency claims.

Hosted read-only API checks passed for application/data identity, gzip delivery, matching service-worker cache identity, owner-only gating and uncached missing-key responses. Hosted desktop UI checks passed for:

- Fixture A: Bugis to Orchard, 18 September 2026 at 10:00, arrival 10:24 with 540 seconds walking.
- Accept, search Tampines Interchange to Bugis without accepting, then reload: accepted Bugis to Orchard instructions and no-deadline constraint remained intact.
- Waiting at step 2, onboard at step 3 and transfer at step 4: walking used remained 120 seconds of the original 20-minute limit; the full transfer and exit allowance remained 420 seconds. Onboard guidance required confirming alighting before recalculation.
- Labelled synthetic cancellation, compare, decline, reload and compare: decline was retained and the duplicate offer suppressed.
- Fresh synthetic cancellation, explicitly accept alternative and reload: the replacement EWL leg at 10:06:30–10:08:30 persisted, replacing the original 10:04–10:06 leg.

See [local acceptance receipt](evidence/publication/release-acceptance.json), [local performance evidence](evidence/publication/verification.json), [hosted API checks](evidence/publication/hosted-api-verification.json) and [publication receipt](evidence/publication/publication.json). Evidence excludes credentials, signed download links and account screenshots. User comprehension was not measured by the agent.

**Still NOT TESTED:** physical Android Chrome/iPhone Safari, mobile keyboards, OS large text, hosted airplane-mode reload/reconnect and external tester comprehension. Local automated offline and desktop viewport checks passed but do not close these gaps. Real-provider cancellation/delay/recovery integration remains disabled and unfinished; representative live evidence remains separate work.

## Owner phone smoke, then a small tester group

Use the [device checklist](../DEVICE_CHECKLIST.md) and [result template](TEST_RESULTS_TEMPLATE.csv). Keep the fixture date **2026-09-18**, even when testing later. Rail coverage ends 31 December 2026; bus pilot services 2/23/28 cover ordinary weekdays through 2 October 2026, with boarding and alighting within 09:30–16:30 Singapore time.

On each available physical phone, sign in and complete accept/preview/reload, confirmed progress, both synthetic decisions, airplane-mode reload with Wi-Fi disabled, two reconnects, keyboard editing, rotation and large-text checks. Use fresh acceptance for missed connection, all-late and exhausted-walking cases in the full checklist. Record the device/browser/build, steps, expected and actual result, and the tester's own description of the next action.

After the owner smoke passes, obtain explicitly approved tester identities and access arrangements before granting access or sending invitations. No tester identities or phone results have yet been supplied. Keep the existing Site identity and history. Version 2 remains an available rollback artifact; rollback has not been exercised.
