# skill-master

A fork of **Anthropic's `skill-creator`**, retargeted at Pi and extended into the authoring loop this
repo uses.

**License: Apache-2.0** — see [`LICENSE.txt`](./LICENSE.txt). The original work is © Anthropic. This
directory is a **modified derivative**, not the original; per Apache-2.0 §4(b), the changes are
stated here.

## Where it came from

`skill-creator` is Anthropic's skill-authoring skill, shipped through Claude Code's
`claude-plugins-official` plugin marketplace. This copy arrived from a packaged export of that
plugin (`~/.agents/skills/skill-creator`), which is why the bundled scripts carried `executable_` /
`empty___` name prefixes — those prefixes are dropped here.

## What changed

- Renamed `skill-creator` → `skill-master`, in the directory name and the frontmatter.
- Rewrote `SKILL.md` for Pi: subagents through the `Agent` tool, headless runs through `pi -p`, Pi's
  skill locations and precedence (`~/.agents/skills`, `.agents/skills`), and the
  `disable-model-invocation` field. The Claude Code / Claude.ai / Cowork sections are gone; their Pi
  equivalents are inline.
- Ported the bundled scripts from `claude -p` to `pi -p`, and from Claude Code's `.claude/commands`
  trigger probe to Pi's `--skill` loading.
- Folded in this repo's writing bar (context pointers, progressive disclosure, completion criteria,
  no-ops), pointing at the sibling `writing-for-agents` skill for the deep version.

The eval harness — A/B runs, grading, benchmark aggregation, the review viewer, and the
description-optimization loop — is retained; only its host assumptions changed.

## Not the original

Nothing here presents itself as Anthropic's `skill-creator`. For the unmodified skill, install it
from the Claude Code plugin marketplace.
