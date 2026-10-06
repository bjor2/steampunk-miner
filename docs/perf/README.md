# Performance history

Every performance number we measure is kept here, so progress shows over time. The
**Performance** tab of the status dashboard —
**https://bjor2.github.io/steampunk-miner/status/#performance** (short link `/status/performance/`)
— draws one chart per metric from these two files on every Pages build, with a budget table
(pass/over, headroom, change vs the previous run), the recent runs and the last measured time:

| File             | What                                                                                                                                                   |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `history.ndjson` | Append-only. One JSON line per measurement run: `{commit, committedAt, measuredAt, source, machine, env?, load?, runs?, note?, metrics: {id: number}}` |
| `metrics.json`   | The registry: per metric id its `label`, `unit`, `group`, `better` (`lower`/`higher`) and optional `budget`; `groups` sets the section order.          |

`source` is one of `bench`, `soak`, `e2e`, `ci`, `manual`, `analysis`. The x-axis is the runs in
commit-time order; every point links to its commit.

## The rule

**If you measured, commit the `history.ndjson` update** with your change (or alone: a push that only
touches `docs/perf/` still rebuilds the page). Never edit or delete old lines, and never write a
number you did not measure.

**A new metric is a new id.** Put it in the measurement's output (a new `...Ms` or `...Max` field in a
bench's JSON line becomes an id by itself), record it, and add the id to `metrics.json`. It gets its
own chart as soon as it is in the history; until it is in the registry it shows with its raw id under
"Not in metrics.json" and the build prints a warning.

## Recording

```bash
# The four CPU benches (bench:world, bench:render, bench:ground, bench:combat), 5 interleaved runs,
# median per metric, 1-min load average recorded; appends one line for HEAD.
npm run perf:record -- --source bench --env "what else was running, anything unusual"

# A measurement written to a file: the memory soak's summary.json and soak.json, a CPU profile
# summary, a stack-stress result, or any file of the form {"metrics": {"<id>": <number>}}.
npm run perf:record -- --source soak --from test-results/soak/summary.json --from test-results/soak/soak.json \
  --env "SwiftShader, headless Chromium"

git add docs/perf/history.ndjson && git commit -m "Record bench numbers after <change>"
```

Options: `--runs N` (default 5), `--benches world,ground`, `--commit <sha>` (default `HEAD`; measure
committed code — the recorder warns on uncommitted changes), `--measured-at <iso>`, `--load <n>`,
`--note "<text>"`, `--dry-run` (print the line, write nothing). The file shapes `--from` knows are
listed in `scripts/perf/perfMetrics.mjs`; anything else should be written as `{"metrics": {...}}`.

## Bench run logs

Any bench run with `-- --log` (`npm run bench:ground -- --log`) also writes its timed series as
`benchmark_result` run events (`name`, `medianUs`, `p95Us`, `runs` = samples, `commit`; whole
microseconds, as #11 keeps floats to `perf_sample`) to its own run folder,
`logs/<runId>_bench-<bench>/events.ndjson`; stdout is unchanged. `npm run bench:summary` checks
every such line against the run-event schema and prints them as a table. CI's `bench` job runs all
four this way on every push and pull request, report only, uploads `logs/` as the artifact
`session-ci-<sha>-<github run id>` and puts the table in the job summary (#124).

## Session analysis

`npm run perf:sessions` (#125, logging strategy section 6) reads every `events.ndjson` under
`--sessions <dir>` (default `logs/`; repeat the flag for more folders) into one table keyed by
commit, run id and tick, and writes `report.html`, a short `summary.txt` and the flat table
`sessions.ndjson` to `--out` (default `test-results/session-analysis/`). `--download <n>` first
pulls the newest `n` CI `session-*` artifacts into `<first --sessions>/ci/` with `gh run download`,
skipping ones already there. The page and summary show:

- **heap against progress**: least-squares MB per 100 minerals, per 10 minutes and per 100 chunks
  from `memory_sample`, after 3 warm-up samples. It is the live heap (no GC is forced), so one
  collection moves a short session's slope a lot; leaks are gated by the soak's after-GC heap;
- **geometries, textures and colliders against chunks**: flagged as climbing by the soak's rule
  (rose in 3 of the last 10 steps, never fell);
- **frame p95/p99 by planet and depth band**, slowdowns (back-to-back seconds over the 16.7 ms
  budget) and long-task bursts, each with the ore, depth and chunk last collected before it;
- **the bench trend per commit**: `benchmark_result` medians, flagged above 10% over the median of
  the commits measured in the 7 days before, per source (CI runner and box never mix). GitHub's
  runners are not one CPU model either: on 2026-10-06 `combatTick` sat at 15-16 µs on some jobs and
  21-25 µs on others, docs-only commits included, so read a flag against the commits around it;
- **run summaries across commits**: the newest game session of a seed against the newest before it
  on another commit, as `compareRuns` tables them.

A session is refused whole, and listed, when it was written under another `logSchemaVersion` or has
a broken line; one crash-truncated last line is ignored (#11). Report only: it never fails on a
finding and never opens or edits an issue. On the box, the daily pass is run by hand:
`npm run perf:sessions -- --sessions /workspace/perf/sessions --download 20 --out <dir>`. The
analysis is pure and tested in `src/logging/sessionAnalysis/` against the committed fixture
sessions there.

## Heap and stack flags

The game sets none, by decision (#102): no `--max-old-space-size`, `--js-flags`, `--stack-size` or
`NODE_OPTIONS`. The measured headroom in Chromium and the Electron renderer, and when to revisit
it, are in [runtime-flags.md](runtime-flags.md).

## Reading the numbers

- The box is shared and often loaded (the first runs were taken at a 1-min load of 7 to 20 on 8
  vCPUs). Compare points only together with their `load`; a gap smaller than the run-to-run range is
  no measurable difference (see the benchmark checklist).
- Frame times from the soak come from SwiftShader software GL, not a GPU: they track trends in this
  harness, not what a player sees.
- The baseline (commit `b48cc89`) comes from the perf and memory-leak pass; its full report, raw runs
  and profiles are on the build box under `/workspace/perf/memory/out/`.
