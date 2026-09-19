# Source code for judges

The submission is the Commute Copilot web application on the repository's `main` branch. The experimental companion-overlay pivot is not part of this submission.

- [Open the public repository](https://github.com/zephtzk/The-Rail-Pathfinders)
- [Browse application source](https://github.com/zephtzk/The-Rail-Pathfinders/tree/main/src)
- [Browse server source](https://github.com/zephtzk/The-Rail-Pathfinders/tree/main/server)
- [Download all source as a ZIP](https://github.com/zephtzk/The-Rail-Pathfinders/archive/refs/heads/main.zip)
- [Open the hosted prototype](https://commute-copilot-nebula.simhongmen.chatgpt.site)
- [Read the demonstration and setup instructions](../README.md)

These GitHub pages and the source download are public. No collaborator invitation, account or API key is required to inspect the code. The repository includes the implementation, package lockfile, pinned transport datasets, build scripts, tests, licence and third-party notices.

## Where to look

| Area | Source entry points |
| --- | --- |
| Application startup and interface | [src/entry.js](../src/entry.js), [src/commute-ui.js](../src/commute-ui.js), [public/index.html](../public/index.html) |
| Rail, bus and walking route planning | [src/rail-engine.js](../src/rail-engine.js), [src/multimodal-engine.js](../src/multimodal-engine.js), [src/planner-worker.js](../src/planner-worker.js) |
| Accepted trip and progress | [src/journey-state.js](../src/journey-state.js), [src/journey-v2.js](../src/journey-v2.js), [src/current-execution.js](../src/current-execution.js) |
| Disruption alternatives and simulations | [src/reroute-model.js](../src/reroute-model.js), [src/rerouting-ui.js](../src/rerouting-ui.js), [src/demo-incidents.js](../src/demo-incidents.js), [src/demo-replay.js](../src/demo-replay.js) |
| Facilities and staff assistance | [src/nearby-facilities-ui.js](../src/nearby-facilities-ui.js), [src/station-guide.js](../src/station-guide.js), [src/staff-card.js](../src/staff-card.js) |
| Caregiver links and persistence | [src/sharing-client.js](../src/sharing-client.js), [server/sharing.js](../server/sharing.js), [server/sharing-store.js](../server/sharing-store.js), [sharing setup](SHARING.md) |
| Fares and spending | [src/fares.js](../src/fares.js), [src/fare-ledger.js](../src/fare-ledger.js), [src/commute-budget.js](../src/commute-budget.js) |
| Provider integrations | [server/adapter.js](../server/adapter.js), [server/bus-adapter.js](../server/bus-adapter.js), [server/address-adapter.js](../server/address-adapter.js), [server/facility-adapter.js](../server/facility-adapter.js) |
| Packaged data and reproducible imports | [public/data](../public/data), [data](../data), [scripts](../scripts) |
| Automated checks and evidence | [tests](../tests), [package.json](../package.json), [FR4 delivery](FR4_DELIVERY.md), [docs/evidence](evidence) |

## Run the core demonstration

Install Node.js 22.13 or later, extract the source ZIP or clone the repository, and run the following from the project folder:

```sh
npm ci
npm run build
npm run dev
```

Open `http://localhost:4173`. Use the dated station-to-station example in the README. The server serves the last build; build again after editing source. Python 3.10 or later is also needed for the full `npm run check` validation command. Browser-test setup is documented in [R5 verification](R5_VERIFICATION.md); current FR4 checks are listed in [FR4 delivery](FR4_DELIVERY.md).

Provider credentials are optional server configuration and are intentionally absent from the source download. Existing hosted permissions and storage are separate from the public code. Do not put credentials or personal share links into source files. Local sharing data is created under ignored `.local-data/` and is not part of the source archive.

## Identify an exact revision

The `main` ZIP follows the latest merged source. For a fixed review snapshot, select the desired commit on GitHub and use **Browse files**. GitHub's **Code > Download ZIP** on that revision downloads the same tree. In a clone, `git rev-parse HEAD` prints the full source revision and `git archive --format=zip --output=commute-copilot-source.zip HEAD` produces an archive containing tracked files only.

Application publication and GitHub merging are separate steps. Use the release record and the hosted `/data/application-build.json` metadata to check the deployed build; do not assume a newer documentation commit means the application has been redeployed. Older phase reports remain available as historical evidence.
