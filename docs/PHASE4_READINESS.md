# Phase 4 user-testing readiness and proposed publication

**Historical prepublication report:** the owner subsequently confirmed written redistribution permission for the two maps and authorized publication. GitHub was pushed and existing Sites version 3 was deployed and checked. The [publication report](PHASE4_PUBLICATION.md) supersedes the version 2, unresolved-permission and hosted-not-tested statements below. See [PUBLICATION_AUTHORIZATION.md](PUBLICATION_AUTHORIZATION.md). This report preserves the original readiness findings rather than rewriting their history.

Prepared 18 September 2026. Scope: scheduled planning, accepted journeys, confirmed progress, saved/offline guidance and clearly labelled synthetic rerouting. **Real-provider routing effects remain disabled and unfinished. No Phase 5 work is included.**

The local candidate is prepared for a bounded test round. Publication remains a separate decision: the public-history review has an unresolved operator-map redistribution item; hosted candidate verification, owner phone smoke tests and external access are still outstanding. No push, deployment or access change was performed.

## Tester handoff

Use the updated [README](../README.md), [device checklist](../DEVICE_CHECKLIST.md) and [result template](TEST_RESULTS_TEMPLATE.csv). The checklist is a 20–30 minute script with fixed inputs, expected results and a question recording whether the tester understood the next action.

Entry pages: `/multimodal.html` for Phase 4, `/` for wider scheduled rail, `/replay.html` for the separate historical corridor experience. The existing Site remains owner-only version 2 and does not contain this candidate. Do not invite testers to it before publication, identity verification and approved access.

Use **18 September 2026, 10:00** for repeatable examples. Rail supports **18 September–31 December 2026**, subject to calendars/exceptions/carryover. Bus services 2, 23 and 28 support ordinary weekdays **18 September–2 October 2026**, boarding and alighting **09:30–16:30**. Bus timing is uncalibrated. Four exterior connections cover Paya Lebar/Bugis; no address, fare, step-free, broad bus or intermediate onboard-alighting capability is added. Progress recalculation stays within the accepted civil date.

## Candidate identity and verification

The candidate is the local commit containing this report on **`codex/phase-4-live-rerouting`**, descended from Phase 4 base `7db02b9d456dfa54f2cf9abce0238ec63db24d66`. The exact final commit SHA and tree are recorded by the **post-commit** acceptance receipt at `test-results/readiness-candidate/receipt.json`. It is intentionally outside tracked source: a commit cannot contain a receipt naming its own final hash. Require `status: PASS` and `cleanCandidate: true` and match its SHA to `git rev-parse HEAD` before any push. A separate final handoff records that exact SHA for this pass.

| Artifact | Candidate SHA-256 |
| --- | --- |
| Application | `c24517f7ea8f2d4b797d7ab7b88083a327ab6e1bc59f3c9c82de312be725def9` |
| Worker | `8980fe6564cffe5679f6dd747e8c0f9f68372c2b3803094888b9f50ae2c6ccff` |
| Rail network | `a7158eef5df2b5cbf345e3de03872205a61d9a4919f11b4745c192d4daf7b934` |
| Bus network | `7dae33ac2f4435a7a765eccc6f83fa4b188929fc7db1271eddf2515e50ad5bac` |
| Walking ledger | `19299cbf9daf2014bb590b7b4c415311c2c996780fafd7bdb0cebd1f2c795598` |

`npm run verify:readiness` runs the existing local acceptance checks, strengthened for the requested boundaries. Set `READINESS_REQUIRE_CLEAN=1` and the installed `BROWSER_EXECUTABLE` as described in the README. The runner uses a separate no-secret loopback server, closes it afterward, and preserves earlier Phase 2–4 evidence. Its receipt and logs are local artifacts; retain them alongside the proposed release.

- **140 Node tests, 27 rail-importer tests, 12 bus-importer tests and 1 walking-metadata test.** Syntax checks, pinned input/build gates and independent validation of four pedestrian links are included.
- **163 browser assertions:** 39 Phase 4, 29 rail, 15 rail-offline, 27 bus/walking pilot, 30 replay and 23 live-panel synthetic-contract checks. Added assertions cover unaccepted-search reload, declined-offer reload, waiting/onboard/transfer walking, missed connection, late alternatives, no feasible route and served application identity.
- **18 Worker/build/performance checks**, including 60 warm comparisons split equally among undisrupted, scoped synthetic cancellation and confirmed missed connection. Each bucket independently enforces p95 ≤1,000 ms; correctness checks require a real offer, applicable scoped cancellation, exclusion of the cancelled trip and preserved total walking allowance. Cold index/search/event/comparison times are reported separately. No unsupported provider-delay semantics were invented.
- **Clean source export:** build a fresh `git archive` of the final commit and compare application identity and Worker bytes to the tested build. This also catches ignored stale output accidentally included by the ordinary build. Uses the same installed locked Leaflet and Node/zlib runtime; it is not a new registry install or an actual Linux-host test.

Rehearsal suites passed. Final approval evidence is the post-commit receipt, performance JSON, browser JSON and reproducible-build JSON in `test-results/readiness-candidate/`; do not substitute historical Phase 4 measurements. Targets remain 3,000 ms first usable browser panel, 150 MiB first-result browser heap, 3 MiB compressed routing data, zero automatic startup live requests and bounded reconnect requests. Measurements are desktop Edge over loopback; no phone or WAN claim follows.

The runtime changes in this pass are attribution and deterministic build handling. LTA and OSM credits now appear in the pilot; the rail source uses plain-text attribution with the licence link. Runtime text has LF checkout rules, asset ordering is explicit and the gzip OS marker is canonical. Imported source/data bytes and their hashes are unchanged. Node **24.16.0**, zlib **1.3.1-e00f703** were used; compare outputs again if the build runtime changes.

