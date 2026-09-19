# Bus stop display follow-up

Bus suggestions use a bus symbol and a description containing only unique service numbers in natural order. Stop roads and service termini remain searchable without appearing in that compact description.

Selecting a bus stop shows its service numbers and a collapsed **Bus stop details** disclosure. Expanding it reveals the stop code, name, road, service directions, source termini and operators. Repeated visits and terminating services are identified. Listed services without supported planner timing stay visible with their limitation; these are static source details, not live arrivals.

Editing or clearing an endpoint removes its previous details. Swapping endpoints and reopening saved routes restore the appropriate stops. Changing departure timing preserves an open disclosure for the same stop. The swap button has reserved space above the bus numbers.

Verification uses `node --test tests/planner-model.test.mjs` and `node tests/r5-bus-stop-browser.mjs` (also included in `npm run test:r5-browser`). The focused browser suite exercises actual keyboard and touch selection, expansion, editing, swapping, saved-route reload and accepted-journey preservation. Layout checks cover mobile, desktop and 320px with 200% root text, including overlap with the swap control. This is desktop Edge emulation, not physical-device testing.

The recorded build identity, check results and inspected screenshots are in [bus stop evidence](evidence/r5/bus-stop-display/verification.json). That snapshot is scoped evidence for this display change; concurrent bus-coverage and map updates require their own final release verification.
