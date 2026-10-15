# CI test metrics: timing and results of every Vitest run

Every test run records its per-file timings and results, grouped by feature, on the orphan
**`test-metrics`** branch, with a per-test history for the status page's Tests tab. Since 2026-10-07 tests no longer run in GitHub Actions (`ci.yml`
`verify` keeps lint, formatting, types and the build; the Windows `determinism` job stays on pull
requests). The build loop's **box Tester** (`claude-sessions/steampunk-loop/tester.sh` on the
build box) runs them and writes the records. Records before that date come from Actions
(`run.source` missing or `actions`). The status page's Tests tab (#192) reads them.

- **When:** per spec, when all its tickets are closed, and nightly from the first loop pass after
  01:30 Oslo. Worker gates run no Vitest (typecheck, lint, format:check, build only). The unit is
  the spec a ticket came from (rules in [issue-tracker.md](../agents/issue-tracker.md#specs-and-testing)):
  the ticket body's `Spec: #N` line, else its `map #N`, else the ticket alone. A spec is complete
  when every ticket under it, sub-specs included, is closed; an outer spec's `Testing: outer-only`
  line tests its sub-specs only at the outer finish (default `per-subspec`). The loop queues each
  completed spec (`tester/queue.json`, shown as "Specs awaiting test", resolved by the loop's
  `spec-resolve.py`) and the Tester works the queue on the `origin/main` tip.
- **Spec run, in order:** `fast` = `CHANGED_FILES=<union of the files the spec's tickets'
commits changed> scripts/ci/selectPushTests.sh` (scoped `vitest related`, full, or none), pacing
  bot excluded, recorded at once; then, when `fast` is green and the feature touched `src/` (or
  was unmappable), `slow` = the four pacing bot files (NIGHTLY_ONLY_TESTS) and Playwright e2e
  when the box has room (else nightly). Records carry `run.feature` and `run.tickets`.
- **Nightly:** the true full suite (`npm test`, every test's duration kept), then balance:report,
  the four benches + bench:summary, balance:planets, e2e, soak:memory and packaged smoke; each
  non-Vitest suite is a record with only its conclusion and duration (`reportFound: false`).
- **Commit statuses:** `box-tester/fast`, `box-tester/slow`, `box-tester/full`, `box-tester/nightly`
  on the tested sha, linking to the run record.
- **Red:** failed files are rerun once (green = flaky, noted in `reason`). Still red, a headless
  Claude triage names the culprit ticket(s); they get a comment, `needs-fix` and are reopened. A
  red nightly full suite also pauses new dev workers until a `tester.sh --full` is green.
- **Query:** `npm run metrics:tests [-- features|files|pass-rate|failures|pipeline|runs] [--limit N]`.
  It fetches the branch and reads `summary.json`; `--summary <file>` reads a local copy instead.
- **How it gets there:** the Tester runs Vitest with `--reporter=json`, writes a one-job jobs file
  from its own step times and calls `scripts/ci/pushTestMetrics.sh` → `recordTestRun.mjs` →
  `testMetrics.mjs` with `GITHUB_*` set by itself (run id = epoch ms) plus `TEST_SOURCE=box`,
  `TEST_PHASE` and `TEST_RUN_URL`. A rejected push fetches the new tip, writes the record again on
  top of it and retries, never forcing.
- **Feature mapping:** `scripts/ci/testFeatures.mjs` is the one table. A slice folder
  `src/features/<slice>/` maps to its slice; `src/systems/<x>/` maps to `<x>`; the pacing bot and
  golden replays have their own names; other layers map by folder, and `scripts/<x>/` maps to
  `tooling-<x>`. Anything else is `unmapped`. These are the kernel areas of `tests/MANIFEST.md`.
  The Tests tab groups by the #191 lock instead (`scripts/tests/testFeatureGroups.mjs`): the slice
  folder, else `cross-slice` for a kernel file a check in `scripts/tests/crossSliceChecks.mjs`
  names, else `kernel`, with the area beside it.

## Run record (`runs/YYYY-MM/<run-id>.json`, schema 1)

```jsonc
{
  "schema": 1,
  "run": {
    "id": 37521014629,
    "attempt": 1,
    "url": "https://github.com/.../actions/runs/37521014629",
    "workflow": "CI",
    "job": "verify",
    "event": "push",
    "mode": "scoped", // scoped | full | none (per feature) | nightly-only (slow) | e2e | nightly | unknown
    "source": "box", // box (Tester) | actions (before 2026-10-07)
    "phase": "fast", // fast | slow | full | nightly (box only)
    "reason": "7 changed files, tests picked by import graph and fs-read rules",
    "sha": "2f12f9c…",
    "branch": "main",
    "runnerOs": "Linux",
    "runnerLabel": "ubuntu-latest",
    "timeoutMinutes": 10,
    "recordedAt": "2026-10-06T19:45:10Z",
    "startedAt": "2026-10-06T19:42:39Z", // test job start (Actions API)
    "jobDurationSec": 128,
    "jobConclusion": "success", // success | failure | cancelled
    "timedOut": false, // cancelled within 15 s of timeoutMinutes
  },
  "totals": {
    "reportFound": true,
    "files": 105,
    "failedFiles": 0,
    "tests": 993,
    "passed": 993,
    "failed": 0,
    "skipped": 0,
    "wallMs": 65570,
  },
  "steps": [{ "name": "Run npm ci", "conclusion": "success", "durationSec": 7 }],
  "features": {
    "bot": { "files": 11, "tests": 120, "failed": 0, "skipped": 0, "durationMs": 310000 },
  },
  "files": [
    {
      "file": "src/systems/bot/botRefining.test.ts",
      "feature": "bot",
      "status": "passed", // passed | failed (a file that fails to load is failed with no tests)
      "durationMs": 71151, // the file's test run time (endTime - startTime), not collection
      "tests": 6,
      "passed": 6,
      "failed": 0,
      "skipped": 0, // skipped also counts todo
      "slowest": [["bot refining sells refined ore …", 40211]], // up to 3 tests of 100 ms or more
      "failures": [{ "test": "full test name or null", "message": "first 300 chars" }],
      "testDurations": [["full test name", 12, "passed"]], // nightly only: every test
    },
  ],
}
```

A run with no report (Vitest skipped, a scoped run with no related tests, killed by the timeout,
or crashed) still gets a record:
`totals.reportFound: false`, `files: []`, plus the job's conclusion, duration and steps.

## Summary (`summary.json`, schema 1)

Rebuilt from the run files on every record, over the last 50 runs by run id:

```jsonc
{
  "schema": 1, "updatedAt": "…", "lastRuns": 50,
  "runs": [ { "id", "url", "event", "mode", "sha", "branch", "startedAt", "jobConclusion",
              "timedOut", "jobDurationSec", "reportFound", "files", "tests", "failed", "failedFiles" } ],
  "pipeline": {
    "modes": { "scoped": 30, "full": 5, "nightly": 1 },
    "timedOut": [runId], "withoutReport": [runId],   // no report and the job did not succeed
    // failing in the latest nightly, but passed or not run by the per-push runs since the one before
    "scopingSuspects": [ { "file", "nightlyRunId", "lastPerPushStatus": "passed" | null } ]
  },
  "features": { "<feature>": { "files", "p50Ms", "p95Ms",   // sums of its files' p50 / p95
                               "fileRuns", "failedFileRuns", "passRate",
                               "lastFailure": { "runId", "sha", "at", "tests", "file" } | null } },
  "files": { "<path>": { "feature", "runs", "lastMs", "p50Ms", "p95Ms", "passRate", "lastStatus",
                         "lastRunId", "lastFailure": { "runId", "sha", "at", "tests" } | null,
                         "flaky",       // passed and failed on the same commit
                         "slowest" } }   // the latest run's slowest tests
}
```

Percentiles are nearest-rank over the runs that ran the file, so a scoped run only adds to the
files it ran. Per-test history across runs lives in the nightly records (`testDurations`).

## Per-test history (`tests.json`, schema 1)

The Tests tab's test list (#192) reads this file, rebuilt next to `summary.json` on every record by
`scripts/ci/testHistory.mjs`. It holds the last 20 runs that kept every test's duration
(`files[].testDurations`, so the nightly full suite: one point per night) and every test of the
newest of them that completed (not cancelled or timed out). A cancelled run with a report still
adds its points; a run without a report adds nothing. A renamed or deleted test drops out, and a
new name starts with no history. A file that failed to load keeps the tests it had before, marked
failed. One line of JSON, about 0.5 MB at 3,000 tests and 20 runs:

```jsonc
{
  "schema": 1, "updatedAt": "…", "lastRuns": 20,
  "currentRunId": 1791400000000,          // the run the list, statuses and counts come from
  "runs": [ { "id", "url", "sha", "startedAt", "source", "phase", "job", "mode",
              "conclusion", "timedOut", "isComplete" } ],            // oldest first
  "files": { "<path>": {
    "feature": "ores",                     // slice, kernel or cross-slice (the #191 lock)
    "area": "ores",                        // featureOfTestFile, the manifest's kernel area
    "status": "passed",                    // the file's status in the current run
    "ms": [512, null, 530],                // the file's duration per run, null when not run
    "tests": { "<full test name>": [[12, null, 14], "p-p"] }   // ms per run, status per run
  } }                                      // p passed, f failed, s skipped/todo, - not run
}
```

A name Vitest reports twice in one file gets ` (2)` appended to its second row.

The runs of 2026-10-06 before this landed were backfilled once from their job logs
(`run.source: "log-backfill"`): per-file duration and counts from the default reporter, slowest
tests only where the log printed them (300 ms or more), and mode `full-legacy` for the runs from
before the per-push split, which ran the whole suite including the pacing bot files.

## Drill-down runs (`drill-down.ndjson`, schema 1)

The Tests tab's drill-down panel (ticket 416) reads this file. `e2e/browser/drillDown.spec.ts`
writes one row per run (stored drill_power steps 1, 5, 10, 15 and 20) to `test-results/drill-down/level-<n>.json`, and
`scripts/ci/recordDrillDown.mjs` appends them here from `pushTestMetrics.sh`, so any Tester record
made after a Playwright run carries them (slow phase `e2e`, probes, the nightly suites). It is one
JSON line per run, oldest first and append-only, following `docs/perf/history.ndjson`. A row whose id
is already held is skipped, since several records in one Tester run see the same files, and a
malformed row is refused with its problems (`scripts/ci/drillDownHistory.mjs`). Positions are planet
metres (1 cell = 1 m, centre at the origin) of the last reported pose, at most 0.2 s old.

```jsonc
{
  "schema": 1,
  "id": "2026-10-16T01:35:00.000Z-L1",
  "measuredAt": "2026-10-16T01:35:00.000Z", // when the Down key went down
  "buildCommit": "e1b25a23", // game_started's buildCommit: what the preview was built from
  "seed": 83921,
  "planet": 1,
  "drillLevel": 1,
  "holdMs": 10004, // wall time of the hold
  "ticks": 600, // game ticks in it
  "start": { "x": 16.42, "y": 299.61, "depthTiles": 0 }, // cells; depth = the HUD's whole cells
  "end": { "x": 16.4, "y": 287.1, "depthTiles": 12 },
  "depthGainedTiles": 12,
  "descentMetres": 12.51, // toward the planet's centre
  "cellsPerSecond": 1.2, // depth gained / s
  "speedMetresPerSecond": 1.251, // start-to-end distance / s
  "recordedAt": "…", // this and the next two: stamped by the recorder
  "sha": "<tested sha>",
  "phase": "slow",
}
```

## Drill ladder runs (`drill-ladder.ndjson`, schema 1)

The status page's Drill speed panel (ticket 434) reads the cut from this file and the descent from
`drill-down.ndjson`. `src/logging/drillLadderSteps.test.ts` cuts the #409 ladder column at stored
drill_power steps 1, 5, 10, 15 and 20 and writes one row per level to
`balance-report/drill-ladder-steps.ndjson`; `scripts/ci/recordDrillLadder.mjs` appends them here
from `pushTestMetrics.sh`, so any Tester record made after a Vitest run of that spec carries them.
Append-only and de-duplicated by row id like the drill-down rows; a malformed row is refused with
its problems (`scripts/ci/drillLadderHistory.mjs`). Rates are the ladder report's fixed-point text
(`src/logging/drillLadderReport.ts`).

```jsonc
{
  "schema": 1,
  "id": "2026-10-16T01:35:00.000Z-drill-ladder-steps-L5", // run time, ladder, level
  "measuredAt": "2026-10-16T01:35:00.000Z", // when the spec cut the ladder
  "ladder": "drill-ladder-steps",
  "planet": 1,
  "worldSeed": 83921,
  "column": 20,
  "previousLevel": 1, // the level cut before this one in the run; null on the first
  "level": 5, // the stored drill_power step
  "cells": 20,
  "ticks": 776, // until the last cell broke
  "seconds": "12.933",
  "cellsPerSecond": "1.546", // 1 cell = 1 m, so also m/s
  "gainOnPrevious": "1.024", // times faster than previousLevel; null on the first
  "lawGainOnPrevious": "1.026", // drillPowerAtStep(level) / drillPowerAtStep(previousLevel)
  "recordedAt": "…", // this and the next two: stamped by the recorder
  "sha": "<tested sha>",
  "phase": "fast",
}
```
