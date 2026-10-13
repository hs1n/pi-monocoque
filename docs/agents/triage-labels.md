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

## The category half is real, and we do not carry it

`/triage` asks for **two** axes, not one: "Every triaged issue should carry exactly one category
role and one state role", where the category is `bug` (something is broken) or `enhancement` (new
feature or improvement). The five strings above are the *state* axis. The category axis has no
representation here, so this repo's tickets carry one role where the skill asks for two.

That is a deliberate gap rather than an oversight, but it is not cost-free, and the cost is concrete
rather than cosmetic — the category decides what happens on a rejection. `/triage` closes a rejected
`bug` with a polite explanation, and sends a rejected `enhancement` to `.out-of-scope/`, the
directory [`issue-tracker.md`](./issue-tracker.md) documents. With no category recorded, that routing
cannot be applied correctly to anything this repo rejects.

A `Category:` line beside `**Status:**` would close both holes. That is an addition to decide
deliberately rather than a gap to fill in passing — but worth deciding *before* the first external
report rather than after, because the moment it matters is the moment a rejection has to be routed.
