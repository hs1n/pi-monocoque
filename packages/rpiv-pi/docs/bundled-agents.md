# Bundled subagents

This page lists the 15 named specialists that `@hs1n/rpiv-pi` installs. It tells what each one
does and how they get onto disk.

Skills send work to these agents through the `Agent` tool. You do not start them directly. The
`Agent` tool comes from `@tintinweb/pi-subagents` (or the API-compatible `@gotgenes` fork).
`/mono-setup` installs it. Without it, the parallel-analysis skills cannot send work to an agent.

## Codebase specialists

| Agent | Purpose |
| --- | --- |
| `codebase-locator` | Finds *where* code is (files, directories, components) and ranks the most important rows. It is a "super grep/find/ls". Use it, not two greps. |
| `codebase-analyzer` | Follows one component from end to end and reports its implementation details. |
| `codebase-pattern-finder` | Finds similar implementations and usage examples, with code snippets to use as models. |
| `integration-scanner` | The reverse-reference partner of `codebase-locator`. It finds the inbound references, outbound dependencies, config registrations and event subscriptions of a component. |
| `scope-tracer` | Sets the limits of a research investigation. It searches anchor terms and reads 5–10 key files. It returns a Discovery Summary and 5–10 dense numbered questions. `research` runs it before the analysis. |
| `precedent-locator` | Finds similar past changes in git history: commits, blast radius, follow-up repairs and lessons from related artifacts. Use it to learn what went wrong before. |

## Review and verification specialists

| Agent | Purpose |
| --- | --- |
| `claim-verifier` | Checks each claim against the real repository state. It tags each claim Verified / Weakened / Falsified, with a reason. |
| `diff-auditor` | A patch auditor that writes only rows. It compares a patch with a surface list from the caller. It writes `file:line \| verbatim \| surface-id \| note` rows: only evidence, with no narrative and no severity. |
| `peer-comparator` | Takes `(new_file, peer_file)` pairs. It tags each peer invariant Mirrored / Missing / Diverged / Intentionally-absent. Use it when a new entity is parallel to an existing sibling. |
| `slice-verifier` | Examines a new slice before it is locked, and looks for problems. It finds forward references, symbol mismatches between slices, decision drift and atomicity violations. A reviewer after finalization cannot find these. |
| `artifact-code-reviewer` | Examines each slice code fence in a finalized artifact for code quality, codebase fit and actionability. It writes one row with a severity tag for each finding (`blocker`, `concern`, `suggestion`). |
| `artifact-coverage-reviewer` | Checks that each Verification Note and Precedent entry in a finalized artifact goes into a success criterion or into code. It flags each entry that does not. |

## Artifact and web specialists

| Agent | Purpose |
| --- | --- |
| `artifacts-locator` | Finds previous research, designs, plans and reviews in `.rpiv/artifacts/`. It is the research equivalent of `codebase-locator`. |
| `artifacts-analyzer` | Examines one research topic in detail across `.rpiv/artifacts/`. It is the research equivalent of `codebase-analyzer`. |
| `web-search-researcher` | Researches information that is only on the web, with deep search and fetch. It needs [`@hs1n/rpiv-web-tools`](https://github.com/hs1n/pi-monocoque/tree/main/packages/rpiv-web-tools) for `web_search` / `web_fetch`. |

## How they get onto disk

The Pi manifest does **not** register the agents. On the first session load, rpiv-pi copies
them into `<agent dir>/agents/`. This is `~/.pi/agent/agents/` by default, or a directory under
`PI_CODING_AGENT_DIR` if you set it. The location is user-global, so all projects use one copy.

A manifest, `.rpiv-managed.json`, records a sha256 for each managed file. Thus the sync can keep
your edits:

| Situation at session start | What happens |
| --- | --- |
| The file is missing | rpiv-pi copies it |
| The file is the same as the bundled source | rpiv-pi does not change it |
| The bundled source changed, and your copy has the recorded hash | rpiv-pi updates it automatically |
| The bundled source changed, **and** you edited your copy | rpiv-pi marks it as pending. A banner tells you to run `/mono-update-agents` |
| The file is not bundled now, and you did not edit it | rpiv-pi marks it as pending removal |

`/mono-update-agents` runs the same sync in force mode. It adds, updates and removes files
without a hash check. Thus it **will** overwrite an rpiv-managed file that you edited. It never
changes the files that you added yourself. It reads `models.json` again first. Thus the
`model` and `thinking` overrides for each agent go into the frontmatter on disk. See
[models-config.md](./models-config.md).

Manifest keys must pass an allowlist that stops path traversal. A key must be one basename. It
must not contain `/`, `\`, `..` or NUL, it must not be absolute, and it must end in `.md`.

Older versions kept a copy for each project in `<cwd>/.pi/agents/`. rpiv-pi removes that
directory fully or not at all. It removes it only when a manifest exists, each managed file is
the same as its source, and no unmanaged file is present.
