# Architecture and internals

This page tells what `@hs1n/rpiv-pi` registers into a Pi session, how it finds its siblings and
how it injects context. Read it when you debug behavior that you did not ask for, or when you
extend the package.

## The package tree

```
rpiv-pi/
├── extensions/rpiv-core/   the one extension: hooks, commands, guidance, model config
├── skills/                 30 skills, one directory each
└── agents/                 15 subagent profiles, copied to ~/.pi/agent/agents/ at runtime
```

The `pi` manifest in `package.json` has two lines:

```json
"pi": { "extensions": ["./extensions"], "skills": ["./skills"] }
```

Extensions load as TypeScript through jiti. There is no build step. Agents are not in the
manifest. rpiv-pi copies them to disk (see [bundled-agents.md](./bundled-agents.md)).

## It registers zero tools

rpiv-pi does not call `registerTool`. Each tool that its skills use (`Agent`,
`ask_user_question`, `todo`, `advisor`, `web_search`, `web_fetch`) comes from a sibling
package. rpiv-pi gives skills, agents, commands and session behavior. The siblings give the
tools.

## Session surfaces

| Surface | Registered by | Notes |
| --- | --- | --- |
| `/rpiv-setup [--yes]` | always | With no UI, it lists the changes and the command that applies them. `--yes` applies with no confirmation |
| `/rpiv-update-agents` | always | |
| `/rpiv-models [show \| set … \| unset …]` | always | With no UI and no argument, it shows the current config and the usage |
| `/skill:<name>` × 30 | Pi, from the manifest | |
| `--rpiv-debug` flag | always | Shows the hidden injected messages below |

The extension subscribes to these session events: `session_start`, `session_compact`,
`session_shutdown`, `tool_call` and `before_agent_start`. It also subscribes to `input` and
`agent_end` for the `/skill:` model bracket.

Startup maintenance runs one time for each process load, not on each `session_start`. It does
the per-directory cleanup, the agent sync and the sibling banner.

At `session_start`, rpiv-pi also looks for bundled skills that a copy with the same name hides.
Pi reads `.agents/skills`, `.pi/skills` and `~/.pi/agent/skills` before the package. If one of
these has a `SKILL.md` with a bundled name, the session shows a warning.

## Guidance injection

On each `read`, `edit` or `write` tool call, rpiv-pi goes from the project root down to the
directory of the file. At each depth, it finds **a maximum of one** file. It takes the first of
these that exists:

1. `AGENTS.md`
2. `CLAUDE.md`
3. `.rpiv/guidance/<subpath>/architecture.md`

On the tool path, rpiv-pi injects only the deepest file that it found. Depth 0 skips
`AGENTS.md` and `CLAUDE.md`, because the resource loader of Pi already reads the working
directory. Depth 0 still checks `<cwd>/.rpiv/guidance/architecture.md`. rpiv-pi also injects the
root guidance at `session_start`. A repeated `session_start` does not inject it again.

Delivery is a hidden message with `customType: "rpiv-guidance"`. An in-process set removes
duplicates. The set clears on `session_start`, `session_compact` and `session_shutdown`.

A compaction hook never sends context directly. A send during overflow recovery makes steering
queue items. Thus rpiv-pi marks the compacted session by identity. On the next real user turn of
that session, it sends one hidden `before_agent_start` message. This message has the root
guidance, the pipeline pointer and a fresh Git read. The marker and the fresh read stop a
parallel session from using this message. The overflow retry continues from the compaction
summary, with no synthetic last message. Run `pi --rpiv-debug` to see the messages when they go.

## Git context injection

rpiv-pi injects the branch, the short commit and the user at `session_start`. After
`session_compact`, they go into the one deferred message on the next user turn. At other times,
`before_agent_start` injects them only when they changed. A bash command that changes git
clears the cache. Standalone messages use `customType: "rpiv-git-context"`. The merged recovery
message uses `"rpiv-post-compact-context"`. `--rpiv-debug` shows both.

Git is optional. If the `git` calls fail, rpiv-pi skips the injection and nothing else changes.
When `git config user.name` is empty, rpiv-pi uses `$USER`, and then `unknown`.

## Pipeline pointer

22 of the 30 skills set `disable-model-invocation: true`. This removes them from the skill list
of the model, so the model cannot start a design pass during a conversation. To keep them
visible, rpiv-pi injects a stage index of approximately 120 tokens at `session_start`. After
compaction, it adds the index to the first real user turn. The index is hidden. `--rpiv-debug`
shows it.

## Sibling coupling

A sibling is **present** when one of these two checks finds it:

- a case-insensitive regex on the `packages[]` array in the active Pi settings file
  (`<agent dir>/settings.json`, with `PI_CODING_AGENT_DIR`);
- or the sibling is loaded in this session. The same regex runs on the source path of each
  loaded tool and extension command. `rpiv-args` registers neither, so it has a presence marker.

The second check finds siblings that load with no settings entry of their own. Examples are a
sibling inside another Pi package (a kit), a project install (`pi install -l`) or `pi -e`.
These siblings do not cause the missing-siblings banner. `/rpiv-setup` does not install a second
copy, which would register the same tools again. The entry graph has no static sibling import.
A test makes sure of this.

`/rpiv-setup` installs each of these seven packages that is not declared and not loaded. It
installs the six packages of this repo by local path, and `@tintinweb/pi-subagents` from npm:

| Package | Provides |
| --- | --- |
| `@tintinweb/pi-subagents` | `Agent`, `get_subagent_result`, `steer_subagent` tools |
| `@hs1n/rpiv-ask-user-question` | `ask_user_question` tool |
| `@hs1n/rpiv-todo` | `todo` tool, `/todos`, overlay widget |
| `@hs1n/rpiv-advisor` | `advisor` tool and `/advisor` |
| `@hs1n/rpiv-i18n` | `/languages`, `--locale`, the i18n SDK |
| `@hs1n/rpiv-web-tools` | `web_search`, `web_fetch`, `/web-tools` |
| `@hs1n/rpiv-args` | `$N` / `$ARGUMENTS` substitution in skill bodies |

It installs them one at a time, with a 120-second timeout for each. It shows each change in a
confirmation dialog, and applies nothing until you confirm. `--yes` skips the dialog. It also
removes legacy entries from `settings.json`: the unscoped `pi-subagents` and `rpiv-workflow`.

No sibling is imported at runtime. The registration order is important in one place only. The
session hooks, `/rpiv-update-agents` and `/rpiv-setup` always register, and they register
first. Thus a clean install with no siblings still shows the missing-siblings banner and can
repair itself.

## Uninstall

```sh
pi remove git:github.com/hs1n/pi-monocoque
```

If you installed a local checkout, run `pi remove /path/to/pi-monocoque`. If no other plugin
needs it, also run `pi remove npm:@tintinweb/pi-subagents`. Then restart Pi. rpiv-pi does not
delete your `.rpiv/artifacts/` tree, `~/.config/rpiv-pi/models.json` or `~/.pi/agent/agents/`.
Delete them yourself if you do not want them.

## Versioning

All `@hs1n/rpiv-*` packages have the same version (lockstep). You edit the number only in the
`version` of the root `package.json`. `npm run versions:sync` writes it into each package and
updates the dependencies inside the monorepo. `npm run versions:check` verifies this, and CI
runs it. Nothing is published. Do not run `npm version` inside this package.
