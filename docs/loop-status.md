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
