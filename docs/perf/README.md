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
