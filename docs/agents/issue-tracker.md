# Issue tracker: GitHub

Issues and specs for this repo live as GitHub issues, driven through the `gh` CLI. Inside a
clone `gh` infers the repo from `git remote -v`, so no repo argument is needed.

_Follows the issue-tracker convention of [`mattpocock/skills`](https://github.com/mattpocock/skills)
(MIT), restated here in this repo's own words: the engineering skills read this file to learn
where to publish and how to query. Keep the operation names and the section titles stable —
they are what those skills look up._

## Operations

- **Create**: `gh issue create --title "…" --body "…"`; heredoc for a multi-line body.
- **Read**: `gh issue view <number> --comments`, and fetch labels — add `--json`/`--jq` when
  the caller wants fields rather than prose.
- **List**: `gh issue list --state open --json number,title,body,labels,comments`, with
  whatever `--label` / `--state` filters the caller needs.
- **Comment**: `gh issue comment <number> --body "…"`
- **Labels**: `gh issue edit <number> --add-label "…"` / `--remove-label "…"`
- **Close**: `gh issue close <number> --comment "…"`

## Pull requests as a request surface

**No.** This repo does not route external PRs through the issue states and labels. Set this
to `yes` to opt in; the skills then use the `gh pr` equivalents and keep only
`authorAssociation` of `CONTRIBUTOR`, `FIRST_TIME_CONTRIBUTOR`, or `NONE` (dropping `OWNER`,
`MEMBER`, `COLLABORATOR`). Note that GitHub shares one number space across issues and PRs, so
a bare `#42` may be either: try `gh pr view 42`, fall back to `gh issue view 42`.

## Publisher conventions

- A skill told to **publish to the issue tracker** creates a GitHub issue.
- A skill told to **fetch the relevant ticket** runs `gh issue view <number> --comments`.

## Wayfinding operations

`/wayfinder` reads this section. Its **map** is a single issue; its **tickets** are child
issues of it.

- **Map** — one issue labelled `wayfinder:map`, carrying the destination, the standing notes,
  the decisions so far, and the fog.
- **Child ticket** — linked to the map as a GitHub sub-issue. Where sub-issues are not
  available, add it to a task list in the map body and open the child with `Part of #<map>` at
  the top. Labels: `wayfinder:<research|prototype|grilling|task>`. Assigned to the driving dev
  once claimed.
- **Blocking** — GitHub's native issue dependencies, the canonical and UI-visible form:
  `gh api --method POST repos/<owner>/<repo>/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-db-id>`,
  where `<blocker-db-id>` is the blocker's numeric **database id**
  (`gh api repos/<owner>/<repo>/issues/<n> --jq .id`) — **not** its `#number` or `node_id`.
  `issue_dependencies_summary.blocked_by` reports the open blockers, which is the live gate.
  Where dependencies are unavailable, fall back to a `Blocked by: #<n>, #<n>` line at the top
  of the child body. A ticket is unblocked once every blocker is closed.
- **Frontier query** — the map's open children, minus any with an open blocker or an
  assignee; first in map order wins.
- **Claim** — `gh issue edit <n> --add-assignee @me`, as the session's first write.
- **Resolve** — comment the answer on the ticket, close it, then append a gist-plus-link
  pointer to the map's decisions.
