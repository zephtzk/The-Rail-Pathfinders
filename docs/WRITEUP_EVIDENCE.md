# Writeup evidence and reproduction

The submission declares **Mdm Lim** as its primary design persona. This is a design choice from the [official PS2 persona brief](https://github.com/aochinwen/NebulaX-Hackathon-ProblemStatement/blob/main/PS2/PS2_README.md#22-the-commuter), not a claim of interviews or field research. The implementation has known gaps for this persona: verified step-free door-to-door routes and advance lift warnings are not demonstrated. `src/preferences.js` defines editable presets; `startIssue` in `src/copilot-ui.js` rejects starting an unverified accessible route.

## Numerical claims

Application source: `f5fb04b9d5bb7a8a6ea2f94b7b825cf45869082e`. The later snapshot `d787c8d6501b3027d21cefd734e46cd726f5c65c` includes the same application plus the browser activation test and delivery evidence. The PDF's evidence links are pinned to this snapshot.

| Claim | How it was obtained | How a judge can check |
| --- | --- | --- |
| 555 JavaScript cases passed | The Node test runner reported `tests 555`, `pass 555`, `fail 0`. | Run `npm test`, which executes `node --test tests/*.test.mjs`. |
| 44 Python cases passed | Sum of the unittest runner totals: 27 rail-import + 16 bus-import + 1 walking-metadata. | Run `npm run test:import`, `npm run test:bus-import`, and `python -m unittest discover -s tests -p test_walking_metadata.py`. |
| Production build passed | The recorded `npm run check` finished with a successful `npm run build`. | Follow README prerequisites, run `npm ci`, then `npm run check`. |

The [original full check log](evidence/fr4-addendum/npm-check-fr4.log) contains the runner output. The negative rail-import test deliberately prints an invalid-ZIP error before the suite reports OK. Its tiny fixture-network output is test data, not production network coverage.

These totals count automated test cases, not participants, journeys, real-world reliability, performance or accuracy. The log includes machine-dependent durations; the submission makes no speed claim from them. Focused browser checks are additional and are not folded into those totals. Station codes, dates, version identifiers and commit IDs identify inputs or artifacts rather than outcome measurements.

## Demonstration and architecture

- `tests/fr4-incident-planner-browser.mjs` uses Paya Lebar (EW8) to Bugis (EW12), 21 September 2026 at 10:00 Singapore time. It records baseline route identifiers, saves a whole-service EW closure, checks that route identifiers exclude EW, preserves the prior accepted trip until explicit cancellation, and starts an alternative. After reload it re-enters the same query to prove that the **saved closure** persists. Resolution makes the baseline eligible again. The test does not establish live travel savings or preservation of an unstarted route preview across reload.
- `src/planner-client.js` and `src/planner-worker.js` show cancellable routing outside the UI thread. `src/multimodal-engine.js` combines the rail, bus and walking models; `src/demo-closures.js` matches the simulated exclusions.
- `src/journey-v2.js` and `src/copilot-ui.js` distinguish suggested plans and accepted guidance. `public/sw.js` implements offline caching. `server/sharing.js`, `server/providers-local.js` and `.openai/hosting.json` document persistent sharing and the hosted D1 binding.
- `tests/fr4-sharing.test.mjs` and `tests/fr4-sharing-ui-browser.mjs` check read-only recipient capabilities. Planned endpoints and geometry are shared; continuous device tracking is not claimed.

The guide provides manual demonstration steps. Automated checks use desktop browser tooling, including mobile emulation. No commuter study, physical-phone field trial, real disruption accuracy benchmark or comparison against another planner is claimed.
