---
name: repo-5s
description: Tidy a repository with the 5S method — Sort, Set in order, Shine, Standardize, Sustain. Use when the user wants to clean up or declutter a repo, find and remove dead files or code, reorganize the directory tree, quiet lint and format noise, write repo-wide conventions, or set up a recurring hygiene audit — even if they never say "5S".
disable-model-invocation: true
---

# Repo 5S

5S is a workplace-organization method: **Sort**, **Set in order**, **Shine**, **Standardize**, **Sustain**. Point it at a repository and the "workplace" is the working tree, the "items" are files and the rules around them, and the goal is a repo where anyone can see what is here, where it belongs, and whether it is healthy — without asking.

Run the five passes in order; the order is load-bearing (sort before you organize, or you organize junk). Each pass ends on a completion criterion. Before the Sort pass, read [`references/audit.md`](references/audit.md) for the red-tag evidence table and the report template.

## Propose, then apply

Every pass gathers evidence, writes it down, then acts. Split the actions by reversibility:

- **Apply directly** — mechanical, reversible, green-build-preserving: formatting, lint autofix, `git mv` that keeps history, adding a config file, writing the audit.
- **Confirm first** — anything destructive or history-affecting: deleting files, `git rm`, and rewriting history. Show the red-tag list and get a yes.

Deleting is the last resort, not the first move. A suspected-unnecessary item gets a **red tag** — a written entry that parks it for a decision — so the repo keeps the item until someone confirms the tag.

Every decision you hand to the user carries a **recommendation**: the disposition you would pick and a one-line reason, written beside the evidence that produced it. The user confirms or overrules; they do not redo the analysis. A decision returned without a recommendation is an unfinished pass.

## 1. Sort (seiri)

Remove what the repo does not need, so what remains is worth organizing.

Run `bash scripts/inventory.sh` from the repo root for a read-only inventory of the working tree: tracked files by extension, the largest and emptiest files, generated-looking paths, TODO/FIXME markers, and untracked and ignored files. Classify from that raw material.

Sources of red tags:
- superseded or duplicated files (same purpose, two homes)
- generated output committed by mistake (build, coverage, caches)
- code with no live references — grep the tree before believing it
- orphaned assets, fixtures, or one-off scripts
- docs describing features the code no longer has

**Every red tag carries evidence**, not a hunch: last commit date (`git log -1 --format=%cs -- <path>`), whether any file references it (`git grep -n '<name>'`), whether a manifest or CI config uses it, and whether it is generated. [`references/audit.md`](references/audit.md) gives the check per candidate kind.

When the user wants an item out of the tree but recoverable, **quarantine** it instead of deleting: move it to a `red-tag/` directory and say where. A quarantined item is still a red tag; it reappears in the report until confirmed.

Completion: every tracked file is classified **keep** or carries a red tag, and each red tag has evidence plus a recommended disposition (delete / quarantine / keep) and its reason.

## 2. Set in order (seiton)

Give every keeper one obvious home, so the layout predicts where a thing lives.

1. Map artifact types to locations: sources, tests, scripts, docs, fixtures, generated. Follow an existing convention where the repo has one; propose one where it does not.
2. Produce a **placement map**: `current path → target path`, with "already correct" for paths that stay.
3. Apply the moves with `git mv` so history follows. Renaming is cheap; a file in the wrong home costs every future reader.

Fixed names beat clever ones for repeating roles (`README.md`, `CONTRIBUTING.md`, `scripts/`, `test/`), and one entry point per concern beats two.

Completion: every path in the map is already in its home or has a target; moves applied, or listed with a reason to defer.

## 3. Shine (seiso)

Clean the tree and inspect it while cleaning — a check that fails is a finding, not just an obstacle.

**Detect the repo's own checks** rather than assuming a stack: read `package.json` scripts, `Makefile` / `justfile`, and CI config. Run what the repo already declares.

- Formatting and lint, with autofix where the tool has it.
- Unused imports, and dead code that has not already earned a red tag.
- Working-tree noise: stray build output, editor files, large binaries.

Record every finding the checks surface, even the ones you fix on the spot — the report is the audit trail.

Completion: the repo's declared checks pass, and every finding is fixed or carries a red tag.

## 4. Standardize (seiketsu)

Turn each decision the audit relied on into something enforced, so the good state survives without memory.

For each recurring decision, give it **one machine-enforced home**:
- formatting, lint, and file layout → the tool's config
- the checks that must hold on every change → a CI job or a hook
- the fix that keeps recurring → a script in `scripts/`
- a rule no tool can check → the shortest line in `AGENTS.md` or `CONTRIBUTING.md` that names it

A written rule is the fallback; an executable check is the target. A convention with two homes has none.

Completion: every convention the passes leaned on has exactly one home in config, CI, a script, or a doc — and the report names it.

## 5. Sustain (shitsuke)

5S Sustain is discipline, not a document: the five passes become a habit someone re-runs, and the repo returns to a good state without a reminder. Re-run the passes on the cadence the user names — same checks, same evidence rules — and confirm two things: the red-tag list has no unresolved items, and the repo's checks still pass.

Completion: a second run is clean, or its findings carry fresh red tags. Persist nothing; the audit lives in the conversation, not the repo.

## Scope

The skill manages the **working tree**. Git branches, stashes, tags, and dependency versions are outside it; leave them to their own tools.

Run all five passes for a full audit. When the user names one ("just the dead files", "the folder layout"), run that pass and stop — the pass upstream of it supplies the input it would otherwise gather itself.

## Report

Present each run in the conversation: a section per pass, the red-tag table with evidence and a recommended disposition, and the placement map. Every item waiting on a decision carries its recommendation in the same row, so the user reads one line and answers. The red-tag area is the only thing the run touches in the working tree. Delete nothing on the strength of a report the user has not read.
