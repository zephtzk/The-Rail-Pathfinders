# R5 routing allocation review

The first R5 delivery exceeded its predeclared 150 MiB sampled Node heap target. The retained [before record](evidence/r5/bus-benchmark-before-memory.json) measured 434.3 MiB after queries, 78.5 MiB retained after explicit garbage collection, and 508.3 ms warm p95. This prompted a routing implementation review; source coverage, walking constraints and search limits were preserved.

## Implementation changes

- Calendar indexes hold packed references into immutable source trips. A bounded merge reads service-day connections as needed, preserving the previous ordering and exclusions.
- Search chains store compact source references; only returned journeys acquire complete public instructions and intermediate-stop arrays. Separate bounded object pools and packed chain indexes reuse private query storage. Capacity limits control retention, never truncate a search.
- Dominated alightings, transfers and train boardings are rejected before allocating state. Frontier compaction preserves order; stop-frontier storage is cleared and reused between queries.
- Bus timing reuses unchanged spans, bounded date caches and separate base/retry output slots. Caller-facing timing results remain independent; returned routes do not retain scratch objects.
- Repeated timetable occurrence strings, iterator objects, discarded wait chains and duplicate physical bus-stop nodes are avoided.

The original source records and the default 30-minute walking allowance remain unchanged. No forced collection occurs during the measured workload, and the target was not raised. Private storage is released only after returned routes have been materialized into independent objects and arrays.

## Final evidence

Both the original benchmark and the stronger inside-search probe passed their unchanged 150 MiB sampled-heap target on the final source. These are observed desktop measurements, not a hard ceiling on every query or device.

| Measurement | Before optimization | Final |
| --- | ---: | ---: |
| Cold parse/index/first query | 224.6 ms | 180.3 ms |
| Warm query p95 | 508.3 ms | 162.6 ms |
| Maximum heap sampled after a query | 434.3 MiB | 143.3 MiB |
| Retained heap after workload and explicit GC | 78.5 MiB | 83.1 MiB |
| Combined compressed source data | 2,611,239 bytes | 2,611,239 bytes |

The stronger final probe sampled 10,347 points across 24 queries: **149.75 MiB heap**, **155.20 MiB combined heap plus external memory** at that combined metric's maximum, **39.07 MiB external memory** at its own maximum, and **278.30 MiB RSS**. The target applies to heap; external buffers and process memory are reported separately, not hidden or counted twice. The instrumented run retained 78.13 MiB after its final collection. Pools trade modest retained storage for much lower repeated allocation; retained figures differ between the benchmark and probe because their harnesses hold different buffers and summaries. Sampling overhead, collection timing and unsampled peaks remain limitations, especially with limited headroom to the target.


Final numerical results are in [the unchanged benchmark workload](evidence/r5/bus-benchmark.json), [inside-search sampling](evidence/r5/bus-memory-probe.json) and [the delivery verification](evidence/r5/verification.json). The [allocation investigation](evidence/r5/bus-memory-profile.json) records intermediate source hashes and allocation samples; those checkpoint measurements are not the final result.

The strict differential harness compares all public result fields against commit `70ae3a8`, including statuses, route order, IDs, instructions, times, constraints, errors and assumptions. It strips only runtime diagnostics. Independent oracle tests remain separate, and a retained-output test freezes earlier mixed itineraries before success, failure, cancellation and later searches reuse private storage.

## Reproduce

Run CPU and memory measurements serially, without other test processes competing for resources:

```powershell
node --expose-gc scripts/benchmark-r5-bus.mjs
node --expose-gc scripts/profile-r5-memory.mjs
node scripts/compare-router-results.mjs
npm run check
```

The memory probe copies the current engines and helper under ignored `test-results`, records their hashes, and injects two reversible sampling calls. It samples every 1,024 bus expansions, every 128 rail connections, and query boundaries. It records heap, external buffers and RSS separately. Sampling adds overhead and can miss peaks between probes; it is not a physical-phone measurement or a hard memory ceiling. Explicit collection runs once after the 24-query workload to distinguish retained memory from transient allocations. The differential harness's separate collection is for test isolation and is not used for performance claims.
