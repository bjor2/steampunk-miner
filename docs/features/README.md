# Feature tree: keep it current

The **Features** tab of the status dashboard —
**https://bjor2.github.io/steampunk-miner/status/#features** (short link `/status/features/`) —
shows every player-facing feature of the game, built or planned, as one tree. Its only source is
[`features.json`](features.json) in this folder, edited by hand. No Python or build step: change the
JSON, commit it, and the next Pages build (every ~10 min, or on the push) shows it.

**When you ship or plan a player-facing feature, update `features.json` in the same change:**

- Shipped something new → add a node with `"status": "built"`, or flip an existing `planned` /
  `partial` node to `built`.
- Shipped part of it → `"partial"`, and say in `description` what is still missing.
- Planned or scheduled (an issue exists, nothing built) → `"planned"` with the issue number.
- Always put the issue numbers in `issues`, so the page can show their live open/closed state.

Engine work, refactors, tests and tooling with no player-facing effect do not go in the tree.

## Node format

```json
{
  "title": "Steam shield",
  "description": "A shield that absorbs hits before the hull does.",
  "status": "planned",
  "issues": [80],
  "planet": 22
}
```

| Key           | Meaning                                                                                  |
| ------------- | ---------------------------------------------------------------------------------------- |
| `title`       | Short name, as a player would say it.                                                    |
| `description` | One or two plain sentences on what the player sees or does.                              |
| `status`      | `built` (in the game today), `partial` (partly built) or `planned` (decided, not built). |
| `issues`      | GitHub issue numbers (optional for `built`; `partial`/`planned` need an issue or `doc`). |
| `planet`      | Campaign planet it unlocks on, if any (shown as `P22`; searchable as "P22").             |
| `doc`         | Optional repo path of the doc that describes it (`docs/...`).                            |
| `children`    | Sub-features, same format.                                                               |
| `group`       | `true` for a heading node that only groups children; a group has no `status`.            |
| `ignoreSync`  | Optional reason that silences the "check" marker after a human looked (see below).       |

The top level has `title`, `description`, `areas` (the numbered feature areas, each a group),
`disagreements` (the "Where the sources disagreed" notes; `**bold**`, `` `code` `` and `#123`
links work) and `sources`.

## The "check" marker

At build time (`scripts/status/build-status.mjs`, `scripts/status/features.mjs`) every node's
issues are joined with the live issue list. A node gets a subtle **⚑ check** marker when its status
looks out of date: marked `planned`/`partial` but all its work issues are closed, marked `built`
but all its work issues are still open, or a linked issue does not exist. Decision and research
issues (`wayfinder:*` labels) and umbrella issues (with sub-issues) never count as work. The tab's
"To check" chip and the "Features to check" list show them; fix the status (or add `ignoreSync`
with a reason when the mismatch is real and known).

`npm test` validates the file (`scripts/status/features.test.mjs`), so a typo fails CI, not the
page. If the file is invalid at build time anyway, the tab lists the problems and the rest of the
page still deploys.
