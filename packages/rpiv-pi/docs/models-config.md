# Model configuration

This page tells how to give Pi a model provider. It also tells how `@hs1n/rpiv-pi` sends
individual agents and skills to different models and reasoning levels.

## Part 1: give Pi a provider

This is the configuration of Pi Agent, not of rpiv-pi. If `/login` already works, or
`~/.pi/agent/models.json` is set up, go to Part 2. Use one of these:

**Subscription login**: start Pi and run `/login`. You can authenticate with Anthropic
Claude Pro/Max, ChatGPT Plus/Pro or GitHub Copilot. `/login` also accepts API keys for other
providers, for example Google Gemini.

**BYOK (API key)**: edit `~/.pi/agent/models.json` and add a provider entry with `baseUrl`,
`api`, `apiKey` and `models[]`. This example uses the z.ai GLM coding plan:

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

If no provider is configured, `/mono-models` has no models to offer. It shows
`No models available (no API keys configured?).`

## Part 2: the `models.json` of rpiv-pi

### Where it is

The file is `<config dir>/rpiv-pi/models.json`. The config dir is `$XDG_CONFIG_HOME` when
that is an absolute path or a `~` / `~/…` path (rpiv-pi expands the tilde first). Otherwise
the config dir is `~/.config`.

| Environment | Path |
| --- | --- |
| default | `~/.config/rpiv-pi/models.json` |
| `XDG_CONFIG_HOME=/x` | `/x/rpiv-pi/models.json` |

rpiv-pi ignores an `XDG_CONFIG_HOME` that is unset, empty, only whitespace, relative or in
`~user` form. Then it uses `~/.config`.

**Reads fall back. Writes do not.** If the XDG path does not exist, rpiv-pi reads
`~/.config/rpiv-pi/models.json`. If the XDG path exists, rpiv-pi uses it, also when its JSON
is malformed. rpiv-pi shows a warning about a corrupt file. It does not hide it behind the
legacy file. `/mono-models` always writes the XDG path.

rpiv-pi writes the file with mode `0600`. The `chmod` is best effort, and a failed `chmod` does
not stop the save. Thus file systems that ignore permission bits (tmpfs, some network mounts,
Windows) still save correctly.

If the JSON is missing or malformed, rpiv-pi applies no overrides. It keeps the parsed config
for the session. It reads the file again after a `/mono-models` save or a
`/mono-update-agents` run.

### Schema

| Key | Type | Applies to |
| --- | --- | --- |
| `defaults` | entry | The `agents` and `skills` entries that do not override it |
| `agents` | `{ [agentName]: entry }` | Bundled subagents. The key is the file name without `.md` |
| `skills` | `{ [skillName]: entry }` | A skill. The key is its name without the `/skill:` prefix |

An **entry** is a string `"provider/modelId"` or an object
`{ "model": "provider/modelId", "thinking": "<level>" }`. An `agents` entry can also have
`extensions` and `tools` arrays. rpiv-pi ignores these two fields in `defaults` and in
`skills`, and shows a warning. The schema rejects all other keys.

### Cascade

The most specific entry wins:

- For an agent: `agents[agent]`, then `defaults`.
- For a skill: `skills[skill]`, then `defaults`.

When the file loads, rpiv-pi merges each entry with `defaults` one field at a time. Thus an
entry that sets only `thinking` still gets the default model.

**The standalone `/skill:` exception.** When you type `/skill:<name>`, the skill uses an
override only from an explicit `skills[<name>]` entry. `defaults` does not apply. Thus your
current session model stays in control of each skill that you start by hand.

### Reasoning levels

`thinking` accepts `off` and each graded level that Pi reports (`minimal` → `max`). An absent
field and `off` are different. An absent field uses the session baseline. `off` turns off
reasoning. For all other values, rpiv-pi shows a warning that lists the valid set:

```
[mono] models.json: unknown thinking level "<v>" — valid values: off, minimal, …, max
```

### Model key form

The canonical form is `provider/modelId`, with a slash. rpiv-pi still reads the legacy
`provider:modelId` colon form. New saves write the slash form.

### Typo detection

At session start, a check finds keys that pass the schema but never apply, for example
`skills.committ` or `agents.codebase-analzyer`. It compares both axes with the names on disk
and in the live skill registry. It shows one warning for each process, with the dotted path.

## Examples

**Low-cost models for simple turns**

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

Your default is Opus. `/skill:commit` and `/skill:changelog` use the lower-cost GLM.
`/skill:research` uses GPT-5.5 at high effort.

**A subagent on a lower-cost model**

```json
{
  "agents": {
    "codebase-locator": "zai/glm-4-7",
    "web-search-researcher": { "model": "zai/glm-4-7", "thinking": "off" }
  }
}
```

rpiv-pi writes agent overrides into the frontmatter of the agent file on disk. Thus they apply
at the next sync of the file. Run `/mono-update-agents` to apply them during a session.

## The `/mono-models` command

With a UI and no argument, `/mono-models` opens a picker: scope → key → model → effort → save.
`esc` goes back one level. `esc` at the scope step closes the picker.

- Each scope, also `defaults`, has **Reset to default** to remove an override.
- The **reset all overrides** scope clears the file, after a confirmation dialog.
- Models with no reasoning skip the effort step and save immediately.
- The effort step has `inherit (no override)` and `off (disable reasoning)` as separate
  choices. `inherit` saves no `thinking` field.
- A save shows `Saved <scope>/<key> → <model> (<effort>)`. A removal shows `Removed <label>.`

With arguments, the command works with or without a UI:

| Command | What it does |
| --- | --- |
| `/mono-models show` | Shows the current overrides |
| `/mono-models set defaults\|agents <agent>\|skills <skill> <model> [effort]` | Saves an override. `<model>` is `provider/id`. `[effort]` is `off` or a level that the model supports |
| `/mono-models unset defaults\|agents <agent>\|skills <skill>` | Removes an override |

With no `[effort]`, the override keeps the session effort. With no UI and no argument, the
command shows the current config and the usage. If an argument is not valid, the command shows
an error and the usage, and it changes nothing. An unknown scope, name, effort or subcommand
error also lists the valid values. In print mode (`pi -p`), Pi discards notify messages. Thus a
valid command applies but shows no output. RPC clients get the output.
