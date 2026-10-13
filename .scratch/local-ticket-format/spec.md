# Local ticket format

_Spec for the ticket layer configured in `docs/agents/issue-tracker.md`. Vocabulary follows
`CONTEXT.md`; this repo's terms win over Matt's where they overlap._

**Status:** ready-for-agent

## Problem Statement

The ticket layer has no single description of what a ticket file looks like. Three accounts
exist and they do not agree.

`to-tickets` writes tickets in one shape: a `# <NN>: <title>` heading, then bold inline fields
(`**What to build:**`, `**Blocked by:**`, `**Status:**`), then `- [ ]` acceptance criteria.

`docs/agents/issue-tracker.md` — this repo's tracker config, and the file every one of these
skills reads — describes a different shape: plain `Status:` and `Blocked by:` lines, no heading
form, no acceptance criteria, no `What to build:`.

Matt's own two documents disagree with each other in the same way, so this is not drift we
introduced by paraphrase. His tracker config describes plain `Blocked by:` lines; his
`to-tickets` template writes `**Blocked by:**`. Nothing in either is authoritative, because
neither is the thing that writes the file.

The practical cost is small today and grows the moment anything reads a ticket instead of
writing one. `wayfinder` runs a frontier scan — open, unblocked, unclaimed — over ticket files.
A scan written against plain lines silently matches nothing in a bold-form file, which reads as
"no tickets" rather than as a parse failure. That is the same silent-wrong-answer shape as a
`Status:` value nobody defines.

## Solution

Make `docs/agents/issue-tracker.md` the authoritative description of a ticket file's on-disk
shape, and make it describe what the machinery actually writes.

The rule to adopt: where a skill's own template conflicts with this repo's tracker config, the
tracker config wins for files in this repo, because it is the file the skills are handed as
config. Where the config and the writer disagree today, the config changes to match the writer
— changing a template we do not own is not available to us, and a config that misdescribes the
writer is worse than one that copies it.

Every field a ticket can carry gets a literal spelling, so a reader can match on it rather than
guess: the numbering form, the heading form, the field names, the "no blockers" spelling, the
status values, the acceptance-criteria marker, and where appended conversation goes.

## User Stories

1. As a developer reading a ticket, I want one documented file shape, so that I know what to
   expect without inferring it from whatever wrote the ticket.
2. As a developer, I want the tracker config to describe the shape the skills actually write, so
   that following the config does not produce files the skills will not read back.
3. As an agent asked to publish a ticket, I want the field spellings given literally, so that I
   reproduce them instead of inventing a plausible variant.
4. As an agent asked to fetch a ticket, I want the shape documented, so that a missing field is
   a parse miss I can report rather than a field I silently treat as absent.
5. As an agent running a frontier scan, I want the "unblocked" and "unclaimed" spellings pinned,
   so that my scan matches files written by a different skill.
6. As a developer, I want the conflict between the writer's template and this repo's config
   resolved in writing, so that the next person to notice it does not have to re-decide it.
7. As a developer, I want to know which document wins when a skill's template and the config
   disagree, so that I can edit the right one.
8. As a maintainer of this fork, I want the tracker layer to stay documentation-only unless
   enforcement is genuinely wanted, so that a solo repo does not grow a linter for its own
   scratch notes.
9. As a developer adding a field later, I want the config to name the fields exhaustively, so
   that adding one is an edit in one place rather than a search across skills.
10. As a developer, I want the specs and tickets this repo produces to be the demonstration of
    the format, so that the documentation and the artifacts cannot drift apart silently.

## Implementation Decisions

- **The tracker config is authoritative for this repo.** It is the document the skills are
  handed as configuration; a skill's embedded template is a default for projects that have not
  chosen otherwise. Recorded explicitly, because the conflict will recur.
- **The config is corrected toward the writer, not the reverse.** `to-tickets`' bold inline
  field form becomes the documented form. We do not edit Matt's skills, and a config that
  misdescribes its writer is a trap.
- **The field set is enumerated exhaustively**, with literal spellings: ticket numbering and
  zero-padding, the `# <NN>: <title>` heading, `**What to build:**`, `**Blocked by:**`, the
  literal `None (can start immediately)` for an unblocked ticket, `**Status:**` with the role
  strings from the triage-label vocabulary, `- [ ]` acceptance criteria, and `## Comments` for
  appended conversation.
- **No new module, no new interface in `packages/**`.** The artifacts are data; the change is
  to a document and to the artifacts it describes.
- **Enforcement is proposed as a separate, optional ticket rather than assumed.** The repo
  enforces several conventions with `scripts/check-*.mjs`, so the idiom exists — but those
  guard code that ships, and `.scratch/` holds notes. Deciding to build one should be a
  conscious "yes", not a side effect of pinning a format.
- **The existing artifacts become the format's witness.** The spec and tickets written in this
  change are the first files under `.scratch/`, so the proof of the format is the tree itself.

## Testing Decisions

There is no executable seam in this repo for this change, and saying so is the decision rather
than an omission. The artifacts are markdown under `.scratch/`; nothing under `packages/**`
parses them, and no test suite here has ever read one. The repo's tests cover `packages/**`, so
this work is outside the tested surface by construction.

That leaves two honest ways to verify, and the first is the default:

- **The artifacts as the check.** Read the written spec and tickets against the documented field
  list, field by field. A good check here is the same criterion as a good test: it reads only
  the externally visible shape, never the reasoning that produced it. The failure it catches is
  a field the config names but the file spells differently.
- **A check script, if enforcement is wanted later.** The repo already runs read-only
  convention checks over committed files, so the idiom and the wiring exist. The seam would be
  a new script plus a test for it, and the unit under test would be the parser, not the files.
  Deliberately not part of this change.

Prior art for the second route, should it be chosen: the existing read-only check scripts, each
of which pairs a small pure predicate with a co-located test and a fail-fast hook entry.

## Out of Scope

- Switching the tracker to GitHub, GitLab, or anything else. The local-markdown choice stands.
- Giving `triage`'s `bug` / `enhancement` category roles a local representation. That is a
  related gap in the same vocabulary and is already recorded as deliberate.
- `wayfinder`'s map file format beyond the fields a ticket shares with it.
- Any change to Matt's skills under `~/.agents/skills`. This repo configures them; it does not
  patch them.
- Retroactively reformatting anything: there are no existing tickets.

## Further Notes

- The conflict is between two of Matt's documents, which is why this was not visible before the
  layer was exercised. It is evidence for the general rule that config describing a writer must
  be derived from the writer, not from a sibling description of the same idea.
- The same class of failure the guidance ladder had: a lookup that is wrong quietly returns the
  absence of a match, and absence is a legitimate answer. Worth remembering when the next
  reader is written.
- If Matt's template changes, this repo's config is what drifts — the config should be the
  thing that gets re-derived, and the ticket that pins it says so.
