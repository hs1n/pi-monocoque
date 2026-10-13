# 02: Enforce the pinned ticket format, or record that it is not enforced

**What to build:** The pinned ticket format stops being able to drift unnoticed, or the
deliberate decision not to guard it is written down where the next person will find it.

Either outcome satisfies this ticket. The repo already enforces several conventions with
read-only check scripts over committed files, so the enforcement route exists and is cheap to
follow; the question is whether notes under `.scratch/` deserve the same treatment as code that
ships. A solo repo has a real answer here and "we never decided" is not it.

**Blocked by:** 01 — the format has to be pinned before anything can be checked against it.

**Status:** ready-for-agent

- [ ] If enforcement is chosen: a read-only check reports every ticket file whose fields do not
      match the pinned spellings, naming the file and the offending field, and it fails on a
      malformed ticket rather than treating a missing field as an absent one.
- [ ] If enforcement is chosen: the check joins the repo's fail-fast hook chain alongside the
      existing convention checks, and its own test covers the predicate rather than the files
      on disk — a good test here reads only the parsed shape.
- [ ] If enforcement is chosen: the check stays silent on a repo with no ticket files, because an
      empty `.scratch/` is the normal state and not a failure.
- [ ] If enforcement is declined: the reasoning is recorded beside the tracker config, so that
      the absence of a check reads as a decision rather than as an oversight.
- [ ] Whichever route is taken, the ticket is closed with the outcome stated, not left open as a
      standing invitation to revisit the question.
