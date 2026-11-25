# pi-monocoque

pi-monocoque is a monorepo of [Pi Agent](https://github.com/badlogic/pi-mono) extensions.
It holds the `rpiv-pi` skill pipeline and the tools that the pipeline uses. It has eleven
packages with lockstep versions. You install it into Pi as a Pi source.

**This repo is a personal fork** of the rpiv-mono project by Sergii Guslystyi.
[@hs1n](https://github.com/hs1n) maintains it. The fork started from upstream v2.13.8, and it is
now at 3.0.0. The fork has no upstream remote and no merge path. It does not adopt later upstream
work. The upstream author does not endorse or support this fork.

[FORK_NOTICE.md](./FORK_NOTICE.md) lists the changes and the MIT obligations to upstream. The
upstream README is kept at [docs/upstream/README.md](./docs/upstream/README.md).

## Install

Nothing in this repo is published to npm. `pi install git:...` works because the monorepo root
declares a `pi` manifest. The manifest lists seven extensions and the skill trees. Pi reads it
after the clone.

```sh
# the whole set, as a Pi source
pi install git:github.com/hs1n/pi-monocoque

# the Agent dispatcher that the parallel skills of rpiv-pi need (third-party, from npm)
pi install npm:@tintinweb/pi-subagents@0.26.3
```

Restart Pi, or run `/reload` in a running session. To develop against a live checkout, run
`pi install /path/to/pi-monocoque`. Pi records the path and does not copy it, so your edits
apply on `/reload`. [INSTALL-FORK.md](./INSTALL-FORK.md) gives all the install routes: live
checkout, one package, opt-in packages such as `rpiv-btw`, and verification.

## Packages

| Package | Role |
| --- | --- |
| [`rpiv-pi`](./packages/rpiv-pi) | The pipeline: 30 skills, 15 named subagents, model management. It registers no tools. |
| [`rpiv-ask-user-question`](./packages/rpiv-ask-user-question) | `ask_user_question`: a structured questionnaire, so the agent asks and does not guess. |
| [`rpiv-todo`](./packages/rpiv-todo) | The `todo` tool, `/todos`, and a live overlay that stays after `/reload` and compaction. |
| [`rpiv-advisor`](./packages/rpiv-advisor) | `advisor`: sends a step to a stronger reviewer model. |
| [`rpiv-web-tools`](./packages/rpiv-web-tools) | `web_search` and `web_fetch`, with providers that you can change. |
| [`rpiv-args`](./packages/rpiv-args) | `$1` and `$ARGUMENTS` placeholders and `` !`cmd` `` substitution in skill bodies. |
| [`rpiv-i18n`](./packages/rpiv-i18n) | The localization SDK for the sibling extensions (it includes `zh-TW`). |
| [`rpiv-btw`](./packages/rpiv-btw) | `/btw`: a side conversation that does not change the transcript. Opt-in: it is not in the root manifest. |
| [`rpiv-config`](./packages/rpiv-config) | Shared JSON config I/O for the siblings, with XDG paths. It is not a Pi extension. |
| [`rpiv-side-call`](./packages/rpiv-side-call) | The shared side-call surface. It selects the host path for a side call and gives the function that runs it. It is not a Pi extension. |
| `test-utils` | Shared test fixtures. Private, workspace-only. |

## Using the pipeline

```
/skill:discover <task>                                # interview → research → design → plan → implement
/rpiv-models                                          # per-skill model + effort overrides
/skill:implement .rpiv/artifacts/plans/<latest>.md    # run one stage at a time
/skill:status                                         # the newest artifacts and the likely next skill
```

The pipeline does not run a graph. Each skill is independent. Each skill writes a Markdown
artifact under `.rpiv/artifacts/`, and the next skill reads it. For multi-stage work, the agent
uses the Pi `Agent` and `SubagentWorkflow` tools. `/rpiv-setup` installs each missing sibling
from a local path, because no registry copy exists.

## Working on this repo

```sh
npm install
npm run check        # host-provided-dep guard + Biome + tsc
npx vitest run       # 152 files / 2600+ tests
npm run coverage     # what the pre-push hook runs
```

- No build step: the packages ship raw `.ts`, and Pi loads them directly.
- The root has one Vitest runner, one Biome config and one `tsconfig.base.json`.
- Husky checks commits (`check:decision-codes` → `check:file-sizes` → `check`). It runs full
  coverage before a push.
- One source sets the lockstep version. Bump the root `package.json`, then run
  `npm run versions:sync`. It writes the version to all 11 packages. CI runs
  `npm run versions:check`.
- Agent architecture notes are in [`.rpiv/guidance/`](./.rpiv/guidance). Pi injects them for
  each directory that you work in.

More docs:

- [docs/upstream/](./docs/upstream): the upstream text, kept verbatim.
- [INSTALL-FORK.md](./INSTALL-FORK.md) and [FORK_NOTICE.md](./FORK_NOTICE.md).
- [packages/rpiv-pi/docs/](./packages/rpiv-pi/docs): skills, models and agents.

## License

MIT. The fork keeps the upstream copyright notices and license texts unchanged. See
[LICENSE](./LICENSE) and `packages/*/LICENSE`. The `contributors` field of each manifest also
records upstream authorship.
