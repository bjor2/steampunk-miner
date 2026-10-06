# CI test metrics: timing and results of every Vitest run

Every CI test run records its per-file timings and results, grouped by feature, on the orphan
**`test-metrics`** branch. That covers the per-push `verify` job of `ci.yml` (scoped, full minus
the three pacing bot files, or none) and the nightly true full suite of `nightly.yml`. The
records are there to show which features are slow, which fail, and pipeline problems such as
timeouts, flaky files and tests the per-push scoping missed. The status page's Tests tab (#192)
reads them.

- **Where:** branch `test-metrics`. It holds `runs/YYYY-MM/<run-id>.json` (one record per run,
  `-a<attempt>` added for a re-run) and `summary.json` (the last 50 runs rolled up). Raw:
  `https://raw.githubusercontent.com/bjor2/steampunk-miner/test-metrics/summary.json`.
- **Query:** `npm run metrics:tests [-- features|files|pass-rate|failures|pipeline|runs] [--limit N]`.
  It fetches the branch and reads `summary.json`; `--summary <file>` reads a local copy instead.
- **How it gets there:** the test job adds `--reporter=json` and uploads the report as the
  `vitest-report` artifact (`if: always()`, kept 14 days). The `metrics` job then calls
  `.github/workflows/record-test-metrics.yml`, also when the test job failed or timed out. That
  workflow downloads the report, reads the test job's steps from the Actions API and runs
  `scripts/ci/pushTestMetrics.sh` → `recordTestRun.mjs` → `testMetrics.mjs`. Only that job has
  `contents: write`. A rejected push fetches the new tip, writes the record again on top of it and
  retries, never forcing. Every step is `continue-on-error`, so metrics never fail CI. Pushes from
  the workflow token start no workflow, and the branch carries no workflow files.
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
    "mode": "scoped", // scoped | full | none (per push) | nightly | unknown
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
