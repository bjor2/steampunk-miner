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

| Operation | How |
|---|---|
| Create a ticket | `gh issue create --label wayfinder:<type>`, then attach it to the map: `gh api -X POST repos/bjor2/steampunk-miner/issues/<map>/sub_issues -F sub_issue_id=<ticket database id>` |
| Database id | `gh api repos/bjor2/steampunk-miner/issues/<n> --jq .id` — the sub-issue and dependency APIs take this, not the issue number |
| Block a ticket | `gh api -X POST repos/bjor2/steampunk-miner/issues/<blocked>/dependencies/blocked_by -F issue_id=<blocker database id>` |
| Claim a ticket | `gh issue edit <n> --add-assignee @me`, before any work |
| Frontier | open sub-issues of the map with no assignee and no open `blocked_by` issue: `gh api repos/bjor2/steampunk-miner/issues/<map>/sub_issues` and check each ticket's `issue_dependencies_summary.blocked_by` |
| Resolve | post the answer as a comment, `gh issue close <n>`, then add a line to the map's *Decisions so far* |
| Rule out of scope | close the ticket as not planned (`gh issue close <n> --reason "not planned"`) and add a line to the map's *Out of scope* |

Assets made while resolving a ticket (prototypes, research notes) live on a
branch or in the repo and are linked from the issue, not pasted into it.
