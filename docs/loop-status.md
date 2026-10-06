# Loop status: the one-liner

The status dashboard — **https://bjor2.github.io/steampunk-miner/status/** — has five tabs, each
linkable: **Issue trees** (`#issues`), **Loops** (`#loops`, the default), **Slots** (`#slots`, the
build loop's slot pools), **Features** (`#features`, the game feature tree) and **Performance**
(`#performance`, short link `/status/performance/`). It shows the issue trees and what every automated loop is
doing. A loop reports its state with one command:

```bash
scripts/status/loop-status.sh <loop> <working|idle|paused|blocked> [--issue N] [--slot S] [--note "text"]
```

On the box the same script lives at `/workspace/claude-sessions/loop-status.sh`.

## Issue trees tab

**https://bjor2.github.io/steampunk-miner/status/#issues** opens on the **Ongoing** filter. Five
buttons pick the list, each with its count, and the choice stays in the hash (`#issues?f=open`,
`ready`, `ongoing`, `closed`, `planned`; `&view=tree` shows the sub-issue tree instead):

| Filter         | Issues                                                                                                                             |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Open           | every open issue (Ongoing + Ready to begin + Planned)                                                                              |
| Ongoing        | labelled `in-progress`, or held by a live loop worker or planner slot                                                              |
| Ready to begin | the build loop's pick rule: none of `blocked`/`on-hold`/`hitl`/`needs-planner`, blockers closed, attempts left, no open sub-issues |
| Planned        | the other open issues: waiting on an open blocker, a label, its open sub-issues or a person                                        |
| Closed         | newest closed first                                                                                                                |

Each card expands to the issue's parent, blockers, created/updated/closed times, its loop slot
(`G#` · `C#`, account, model and effort, attempts, push_pending) and its phase bar from
`docs/metrics/tickets/`. An ongoing issue shows when work began (Oslo time and elapsed): the loop's
claim time from the published `slots.json` or the loop event log, else when `in-progress` was
applied. The rule lives in `scripts/status/issueBuckets.mjs`, which the page imports as is.

## Performance tab

**https://bjor2.github.io/steampunk-miner/status/#performance** shows the budget verdicts (latest value,
headroom, change vs the previous run), the last measured time, the recent measurement runs, one
chart per metric over commits, and, live, the perf loop's state plus the open and recently closed
`perf` issues. The tab label shows `N over budget` (red) or `N/N in budget`, amber when the latest
measurement is over a day old. A chart links as `#metric-<id>` (non-alphanumerics as `-`).

The data is `docs/perf/history.ndjson` (one JSON line per measurement run) and
`docs/perf/metrics.json` (labels, units, groups, budgets). **If you measured anything, publish it
with one line, then commit:**

```bash
npm run perf:record -- --source bench --env "what else ran"     # or --from <summary.json> for a soak/e2e file
git add docs/perf/history.ndjson && git commit -m "Record bench numbers after <change>"
```

A new metric is a new id; add it to `metrics.json` (with a `budget` if it has one). The perf loop
reports itself like any loop (`loop-status.sh perf-loop working --issue N`); any loop whose name
contains `perf` shows on the Performance tab. See [docs/perf/README.md](perf/README.md).

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

## Slots tab

**https://bjor2.github.io/steampunk-miner/status/#slots** shows the build loop's two pools: the
**Grok agent slots** (free, `dev` or `planner`) and the **Claude Code slots** (free, `busy` or
`disabled`), split per Claude account (`A1 · Claude Max 1`, `A2 · Claude Max 2`) with disabled or
signed-out accounts marked. Each slot shows its ticket (linked), the slot it pairs with in the other
pool (`G3 ↔ C5 (A2)`, the same colour on both sides) and how long it has been held. A busy Claude
slot whose Grok slot is free is flagged `G free`. The tab label reads `Grok used/size · Claude
used/size` (`Slots 9/12 · 8/8`); the page header carries the same summary on every tab with Claude
per account, and the Loops tab adds it to the `steampunk-loop` row.

The data is `slots.json` on the `loop-status` branch, next to `loops.json`. The build-loop driver
(`next-ticket.sh`, outside the repo, schema in its README) writes the full snapshot on the box at
`/workspace/claude-sessions/steampunk-loop/slots.json` on every pass, refill and `--status`, and
publishes a **sanitised copy** itself (`publish_slots_json`): no pids, paths, host names or login
emails, accounts named only `A1`/`A2` and `Claude Max N`, committed through the contents API only
when the content apart from `updated_at` changed, never forced, so it makes no commit on main and
starts no workflow. There is no separate publish command to call. The fields the page reads:

```
{ updated_at, caps: { dev, planner },
  grok:     [{ slot, state: 'free'|'dev'|'planner', ticket, since, claude_slot }],
  claude:   [{ slot, state: 'free'|'busy'|'disabled', ticket, grok_slot, since }],
  accounts: [{ id, account, name, enabled, reason,
               slots: [{ slot: 'C1', state, kind: 'dev'|'aux'|'external'|null, ticket, grok_slot, since }] }] }
```

Without `accounts` (a v1 snapshot) the Claude pool shows as one pool. The page copies only these
fields (`scripts/status/slots.mjs`), so anything else in the file never reaches it, and drops a name
or reason that looks like a path, email or host name. A malformed file shows its reason instead of
the tables.

- **Live:** the page re-reads `slots.json` with `loops.json` every 60 s (one API call for the
  branch head, then both files from raw at that commit), so a change shows within about a minute.
  `build-status.mjs` puts the last snapshot in `status.json` for the first paint.
- **STALE:** the driver publishes only on change, so `updated_at` is the last change, not the last
  check. The snapshot counts as confirmed by the newer of `updated_at` and the newest heartbeat of
  the `steampunk-loop` entries in `loops.json` (sent every 10 min while a session runs, and on every
  pass); older than 20 min (`SLOTS_STALE_AFTER_MIN`) and the tab, its badge and the header line say
  STALE.

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
