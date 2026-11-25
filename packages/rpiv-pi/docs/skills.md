# Skills reference

This page lists each skill that `@hs1n/rpiv-pi` ships. For each skill, it gives the input, the
output, and if the model can start the skill itself.

## How to read these tables

- **Invoke**: run `/skill:<name>` in a Pi session.
- **Auto**: ✓ means that the model can select the skill itself from your prompt. 22 of the 30
  skills set `disable-model-invocation: true` and show —. These skills run *only* when you type
  `/skill:<name>`. At session start, rpiv-pi injects a short index of the stage skills. Thus the
  model knows that they exist and can recommend one.
- **Writes**: the artifact bucket under `.rpiv/artifacts/`. "side-effect" means that the skill
  changes the repo (code, commits, docs) and does not write an artifact.

Each skill names its input artifact in prose. There is no machine-readable chain declaration.
Thus the input of a stage is the output of the previous stage.

## Intent and research

| Skill | Auto | Consumes | Writes | What it does |
| --- | :---: | --- | --- | --- |
| `discover` | — | free text, or an existing artifact path | `discover/` | Asks you one question at a time, then writes a Feature Requirements Document. The first question is about intent only, before the codebase probe. The later questions use what the probe found. Its Decisions block goes through `research` into `design`. |
| `research` | — | free text, or a `discover` artifact | `research/` | Sends `scope-tracer` to write trace-quality questions. Parallel analysis agents answer them. Then it writes a research document. |
| `explore` | — | a `research` artifact | `solutions/` | Compares solution approaches with advantages, disadvantages, trade-offs and a recommendation. Use it when more than one implementation is valid. |
| `slice` | — | a `research` artifact | `slices/` | Divides the work into independent vertical slices that you can design separately. It writes a machine-readable `slices:` frontmatter array. In re-slice mode, it divides a slice map again after the map fails a readiness check. |

## Design

| Skill | Auto | Consumes | Writes | What it does |
| --- | :---: | --- | --- | --- |
| `design` | — | `research` or `solutions`. `--resume` accepts a `design` that is in progress | `designs/` | Divides a feature into vertical slices. It generates and checks one slice in each session. It writes architecture decisions, a slice breakdown and a file map. After you approve a slice that is not the last one, it writes the slice to the artifact and reads it back to confirm it. Then it stops and gives a `--resume` command for a new session. Thus compaction never carries approved code. |
| `design-slice` | — | `slices` (+ the upstream `design`) | `designs/` | Designs exactly ONE slice in isolation: decisions, file map, key interfaces, integration points and success criteria. Another skill runs it. It does not run alone. |
| `design-review` | — | each per-slice `design` + the `slices` map | in-place edits | One developer checkpoint for all the slice designs. You accept or adjust the proposed shape. It applies each adjustment to the slice and to the slices that depend on it. |
| `synthesize` | — | N `designs` (or N `subplans`) | `plans/`, `subplans/` | Merges independent slice designs into one phased plan. It removes overlaps and puts the phases in slice-dependency order. For large slice maps, it runs in levels with `--as-subplan`. |

## Planning

| Skill | Auto | Consumes | Writes | What it does |
| --- | :---: | --- | --- | --- |
| `plan` | — | a `design` artifact | `plans/` | Changes a design into parallel atomic phases with explicit success criteria. Use it when a simple phased breakdown is sufficient. |
| `blueprint` | — | `research` or `solutions` (optional) | `plans/` | Does design and plan in one pass. It divides the work into vertical slices, with a short developer checkpoint between phases. It writes a plan that is ready for `implement`. It uses fewer subagents than `design`, because it uses the integration and precedent sections of the research artifact. |
| `acceptance` | — | the goal brief, verbatim (+ a `research` artifact as evidence) | `acceptance/` | Writes the acceptance inventory from the goal. Each item is an observable outcome with an ID and, where possible, a command that proves it. It runs between research and planning, before a plan exists. Thus the plan cannot make the standard of completion smaller. `grade` uses it for completeness, and `validate` runs it. |
| `quick-plan` | — | a `research` artifact (+ the goal brief and an `acceptance` inventory, when they exist) | `plans/` | Writes one small plan for a small task that you understand well. It sends a maximum of one `codebase-pattern-finder` agent. It writes one `status: ready` phased plan, with no slices, no risk flags and no questions. It lists the goal items that it does not cover under `## Out of Scope`. |
| `elaborate` | — | a `plan` artifact | `elaborations/` | Writes implement-ready code for ONE phase of a synthesized plan. The results go back into the plan. |
| `revise` | — | a `plan` (+ optional `reviews`) | `plans/` | Updates a plan after review feedback, a blocker during `implement`, or a scope change. It keeps the structure and does not write the plan again. |
| `amend` | — | one artifact + its `grade` verdicts | the same artifact | Repairs only the dimensions that failed in `grade`, and writes the artifact again in place. It does one pass and uses no subagents. |

