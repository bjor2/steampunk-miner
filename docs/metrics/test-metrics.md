# CI test metrics: timing and results of every Vitest run

Every test run records its per-file timings and results, grouped by feature, on the orphan
**`test-metrics`** branch. Since 2026-10-07 tests no longer run in GitHub Actions (`ci.yml`
`verify` keeps lint, formatting, types and the build; the Windows `determinism` job stays on pull
requests). The build loop's **box Tester** (`claude-sessions/steampunk-loop/tester.sh` on the
build box) runs them and writes the records. Records before that date come from Actions
(`run.source` missing or `actions`). The status page's Tests tab (#192) reads them.

- **When:** per feature, when it completes, and nightly from the first loop pass after 01:30
  Oslo. Worker gates run no Vitest (typecheck, lint, format:check, build only). When a close
  leaves a parent issue with no open sub-issue, that parent is the completed feature (its tickets =
  its closed children and grandchildren); a closed ticket without a parent is a feature of its
  own. The loop queues it (`tester/queue.json`, shown as "Features awaiting test") and the Tester
  works the queue on the `origin/main` tip.
- **Feature run, in order:** `fast` = `CHANGED_FILES=<union of the files the feature's tickets'
commits changed> scripts/ci/selectPushTests.sh` (scoped `vitest related`, full, or none), pacing
  bot excluded, recorded at once; then, when `fast` is green and the feature touched `src/` (or
  was unmappable), `slow` = the three pacing bot files (NIGHTLY_ONLY_TESTS) and Playwright e2e
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
  `tooling-<x>`. Anything else is `unmapped`. Change this once #191 decides how tests declare
  their feature.

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

The runs of 2026-10-06 before this landed were backfilled once from their job logs
(`run.source: "log-backfill"`): per-file duration and counts from the default reporter, slowest
tests only where the log printed them (300 ms or more), and mode `full-legacy` for the runs from
before the per-push split, which ran the whole suite including the pacing bot files.
