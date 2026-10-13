---
name: skill-master
description: Author and improve agent skills — the reusable instruction packages an agent loads on demand. Use when the user wants to create a skill from scratch, turn a repeated workflow or the current conversation into a skill, edit or refactor an existing skill, make a skill trigger more reliably by rewriting its description, test a skill against a baseline with evals, or decide how to split one document into a router plus reference. Also use it when a skill exists but underperforms, overtriggers, or never fires.
---

# Skill Master

A skill is a document an agent reads to do a job the same way every time. This skill runs the loop that produces one: capture intent, design the interface, write the body, bundle what the body points to, test it against a baseline, revise on human feedback, then sharpen the description last.

Your job is to find where the user is in that loop and move them forward. If they arrive with "I want a skill for X", start at step 0. If they hand you a draft, jump to step 2. If they have a working skill that never fires, go straight to step 5. If they say "just vibe with me, no evals", skip step 3 and write.

Two rules hold across every step:

- **The name is a contract.** A skill's directory name and its `name:` field must match, stay kebab-case, and collide with nothing else the agent can load. A duplicate name silently shadows the other copy — check before you ship (step 6).
- **Say it once.** Every load-bearing idea has exactly one authoritative home. If you find yourself repeating it, move it and point.

## The bar

What separates a skill that works from one that only reads well:

- **One job.** If the description needs "and" twice, it is two skills.
- **A sharp pointer.** The `description` is the only text the agent sees when deciding to load the skill. What it does plus the distinct branches that should reach for it — no more.
- **Progressive disclosure.** Inline what every branch needs; push behind a pointer what only some branches reach. The top file stays legible; the detail is one read away.
- **Steps with completion criteria.** Each step ends on a condition the agent can check, so it knows done from not-done.
- **Leading words over sentences.** A compact, pretrained concept the agent thinks with ("red", "tracer bullet", "tight loop") anchors a whole region of behaviour in one token.
- **Positive framing.** State the target behaviour. A prohibition drags the forbidden thing into context; name what to do instead.
- **No no-ops.** An instruction the model already obeys by default pays load to say nothing. Run the document; cut the sentences that change nothing.

For the craft behind these — context pointers, the two loads, the information hierarchy, co-location, sprawl, sediment — read the sibling **`writing-for-agents`** skill (`../matt-pocock/writing-for-agents/`). It is the deep reference; this skill is the workflow that uses it.

## 0. Capture intent

The conversation may already hold the workflow: the tools used, their order, the corrections the user made, the output shape. Mine that first, then fill gaps with a short interview — do not make the user restate what they already showed you.

Answer four things before writing:

1. What should the agent do reliably that it cannot do now?
2. When should the skill fire? (the user phrases and contexts — this becomes the description)
3. What does a good output look like? (format, files, length, what gets checked)
4. Is the output objectively verifiable? File transforms, extraction, code generation, and fixed procedures earn eval assertions; writing style and art are graded by a human, not by assertions.

Ask about edge cases, input formats, dependencies, and the failure the user keeps hitting. If the skill depends on an API, a library, or an upstream spec, research in parallel — come back with context instead of questions.

## 1. Design the interface

Settle four interface choices before the body:

- **Name** — lowercase letters, digits, hyphens; at most 64 characters; no leading, trailing, or doubled hyphen. The directory name and `name:` must match. If it collides with anything loadable, rename or do not ship.
- **Description** — the pointer. State what the skill does **and** the distinct branches that should reach for it. Front-load the leading word. One trigger per branch; collapse synonyms. Keep "when to use" out of the body — the body is read only after the pointer fired.
- **Invocation** — should the model reach for it on its own, or only when the user asks? Set `disable-model-invocation: true` for a deliberate command (a release, a destructive migration) and leave it off when the skill should win on a matching task.
- **Branches** — what are the genuinely different cases the skill handles? Distinct branches justify separate reference files; one branch does not.

Write the description for an agent that will undertrigger. Name the concrete situations ("when the user mentions a dashboard, data visualization, or internal metrics — even if they never say 'dashboard'"), not the abstract category.

## 2. Write the body

Anatomy:

```
skill-name/
├── SKILL.md          # required: frontmatter + instructions
├── references/       # pushed-down docs, read on demand
├── scripts/          # deterministic work the agent should not redo
└── assets/           # files used in output (templates, fonts)
```

Rules that keep the body legible:

- Keep `SKILL.md` focused — as a rule of thumb under ~500 lines. Past that, add a layer: a pointer and a reference file, not more body.
- Order it as the agent runs it: steps first, in order, each ending on a completion criterion. Reference a branch consults sits beside the branch, or behind a pointer.
- Reference each bundled file from `SKILL.md` with the condition for reading it ("when the report is a spreadsheet, read `references/xlsx.md`"). A file nothing points at is dead weight.
- Give a long reference file (>300 lines) a table of contents.
- Prefer the imperative, and explain **why** a rule matters rather than shouting MUST. A model that understands the reason generalizes; one obeying a rule does not.
- Give the exact template when the output must be fixed; give the criterion and an example when it needs judgment.

Before calling the draft done, read it once with fresh eyes and hunt no-ops: a sentence the model already obeys gets deleted whole, not trimmed.

## 3. Test against a baseline

This step turns a draft into a skill you can trust, and it is one uninterrupted sequence — do not stop midway.