## Execution and verification

| Skill | Auto | Consumes | Writes | What it does |
| --- | :---: | --- | --- | --- |
| `implement` | — | a `plan` artifact | code changes | Does a plan one phase at a time. It checks each phase against its success criteria before the next phase. |
| `validate` | — | a `plan` + the working tree | `validation/` | Runs the success criteria of each phase against the working tree. It reports a `pass` / `fail` verdict. |
| `remediate` | — | a `plan` + its failing `validation` | side-effect | Repairs the failures that `validate` found. For each failed `verify-at-implement` risk ruling, it runs that ruling's procedure again. For each `blockers:` entry, it runs the failing command again. It applies the smallest repair and confirms that the check passes. Run it only after `validate` fails. |
| `code-review` | ✓ | the working tree, a branch or a PR | `reviews/` | Parallel specialist agents examine the diff, compare it with peer code and check claims. It writes `blockers_count` and findings with severity tags. The scope argument accepts `staged`, `working`, a hash, `A..B` or a branch. With no scope, it compares the feature branch with the default branch. |
| `architecture-review` | — | a file, directory or module path | `architecture-reviews/` | Examines the code one layer at a time, from the top, with the same 10-dimension checklist for each layer. A developer checkpoint sorts the findings. It writes a phased plan that `blueprint` can use one phase at a time. It works with all languages. |
| `grade` | — | one artifact + one dimension name | `verdicts/` | Judges ONE artifact for ONE quality dimension and writes a verdict JSON. It only judges. It makes no repairs. Another skill runs it. |
| `lens-grade` | — | one target (an artifact or the working-tree diff) + one lens and a rubric | a JSON verdict in `--out <dir>` | Judges ONE target through ONE lens against a pass/fail rubric. It does not edit, does not run the code and uses no subagents. Run one instance for each lens, in parallel. |
| `commit` | ✓ | a working tree with changes | git commits | Puts staged and unstaged changes into one or more logical commits, with descriptive messages. |

## Repository utilities

| Skill | Auto | Consumes | Writes | What it does |
| --- | :---: | --- | --- | --- |
| `status` | ✓ | `.rpiv/artifacts/` (+ an optional `[topic]`) | nothing | Read-only. Lists the newest artifacts for each topic, with stage, date and path. Then it names the likely next `/skill:<name>` and gives the reason. It is not for git status. |
| `pr-triage` | ✓ | a PR number, a URL or the current branch | `triage/` | Read-only triage of a GitHub PR. It gives a disposition (Review / Request changes / Hold / Decline), a security tier (0–2) and the convention drift. It never checks out or changes the working tree. |
| `create-handoff` | ✓ | the current session | `handoffs/` | Writes the current task, decisions, changes in progress and open questions into one file. A new session can continue from that file. |
| `resume-handoff` | ✓ | a `handoff` document | continues the work | Reads the handoff and checks the repo, the branch and the state. Then it continues from where the previous session stopped. |
| `annotate-guidance` | ✓ | the source tree | `.rpiv/guidance/**/architecture.md` | Writes architecture guidance in a shadow tree next to the source. rpiv-pi injects these files automatically. See [architecture.md](./architecture.md). |
| `changelog` | ✓ | git history + the working tree | `CHANGELOG.md` edits | Writes the `[Unreleased]` section of each changed changelog again, in Keep a Changelog style, from Conventional Commit prefixes. It knows about monorepos, and you can run it again with the same result. |
| `frontend-design` | — | the style system of the project | injected guidance | Injects visual design guidance for web frontend work. If the scan finds nothing, it asks 2 questions. If the project has a design system, it uses only the scan. |

## Artifact buckets

All artifacts go under `.rpiv/artifacts/` in the project that you work in:

```
.rpiv/artifacts/
├── discover/               research/            solutions/
├── slices/                 designs/             elaborations/
├── plans/                  subplans/            acceptance/
├── verdicts/               reviews/             validation/
└── architecture-reviews/   triage/              handoffs/
```

The first skill that writes into the directory creates it.
