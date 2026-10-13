# pi-monocoque

A monorepo of [Pi Agent](https://github.com/badlogic/pi-mono) extensions: the `rpiv-pi`
skill pipeline and the tools it composes. Eleven packages, lockstep versions, installed
into Pi as a Pi source.

**This is a personal fork** of [juicesharp/rpiv-mono](https://github.com/juicesharp/rpiv-mono),
maintained by [@hs1n](https://github.com/hs1n) and **frozen at that project's v2.13.8** —
there is no upstream remote and no merge path; later upstream work is not adopted here. It is
not affiliated with, endorsed by, or supported by the upstream author. What the fork changes
— and what it owes upstream under MIT — is in [FORK_NOTICE.md](./FORK_NOTICE.md); upstream's
own README is preserved at [docs/upstream/README.md](./docs/upstream/README.md).

## Install

There is **no registry route**: nothing here is published to npm, and `pi install
git:...` works only because the monorepo root declares a `pi` manifest (eight extensions +
`packages/rpiv-pi/skills`) that Pi reads after cloning.

```sh
# the whole set, as a Pi source
pi install git:github.com/hs1n/pi-monocoque

# the Agent dispatcher rpiv-pi's parallel skills need (third-party, from npm)
pi install npm:@tintinweb/pi-subagents@0.21.0
```

Restart Pi, or `/reload` in a running session. To develop against a live checkout instead,
`pi install /path/to/pi-monocoque` — paths are recorded, not copied, so edits arrive on
`/reload`. Full matrix (live checkout, per-package install, opt-ins like `rpiv-btw`,
verification): [INSTALL-FORK.md](./INSTALL-FORK.md).

## Packages

| Package | Role |
| --- | --- |
| [`rpiv-pi`](./packages/rpiv-pi) | The pipeline: ~30 contract-carrying skills, 15 named subagents, the four built-in `/wf` workflows, lane observability, model management. Registers zero tools. |
| [`rpiv-workflow`](./packages/rpiv-workflow) | `/wf` runner — chains skills into typed multi-stage pipelines (declarative, validatable, resumable, predicate routing, parallel fan-out). |
| [`rpiv-ask-user-question`](./packages/rpiv-ask-user-question) | `ask_user_question` — a structured questionnaire instead of a guess. |
| [`rpiv-todo`](./packages/rpiv-todo) | `todo` tool + `/todos` + a live overlay that survives `/reload` and compaction. |
| [`rpiv-advisor`](./packages/rpiv-advisor) | `advisor` — escalate any step to a stronger reviewer model. |
| [`rpiv-web-tools`](./packages/rpiv-web-tools) | `web_search` / `web_fetch` with pluggable providers. |
| [`rpiv-args`](./packages/rpiv-args) | `$1` / `$ARGUMENTS` placeholders and `` !`cmd` `` substitution in skill bodies. |
| [`rpiv-i18n`](./packages/rpiv-i18n) | Localization SDK for the sibling extensions (includes `zh-TW`). |
| [`rpiv-btw`](./packages/rpiv-btw) | `/btw` — a side conversation that never touches the transcript. Opt-in: not in the root manifest. |
| [`rpiv-config`](./packages/rpiv-config) | Shared XDG-aware JSON config I/O for the siblings. Not a Pi extension. |
| `test-utils` | Shared test fixtures. Private, workspace-only. |

## Using the pipeline

```
/wf build "add a --json flag to the export command"   # a full pipeline, run detached
/skill:discover <task>                                # or drive the stages yourself
/rpiv-models                                          # per-skill model + effort overrides
/lanes                                                # watch, step into, or answer a running lane
```

Skills carry contracts: each declares what it reads and produces, and `/wf` stages are
validated against those contracts at load and run time. `/rpiv-setup` installs any sibling
that is missing — by local path, since there is no registry copy to fetch.

## Working on this repo

```sh
npm install
npm run check        # host-provided-dep guard + Biome + tsc
npx vitest run       # 259 files / 6350+ tests
npm run coverage     # what the pre-push hook runs
```

- No build step: packages ship raw `.ts`, and Pi loads them directly.
- One Vitest runner, one Biome config, one `tsconfig.base.json` at the root.
- Husky gates commits (`check:decision-codes` → `check:file-sizes` → `check`) and pushes
  (full coverage).
- Versions are hand-maintained lockstep: bump them, then `npm run versions:sync`.
- Agent-facing architecture notes live under [`.rpiv/guidance/`](./.rpiv/guidance) and are
  injected per directory as you work.

Deeper docs: [docs/upstream/](./docs/upstream) (upstream's narrative, kept verbatim),
[INSTALL-FORK.md](./INSTALL-FORK.md), [FORK_NOTICE.md](./FORK_NOTICE.md),
[packages/rpiv-pi/docs/](./packages/rpiv-pi/docs) (lanes, models, agents, workflows).

## License

MIT. Upstream's copyright notices and license texts are kept unmodified — see
[LICENSE](./LICENSE) and `packages/*/LICENSE`. Upstream authorship is recorded in the
`contributors` field of each manifest as well.
