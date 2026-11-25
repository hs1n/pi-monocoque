---
name: status
description: Show where the rpiv pipeline work stands and which skill to run next, from the Markdown artifacts already in .rpiv/artifacts/. Lists the newest artifacts per topic with stage, date, and path, then names the likely next /skill:<name> and the reason. Read-only — never writes or edits a file. Use when the user asks "where am I", "what is the next step", "what stage is this feature at", or wants a summary of the rpiv artifacts. Not for git status.
argument-hint: "[topic]"
allowed-tools: Read, Glob, Grep, Bash(node *)
shell-timeout: 10
---

# Pipeline Status

You tell the user where their work stands and which skill to run next. Your only source is the Markdown artifacts in `.rpiv/artifacts/`. There is no run state and no resume point, so the artifacts on disk are the full record.

This skill is read-only. Do not write, edit, move, or delete a file. Do not start the next skill. Only name it.

## Input

`$ARGUMENTS` — an optional topic filter, for example `export-json`. Empty → show all topics.

## Metadata

```!
node "${SKILL_DIR}/_helpers/artifact-index.mjs"
```

The Metadata block shows the index without the filter, because `$ARGUMENTS` does not reach the render step. **If `$ARGUMENTS` is not empty**, run the helper again with the topic. Use its output for the rest of this skill:

```
node "${SKILL_DIR}/_helpers/artifact-index.mjs" "<topic>"
```

The helper output has this shape:

- Line 1 is `root: <path>`.
- `missing` — the `.rpiv/artifacts/` directory does not exist.
- `empty` — no Markdown artifact matches.
- Else a header line and one tab-separated row per artifact: `date`, `bucket`, `stage`, `status`, `path`. The newest row is first. Each bucket shows its 3 newest artifacts. `status` is the frontmatter `status:` value, or `-`.

## Steps

### Step 1: Handle a missing or empty index

- If the output says `missing`, tell the user that `.rpiv/artifacts/` does not exist. Suggest `/skill:discover "<feature description>"` to start. Stop.
- If the output says `empty` and a topic was given, tell the user that no artifact matches the topic. Suggest a run without a topic. Stop.
- If the output says `empty` and no topic was given, suggest `/skill:discover`. Stop.

### Step 2: Group the rows by topic

1. Each stage names its own topic, so the filenames of one feature can differ. Put rows in one group when the filenames share a clear topic word.
2. If the grouping is not clear, read the frontmatter `topic:` of each newest artifact. Read only the frontmatter block, not the full file.
3. If two rows still do not clearly match, put them in different groups. Do not guess a link.

### Step 3: Find the next skill for each group

Use the stage of the newest artifact in the group. Use this table:

| Newest stage | Next skill | Reason |
| --- | --- | --- |
| `discover` | `/skill:research <path>` | The requirements exist. The codebase facts do not. |
| `research` | `/skill:design <path>`, or `/skill:blueprint <path>` for smaller work | The facts exist. The architecture does not. Use `/skill:explore` first if several approaches are valid. |
| `explore` | `/skill:design <path>` | The approach is chosen. The architecture does not exist. |
| `slice` | `/skill:design <research path>` | The slice map exists. The design does not. |
| `design` or `design-slice` | `/skill:plan <path>` | The design exists. The phased plan does not. |
| `acceptance` | `/skill:plan` or `/skill:blueprint` | The acceptance inventory exists. The plan does not. |
| `plan/blueprint/quick-plan/synthesize` or `elaborate` | `/skill:implement <plan path>` | The plan exists. See the note below. |
| `validate` | `/skill:code-review` | The plan is validated. If the validation reports failures, fix them first with `/skill:implement` or `/skill:revise`. |
| `code-review` | `/skill:commit` | The review exists. Fix its findings before you commit. |
| `architecture-review` | `/skill:blueprint <path>` | The polish plan exists. Blueprint takes it one phase at a time. |
| `pr-triage` | the disposition's next step in the triage document | Triage ends with a plain action, not a skill. |
| `create-handoff` | `/skill:resume-handoff <path>` | A handoff exists. Resume from it. Do not read its content again here. |
| `unknown` | none | Tell the user which bucket you do not know. |

Notes:

- `implement` and `commit` write no artifact. The artifacts cannot show if the code is already written. If the user says the plan is implemented, name `/skill:validate <plan path>` instead.
- A plan with `status: in-progress` or `status: in-review` is not finished. Tell the user to finish the plan first.

### Step 4: Report

Present one block per group, the newest group first:

```
## {topic}

| Date | Stage | Status | Path |
| --- | --- | --- | --- |
| {date} | {stage} | {status} | `{path}` |

Next: `/skill:{name} {path}` — {reason}
```

- Use the paths from the helper output. Do not change them.
- Keep the report short. Do not summarize the content of an artifact.
- If there are more than 5 groups, show the 5 newest. Tell the user to run `/skill:status <topic>` for the others.

## Guidelines

- Read-only. Never write, edit, or delete a file.
- Never start the next skill. Name it, and let the user run it.
- Use only the helper output and frontmatter. Do not read source code. Do not run git.
- Say "not found" when the artifacts do not show a fact. Do not guess.
