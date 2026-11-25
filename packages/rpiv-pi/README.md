# @hs1n/rpiv-pi

<div align="center">
  <a href="https://github.com/hs1n/pi-monocoque/tree/main/packages/rpiv-pi">
    <img src="https://raw.githubusercontent.com/hs1n/pi-monocoque/main/packages/rpiv-pi/docs/cover.png" alt="rpiv-pi cover art showing the six-stage skill pipeline: discover, research, design, plan, implement, validate" width="70%">
  </a>
</div>

rpiv-pi changes "build this feature" into a sequence of named stages: discover → research →
design → plan → implement → validate → code-review → commit. Each stage writes a Markdown
artifact under `.rpiv/artifacts/` that you can review, and the next stage reads it. rpiv-pi
adds 30 skills and 15 specialist subagents to [Pi Agent](https://github.com/badlogic/pi-mono).
The agent runs them with the Pi `Agent` and `SubagentWorkflow` tools. Use it when you want
structured multi-stage work that you can review, not one very long chat turn.

## Install

`rpiv-pi` is in [`hs1n/pi-monocoque`](https://github.com/hs1n/pi-monocoque), an 11-package
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
live-checkout install (`pi install <path>`) and `scripts/fork-pi-install.sh` (one Pi entry per package).

## Quick start

rpiv-pi registers no tools. It uses the tools of its sibling extensions. If a sibling is
missing, one command installs it. It uses a local path for the siblings in this repo, and npm
for the third-party `Agent` dispatcher:

```
/mono-setup
```

The dialog shows each change and applies nothing until you confirm. With no UI, the command lists
the changes and tells you to run `/mono-setup --yes`. That form applies them with no confirmation.
The old names `/rpiv-setup`, `/rpiv-models` and `/rpiv-update-agents` still work as aliases.

You also need a model in Pi. If `/login` works, you have one. If not, see [docs/models-config.md](./docs/models-config.md).

Now run a pipeline. Each skill is independent and reads the artifact of the previous stage:

```
/skill:discover "add a --json flag to the export command"
/skill:research .rpiv/artifacts/discover/<latest>.md
/skill:blueprint .rpiv/artifacts/research/<latest>.md
/skill:implement .rpiv/artifacts/plans/<latest>.md
/skill:validate .rpiv/artifacts/plans/<latest>.md
```

If you tell the agent to run more than one stage, it dispatches them with `Agent` or
`SubagentWorkflow`. No fixed graph exists, so you can skip a stage, change the order, or run
two designs in parallel. Each stage writes into `.rpiv/artifacts/<bucket>/`, and the next stage
finds its input there. `/skill:status` is read-only. It lists the 3 newest artifacts in each
bucket, groups them by topic, and names the likely next skill. [docs/skills.md](./docs/skills.md)
has the full list.

## What you get

- **Artifacts that you can review, not one long turn**: each skill writes timestamped
  Markdown into `.rpiv/artifacts/<bucket>/`. You can read, edit or reject a design before
  the agent writes code.
- **Independent stages**: each skill is one `/skill:<name>` command. It reads the previous
  artifact and writes its own. No run state and no resume point exist. The output of a stage
  is on disk, and the next stage starts from that file.
- **Parallel dispatch where it helps**: the analysis and design skills use the `Agent` tool
  for parallel work. Thus the agent designs or reviews independent slices at the same time.
- **Cheap models for simple stages**: `/mono-models` sets model and reasoning-effort
  overrides for each skill or subagent. It also finds typos in keys that would not apply.
- **Your architecture docs, injected where they apply**: when you touch a file, rpiv-pi sends
  the nearest `AGENTS.md`, `CLAUDE.md` or `.rpiv/guidance/<sub>/architecture.md` to the
  model. It sends each file one time per session, and your transcript does not show it.

## Configuration

`/mono-models` writes `~/.config/rpiv-pi/models.json` with mode `0600`. If
`$XDG_CONFIG_HOME` is an absolute path, or a `~` or `~/…` path, the file is under
`$XDG_CONFIG_HOME/rpiv-pi/`. The file is optional. If it is missing or has bad JSON, no
overrides apply.

| Command | What it does |
| --- | --- |
| `/mono-models` | Opens the picker. With no UI, it shows the config and the usage |
| `/mono-models show` | Shows the current overrides |
| `/mono-models set defaults <model> [effort]` | Sets the global default |
| `/mono-models set agents <agent> <model> [effort]` | Sets the override for one subagent |
| `/mono-models set skills <skill> <model> [effort]` | Sets the override for one skill |
| `/mono-models unset defaults\|agents <agent>\|skills <skill>` | Removes an override |

`<model>` is `provider/id`. If you do not give an effort, the override keeps the session
effort. In print mode (`pi -p`), Pi discards notify messages. Then `/mono-setup --yes` and
`/mono-models` apply valid arguments but show no output. RPC clients get the output.

## Reference

- [docs/skills.md](./docs/skills.md): all 30 skills, what each one reads and writes, and
  which ones the model can select itself.
- [docs/models-config.md](./docs/models-config.md): how to give Pi a provider, and the full
  `models.json` schema, cascade and examples.
- [docs/bundled-agents.md](./docs/bundled-agents.md): the 15 bundled subagents, and how the
  sync on disk decides what to overwrite.
- [docs/architecture.md](./docs/architecture.md): what rpiv-pi registers, guidance and git
  context injection, sibling coupling, and uninstall.

## Requirements

| Requirement | Why |
| --- | --- |
| [Pi Agent](https://github.com/badlogic/pi-mono) 0.80.x or 1.x | The host. Install it globally, so `pi` is on your PATH |
| A model provider | Pi `/login` or `~/.pi/agent/models.json`. See [docs/models-config.md](./docs/models-config.md) |
| `@tintinweb/pi-subagents` (npm) | Supplies the `Agent` tool. Without it, the parallel-analysis skills cannot dispatch. `/mono-setup` installs it from npm |
| `git` *(optional)* | Branch, commit and user context. If git fails, rpiv-pi skips the injection, and nothing else changes |
| Node.js 22+ | The runtime for Pi and the bundled scripts of rpiv-pi. No build step and no native dependency |

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| Session-start banner: *N sibling extension(s) missing* | Siblings are not installed | Run `/mono-setup`, then restart Pi |
| Session-start banner: *bundled agents need attention* | A bundled agent changed, and you edited your copy on disk | Run `/mono-update-agents`. It overwrites the files that rpiv-pi manages. It does not change agents that you added |
| `/mono-setup` fails on one package | Pi cannot reach the package directory or its npm dependency | Run `pi install <path>` for that package, then run `/mono-setup` again |
| `/mono-models` reports *No models available* | Pi has no provider | Run `/login`, or add a provider to `~/.pi/agent/models.json` |

## Related

`/mono-setup` installs the packages marked auto, from local paths in this checkout. The other
packages are independent, under [`packages/`](https://github.com/hs1n/pi-monocoque/tree/main/packages).

| Package | Role | Auto |
| --- | --- | :---: |
| [`@hs1n/rpiv-args`](https://github.com/hs1n/pi-monocoque/tree/main/packages/rpiv-args) | `$1` / `$ARGUMENTS` placeholders in skill bodies | ✓ |
| [`@hs1n/rpiv-ask-user-question`](https://github.com/hs1n/pi-monocoque/tree/main/packages/rpiv-ask-user-question) | Structured questionnaires to you | ✓ |
| [`@hs1n/rpiv-todo`](https://github.com/hs1n/pi-monocoque/tree/main/packages/rpiv-todo) | Live task overlay that stays after `/reload` | ✓ |
| [`@hs1n/rpiv-advisor`](https://github.com/hs1n/pi-monocoque/tree/main/packages/rpiv-advisor) | Sends a step to a stronger reviewer model | ✓ |
| [`@hs1n/rpiv-web-tools`](https://github.com/hs1n/pi-monocoque/tree/main/packages/rpiv-web-tools) | Web search and fetch, with providers that you can change | ✓ |
| [`@hs1n/rpiv-i18n`](https://github.com/hs1n/pi-monocoque/tree/main/packages/rpiv-i18n) | Localization SDK for the rpiv TUI strings | ✓ |

## License

[MIT](./LICENSE)
