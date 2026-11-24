# Model configuration

How to give Pi a model provider, and how `@hs1n/rpiv-pi` routes individual
agents and skills to different models and reasoning levels.

## Part 1 — giving Pi a provider

This is Pi Agent's own configuration, not rpiv-pi's. If `/login` already works or
`~/.pi/agent/models.json` is set up, skip to Part 2. Pick one:

**Subscription login** — start Pi and run `/login` to authenticate with Anthropic
Claude Pro/Max, ChatGPT Plus/Pro, or GitHub Copilot. `/login` also accepts plain API
keys for other providers, including Google Gemini.

**BYOK (API key)** — edit `~/.pi/agent/models.json` and add a provider entry with
`baseUrl`, `api`, `apiKey`, and `models[]`. Example, using the z.ai GLM coding plan:

```json
{
  "providers": {
    "zai": {
      "baseUrl": "https://api.z.ai/api/coding/paas/v4",
      "api": "openai-completions",
      "apiKey": "XXXXXXXXX",
      "compat": {
        "supportsDeveloperRole": false,
        "thinkingFormat": "zai"
      },
      "models": [
        {
          "id": "glm-5.1",
          "name": "glm-5.1 [coding plan]",
          "reasoning": true,
          "input": ["text"],
          "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 },
          "contextWindow": 204800,
          "maxTokens": 131072
        }
      ]
    }
  }
}
```

With no provider configured, `/rpiv-models` cannot offer you anything and reports
`No models available (no API keys configured?).`

## Part 2 — rpiv-pi's `models.json`

### Where it lives

`<config dir>/rpiv-pi/models.json`, where the config dir is `$XDG_CONFIG_HOME` when
that is set to an absolute path (or a `~` / `~/…` path, which is tilde-expanded
first), and `~/.config` otherwise.

| Environment | Path |
| --- | --- |
| default | `~/.config/rpiv-pi/models.json` |
| `XDG_CONFIG_HOME=/x` | `/x/rpiv-pi/models.json` |

An `XDG_CONFIG_HOME` that is unset, empty, whitespace-only, relative, or in `~user`
form is ignored and `~/.config` is used.

**Reads fall back, writes do not.** If the XDG path does not exist, rpiv-pi still reads
`~/.config/rpiv-pi/models.json`. If the XDG path *does* exist, it wins even when its
JSON is malformed — corruption is warned about, never masked by the legacy file.
`/rpiv-models` always writes the XDG path.

The file is written with mode `0600`. The `chmod` is best-effort and never gates
success, so filesystems that ignore permission bits (tmpfs, some network mounts,
Windows) still save correctly.

Missing or malformed JSON degrades to no overrides at all. The parsed config is cached
for the session and re-read after a successful `/rpiv-models` save or a
`/rpiv-update-agents` run.

### Schema

| Key | Type | Applies to |
| --- | --- | --- |
| `defaults` | entry | `agents` and `skills` entries that do not override it |
| `agents` | `{ [agentName]: entry }` | Bundled subagents, keyed by filename without `.md` |
| `skills` | `{ [skillName]: entry }` | A skill, keyed by its name after the `/skill:` prefix is stripped |

An **entry** is either a bare string `"provider/modelId"` or an object
`{ "model": "provider/modelId", "thinking": "<level>" }`. No other keys are accepted at
any level — unknown keys are rejected by the schema.

### Cascade

Most specific wins:

1. `skills[skill]`
2. `defaults`

Each layer is composed field-by-field against `defaults` when the file loads, so an
entry that sets only `thinking` still inherits the default model.

**The standalone `/skill:` exception.** A user-typed `/skill:<name>` picks up an
override only from an explicit `skills[<name>]` entry. `defaults` does not arm it, so
your current session model stays sovereign for anything you invoke by hand.

### Reasoning levels

`thinking` accepts the explicit `off` plus every graded level Pi reports (`minimal` → `max`).
Omitting the field and setting it to `off` are different: omitting inherits the
session baseline, `off` explicitly disables reasoning. Anything else is warned about
(the warning enumerates the accepted set):

```
[rpiv-pi] models.json: unknown thinking level "<v>" — valid values: off, minimal, …, max
```

### Model key form

Canonical is `provider/modelId` with a slash. The legacy `provider:modelId` colon form
still parses on read for back-compatibility; new saves emit the slash form.

### Typo detection

A session-start check reports record keys that pass schema validation but would silently
never apply — `skills.committ`, `agents.codebase-analzyer`. It warns once per process with
the dotted path, checking both axes against the names that exist on disk and in the live
skill registry.

## Worked examples

**Cheap models for cheap turns**

```json
{
  "defaults": "anthropic/claude-opus-4-7",
  "skills": {
    "commit": "zai/glm-4-7",
    "changelog": "zai/glm-4-7",
    "research": { "model": "openai/gpt-5.5", "thinking": "high" }
  }
}
```

Your default is Opus. `/skill:commit` and `/skill:changelog` use the cheaper GLM;
`/skill:research` uses GPT-5.5 at high effort.

**A subagent on a cheaper model**

```json
{
  "agents": {
    "codebase-locator": "zai/glm-4-7",
    "web-search-researcher": { "model": "zai/glm-4-7", "thinking": "off" }
  }
}
```

Agent overrides are injected into the agent's frontmatter on disk, so they take effect
the next time the file is synced. Run `/rpiv-update-agents` to apply them mid-session.

## The `/rpiv-models` picker

`/rpiv-models` walks scope → key → model → effort → save. `esc` steps back one level;
`esc` at the scope step exits. It requires interactive mode.

- Every scope, including `defaults`, offers **Reset to default** to drop an override.
- A **reset all overrides** scope clears the file, behind a confirmation dialog.
- Non-reasoning models skip the effort step and commit immediately.
- The effort step lists `inherit (no override)` and `off (disable reasoning)` as
  separate choices — picking `inherit` persists no `thinking` field at all.
- On save it notifies `Saved <scope>/<key> → <model> (<effort>)`; removing an override
  notifies `Removed <label>.`
