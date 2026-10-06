# Ticket phases: where each ticket's time goes

CI test timings and results live elsewhere: see [test-metrics.md](test-metrics.md).

Each closed ticket gets a breakdown of its time, from creation to close, in ten fixed phase
categories. One file per ticket lives in `docs/metrics/tickets/<n>.json`. The status page draws them
in the **Where the time goes** section at the top of the **Issue trees** tab
(**https://bjor2.github.io/steampunk-miner/status/#issues**):

- one stacked bar per recently closed ticket (the last 30), linked to the issue, with its
  claimed-to-done time beside it; a ticket with no `claimed` shows "no claim data";
- the category totals of the tickets closed each day (UTC);
- the median cycle time and median lead time per close day, to follow completion time over time;
- a legend with every category, even one at zero.

The bars, the day totals and the legend count only each ticket's
[claimed-to-done window](#claimed-to-done-window) (#167); a ticket with no claim adds nothing to them.

The page never shows how long a ticket was **blocked**: the files still record `blocked` time (the
category is part of schema v1), but the status page drops it before drawing, on both tabs, so it is
in no bar, legend, tooltip or category total there (`HIDDEN_CATEGORY_IDS` in
`scripts/status/ticketTimeOverview.mjs`). A bar is its other categories; the claimed-to-done, lead
and cycle times beside the bars and in the medians stay the full wall-clock spans.

The page reads only the committed files (`scripts/status/ticketTimeOverview.mjs`), so the Pages job
builds it without transcripts. Ticket #134 specifies all of this.

The **Features** tab rolls the same files up per feature and feature area, counting only each
ticket's [claimed-to-done window](#claimed-to-done-window), under a chart of tickets closed per day;
see [Roll-up per feature](#roll-up-per-feature-features-tab) below.

## Categories (schema v1)

The list is fixed. Adding or renaming a category bumps `schema`
(`scripts/metrics/phaseCategories.mjs`, which also holds each category's colour).

| id             | Name                | Counted when                                                                                                                                                                       | Source                |
| -------------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| `blocked`      | Blocked             | open with an open `blocked_by` dependency, or a `blocked` label                                                                                                                    | GitHub timeline       |
| `planner_wait` | Waiting on planners | the `needs-planner` label is on                                                                                                                                                    | GitHub timeline       |
| `idle`         | Idle                | open, unblocked and in no session: waiting for a slot, a loop tick, or between attempts                                                                                            | what is left over     |
| `context`      | Context gathering   | Read/Grep/Glob, `gh issue view`, `gh api`, `git log/show/diff/status`, cat/sed -n/grep/ls, read-only python, Skill, Agent subagents                                                | transcript            |
| `planning`     | Planning            | a reply with no tool call (thinking, a written plan, the closing summary), TodoWrite, plan mode, Plan subagents                                                                    | transcript            |
| `developing`   | Developing          | Edit/Write/MultiEdit/NotebookEdit, `git add/commit/stash/checkout`, `sed -i`, file-writing scripts, `art:export`                                                                   | transcript            |
| `testing`      | Testing             | vitest, typecheck, lint, prettier, build, bench, soak, balance and pacing sims, playwright, waiting on those runs                                                                  | transcript            |
| `gates`        | Gates               | the loop's own typecheck/lint/format/test/build after a session                                                                                                                    | loop logs             |
| `landing`      | Landing             | rebase, push under `.push.lock`, push_pending recovery, conflict resolution and hand-lands until the close; in a session `git fetch/rebase/push` and `gh issue comment/edit/close` | loop logs, transcript |
| `other`        | Other               | session time no rule matches                                                                                                                                                       | transcript            |

`other` should stay small. On the backfill below it is 0.7% of session time. If it grows, read
what the unmatched calls were and add a rule to `scripts/metrics/classifyToolCall.mjs`, with a
fixture in its test.

## How time is counted

**Inside a session** (`scripts/metrics/sessionSegments.mjs`, transcript in
`~/.claude/projects/*<worktree>*/<session>.jsonl`):

- A tool call's time runs from its `tool_use` to its `tool_result` and goes to that call's
  category.
- The model's time between a `tool_result` and the next `tool_use` goes to that next call's
  category. Model time in a reply that ends with no call counts as `planning`.
- Parallel calls share one timeline: the earliest open call owns the overlap, so no second counts
  twice.
- A background run (`run_in_background`) ends with a task notification that names its `tool_use`.
  The wait until that notification goes to the run's category, usually `testing`. Monitor,
  ScheduleWakeup and TaskOutput are `testing` for the same reason.
- Subagent lines are skipped: their Agent call in the main transcript already covers that time.

**Over the ticket's life** (`scripts/metrics/ticketRecord.mjs`): each source becomes windows with a
rank. Where windows overlap, the higher rank owns the time. Time no window covers is `idle`.
Ranks, highest first:

1. what the transcript says a session did;
2. the rest of a session's span (`other`): the seconds between the loop starting the session and
   the first transcript line;
3. `gates`: from the end of the session to the last `.gates.*` file's mtime, never later than the
   minute of the driver's verdict line (just the verdict line when the gate files are gone);
4. `landing`: from the driver's "verified ... pushing", "push lock acquired", push_pending recovery
   or manual-land line until the close. A failed rebase or push ends it only when another attempt
   follows (the ticket went back to work). Without one, the time until the close is conflict
   resolution and a hand-land;
5. `planner_wait`;
6. `blocked`.

A session ends at its transcript's last line. With no transcript, it ends at the driver's "exited"
line, and the log file's mtime is the last resort, because moving the box on 2026-10-06 at 05:35
touched every log file.

**Attempts:** each session log `logs/<n>-<YYYYMMDD-HHMMSS>.log` (build loop and perf loop) is one
attempt. Its first line names the session's transcript. A transcript started on `ticket/<n>` or
`perf/<n>` that no log names counts as an attempt of its own. Every segment carries the attempt
it falls in (0 before the first), the attempt's tier (from the driver's `tier=` line) and its
model (from the transcript, else the driver's model alias). Retries and rework can be counted
from these, with no extra category.

**Lead time:** created to closed. **Cycle time:** start of the first attempt to closed (`null`
when no session ever ran).

### Claimed-to-done window

A ticket is **claimed** when its first attempt starts: the first loop session (the `in-progress`
slot claim), or the first transcript on its branch when no log names one, never before its
creation. `claimed` is that moment and `claimed_to_done_s` the seconds from it to the close (#138).
They equal the cycle time's span and are `null` for a ticket no session ever ran.

The Features tab and the Issue trees tab count only this window (`scripts/metrics/claimedWindow.mjs`):

- every segment before the claim is dropped, whatever its category: waiting for a slot, blocked or
  waiting on planners before anyone picked the ticket up says nothing about the work;
- inside the window, every category is kept in its own colour: the session categories, `gates`,
  `landing`, `idle` between attempts or waiting on a gate slot, and `blocked` and `planner_wait`
  after the work started (the status page then leaves `blocked` out, see above);
- a segment that straddles the claim keeps only its part after it.

The median lead time on the Issue trees tab still runs from creation to close.

## File schema (v1)

```jsonc
{
  "schema": 1,
  "ticket": 133,
  "title": "Bug: lava touches on planets 8 and 10 with no lava-risk tile opened",
  "tier": "hard", // the tier:* label at close, else the last attempt's tier
  "model": "claude-opus-5-5", // the last attempt's model
  "created": "2026-10-06T10:06:58Z",
  "closed": "2026-10-06T13:10:52Z",
  "segments": [
    // one per line, covering created..closed with no gap or overlap
    {
      "category": "blocked",
      "start": "…",
      "end": "…",
      "attempt": 0,
      "tier": null,
      "model": null,
      "source": "github",
    },
  ],
  "totals": { "blocked": 4975, "planner_wait": 0, "idle": 1067 /* …all ten, seconds */ },
  "lead_time_s": 11034,
  "cycle_time_s": 4992,
  "claimed": "2026-10-06T11:47:40.000Z", // first attempt's start (#138), null with no session
  "claimed_to_done_s": 4992, // claimed to closed, null with no session
  "backfilled": false,
}
```

`source` is `transcript`, `loop-log`, `github` or `derived` (idle). The totals add up to the lead
time to within rounding. `claimed` and `claimed_to_done_s` were added to v1 without a schema
bump: a reader treats a file without them as never claimed. The writer puts one segment per line and rewrites the same bytes for the
same inputs, so the folder is excluded from Prettier.

## Roll-up per feature (Features tab)

The **Features** tab (**https://bjor2.github.io/steampunk-miner/status/#features**) shows the
ticket times per feature and per feature area of `docs/features/features.json` (#135), each
ticket cut to its [claimed-to-done window](#claimed-to-done-window) (#138). The rule lives in
`scripts/status/featureTime.mjs`:

- **A feature's tickets** are its `issues`, plus every sub-issue of an umbrella issue it lists,
  followed down through umbrellas of umbrellas. The umbrella itself is one of the tickets.
- **A group's tickets** (an area or a sub-heading) are the union of its own issues and all its
  children's tickets.
- **Each ticket counts once per node**, however many paths reach it. A ticket shared by two
  features counts in both, but only once in the group above them, so an area's total is never a
  plain sum of its features.
- **Measured** tickets have a file in `docs/metrics/tickets/` with a claim; their in-window
  category times are added. The others (no file, or closed with no session) count as **not
  measured**: shown as a count, never as zero time.
- Per node: seconds per category inside the window, the total claimed-to-done time, the measured
  and not-measured counts, and from **2 measured tickets** on the median claimed-to-done time per
  ticket. These replace lead time as the tab's headline.

What the tab shows (`scripts/status/featureTimeHtml.mjs`):

- at the top, **Tickets closed over time** (`scripts/status/ticketsClosed.mjs`): the `build` and
  `perf` issues closed each UTC day as bars, from the first close to the day the page is built
  (days with none at zero), with the running total as a line. It counts what
  `gh issue list --state closed --label build` (and `--label perf`) lists, not-planned closes
  included, from the issue list `build-status.mjs` already fetches, so every closed ticket counts
  with or without a metrics file. A day's hover gives the date, the count and the titles. Beside it,
  the median `claimed_to_done_s` of the measured tickets closed each day;
- on every feature row and group heading, a compact stacked bar in the fixed category colours with
  its total and median (or "N not measured" when no ticket is measured; nothing when it links no
  ticket). Its tooltip lists the claimed-to-done time and counts, the median and each category's
  time;
- above the tree, one bar per feature area on a shared scale, split by category, under the same
  legend as the Issue trees section (`phaseLegendHtml`, colours from `phaseCategories.mjs`), with
  the categories' totals over every ticket the tree links.

`build-status.mjs` reads the sub-issues and the close dates from the issue list it already fetches
and the times from the committed files only, so the Pages job builds it with no transcripts. A
broken ticket file or feature file replaces its chart with the error; the tree still renders.

## Commands (on the build box)

```bash
npm run metrics:ticket -- 133   # one closed ticket; refuses an open one
npm run metrics:backfill        # every closed #90 child and perf ticket closed since 2026-10-05
                                # that has transcripts; marks them backfilled, prints each ticket
                                # and the share of session time in other
```

The inputs live only on the box: `gh` (logged in), the loop logs
(`/workspace/claude-sessions/steampunk-loop/logs` and `/workspace/claude-sessions/perf-loop/logs`,
override with `METRICS_LOOP_LOGS=dir1:dir2`) and the transcripts (`~/.claude/projects`, override with
`METRICS_CLAUDE_PROJECTS`). Session log names are read in the box's local time (Europe/Oslo), the
same clock the loops name them with.

The first backfill (2026-10-06) wrote 28 tickets; a rerun the same day for #138 added `claimed`
and `claimed_to_done_s` to all 32 committed files and changed nothing else in them. Six closed tickets had no transcripts and were
skipped: #83, #97, #98, #105, #111 and #113. `other` was 0.7% of session time.

## How the loop calls it after a close

The loop wiring lives outside this repo; Grok Bot hooks it up. After the driver has pushed a ticket
and closed its issue (the "closed after successful push" / "landed on origin/main and closed"
step), it should:

1. run `npm run metrics:ticket -- <n>` in a checkout of `origin/main`, once the session's
   transcript and the gate files are final;
2. commit only `docs/metrics/tickets/<n>.json`, with a message like
   `Record where #<n>'s time went`, and push it under `.push.lock` like any landing (plain rebase,
   never force);
3. treat any failure as a warning: the metrics must never block or fail the loop. The command
   is idempotent, so a later run (or `metrics:backfill`) fills the gap.

A push to `main` rebuilds the status page, so the new bar shows on the next Pages run.

## Limits

- The driver's stamps are whole minutes. Gate and landing edges that come only from the driver
  log are accurate to about a minute; the gate files and transcripts are accurate to the second.
- A blocker counts from its creation to its last close. A reopened blocker is not followed.
- Tickets worked by hand outside the loop show only the transcripts started on their branch.
  Sessions on `main` cannot be matched to a ticket.
