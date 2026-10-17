# Loop status: the one-liner

The status dashboard — **https://bjor2.github.io/steampunk-miner/status/** — has six tabs, each
linkable: **Issue trees** (`#issues`), **Loops** (`#loops`, the default), **Slots** (`#slots`, the
build loop's slot pools), **Tests** (`#tests`, the box Tester and every test's duration, feature
and trend), **Features** (`#features`, the game feature tree) and **Performance** (`#performance`,
short link `/status/performance/`). It shows the issue trees and what every automated loop is
doing. Above the tabs (on every tab but Features) the highlighted **Drill speed** panel shows whether
drilling got faster ([below](#drill-speed-panel-ticket-434)). A loop reports its state with one
command:

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

Where build tickets come from: the build loop picks from #90's sub-issues, the hand-kept
`EXTRA_TICKETS` list, and (since 2026-10-07) every open `build` issue that is a sub-issue of an open
`wayfinder:map`, or of an open spec one level below such a map. #90 is at GitHub's 100 sub-issue
cap, so new builds are filed under their map (#157, #139, ...) and the loop finds them without a
hand edit. An epic (an issue with open sub-issues) is never picked itself. The usual pick rule still
applies to all of them (see Ready to begin above). Cost: one open-issue list and one sub-issue read
per open map (and per open spec under it), cached for two minutes.

Parents close themselves: on every pass the build loop closes any open issue labelled `build`,
`wayfinder:map`, `wayfinder:task`, `perf` or `design` (build plans, wayfinder maps, specs, perf
plans) once its `sub_issues_summary` has `total > 0` and `completed == total` **and** the issues it
links in its body (`issues/<n>`, this repo; the umbrella plan #90 and the issue itself don't count)
are closed too, with a comment saying so. A wayfinder map stays open until everything it lists is
built: its decision tickets **and** every build (or other issue) it links must be closed. A spec or
plan parent waits for the `build` tickets it links. Two parents that link each other don't block
each other. Root map #1 follows the same strict rule. So a map leaves the Open list only when its
last decision ticket and its last linked build have closed.

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
               slots: [{ slot: 'C1', state, kind: 'dev'|'aux'|'external'|null, label, ticket, grok_slot, since }] }],
  waves:    { mode, parallel, list: [{ number, key, map, lane, state, tickets, done, live }] },  // since 15 Oct; not drawn yet
  gate:     { busy, max },          // gate-stage tokens: worker gates + box Tester heavy phases
  tester:   { state: 'idle'|'running', phase, sha, since, holds_gate, claude_slot,
              last_run, last_nightly, last_nightly_result, main_red_sha,
              feature, feature_title,            // the feature under test while running
              queue: [{ feature, title, tickets, since }] } }   // completed specs awaiting test (feature = the spec issue)
```

`tester` is the box Tester (`tester.sh` beside the driver, docs/metrics/test-metrics.md). It
writes `tester/live.json` on every phase change and runs `next-ticket.sh --status`, so the Slots
tab shows it holding a gate token or its triage Claude slot (an `aux` slot labelled
`tester-triage`) within about a minute; it also publishes a `tester` entry in `loops.json`
(working / idle / blocked on red / paused on main red), whose state changes rebuild the page. The
Tests tab (#192) reads `tester` with the test-metrics `summary.json` and main's `box-tester/*`
commit statuses: the spec under test, the specs awaiting test, runs per phase (fast, slow, probes,
full, nightly suites; `probes` are the `Tester checks:` commands of a spec's resolution comments, since
build workers no longer run pacing, `balance:*` or e2e themselves) with their feature, the main-red pause and a STALE warning when no box run
happened for 26 h (`TESTER_STALE_AFTER_H`; runs are per completed spec plus the nightly). A ticket the Tester
reopens with `needs-fix` gets one attempt back in the loop's `state.json` (`tester_grants`), so the
loop retries it even after `MAX_ATTEMPTS`; the Loops tab's Needs attention list says "Tester red
(phase): retry granted" until it closes green.

**Red main (since 2026-10-13):** while `tester/main-red` is set (a red nightly or `--full` suite;
it holds the commit SHA), the driver doesn't stop all dev spawns any more. `fill_dev_slots` still
refills, but `pick_tickets` skips every ticket without the `needs-fix` label, so only the fixes
that turn main green get workers (the reopened culprits, plus fix-main tickets such as #350 for the
#324 import cycle). Tier routing is unchanged. The driver log says "spawning needs-fix tickets
only". The Tester keeps running `tester.sh --full` while the flag is set. A green full run clears
the flag, and the next refill goes back to normal picking. Before this change a red main also
blocked the needs-fix tickets, so main could never get green again (Oct 8 to 13).

**Main-red cleared by hand (15 Oct 2026, Bjor's ruling):** `tester/main-red` (set at 57ab1562b) was deleted by hand at 17:40 CEST after #418 closed (16:48) so the waiting tickets (#419, #420, #416, #400, #397, #320) can start. `campaignPacingGate` is a known red until #417 closes, so a later full run will still fail on it until #419 (the known-failure marker) lands; the other previously failing files (runSummary, cutFollow, pacingGate, botWallet, botChargeNeed) pass on the tip 538aacfc0.

**Auto-filed fix tickets (since 2026-10-13):** when a `--full` or nightly full suite is red and no
open `needs-fix` issue exists, `tester.sh` (`auto_file_needs_fix`) files one itself, labelled
`build`, `needs-fix` and `tier:hard`, with the run tag, SHA, failed files and the exact FAIL and
assertion lines. It forbids loosening tests or locked limits and says to pause at `needs-planner`
for the Systems & Economy Designer (with the Horizontal and Vertical Scalers) if a new economy
decision is needed. While main is red, `pick_tickets` also picks any open `build` + `needs-fix`
issue (`red_fix_tickets`), even if it is not under #90 or in `EXTRA_TICKETS`. Together these stop
the idle state of 13 Oct, when main was red with no open fix ticket and all 8 slots sat empty.

A session that pauses its ticket at `needs-planner` (a planner question, not a failed build) gets
its attempt refunded in `state.json` (`attempts`, floor 0), so it never runs out of tries while
waiting on planners. Needs attention shows it as "needs-planner (attempt refunded)". Real failures
(`needs-fix`, gate failures, no-change rejections) still count against `MAX_ATTEMPTS` = 2.

A ticket whose gates were green but whose branch then conflicted with `origin/main` at push time
is handed back `needs-fix` with its attempt refunded too (conflict refund, since 2026-10-07 23:35),
at most 3 times per ticket (`CONFLICT_REFUND_MAX`, counted in `state.json` `conflict_refunds`).
With up to 8 parallel lanes moving main, two conflicts used to use up `MAX_ATTEMPTS` and strand
every ticket blocked by that one. After 3 refunds a conflict counts like any other failure. The
hand-back comment on the issue shows the refund count and the attempts used.

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

## Tests tab

**https://bjor2.github.io/steampunk-miner/status/#tests** shows the box Tester's state and runs
(above, see the Slots tab section) and, under **Every test**, each Vitest test with its feature,
latest status and duration, a sparkline of its duration over the recorded runs and a link to its
file at the run's commit. Above the list: which run it comes from (commit, time, run record), the
counts of files and tests with passed, failed and skipped, each feature's files, tests and total
duration with its own trend, and the slowest 10 tests. A test or feature whose latest run is at
least 1.5× and 20 ms over the median of three or more earlier runs is marked **slower**
(`scripts/status/testsOverview.mjs`).

The feature is the #191 lock: the test's `src/features/<slice>/` folder, else `cross-slice` for a
kernel file a check in `scripts/tests/crossSliceChecks.mjs` names, else `kernel`, with the
`tests/MANIFEST.md` area beside it. Sort and filter by feature, status, duration, file or slow-down
and search file, test or area; the choice stays in the hash (`#tests?feature=ores&sort=slowdown`,
`&status=failed`, `&q=bag`, `&dir=asc`; the first 200 rows show, `&all=1` shows every one).

The data is `tests.json` on the orphan `test-metrics` branch, rebuilt with `summary.json` each time
the Tester records a run ([test-metrics.md](metrics/test-metrics.md#per-test-history-testsjson-schema-1)).
Only runs that keep every test's duration feed it, so the trend has one point per nightly (the last
20). Nothing is committed to main, and the branch has no workflows, so no CI or Pages run starts.
The page reads it from raw when the tab opens and on the 60 s poll while the tab is shown;
`build-status.mjs` copies it beside the page as `test-history.json` for when raw fails.

### Drill-down run (ticket 416)

Between the Tester panel and **Every test**, the **Drill-down run** panel shows how far the vehicle
gets when the real Down key is held for 10 s. `e2e/browser/drillDown.spec.ts` opens the committed
start save `scenarios/drill-down-start.scenario.json` (seed 83921, planet 1, `drill_power` 1) in the
preview build. It drives off the dock pad to column 16, stops, then holds ArrowDown for 10 s of wall
time. Further runs do the same at stored drill_power steps 5, 10, 15 and 20 (ticket 434), set
through `debug.setUpgrade`. The panel shows
the latest run per level (start and end position in cells, HUD depth, depth reached in 10 s and its
change against the run before, cells/s, m/s), a sparkline of depth gained over commits, and the
newest 20 runs (commit, ticks in the hold, Tester phase).

It watches and does not judge (GD on #416). The spec asserts only that the vehicle went down and did
not stall at 0, and the page colours nothing pass or fail. #409 owns the strict ladder assertion.
It runs where the Tester runs Playwright: the slow tier of a spec run (when the box has room) and the
nightly `e2e` suite. Build workers never run it.

Where the results live: each run writes one row to `test-results/drill-down/level-<n>.json` in the
Tester's worktree. `scripts/ci/pushTestMetrics.sh`, which the Tester calls after every phase, runs
`scripts/ci/recordDrillDown.mjs`, and that appends the rows to **`drill-down.ndjson` on the
`test-metrics` branch**: one JSON line per run, append-only, kept across runs, a row id already held
skipped. The schema is in [test-metrics.md](metrics/test-metrics.md#drill-down-runs-drill-downndjson).
The page reads the file from raw like `tests.json`, and `build-status.mjs` copies it beside the page
as `drill-down.ndjson`.

### Drill speed panel (ticket 434)

Bjor, 15 Oct: "drilling is still way too slow, level 20 feels like level 5". The **Drill speed**
panel sits in its own highlighted card above the tabs, so every merge shows whether drilling got
faster and smoother. One row per **level**, which is the stored `drill_power` step the tests set
(stored 10 equals major 1; the panel's note says so), at levels 1, 5, 10, 15 and 20:

- **Cut m/s (ladder):** what the drill can cut. `src/logging/drillLadderSteps.test.ts` runs the
  #409 ladder's cut (`cutColumnAtDrillStep`) down the first 20 cells of the P1 surface column (seed
  83921, column 20; all band 1, the ground a 10 s hold reaches) at each stored step, with the drill
  law alone and no vehicle travel. 1 cell = 1 m, so its cells/s is its m/s.
- **Descent m/s (browser):** what the body achieves going down: the drill-down run's
  `descentMetres` (toward the planet's centre) over its 10 s hold, at the same stored step.
- **Descent ÷ cut:** the "remove ground, then fall" gap, with a bar against the **100% target**.
- **Gain on the level before:** the latest cut, the drill law's own gain for that step (the ladder
  row's `lawGainOnPrevious`) and the latest descent, each divided by the level shown above it, so
  "level 20 feels like level 5" reads as a number.
- **Trend:** each speed's latest value, its change since the run before ("first run" for a lone
  one), the run count and commit, and a sparkline over the newest 20 runs.

A level with no run reads **"no run yet"**, never 0. It watches and does not judge: nothing is
coloured pass or fail, #409 keeps the strict per-major ladder assertion, and the drill-down run
keeps its loose ones.

Where the data comes from: the descent is `drill-down.ndjson` (above). The cut is
**`drill-ladder.ndjson` on `test-metrics`**: the ladder spec writes one row per level to
`balance-report/drill-ladder-steps.ndjson` in the Tester's worktree, and `pushTestMetrics.sh`
runs `scripts/ci/recordDrillLadder.mjs` after every phase, which appends them the same way
(append-only, a row id already held skipped, stamped with `recordedAt`, `sha` and `phase`). The
schema is in [test-metrics.md](metrics/test-metrics.md#drill-ladder-runs-drill-ladderndjson-schema-1).
The page reads both files from raw on load and on the 60 s poll, and `build-status.mjs` copies them
beside the page. Code: `scripts/status/drillSpeed.mjs` (model) and `drillSpeedHtml.mjs` (view),
tested from the fixtures in `scripts/status/fixtures/drill-speed/`.

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

## Waves and the load guard (15 Oct 2026)

Bjor's rule (15 Oct 22:26): after each planning session the Producer runs `/osilion-wave-plan`, and
**waves, not single tickets, are what gets developed.** A wave is a `wayfinder:wave` issue (written by
`osilion-wave-plan`, one per theme, tickets in dependency order, `Touches:` and `Size:` taken from the
ticket bodies). Today, on map #302: **1A Drill kernel** (#430 then #397, #421, #432), **1B UI text
budget** (#425 then #426 to #429), **1C Status page drill speed** (#434) and **1D Bench** (the
grilling and spec tickets; the loop never dispatches it). Settings sit in the map's _Wave settings_
block (`packing: theme`, `promote: none`, `browser: off`, `replan: wave`).

**Design (layer over the per-ticket worker).** A wave only decides _which ticket the next free slot
takes and in what order_. The worker (one Claude Code session per ticket, own worktree, gates, push
lock, attempts, `needs-planner` refund, tier labels) and the 6 Claude slots of account 1 are unchanged.
Waves in one round run in parallel (one slot each); inside a wave tickets run one after another
(`parallel=1`).

**Switch.** Wave mode is **off by default**: the driver picks tickets exactly as before. Turn it on
with `mode=on` in `/workspace/claude-sessions/steampunk-loop/wave-mode` (or `WAVE_MODE=on`). When on:

- the next ticket comes from the claimed waves first, then the ready waves (every blocking wave
  closed), best `PRIORITY_TICKETS` rank first; the usual per-ticket filters still apply;
- **a build ticket in no wave is not built** once the transition window is over (`legacy_hours`,
  default 24 h from the first on-pass); until then it is built as before. `--wave-status` lists them;
  every routine pass prints `NEEDS_WAVE_PLAN {"map":..,"tickets":[..],"room":..}` for build tickets
  older than 30 min that sit in no wave, and the Producer runs the wave plan;
- the first claim of a wave assigns the wave issue to the gh user and labels it `in-progress`
  (assigned = frozen: a replan never touches it); a green close ticks the ticket in the wave body; a
  wave whose tickets are all closed is closed by the driver;
- a claimed wave with nothing runnable left (every open ticket `needs-planner`, `blocked`, `hitl`,
  `on-hold`, out of attempts, or waiting only on those) is un-assigned and labelled `wave:paused`;
  the next `/osilion-wave-plan <map> --replan` regroups what is left, and removing the label makes it
  claimable again. Independent tickets of a wave keep running while one ticket is stuck;
- the worker prompt gets a `WAVE:` line naming the other tickets of the wave.

Running workers are never killed by any of it. Order and caps are the only thing that changes.

**Replan.** `next-ticket.sh --wave-plan <map>` runs `/osilion-wave-plan <map> --replan` headless in a
Claude slot (exit 75 if the pool is full). A first plan is never applied headless. The Producer
runs it after each planning session and posts the wave table in the room; the Game Director does
not lock a spec until that table is posted. `Touches:` and `Size:` go on every build ticket when it
is filed (areas in use: `drill-kernel`, `ui-panels`, `status-page`).

**Load guard (always on, `LOAD_GUARD=0` or `load_guard=off` turns it off).** Before every dev claim
the driver checks the box: no new worker while the 1-minute load average is above 14 or
`MemAvailable` is below 3 GB (Oct 15 21:5x the box ran out of memory while the Tester's browser tests
and 4 workers ran together). The driver log says `load guard: ...`. A skipped refill is retried by the
next refill trigger or the 30-minute pass.

**`slots.json`** gets a top-level `waves: { mode, parallel, list: [{ number, key, map, lane, mode,
state: 'running'|'ready'|'blocked'|'paused'|'bench', tickets, done, live }] }` and a `wave` key (the
wave key) on every slot that holds a ticket. The sanitised public copy carries them too. The Slots
tab does not draw them yet (the page copies only the fields listed above); the Waves panel is a
follow-up ticket in wave 1C, after #434, because it edits the same `scripts/status/` files.

## Wave mode is ON (16 Oct 2026)

Bjor approved it on 16 Oct (about 11:23 Oslo): "test wave mode with a dry run and a real claim, put the mobile tickets in
their own wave first, then turn it on". The switch is `mode=on` in
`/workspace/claude-sessions/steampunk-loop/wave-mode` (backup `wave-mode.bak-20261016-off`). The transition window for
tickets in no wave (`legacy_hours=24`) started at the first on-pass, 16 Oct 11:05 Oslo. **Rollback:**
`sed -i 's/^mode=on/mode=off/' /workspace/claude-sessions/steampunk-loop/wave-mode` (or `WAVE_MODE=off`); nothing else changes
and running workers are untouched either way.

Mobile pass 1 has its own waves on map #470 (not #302, whose planner reads only its direct children): **1A** render quality
(#477), **1B** save durability (#479), then the portrait slice **1D** (#483 to #487), **1E** (#489) and **1C**
(#482, #488, blocked by 1D). They use #302's wave settings (`packing: theme`), written into the #470 body, and the
`Touches:`/`Size:` lines the Producer put on the tickets. `PRIORITY_TICKETS` starts `473 475 476 477 478 479 480 481`, so
mobile still wins ties. Only tickets with `build` run; `needs-planner`, `blocked` and no-`build` tickets are skipped, and a wave
with nothing runnable left pauses itself. Tested: a dry run under `WAVE_MODE=on` (picked #477 only; held and `needs-planner`
tickets skipped), a real pass (closed finished wave 1B, then claimed wave 3B for #444), `wave_on_claim` and the tick on
wave 1A. Maps whose children are not #302's need their own `--wave-plan <map>` run.

## Priority list (14 Oct 2026)

`PRIORITY_TICKETS` in `next-ticket.sh` now starts `396 399 400 397 409 411 410` (Bjor, 14 Oct 23:10: smooth drilling first): #396 (drill law), then the cut-follow chain #399 (K-carry), #400 (K-bound), #397 (cut-follow, smooth drilling) and #409 (drill ladder benchmark), then #411 (money-only tech tree) and #410 (item cards). Since 15 Oct 00:12 Claude account 1 has 6 slots (C1-C6; it was raised to 8 on 14 Oct and lowered after the box load reached 86 on 8 cores); account 2 is C7-C10 (4 slots, disabled until its weekly limit resets). Free slots are refilled as soon as a worker exits instead of waiting for the 30-minute pass. The next free dev slot claims them in that order, skipping blocked tickets.

## Smooth drilling first (16 Oct 2026, 11:55 BST)

Bjor, 16 Oct: "Prioritize the drilling now, as this is really bad." `PRIORITY_TICKETS` in `next-ticket.sh` now starts `491 492 499 471 463 460 441`, ahead of `473 475 476 477 478 479 480 481 396 399 400 397 ...`. In wave mode a wave's rank is the best `PRIORITY_TICKETS` position of its tickets, so wave **3D** (#467: #491 toe-aware let-go stop, then #492 swept cut keeps ahead of the body) is the first wave the next free slot takes. Waves 3C (#471, `needs-planner`) and 3A (#463, no `build` label) rank next but are skipped until they are runnable, so they never block anything. #499, #460 and #441 are `needs-planner` or `blocked` and are skipped the same way until the planner clears them. Nothing else changed: no label was added to materials (#444 to #454) or portrait (#485 to #489) tickets, no live worker was stopped, and wave mode, `parallel=1` per wave and the load guard (1-min load above 14) are as before. #491 resumes from its existing `ticket/491` commits (9693a918, ace0fdd1); the driver reuses an existing branch tip and takes a backup branch first.

Rollback: restore `next-ticket.sh.bak-20261016-drillfirst` (the file before this edit) or delete the first seven numbers from line 130.

## Measurement tickets in wave mode (16 Oct 2026, 14:10 Oslo)

`PRIORITY_TICKETS` in `next-ticket.sh` now carries **#504** (start/turn latency measurement), **#505** (level-cut dip measurement) and **#503** (clamped-carry accounting, slice 1) right after the drilling entries (`491 492 499 471 463 460 441`). #504 and #505 are `build,tier:easy`, measure-only, Spec #316.

These three are children of #316, not #302, so the wave planner places them in no wave, and wave mode skips a ticket in no wave once the 24 h transition window ends (about 11:05 Oslo on 17 Oct). A new `WAVE_ORPHAN_ALLOW=" 504 505 503 "` list in `next-ticket.sh` exempts them: they are tried before wave order and keep running after the window. Every other pick rule still applies (`build`, none of `blocked`/`on-hold`/`hitl`/`needs-planner`, blockers closed, attempts left). Remove a number from the list once its ticket closes or joins a wave.

Rollback: restore `next-ticket.sh.bak-20261016-1500-prio503-505` (the file before this edit), or delete `504 505 503` from line 130 and the `WAVE_ORPHAN_ALLOW` line and its two uses in `pick_tickets`.

## Portrait go: #500 first, then the portrait slice (16 Oct 2026, 18:40 Oslo)

Bjor, 16 Oct 18:18: "HUD fix, portrait slice then continue." `build` is on **#500** (mobile HUD declutter), **#484** to **#488**
and **#489**; **#482** (real-device check) stays a human step and now carries `hitl`; the materials tickets (#444 to #454) stay
without `build`. Native blockers make the order: **#500 blocks #484, #485 and #486**; #488 waits for #485 to #487; #489 waits
for #483 to #488 (Producer). The map #470 waves, replanned with `/osilion-wave-plan`: **2A** (#496) `#500 → #484 → #485`,
**2B** (#497, blocked by 2A) `#486 → #487`, then `#488`, then `#489`; **2C** (#495) is the HITL bench for #482. Waves 2A and 2B were
unpaused. Map #302 was replanned too (now 7A to 7D; #441, #499 and #471's wave are out).

`PRIORITY_TICKETS` now starts `500 506 484 485 486 487 488 489 463 504 505 503 396 ...` (closed tickets dropped, same file size,
live workers read the script by offset); **#506** is also in `WAVE_ORPHAN_ALLOW` (a #316 child outside the wave planner, like
503 to 505). Held: #471 (`blocked`), the materials waves, #482.

Side effect to know about: removing `hitl` from the spec #470 makes the spec pool delegate it to a planner room (one pass did, at
17:32 BST). `hitl` is back on #470 and the planner slot was freed; leave `hitl` on #470.

Rollback: restore `next-ticket.sh.bak-20261016-1825-portrait-prio`; `gh issue edit <n> --remove-label build` for 500 and 484 to
489; remove the blockers with `gh api -X DELETE repos/bjor2/steampunk-miner/issues/{484,485,486}/dependencies/blocked_by/<id of #500>`.

## Materials rarity wave 7A released (16 Oct 2026, 19:01 Oslo)

Bjor, 16 Oct 19:01: "Give it the build label then." `build` is now on **#445**, **#446**, **#447** and **#449** (wave 7A, #461,
map #302, `remote ready`). Native blockers set the order inside the wave: #445 first, then #446 and #447 (both blocked by #445), then
#449 (blocked by #445 and #446); the wave runs one worker at a time. #448, #450 to #454, #461 and #463 stay without `build`, as do
#499 and #471. The portrait waves (2A and 2B) and #506 keep their place in `PRIORITY_TICKETS`; wave 7A only uses free slots.

Rollback: `gh issue edit <n> --remove-label build` for 445, 446, 447 and 449 (a running worker finishes its ticket first).

## #508 added to the priority and orphan lists (16 Oct 2026, ~19:30 Oslo)

The Producer filed **#508** (E1b carry-smoothing prototype, drill kernel, `build`, `tier:hard`) under #316, outside map #302, and the
Game Director wants it ahead of anything off the smooth-drilling path. `PRIORITY_TICKETS` now starts `500 506 508 484 ...` and
**508** is in `WAVE_ORPHAN_ALLOW` next to 506 (no-wave #316 child). Same file size and inode (padding spaces trimmed on the same
lines; live workers read the script by offset).

Rollback: restore `next-ticket.sh.bak-20261016-1930-508` (the file before this edit, same size; copy it over in place with `cat`, not `mv`).

## #509 released: build, priority and orphan lists (16 Oct 2026, ~20:15 Oslo)

**#509** (materials: clamp seam with its protocol bump, split from #445 by the Producer; `tier:hard`, under #316, outside map #302)
now has `build`. It is blocked by #445 (open) and #506 (closed), so it waits for #445. `PRIORITY_TICKETS` starts `508 509 484 ...`
(closed 500 and 506 dropped) and **509** is in `WAVE_ORPHAN_ALLOW` next to 508. Same file size and inode, edited in one in-place write.

Wave 7A (#461: #445, #446, #447, #449) had been paused by the driver at 19:34 Oslo because #445 carried `needs-planner`. The TD
answered and removed it, so `wave:paused` was removed from #461 and the wave is `ready` again (the wave cache takes up to ~2 min to show it).

Rollback: `gh issue edit 509 --remove-label build`; restore `next-ticket.sh.bak-20261016-2015-509` over `next-ticket.sh` in place (`cat`, not `mv`).

## Smooth drilling released at top priority: #514, #515, #516 (16 Oct 2026, ~21:45 Oslo)

Bjor's top priority is smooth drilling. The Producer filed **#514** (A, report the pose every tick while drilling; `tier:hard`),
**#515** (B, camera ease below 3 m/s; `tier:easy`) and **#516** (C, shipped-contact dead stop; `tier:hard`) under spec #316, outside
map #302. All three carry `build`, no `needs-planner`, `hitl` or `on-hold`, and have no native blockers; the order #514 then #516
lives in wave 2B (#517) and #515 is alone in wave 2C (#518). `PRIORITY_TICKETS` now starts `514 515 516 509 486 ...` (515 is not
behind 514) and `WAVE_ORPHAN_ALLOW` is `" 509 514 515 516 "` (no-wave #316 children). Closed tickets (508, 484, 485, 463, 503 to 505 and
others) were dropped from both lists to keep the file the same size; the edit was one in-place `pwrite` on the same inode.

Rollback: `gh issue edit <n> --remove-label build` for 514, 515 and 516; restore `next-ticket.sh.bak-20261016-2145-514` over
`next-ticket.sh` in place (`cat`, not `mv`).

## #519 released at top priority, #514 held behind it (16 Oct 2026, ~23:10 Oslo)

The Producer filed **#519** (A2: DrillGated once per gated cell on the flag-off report path, protocol 82; `build`, `tier:hard`, size M,
under spec #316, outside map #302, new wave 2D #521) and the TD cleared it for `build`. **#514** (A1) is natively blocked by #519
(open blocker), so the picker skips it until #519 is closed; #514 had no live worker (its earlier session paused with `needs-planner`
and was refunded). `PRIORITY_TICKETS` now starts `519 514 516 509 486 ...` and `WAVE_ORPHAN_ALLOW` is `" 509 514 516 519 "`. Closed
tickets (515, 396, 399, 400, 397, 409 to 411, 391) were dropped to keep the file the same size; the edit was one in-place `pwrite`
on the same inode.

Rollback: `gh issue edit 519 --remove-label build`; restore `next-ticket.sh.bak-20261016-2310-519` over `next-ticket.sh` in place
(`cat`, not `mv`).

## #522 released at top priority, #514 held behind #519 and #522 (16 Oct 2026, ~23:30 Oslo)

The Producer filed **#522** (A3: run-coded reportPose log lines, log schema bump, lossless; `build`, `tier:hard`, size M; touches the
command log and test harness; under spec #316, outside map #302; wave 2E #523). It is not blocked by #519. **#514** (A1) is natively
blocked by both **#519** and **#522** (both open), so the picker keeps it out until both are closed. `PRIORITY_TICKETS` now starts
`519 522 514 516 487 488 489` and `WAVE_ORPHAN_ALLOW` is `" 514 516 519 522 "`. All other closed tickets were dropped from the
priority list to keep the file the same size; the edit was one in-place `pwrite` on the same inode.

Rollback: `gh issue edit 522 --remove-label build`; restore `next-ticket.sh.bak-20261016-2330-522` over `next-ticket.sh` in place
(`cat`, not `mv`).

## Idle-box bench for #514: quiet-bench.sh (16 Oct 2026, ~23:45 Oslo)

The TD (comment 6225097284 on #514) ruled that A1 can only merge after the cost bench is re-run on an idle box: p50 <= 1.2 ms at W=7,
p95 < 2 ms at W=27, P200 flatness (p50 within +-10% of the P1 rigs), a per-tick max, and `meetsBar` in `scripts/benchReportPose.ts` must
read 1.2, not 0.7. Interval stays 1. The loop had no "bench on idle" concept: workers may not run benches, and the Tester only runs
`npm run bench:<name>` probes after a whole spec closes, with workers alive (and its regex does not match `bench:report-pose`).

What exists now:

- `quiet-bench.sh <ticket>` in the loop dir. It writes `.quiet-hold` (expiry epoch + owner), waits until the 1-min load stays below 2.0 for
  9 samples 20 s apart (max 60 min), checks out the tip of `ticket/<n>` in a throwaway `worktrees/wt-bench` (node_modules symlinked from the
  main clone), runs `npm run bench:report-pose` three times, logs load and the top CPU consumers around each run to
  `logs/quiet-bench-<n>-<ts>.log` (a run is marked NOT VALID if load1 after is 2.5 or more), then removes the worktree and the hold.
  `--selftest` (5 s hold) and `--release` exist. Nothing is killed: running workers and the Tester finish, new dev claims wait.
- `wave-lib.sh` `load_guard_reason` now also reports a live `.quiet-hold`, so `--refill-dev` and the pass claim nothing while it holds.
  The hold expires by itself (wait + 30 min), so a crashed run cannot wedge the loop. `wave-lib.sh` is sourced once per process, so
  running workers were not affected; `next-ticket.sh` was not edited.
- #514 got a comment (merge gate, `meetsBar` 1.2, per-tick max, P200 flatness, "do not run the bench in the session; end with
  `needs-planner: awaiting idle-box bench`; do not merge or close before the result is on the ticket and #519 and #522 have merged").

How to use: when #514's worker has committed the final code and paused, run `quiet-bench.sh 514` (it may take up to an hour to get a quiet
box; busy slots drain as sessions finish). Paste the benchmark lines on #514 for the TD and VS.

Open decision (human or planner): the driver pushes a green ticket to main right after its session ends, so the only thing keeping #514
from merging before the bench is the worker pausing with `needs-planner` and the native blockers (#519, #522). If a worker ignores the
comment, put `on-hold` on #514 until the bench is posted.

Rollback: `rm quiet-bench.sh .quiet-hold`; restore `wave-lib.sh.bak-20261016-2345-quiet` (the file before the 4-line hold check; copy it
over `wave-lib.sh`).

## #516 first, #514 blocked by it; quiet-bench paired and balance stages (16 Oct 2026, ~00:00 Oslo, 17 Oct)

TD ruling on #516 (comment 6225171313): **#516 merges before #514** and has no dependencies. `PRIORITY_TICKETS` is now
`516 519 522 514 487 488 489` (a same-size reorder, one in-place `pwrite`, backup `next-ticket.sh.bak-20261016-2355-516first`), and
**#516 is a native blocker of #514** next to #519 and #522 (`POST .../issues/514/dependencies/blocked_by`), so the picker keeps #514 out
until all three are closed. #516 has no `needs-planner`, `on-hold` or `blocked`, 0 attempts used, and no blockers. Wave 2B (#517) still
lists #514 then #516; the wave logic skips the blocked #514 and offers #516.
Rollback: restore the backup in place (`cat`, not `mv`); `gh api -X DELETE repos/bjor2/steampunk-miner/issues/514/dependencies/blocked_by/<id of #516>`.

`quiet-bench.sh` (see the section above) now also:

- **Bench stage, PASS/FAIL per row** via `quiet-bench-eval.py` (VS 6225108027): W=7 p50 <= 1.2 ms; W=27 p95 <= 2 ms or <= 1.25 x the paired
  swept-cut p95 (median of >= 3 runs); P200 rows (W=7 within +-10% of the P1 rig, W=27 the 1.25x rule); the per-tick max printed; the bench's
  own bar constant must read 1.2. It detects the paired swept-cut mode at run time (a `pair|baseline|swept|compar` flag in
  `scripts/benchReportPose.ts` or a matching `package.json` script) and never invents one. Tip `76f47f53` has none, so the log says
  "paired mode not present yet, result INCOMPLETE" and falls back to plain `npm run bench:report-pose`. A gate with no matching field in the
  bench JSON is INCOMPLETE, never PASS. The worker's bench must print, per row: `width`, `speedMps`, `interval`, a drill-level field (key
  contains `level`), `tickP50Ms`, `tickP95Ms`, a per-tick max (key contains `tick` and `max`), and the swept-cut rows either as extra rows with
  `mode`/`path`/`kind`/`variant`/`source` = `swept` or in a second array of rows, plus `bar.tickP50Ms` = 1.2.
- **`--balance` stage** (`--only-balance` skips the bench): `npm run balance:baseline` (script `vite-node scripts/balanceReport.ts
--write-baseline`, output `balance-report/` with `summary.json`, `report.md`, `events.ndjson`, `commands.ndjson`) on the tip of `ticket/<n>`
  **and on its merge-base with main** (`git merge-base origin/main ticket/<n>`; TD: not main's tip, not the stale 7 Oct baseline), one after the
  other in throwaway worktrees (`wt-bench`, `wt-bench-base`), same seeds. The pacing-bot bands (summary.json minus `logSchemaVersion`, and the
  pacing report minus its "Against the baseline" section) must be **zero diff**; any diff is FAIL: A leaked into the bot, goes back to Systems.
  Events and commands hashes are reported as info. Drift from the other commits since 7 Oct is not in this comparison (both sides share the merge-base);
  it belongs to the re-record, read against the #396 pacing bands. The hold is extended by 90 min for this stage.
- `--selftest` now also checks the evaluator on synthetic paired rows, tip-style rows and the zero-diff and nonzero-diff balance cases (no benches run).
  Rollback: restore `quiet-bench.sh.bak-20261016-2355-paired`, remove `quiet-bench-eval.py`.

## Wave-key collision fixed in wave-lib.sh: #516 was never picked (16 Oct 2026, 23:05 box time)

With `516` at the front of `PRIORITY_TICKETS`, no blockers, no labels and 0 attempts, the picker still answered "no pickable build ticket" four
times. Cause: wave keys repeat across maps (**2B** is #497 on map #470 and #517 on map #316), and `wave_prepare_pick` indexed `WAVE_TAKEN` and
`WAVE_OF` by that key, so the live worker of #497 (#487) filled the one-worker cap of #517 and starved #516. `wave-lib.sh` now indexes both by the
wave issue number (`$num`); `next-ticket.sh` only reads them through `WAVE_OF[$n]`, so it was not edited. Backup
`wave-lib.sh.bak-20261016-2358-wavekey`. After the fix a fresh pass claimed **#516** (slot G1, Claude C1, 23:05 box time); #514 stays out
(blocked by #516, #519 and #522 (closed 22:56 box time)). Not fixed, only noted: `blockedKeys` between waves still uses the bare keys, so two
waves with the same key can block or unblock each other wrongly; the next `/osilion-wave-plan` should give map-unique keys.
Rollback: restore the backup over `wave-lib.sh` (running processes keep the code they loaded).

## Wave keys are map-unique (17 Oct 2026, ~00:35 Oslo); #524 orphan-allowed

- `WAVE_ORPHAN_ALLOW` is now `" 514 516 519 522 524 "` (#524, the bot-slice baseline re-record; not in `PRIORITY_TICKETS`, its native blockers #514 and
  #519 keep it out). Same size and inode (padding spaces), backup `next-ticket.sh.bak-20261017-0010-524`.
- **Planner** (`osilion-wave-plan`, `scripts/waves.mjs`, doc `WAVES.md`; user-created workflow, edited in place with backups `*.bak-20261017-0030`):
  new waves are keyed `<map>-<level><letter>` (`316-3A`) and sweeps `<map>-BT...`; the branch name keeps the bare part (`waves/316/3A`). Waves already
  on GitHub keep their bare keys (`2B`); they are re-keyed only when a replan rewrites their issue. No existing wave issue body was touched.
- **Loop** (`wave-lib.sh`, backup `wave-lib.sh.bak-20261017-0025-mapkeys`; `next-ticket.sh` not edited): the "Blocked by" parser accepts hyphenated keys, and a
  blocker counts as open when an open wave **on the same map** has the same key with its `<map>-` prefix stripped, so bare and prefixed forms match each other
  and two waves with the same bare key on different maps no longer block or unblock each other (this completes the `$num` indexing fix of 16 Oct).
- Checked: `--wave-status` before and after is identical (10 waves, same states); a synthetic cache with bare and prefixed keys across maps 470, 316 and 302 resolved
  each blocker within its own map; `waves.mjs propose 316` and `302` produce `316-3A`, `302-8A..8C` and blockers like `302-8A`, and `status 316` still reads the old keys.
- Rollback: restore the three backups (`wave-lib.sh`, `waves.mjs`, `WAVES.md`); existing waves are unaffected either way.

## Merge-after guard (17 Oct 2026, ~00:40 Oslo): #529 builds in parallel, merges only after #514

TD ruling on #514/#529: no hard build block, but a fixed merge order. Mechanism (generic, config-driven):

- **`merge-after.conf`** (loop dir): one `<ticket>:<prerequisite>` per line, `#` comments allowed. Currently `529:514`.
- **`merge-hold-lib.sh`** (new, sourced at the end of `wave-lib.sh`) defines `merge_after_of` and `merge_hold <n> <wt>`. `verify_ticket` calls
  `merge_hold "$n" "$wt" && return 0` right after the gates are green and before the push/close (one-line hook in `next-ticket.sh`; same size, same inode,
  an equal number of bytes were taken from the comment above it; backup `next-ticket.sh.bak-20261017-0140-mergehold`; `bash -n` ok).
- **Semantics.** No entry: nothing changes. Prerequisite CLOSED _before this session started_ (`SESSION_SINCE`): go ahead and push as usual. Otherwise the ticket is
  **held**: nothing is pushed or closed, the attempt is refunded, a reopened issue is reopened, `ticket/N` is kept at its tip (`ensure_worktree` only wipes on
  re-claim and reuses a tip ahead of main), `state.merge_held[N] = {after, branch, sha, why, since}`, and a comment tells the next session what to do.
  `why=open` (prereq still open, or unreadable: fail closed) adds the prerequisite as a **native blocker**, which the picker already honours, so the ticket is
  not re-picked while #514 is open and is re-claimed automatically when #514 closes. `why=stale` (prereq closed _during_ the session, so the session did not
  build on it) is not blocked and is re-picked at once. If the blocker link cannot be added, the ticket gets `needs-planner` instead (remove it once the prereq closes).
- **Why not `push_pending`.** It is one global slot that blocks every other landing and marks the coordinator blocked; a held ticket should not stall the loop.
  **Why re-queue rather than auto-push.** The protocol-bump renumber and the lane re-run at both cadences is worker work, and a failed #514 bar changes which
  cadence ships. The re-claim is one normal attempt on the kept branch; its prompt gets the hold comment (rebase on `origin/main`, renumber the protocol bump,
  re-run the lane at every shipping cadence, gates). The ordinary push then rebases/hands conflicts back; never forced.
- **Picker/lane.** #529 and #514 may run in parallel; the guard only controls landing order. No extra lane-use constraint was added.
- **#529 relaunch.** Workers read issue comments only at session start, and the live #529 session (started 23:29 UTC) predated Producer comment 6226634455 (deletes stop-rule
  item (f)). Used the #508-style relaunch: `needs-planner`, SIGTERM the session (attempt refunded 0/2), label removed, re-claimed on slot 4 at 00:37 Oslo.
- Tested with stubs and a temp state: no entry, prereq open (blocker + refund + record), blocker add fails (needs-planner fallback), prereq unreadable, closed
  after session start (stale), closed before session start (go ahead, record cleared). Not run against real issues.
- Rollback: restore `next-ticket.sh.bak-20261017-0140-mergehold` and `wave-lib.sh.bak-20261017-0140-mergehold`, delete `merge-after.conf`, remove any blocker links
  and `merge_held` entries from `state.json`.

## Merge-after guard: `:release` entries (17 Oct 2026, ~04:00 Oslo)

- `merge-after.conf` takes an optional third field: `<ticket>:<prereq>:release`. The prerequisite closing is then not enough: the hold is lifted only when the prerequisite is
  CLOSED **and** the marker file `merge-release.d/<ticket>` exists (dir created in the loop dir). Plain `<ticket>:<prereq>` entries behave as before (native blocker).
- A green ticket with a release entry that is not releasable (no marker, or prerequisite still open) is held: nothing pushed or closed, `ticket/N` kept, the attempt refunded,
  and the issue labelled **`on-hold`** (no native blocker: that would clear when the prerequisite closes; on-hold is already honoured by the picker, so there is no cycle of
  refunded attempts). The hold comment says what is needed ("waiting for recorded release: #prereq landed or the GD recording Bjor's decision") and gives the release command.
  Nothing is added while the ticket builds: the entry is read only when a green session is about to push, so a release entry never blocks or pauses the build.
- `merge_release_sweep` (new, called at the top of `wave_prepare_pick`, skipped on `--dry-run`) lifts the `on-hold` label it added once marker + closed prerequisite are both there
  (gh is only called when a marker exists); the next pick re-claims the ticket for its rebase and re-run attempt; that session passes `merge_hold` (marker present, prerequisite
  closed before the session) and the ordinary push path lands it. A prerequisite that closed _during_ the session is a re-queue at once (no label), as before. `state.merge_held[N]`
  records `release` and `label` (the sweep only removes an on-hold it added itself).
- Release command: `touch /workspace/claude-sessions/steampunk-loop/merge-release.d/<ticket>`. Un-release: `rm` the marker (only matters before the sweep ran).
- The stale `529:514` entry was removed (#529 closed). No `514:<A6>` entry yet: the A6 issue was not filed at the time of this change.
- Stub-tested: no marker + prerequisite open, no marker + closed, marker + closed (goes ahead), marker + open (held), closed during session, plain entry unchanged, sweep (no marker,
  marker + open, marker + closed, idempotent). Files: `merge-hold-lib.sh`, `wave-lib.sh` (one sweep line; `.bak-20261017-0350-release`), `merge-hold-lib.sh.bak-20261017-0350-release`,
  `merge-after.conf.bak-20261017-0350`; `next-ticket.sh` untouched. Rollback: restore those backups.