Work in `<skill-name>-workspace/`, a sibling of the skill. Organize by iteration (`iteration-1/`, ...), then one directory per test case. Create directories as you go.

**Write 2-3 realistic prompts.** The kind of thing a real user types — messy, specific, with file paths and backstory. Save them to `evals/evals.json` (schema in `references/schemas.md`). Show them to the user before running: "Here are the test cases I'd like to try — do these look right?"

**Spawn every run at once.** For each prompt, launch two subagents in the same turn — one with the skill, one without — so they finish together. Use the `Agent` tool, with a self-contained brief per run: skill path, prompt, input files, and where to save outputs. For a new skill the baseline is *no skill*; for an improvement, snapshot the current skill first (`cp -r <skill> <workspace>/skill-snapshot/`) and point the baseline at the snapshot.

**While they run, draft assertions.** Objectively checkable, descriptively named, readable at a glance in the viewer. Add them to `evals/evals.json` and each `eval_metadata.json`. If the skill is subjective, say so and lean on human review instead of forcing assertions.

**Capture timing the moment each run lands.** The completion notification carries `total_tokens` and `duration_ms`; write them to `timing.json` in that run's directory. The data is not persisted anywhere else.

**Grade, aggregate, show the user.** Spawn a grader (brief in `agents/grader.md`) to score each assertion against the outputs and write `grading.json` using the exact fields `text`, `passed`, `evidence` — the viewer depends on them. Script what can be scripted rather than eyeballing it. Then:

```bash
python -m scripts.aggregate_benchmark <workspace>/iteration-1 --skill-name <name>
python <skill-path>/eval-viewer/generate_review.py <workspace>/iteration-1 \
  --skill-name <name> --benchmark <workspace>/iteration-1/benchmark.json
```

Add `--previous-workspace <workspace>/iteration-<N-1>` from iteration 2 on. With no display, pass `--static <out.html>` and hand the user the file. Do this **before** critiquing the outputs yourself — get them in front of the human early.

Then tell the user: "I've opened the results — an Outputs tab to click through each case and leave feedback, and a Benchmark tab for the numbers. Tell me when you're done."

## 4. Iterate

The loop is the work. When feedback arrives:

- **Generalize from it.** These few prompts stand in for a million uses. Fix the class, not the example; when a case is stubborn, change the metaphor or the working pattern rather than bolting on a fiddly rule.
- **Keep the prompt lean.** Read the transcripts, not just the outputs. If the skill sent the agent somewhere unproductive, delete the part that did.
- **Explain the why.** Terse feedback is a clue, not a spec — work out what the user wanted, then transmit that understanding into the instruction.
- **Bundle repeated work.** If every run wrote the same helper, that helper belongs in `scripts/`, written once.

Apply the changes, run a fresh `iteration-<N+1>/` (baseline included), relaunch the viewer with `--previous-workspace`, and read the new feedback. Stop when the user is happy, the feedback is empty, or you stop making progress.

For a rigorous "is the new version actually better?", use the blind comparison: two outputs, one independent judge that is not told which is which. Briefs in `agents/comparator.md` and `agents/analyzer.md`.

## 5. Sharpen the description

Triggers are won or lost in the description, so optimize it last, once the body is settled.

Build ~20 trigger queries — a mix of should-trigger and should-not-trigger. Realistic, specific, varied in length and register, heavy on edge cases. The near-miss negatives are the valuable ones: queries that share vocabulary with the skill but need something else. "Write a fibonacci function" tests nothing; a query that mentions a dashboard but wants a static screenshot does.

Then run the loop, which splits train/test, measures trigger rate, and returns the best test-scoring description:

```bash
python -m scripts.run_loop \
  --eval-set <trigger-eval.json> \
  --skill-path <skill-path> \
  --model <model-powering-this-session>
```

Each query runs headless through `pi -p`; the skill is offered with `--skill <path>` and the model decides on its own. A skill triggers when the task is hard enough that consulting it beats the default — so test prompts must be substantive, not one-liners. Show the user the before/after descriptions and the scores.

## 6. Place, validate, package

- Validate the frontmatter against the spec: `python scripts/quick_validate.py <skill-path>`.
- Check the name against every other skill the agent can load. Two copies of a name is a silent shadow, not a merge.
- Put it where it will be discovered: `~/.agents/skills/<name>/` for a personal skill, `.agents/skills/` for a project one. A project copy outranks a package copy — keep the hierarchy in mind. Run `/reload` after adding one.
- If the skill is vendored or derived from someone else's work, its license travels with it and any modification is stated plainly. A copy never presents itself as the original.

## Hard rules

- No malware, exploit code, credential theft, or skills whose real intent differs from their described intent. Decline those.
- Do not ship a skill that duplicates a name already loadable — rename, or do not ship.
- Preserve a skill's name when improving it. `research-helper` stays `research-helper`, not `research-helper-v2`.

## References

- `references/schemas.md` — JSON shapes for `evals.json`, `grading.json`, `benchmark.json`, and the trigger eval set.
- `agents/grader.md` — scoring assertions against outputs.
- `agents/comparator.md` — blind A/B comparison.
- `agents/analyzer.md` — why one version beat another.
- Sibling skill `writing-for-agents` — the craft of writing for an agent.

## The loop, once more

Intent → interface → body → baseline test → human review → iterate → optimize the description → place and validate.

Good skills are not written; they are converged on. Run the loop.
