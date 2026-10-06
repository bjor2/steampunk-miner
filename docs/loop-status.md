# Loop status: the one-liner

The status dashboard — **https://bjor2.github.io/steampunk-miner/status/** — has three tabs, each
linkable: **Issue trees** (`#issues`), **Loops** (`#loops`, the default) and **Features**
(`#features`, the game feature tree). It shows the issue trees and what every automated loop is
doing. A loop reports its state with one command:

```bash
scripts/status/loop-status.sh <loop> <working|idle|paused|blocked> [--issue N] [--slot S] [--note "text"]
```

On the box the same script lives at `/workspace/claude-sessions/loop-status.sh`.

The Loops tab also has a **Performance** section: one chart per measured metric over commits, read from
`docs/perf/history.ndjson` and `docs/perf/metrics.json`. If you measured anything, record it with
`npm run perf:record` and commit the `history.ndjson` line; a new metric is a new id, added to
`metrics.json`. See [docs/perf/README.md](perf/README.md).

| State     | Meaning                                                                  |
| --------- | ------------------------------------------------------------------------ |
| `working` | Busy on something now; pass `--issue N` when it is a ticket.             |
| `idle`    | Running, nothing to do (say why in `--note`, e.g. "nothing pickable").   |
| `paused`  | Deliberately stopped by a human or a schedule.                           |
| `blocked` | Cannot continue without help: push pending, needs-planner, out of tries. |

Examples:

```bash
loop-status.sh steampunk-loop working --slot 2 --issue 115 --note "tier easy"
loop-status.sh planner-bot idle --note "no needs-planner tickets"
loop-status.sh perf-tester blocked --issue 77 --note "bench regressed 12%"
loop-status.sh vertical-scaler --remove            # drop an entry you no longer use
loop-status.sh --show                              # print the published loops.json
```

- One entry per `<loop>` (or `<loop>/<slot>` with `--slot`); every call overwrites that entry and
  stamps it with the current time. That time is the **heartbeat**: the page marks an entry
  **STALE** when it is older than 30 minutes (`--stale-after MIN` overrides it per entry), so a
  long-running loop should re-send its state every 10–20 minutes.
- It never fails the caller: it always exits 0 and gives up after ~8 s. It takes about 2 s.
- Batch form for drivers that report many slots at once (one commit):
  `loop-status.sh --batch < entries.jsonl`, one JSON object per line with `loop`, `slot`,
  `state`, `issue`, `note` and any extra fields (the build-loop driver sends `extra.push_pending`,
  `extra.active`, `extra.max`, `extra.attempts`, which the page shows).

## Feature tree

The **Features** tab (https://bjor2.github.io/steampunk-miner/status/#features) renders
[`docs/features/features.json`](features/features.json). **When you ship or plan a player-facing
feature, update that file in the same change** (status `built` / `partial` / `planned`, plus the
issue numbers). Each feature shows the live open/closed state of its issues, and a **⚑ check**
marker when its status looks out of date. Format and rules: [docs/features/README.md](features/README.md).

## How it works

- `loops.json` lives on the orphan branch **`loop-status`** (no code, no history on main). The
  script reads it through the GitHub contents API, merges the entry and writes it back with the
  previous blob sha, so a concurrent write is rejected and retried, never overwritten or forced.
  Writers on the same machine also queue on a local lock.
- A **state change** (not a plain heartbeat) dispatches the Pages workflow (`pages.yml`, at most
  once per 90 s); a push to `loop-status` cannot trigger it because that branch has no workflows.
- The Pages workflow builds the game exactly as before, then runs
  `scripts/status/build-status.mjs`, which writes `dist/status/` (issue tree from GraphQL
  sub-issues, loops.json, last workflow runs, the Performance charts from `docs/perf/`, and
  `features.json` from `docs/features/` joined with the issue states). Triggers: every ~10 min, issue events, pushes to
  main, and dispatch. The page itself re-reads `loops.json` live from the branch every 60 s, so
  loop state shows within about a minute even between builds.
- Workflows listed in `WORKFLOWS` in `build-status.mjs` with a `loop` name (today
  `balance-planets`) appear as loops automatically, from their last Actions run.
- Env switches: `LOOP_STATUS_DISABLE=1` (no-op), `LOOP_STATUS_NO_DISPATCH=1`,
  `LOOP_STATUS_QUIET=1`. Failures are logged to `~/.cache/loop-status/loop-status.log`.

The build-loop driver (`/workspace/claude-sessions/steampunk-loop/next-ticket.sh`) reports each
slot (`working` on claim, `idle` when freed, `blocked` on needs-planner or exhausted attempts),
re-sends a heartbeat every 10 minutes while a session runs, and publishes a full snapshot of its
`--status` (all slots, push_pending) on every coordinator run.
