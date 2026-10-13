# Triage labels

The engineering skills speak in terms of five canonical triage **roles**. This file maps each
role to the string this repo actually writes, so a skill told to "apply the AFK-ready label"
knows what to put in the ticket.

Here the tracker is local markdown, so these strings are not tracker labels — they are the
values of the `Status:` line at the top of a ticket file (see
[`issue-tracker.md`](./issue-tracker.md)). If the tracker ever moves to GitHub, the same five
strings become label names, and they will need creating on the repo before a skill can apply
them.

| Role | String | Meaning |
| --- | --- | --- |
| needs triage | `needs-triage` | A maintainer has to evaluate this one |
| needs info | `needs-info` | Waiting on the reporter |
| ready for agent | `ready-for-agent` | Fully specified; an AFK agent can take it |
| ready for human | `ready-for-human` | Needs human implementation |
| wontfix | `wontfix` | Will not be actioned |

The right-hand column is the part worth editing: everything else assumes the role names, but
the strings are yours. They are left at the defaults because this repo has no existing
vocabulary to reconcile with.

_Follows the triage-label convention of [`mattpocock/skills`](https://github.com/mattpocock/skills)
(MIT), restated in this repo's own words._

## Not covered here

`/triage` also classifies each item as one of two **category** roles — `bug` (something is
broken) and `enhancement` (new feature or improvement). The convention defines no local
representation for a category, so nothing writes one today; a `Category:` line would be a
deliberate addition rather than a gap being filled. Worth deciding when the first external
report actually arrives.
