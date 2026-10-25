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

## Phone lane

`npm run perf:phone` (#470 P1-10, ticket 481) is the phone-class lane, report only and not gated:
it runs `e2e/browser/mobile/perfPhone.spec.ts` on the Pixel 7 Chromium project with the CPU slowed
4x and 6x (`Emulation.setCPUThrottlingRate` over CDP), on planet 1 parked, at 96 m/s and at
3600 m/s (`e2e/browser/mobile/perfPhonePlan.json`), and records one `--source e2e` line per rate,
`--env "Chromium CPU throttled Nx, SwiftShader"`, under the ids `phone.cpu<N>x.<case>.<field>`:
`tickMsP95` (one fixed tick stepped alone, the sim's CPU cost), `ticksDroppedByCap` (15 s of live
play: the due ticks the 30-step cap let go, summed from the `perf_sample` lines, ticket 480) and
`frameMsP95`,
the settled `renderScale`, `internalWidth` and `internalHeight`, `jsHeapMB` and `domNodes`. They
chart in the group "Phone lane (CPU-throttled emulation)"; the tick cost carries the TD's 6 ms
target, so a phone three times slower still fits a 16.7 ms frame at any speed.

It is emulation: a throttled desktop CPU and SwiftShader software GL. It gives tick cost (CPU)
numbers only; GPU numbers come from the real-device check (#482), and nothing here is "verified on
device". `-- --dry-run` prints the lines and writes nothing.

## Purchase-level rows

`npm run bench:purchase-levels` (ticket 840, the row set and done-when from the #316 decision) is
report only and not gated. It measures streaming and tick cost by drill purchase level: L1, L20
(about 84 m/s), L30 (about 800 m/s), L40 (about 7 km/s) and the planet's radius-clamp level, on
planets 1, 5, 10 and 40, on two profiles. Each row prints one JSON line, and the run writes
`test-results/bench-purchase-levels/rows.ndjson` and `table.md`, the table to post on the ticket.
`-- --planets 1,5 --levels L1,L20 --profiles phone` runs a subset. The vs-L1 column needs the L1
row of the same planet and profile in the same run.

- **Rigs.** A level names the law step of that `drill_power` purchase through planet 1's band-1
  rock. On a harder planet the same purchase barely scratches the rock, so the row's rig is the
  weakest purchase whose step on that planet's band-1 rock reaches the level's planet-1 step, as
  ticket 560 named its rigs by speed. Every other track is the planet's on-curve step. The clamp
  level is the weakest purchase whose step reaches the planet's radius in one tick, where
  `stepWithinPlanetMm` holds it (ticket 558). It is computed per planet, never written down.
- **Profiles.** Desktop is 1280x800, the ticket's size, because the repo has no desktop perf
  profile. Phone is the perf:phone lane's profile: the Pixel 7 landscape screen (915x412) at the
  lane's first throttle rate, 4x (`perfPhonePlan.json`). Node can't throttle a CPU, so the bench
  models a uniformly slower one. Every time is multiplied by the slowdown, and the terrain's 2 ms
  budget is spent at 2 ms / slowdown of this machine's time, which is what a 4x slower CPU gets
  out of the budget. The view radius is half the screen's diagonal at the widest zoom its shape
  allows, which is how far the camera pulls back at speed.
- **A frame** is one tick. It runs the client's cut-follow read and the authority's tick (the
  clock, a `drillStep`, a report every 12 ticks), then the terrain stream, then the hazard strip,
  all on the main thread. Generation runs on the main thread here; the live client builds in the
  worker (ticket 337), so waits are upper bounds. Rapier, React and the GPU aren't included; see
  `bench:physics` and `perf:phone` for those. The rig starts already moving at its law speed, like
  the #560 slab, so a row reads steady state, not the #724 gravity ramp. A pass runs from a cold
  chunk cache down to the core's top, for at most 3 s. Passes repeat until 60 moving ticks are
  read, or 10 passes have run.
- **Columns.** Tick p50/p95 over the moving ticks; frame p95 against the 16.7 ms budget and terrain
  p95 against the 2 ms budget (#4); chunk loads (generations) per second; builds per frame (mean,
  max); frames with the rig's body or cut front in a chunk with no mesh, and the longest run of
  them; frames whose strip window was gap-free and reached its full reach; frames that showed the
  1 s collapse warning. For the warning, a block 16 m down the line is warned on the pass's first
  frame, and its pip is checked on every frame until it refills or the nose reaches it.
- **Done when (per row):** the tick p50 is within ±10% of the L1 row on the same planet and
  profile; the rig never stands in unbuilt ground; frame and terrain p95 are within budget; at L20,
  the strip is populated and the warning shown on every judged frame; and no command is refused. A
  red row goes under #647 as streaming or prefetch work, **never as a speed clamp**.

### Explosion rows (D8, ticket 868)

The same run prints the explosion rows after the purchase rows (`-- --rows vfx` runs only them;
`--sizes 1,6 --radius-levels 0,10 --screens phone360,desktop1920x1080` picks among them): one blast
of size 1, 6 or 12 at Blast Radius level 0, 10 or 1e6, on 360 px, 1280×800 or 1920×1080, played
through the real front pools (`src/features/dynamite-visuals/scene/`) with its stages from the plan
and its fronts a frame at a time, as the debug preview plays them. Each row times every frame's
stepping, emitting and uploading on this machine until the pools are empty and the disc and ring
are out, the phone's time multiplied by the perf:phone slowdown, and prints p50, p95 and max
against the 16.7 ms frame budget, the pieces the stages threw (capped by pool, never by radius)
and the ring's and fireball's pixels on that screen. The GPU's fill is not here (`perf:phone`).
A row over budget is a VFX finding under #647, never a reason to cut a stage.

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
