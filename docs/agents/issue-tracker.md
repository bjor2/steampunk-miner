# Issue tracker

GitHub Issues on [bjor2/steampunk-miner](https://github.com/bjor2/steampunk-miner/issues)
is the issue tracker for this repository. New backlogs, plans and wayfinder maps
go there, not into local markdown.

Use the `gh` CLI (`gh issue …`, `gh api …`). Refer to issues by their title,
with the link inside it, rather than by bare number.

## Wayfinding operations

A wayfinder **map** is one issue labelled `wayfinder:map`. Its tickets are
GitHub **sub-issues** of the map, and each carries exactly one type label:
`wayfinder:research`, `wayfinder:prototype`, `wayfinder:grilling` or
`wayfinder:task`.

| Operation         | How                                                                                                                                                                                                      |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Create a ticket   | `gh issue create --label wayfinder:<type>`, then attach it to the map: `gh api -X POST repos/bjor2/steampunk-miner/issues/<map>/sub_issues -F sub_issue_id=<ticket database id>`                         |
| Database id       | `gh api repos/bjor2/steampunk-miner/issues/<n> --jq .id` — the sub-issue and dependency APIs take this, not the issue number                                                                             |
| Block a ticket    | `gh api -X POST repos/bjor2/steampunk-miner/issues/<blocked>/dependencies/blocked_by -F issue_id=<blocker database id>`                                                                                  |
| Claim a ticket    | `gh issue edit <n> --add-assignee @me`, before any work                                                                                                                                                  |
| Frontier          | open sub-issues of the map with no assignee and no open `blocked_by` issue: `gh api repos/bjor2/steampunk-miner/issues/<map>/sub_issues` and check each ticket's `issue_dependencies_summary.blocked_by` |
| Resolve           | post the answer as a comment, `gh issue close <n>`, then add a line to the map's _Decisions so far_                                                                                                      |
| Rule out of scope | close the ticket as not planned (`gh issue close <n> --reason "not planned"`) and add a line to the map's _Out of scope_                                                                                 |

Assets made while resolving a ticket (prototypes, research notes) live on a
branch or in the repo and are linked from the issue, not pasted into it.

## Specs and testing

A **spec** is an issue titled `Spec: …` or a wayfinder map. Build tickets come from one spec, and
the box Tester tests per spec: when every ticket of a spec is closed, it runs that spec's tests (the
union of the files its tickets changed, fast relevant tests, then the pacing bot and e2e) and reopens
the culprit ticket with `needs-fix` when red. The loop's `spec-resolve.py` reads these lines:

- **Every build ticket** names its spec on a line of its own: `Spec: #<n>`. Without it the ticket's
  first `map #<n>` reference counts, and without either the ticket is tested alone at its close.
- **A sub-spec** (a spec inside a bigger one) is a sub-issue of the outer spec, or carries its own
  `Spec: #<outer>` line.
- **An outer spec** (one with sub-specs) states when its tests run, on a line of its own:
  - `Testing: per-subspec`: each sub-spec is tested when its tickets close, and the outer spec
    again when all of them are closed. This is the default when the line is missing.
  - `Testing: outer-only`: sub-specs are not tested on their own; only the whole outer spec is,
    once every ticket under it is closed. Pick this when sub-specs only work together.

Planners (Producer, Game Director, Tech Director) write these lines when they create specs and
tickets. Template for an outer spec body:

```markdown
Spec: #<outer spec, if this is a sub-spec>
Testing: per-subspec <!-- or outer-only -->

## Destination

...
```

and the first lines of a build ticket body:

```markdown
Spec: #<spec this ticket implements>
...
```
