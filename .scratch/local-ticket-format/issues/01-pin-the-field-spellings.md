# 01: Pin the ticket field spellings in the tracker config

**What to build:** A ticket file in this repo has one documented shape, and the documentation
matches what the skills actually write. A developer or agent reading the tracker config can
reproduce a ticket by hand and have it be the same file `to-tickets` would have produced, and a
reader can match a field by its literal spelling instead of guessing at a variant.

The tracker config changes; no code changes.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] The tracker config enumerates every field a ticket can carry, with the literal spelling of
      each, covering: the numbered heading, the free-text description of what a ticket makes
      work, the blocking-edge field including the exact wording used for an unblocked ticket,
      the status field with its allowed values, the acceptance-criteria marker, and the heading
      appended conversation goes under.
- [ ] The documented shape matches what the ticket-writing skill produces, field for field — no
      field the writer emits is undocumented, and no field is documented under a spelling the
      writer does not use.
- [ ] The config states which document wins when a skill's embedded template and this repo's
      config disagree, and why: the config is what the skills are handed, so it governs here.
- [ ] The config records that the correction went toward the writer rather than the reverse, so
      the next person to notice the conflict does not undo it.
- [ ] The spec and the ticket files written under `.scratch/local-ticket-format/` are readable
      against the documented field list with no field needing interpretation, and are left in
      place as the format's witness.
- [ ] Reading the config alone is enough to write a conforming ticket: no field requires opening
      a skill's source to learn its spelling.