## What will become public

The destination GitHub repository is **public**. A branch push exposes its entire reachable history, not just the final diff. The original unpublished range was `c7f71e5..7db02b9`: Phase 2 `faa611a`, newline-policy correction `d1a432b`, Phase 3 `38275dc`, Phase 4 `7db02b9` (204 changed files). This pass adds an ordinary descendant commit; no history was rewritten.

Review covered all unique blobs in those four commit trees plus the current tree: 267 blobs, 264 decoded text items including eight GTFS ZIP members, and all 11 tracked image paths. No actual credentials, private keys, signed download links or credential files were found. Matches were explicitly synthetic examples or lockfile integrity hashes. Intended publication includes pinned source archives, compiled data, tests, acquisition ledgers, sanitised evidence and reports. Generated output, dependencies, local logs and Python caches remain ignored. The readiness diff was separately reviewed.

Public metadata remains: developer workspace paths in historical reports, Site/project/deployment identifiers and owner hostname, and ordinary OSM contributor metadata. These are not authentication secrets; this is not a claim that all personal identifiers were removed. Images showed application QA or source maps, without account screenshots or EXIF/GPS metadata.

**Unresolved public-history item:** `data/bus/walking-evidence/smrt-bugis-map.jpg` and `smrt-paya-lebar-map.jpg` carry © Land Transport Authority. Their redistribution permission is not recorded. [Third-party notices](../THIRD_PARTY_NOTICES.md) and LICENSE now distinguish their rights, LTA data, OSM/ODbL and MIT application code. Attribution is confirmed; permission to republish those maps is not established by this pass. Review their publication rights before authorizing the public GitHub push. Removing only the tip copies would leave historical copies in the push; history was preserved as instructed. The application does not bundle these JPEGs.

## Exact publication destinations

| Purpose | Repository / branch |
| --- | --- |
| GitHub review and source distribution | `https://github.com/zephtzk/The-Rail-Pathfinders.git` → **`codex/phase-4-live-rerouting`** |
| Existing Sites deployment source | `https://git.chatgpt-team.site/87da70e4-fc14-4ba8-8070-27f1291fe023/appgprj_6aad0ab90e5881919eca01b79f19aa24.git` → **`main`** |

Preserve project **`appgprj_6aad0ab90e5881919eca01b79f19aa24`**, its `.openai/hosting.json` identity and URL **https://commute-copilot-nebula.simhongmen.chatgpt.site**. A GitHub push does not publish that Site. The [sanitised hosting plan](evidence/readiness/hosting-plan.json) records the exact Sites binding, owner-only custom audience (one owner, no groups/external visitors), available external invitations and empty runtime environment revision 0. The binding lookup minted an ordinary short-lived credential with automatic publication disabled; its token was discarded without use or persistence.

Current hosted version **2** points to `f8546eef7e950ffb3e50f98a6867b4e73f3dedf2`; this commit is already an ancestor of the candidate via the original GitHub integration merge. Before an authorized Sites push, inspect the current remote `main` tip. If unchanged, the candidate can fast-forward it. If newer/divergent, preserve both histories through a normal reviewed merge and reverify the resulting commit. Never force-push to work around divergence or substitute a different SHA under the tested archive.

GitHub's connector confirmed the repository is public and currently lists only main and Phase 0/1 branches; its reported permissions are read-only. A native read-only `ls-remote` could not reach GitHub in this environment. Git push authentication/reachability therefore remains unverified; no push was attempted. Refresh refs and verify the authorized Git transport before publishing.

## Proposed actions, in order

1. Review this report, the exact clean-candidate receipt and the operator-map evidence-rights item. **Authorize the GitHub feature-branch push** when public publication is acceptable. Push the recorded candidate normally; no merge into GitHub main or history rewrite is proposed.
2. **Separately authorize the necessary Sites publication:** push that verified source to the existing Sites repository's `main`, package that exact build and save/deploy it using the existing owner-private Site. Recheck source identity, current audience and rollback target immediately before publication. No replacement Site is needed.
3. **Verify the hosted build and owner access:** compare source commit and `/data/application-build.json`, Worker/archive identity, compression, no-secret/error behavior, saved guidance, offline reload and reconnect. Current local evidence does not prove any of these hosted checks.
4. **Perform owner phone smoke tests** on physical Android Chrome and iPhone Safari using the checklist, including real airplane mode, keyboard, text scaling and next-action comprehension.
5. **Approve a small tester group's access arrangement explicitly, then invite them.** Recommended: named external viewers using the existing Site's supported invitation mechanism, with sign-in tested by an authorized non-owner. Any wider audience is a separate choice. Preserve the Site identity and verify both allowed and disallowed access after the approved change. No messages or invitations have been sent.

The hosted `LTA_ACCOUNT_KEY` is needed only if this round includes real advisory feeds; enter it through secure runtime settings, never chat or Git. Scheduled, synthetic and offline tests can proceed without it. Representative live disruption/cancellation/delay/recovery evidence and the missing runtime integration stay a separate engineering follow-up, with real routing effects disabled.

Rollback remains the stored version `appgprj_6aad0ab90e5881919eca01b79f19aa24~appgver_4f9eae0b43848191bd9dea16d542d2be`, archive SHA-256 `9dd87bee6fc8709a183b92a7bf960212bbd149bdca6dce3309f4f30be8dc638a`. Reuse that archive if a later authorized release needs rollback; do not rebuild or delete history. Rollback execution and all hosted/phone/external-tester checks remain **NOT TESTED**.
