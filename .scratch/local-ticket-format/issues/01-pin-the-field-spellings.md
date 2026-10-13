# 01: Pin the ticket field spellings in the tracker config

**What to build:** A ticket file in this repo has one documented shape, and the documentation
matches what the skills actually write. A developer or agent reading the tracker config can
reproduce a ticket by hand and have it be the same file `to-tickets` would have produced, and a
reader can match a field by its literal spelling instead of guessing at a variant.

The tracker config changes; no code changes.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [x] The tracker config enumerates every field a ticket can carry, with the literal spelling of
      each, covering: the numbered heading, the free-text description of what a ticket makes
      work, the blocking-edge field including the exact wording used for an unblocked ticket,
      the status field with its allowed values, the acceptance-criteria marker, and the heading
      appended conversation goes under.
- [x] The documented shape matches what the ticket-writing skill produces, field for field — no
      field the writer emits is undocumented, and no field is documented under a spelling the
      writer does not use.
- [x] The config states which document wins when a skill's embedded template and this repo's
      config disagree, and why: the config is what the skills are handed, so it governs here.
- [x] The config records that the correction went toward the writer rather than the reverse, so
      the next person to notice the conflict does not undo it.
- [x] The spec and the ticket files written under `.scratch/local-ticket-format/` are readable
      against the documented field list with no field needing interpretation, and are left in
      place as the format's witness.
- [x] Reading the config alone is enough to write a conforming ticket: no field requires opening
      a skill's source to learn its spelling.

## Comments

Completed. The config now carries the field set in the canonical bold form, plus a
"Which document wins" section and a "Known gaps" section.

Two things running this ticket surfaced, both recorded in the config's Known gaps rather than
fixed here:

- The writer emits two fields the config had never named — the description of what the ticket
  makes work, and the acceptance criteria — and spells the two it *did* name differently. That
  came from running `to-spec` and `to-tickets` and reading the output; reading the skills would
  not have shown it, because the config was written from a third document that disagrees with
  the writer.
- The five status roles describe triage state, so **none of them means "done"**. This ticket is
  finished and the format has no field that can say so: the ticked criteria above and this note
  are the record, and `**Status:**` still reads `ready-for-agent`. That is the gap shown rather
  than described — worth a sixth role or an explicit archival convention, as a separate decision.
