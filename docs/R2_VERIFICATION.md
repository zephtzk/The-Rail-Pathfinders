# R2 verification

Recorded 19 September 2026, Singapore time. This document distinguishes the retained R1 regression baseline from final integrated R2 verification. It is not deployment evidence.

## Final verification of committed source

Source commit `72786954b89279b4217c6060cc887b41a253dc1a` passed the complete verification below. The source was frozen during the final sequential baseline sweep; the worker SHA-256 was checked before and after and remained unchanged. The unified R2 suite was also rerun against this same application build.

| Check | Final result |
| --- | --- |
| JavaScript tests | 259 passed |
| Python import/walking tests | 40 passed |
| Syntax checks and production build | Passed; 65 local assets |
| Unified R2 phone flow | 35 browser checks passed |
| Original replay | 30 browser checks passed |
| Original rail planner | 29 browser checks passed |
| Original multimodal planner | 27 browser checks passed |
| Original Phase 4 rerouting | 39 browser checks passed |
| R1 integrated upgrades | 18 browser checks passed |
| Sharing/privacy lifecycle | 8 browser checks passed |
| Local location assistance and offline readiness | 11 browser checks passed |
| Standalone facility flow | Passed |
| Two-client HTTP and backend restart | Passed |
| Committed-source archive rebuild | Matching application identity and worker bytes |

Final application SHA-256: `279031d5b91b9c35e15e1c202bd59ac20f120ea1b1156fdf5c348489291bc749`.

Final worker SHA-256: `e343583b4a2d86bc4d1d12712e786aac72830d00d5d876486349a97c409c4a30`.

Durable summaries: [baseline results](evidence/r2/baseline-results.json), [35-check R2 results](evidence/r2/r2-browser.json), [application identity](evidence/r2/application-build.json), and [committed archive reproduction](evidence/r2/reproducible-build.json). Detailed local logs and browser records are under `test-results/r2-final-baseline-lf/`.

The final sweep used Windows, Node 24.16.0, installed Edge 153.0.4234.32 and loopback serving. Browser runs are desktop mobile/touch emulation. Optional replay/rail screenshots were disabled during the final repeated sweep; all behavioral assertions remained enabled. The R2 screenshots and results are recorded separately under `docs/evidence/r2/`.

Before this final sweep, source line endings were normalized to the repository's LF policy so the tested application matched bytes obtained from Git. Imported byte-hashed data was untouched. The earlier complete pre-normalization pass is retained under `test-results/r2-final-baseline/`, but its hashes are not the committed candidate hashes above. The clean Git archive rebuild used the same locked installed Leaflet/QR dependencies and Node/zlib runtime (zlib `1.3.1-e00f703`); it does not demonstrate a fresh registry install or a Linux-runtime build.

## Retained baseline verification during R2 integration

Executed in the isolated `codex/features-r2` application checkout on Windows with Node 24.16.0 and installed Edge 153.0.4234.32. Browser suites used loopback port 4192 and desktop mobile emulation. Evidence is under `test-results/r2-baseline/`; historical R1 evidence was not overwritten.

| Check | Observed result | Evidence |
| --- | --- | --- |
| `npm run check` | 254 JavaScript tests and 40 Python tests passed; browser/server syntax checks and build passed | `npm-check.log` |
| Original replay | 30 checks passed | `replay/browser-results.json`, `replay.log` |
| Original rail planner | 29 checks passed | `rail/rail-browser-results.json`, `rail.log` |
| Original multimodal planner | 27 checks passed | `multimodal/multimodal-browser.json`, `multimodal.log` |
| Original Phase 4 rerouting | 39 checks passed; repeated successfully after routing-context validation changed | `phase4-final/browser.json`, `phase4-final.log` |
| R1 integrated upgrades | 18 checks passed after the invitation compatibility-URL fix | `upgrades/browser.json`, `upgrades.log` |
| Facility flow | Passed unknown real coverage, explicit checkpoints, blocked nearest toilet, independent alternative, detour reach/return/resume, unchanged destination and consent | `facilities.log` |
| HTTP and restart | Passed two-client scoped acceptance, accepted revision persistence through server restart, denied viewer edits, revocation, forwarded mutations and unconfigured deployed-worker response | `sharing-http.log` |

The rail, multimodal, Phase 4 and upgrades browser suites now enter retained planners with `?legacy=1`; replay still enters `/replay.html`. Original behavioral assertions are retained. The upgrades locator follows the intentional **Save Route** label, and that suite now respects `CAPTURE_DIR` so R2 evidence stays separate.

The first upgrades run passed 12 checks, then exposed an invitation-handling defect: removing the credential fragment also removed `?legacy=1`, so an offline reload entered the unified shell with the active panel hidden. `SharingClient.useFragment()` now retains the query while removing the fragment. The focused regression confirms that the secret fragment is removed, and the full 18-check rerun passed. The initial failure is retained in `upgrades-before-fix.log`.

Another integration review found that a corrupt optional `routingContext` could pass active-state validation and reach a renderer that expects route legs and confirmed progress. It is now checked with the existing Phase 4 journey validator before use. Tests cover malformed and valid older contexts without mutating the accepted snapshot.

## Build attribution and scope

The historical integration runs below occurred while R2 work continued; the final committed-candidate table above supersedes them. The original multimodal and first Phase 4 runs recorded application SHA-256 `78b89af521bf83b470bed46c2c5594907b0cb0b2a0629c7d50c6edc2f5a2841a` and worker SHA-256 `f7b409bce56cd0ad8e7fb9c85e3d20e79c4b44c5842eaab601298873b171f799`.

The later 254-test check and repeated Phase 4 suite recorded application SHA-256 `3be96b97f4411aec39adfaa07c2119c627c58139a5c1b6396df9a247673bc6dd` and worker SHA-256 `7bf7569f70a42a234af26c7e545cf8714c32f58e38ee9e82319560db1a6dfb55`. Phase 4 additionally verified the server build identity against the candidate on disk.

Physical iPhone/Android behavior, user comprehension, live credentialed LTA access, deployed D1, external push delivery, real accessible door-to-door coverage and real verified toilet paths remain unverified. Browser network-off tests demonstrate local offline behavior only; the live-feed fixtures remain synthetic. No merge, production deployment or access expansion was performed by this verification pass.
