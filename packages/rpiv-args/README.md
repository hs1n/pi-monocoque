# @hs1n/rpiv-args

<div align="center">
  <a href="https://github.com/hs1n/pi-monocoque/tree/main/packages/rpiv-args">
    <img src="https://raw.githubusercontent.com/hs1n/pi-monocoque/main/packages/rpiv-args/docs/cover.png" alt="Two panels: /skill:deploy api production filling $1 and $2 in a skill body, and a /skill:commit body whose !`git status -s` runs and pastes real git output into the prompt" width="50%">
  </a>
</div>

Give arguments to a skill as you give them to a shell command. `rpiv-args` adds `$1`, `$2`,
`$ARGUMENTS` and related placeholders to the skill bodies of
[Pi Agent](https://github.com/badlogic/pi-mono). It also runs `` !`cmd` `` and ```` ```! ````
blocks, so the prompt has real command output before the model reads it. Use it when you write
Pi skills and want parameters, not one hard-coded copy for each case.

## Install

This package is in [`hs1n/pi-monocoque`](https://github.com/hs1n/pi-monocoque), an 11-package
monorepo. Nothing is published to npm. Install the repo as a Pi source:

```sh
pi install git:github.com/hs1n/pi-monocoque
```

Restart Pi, or run `/reload` in a running session. The `Agent` tool of the pipeline comes from
a third-party package. Install it separately:

```sh
pi install npm:@tintinweb/pi-subagents@0.26.3
```

[INSTALL-FORK.md](https://github.com/hs1n/pi-monocoque/blob/main/INSTALL-FORK.md) gives the
live-checkout install (`pi install <path>`) and `scripts/fork-pi-install.sh` (one package at a time).

## Quick start

Create `.pi/skills/deploy/SKILL.md` in your project. For a personal skill, use
`~/.pi/agent/skills/deploy/SKILL.md`. Put a placeholder in the body:

```yaml
---
name: deploy
description: Deploy a service to an environment
---

Deploy service $1 to $2.
Current branch: !`git branch --show-current`
```

Start it with arguments:

```
/skill:deploy api production
```

The model gets the body with `api` in place of `$1` and `production` in place of `$2`. The
real branch name replaces the `git` command. A last line, `Skill input: api production`, marks
your raw input.

## What you get

- **Skills take arguments as shell commands do**: positionals, `$ARGUMENTS` and `${@:N:L}`
  slices, split with shell-style quotes. Thus `/skill:deploy "staging server" --force` puts
  `staging server` in `$1`.
- **Command output goes into the prompt, not into a tool call**: inline
  `` !`git status -s` `` and ```` ```! ```` blocks run first. The model reads the result and
  does not need to get it.
- **Existing skills do not change**: a body with no placeholder and no shell syntax gives the
  same bytes as the built-in expansion of Pi. A regression test checks this.
- **The model does not read your argument as a new instruction**: the extension puts
  arguments under an explicit `Skill input:` label. It also adds a skill-invocation protocol
  to the start of the system prompt in each turn.
- **A runaway command cannot stop the turn or fill the context**: each command has a limit of
  120 s by default. The extension keeps only the last 50 KB or 2000 lines of output. It puts
  errors inline, so the rest of the body still goes through.
- **Commands run in the order that you wrote them**: they run one after the other, never in
  parallel. Thus `` !`mkdir x` `` and then `` !`ls x` `` works.
- **Paths relative to the skill work**: `${SKILL_DIR}` always resolves to the directory of the
  skill file, for all install types. `${SESSION_ID}` gives the current session id.

## Configuration

`rpiv-args` reads no config file and no environment variables. The only setting is in the
frontmatter of each `SKILL.md`:

| Key | What it does | Default |
| --- | --- | --- |
| `shell-timeout` | The limit in **seconds** for each `` !`cmd` `` or ```` ```! ```` command in that skill. `0` turns off the timer. | `120` |

Shell commands always run in the working directory of the Pi session, not in the skill
directory.

## Limitations

| Limit | Detail |
| --- | --- |
| No type validation | `$1` gets the text that the user typed. A skill that expects a path can get a sentence |
| No flag parsing | `--force` is a positional token, as all other tokens are |
| Literal substitution | The extension also replaces placeholders inside fenced code and inline code |
| No recursive substitution | If a value contains `$1`, the extension does not expand it again |
| Only the `input` hook | `session.steer()` and `session.followUp()` do not go through the `input` hook, so they do not resolve placeholders |

## Reference

- [Placeholders and variables](https://github.com/hs1n/pi-monocoque/blob/main/packages/rpiv-args/docs/placeholders.md):
  each placeholder and runtime variable, index and slice rules, quotes, and what substitution
  does not do.
- [Authoring skills](https://github.com/hs1n/pi-monocoque/blob/main/packages/rpiv-args/docs/authoring-skills.md):
  `$ARGUMENTS` or positionals, empty arguments, frontmatter, and an example with the exact text
  that the model gets.
- [Shell substitution](https://github.com/hs1n/pi-monocoque/blob/main/packages/rpiv-args/docs/shell-substitution.md):
  shell syntax, the order of execution, timeouts, error strings, output limits, and Windows and
  PowerShell.
- [How it works](https://github.com/hs1n/pi-monocoque/blob/main/packages/rpiv-args/docs/how-it-works.md):
  the three event hooks, the transformation pipeline, the two emit paths, the skill index, and
  the paths that it does not cover.

## Requirements

- A Pi Agent host. You need no API key, no model and no native modules, because nothing here
  calls a model.
- **A POSIX shell or PowerShell** for `` !`cmd` `` and ```` ```! ```` blocks. Commands run
  through `sh -c` on macOS and Linux, and through `powershell.exe -Command` on Windows. On
  Windows, POSIX-only tools such as `grep`, `sed` and `awk` have no aliases. See
  [Shell substitution](https://github.com/hs1n/pi-monocoque/blob/main/packages/rpiv-args/docs/shell-substitution.md).

## Related

- [@hs1n/rpiv-pi](https://github.com/hs1n/pi-monocoque/tree/main/packages/rpiv-pi): the
  umbrella package. Its `/rpiv-setup` command installs `rpiv-args` with the other siblings.

## License

MIT. See [LICENSE](LICENSE).
