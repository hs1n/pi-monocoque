# @hs1n/rpiv-config

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Shared JSON config I/O for the `@hs1n/rpiv-*` packages — XDG-aware path resolution, loads
that return `{}` instead of throwing, saves that report failure and chmod to `0600`, and
TypeBox-driven defaults. It is an internal utility of the
[pi-monocoque](https://github.com/hs1n/pi-monocoque) monorepo — nothing is published; the
siblings resolve it through the workspace links. There is no CLI, and it registers nothing
with [Pi Agent](https://github.com/badlogic/pi-mono).

## Install

Not published: `rpiv-config` is a workspace package inside
[`hs1n/pi-monocoque`](https://github.com/hs1n/pi-monocoque), and its consumers resolve it
through the monorepo's workspace links (`"@hs1n/rpiv-config": "^<lockstep version>"`), not
from a registry.

ESM only. The package ships TypeScript source — `exports` points at `./index.ts`, with no
`main`, no `types`, and no compiled build — so you need a bundler or a TypeScript-aware runtime
(`tsx`, Bun). Plain `node` cannot load it, and `--experimental-strip-types` refuses `.ts` files under `node_modules`.

## Quick start

```ts
import { configPath, loadJsonConfig } from "@hs1n/rpiv-config";

const path = configPath("rpiv-todo"); // ~/.config/rpiv-todo/config.json
const config = loadJsonConfig<{ theme?: string }>(path); // {} if the file is missing
```

## What it provides

Eleven exports, all stateless — no singletons, no caches, no import-time side effects.

| Export | What it does |
| --- | --- |
| `configPath(name, file?)` | Resolves `<config dir>/<name>/<file>`, defaulting to `~/.config/<name>/config.json`. An absolute `XDG_CONFIG_HOME` (or `~`/`~/…`) overrides the directory; anything else falls back. |
| `loadJsonConfig(path)` | Parses a JSON file. Returns `{}` for a missing file, a non-plain-object value, or malformed JSON (which also warns) — a hand-edited config cannot crash the caller. |
| `loadJsonConfigWithLegacyFallback(name, file?)` | Reads the XDG path; only when that file is absent does it read the pre-XDG `~/.config/<name>/<file>`. Corruption is surfaced, never masked by the legacy file. |
| `saveJsonConfig(path, data)` | `mkdir -p`, writes pretty JSON with a trailing newline, then chmods `0600` (best effort). Returns `true`/`false` instead of throwing — guard your "Saved" message on it. |
| `validateConfig(schema, value)` | Strips unknown keys, layers schema defaults underneath, and returns `{}` on any failure. |
| `validateGuidanceFields(fields)` | Keeps `promptSnippet` and `description` only if each is a non-empty string, and `promptGuidelines` only if it is a non-empty array of non-empty strings. Everything else is dropped. |
| `GuidanceFieldsSchema` | TypeBox object for the three guidance fields, with `additionalProperties: true` so consumers can nest it in a larger config schema. |
| `GuidanceFields` | Type for the same shape: `{ promptSnippet?: string; promptGuidelines?: string[]; description?: string }`. |
| `parseModelKey(key)` | Splits `provider/modelId`, also accepting the legacy `provider:modelId`; slash wins when both are present. Returns `undefined` if there is no separator at index ≥ 1. |
| `modelKey({ provider, id })` | Emits the canonical `provider/id`. Paired with `parseModelKey`, persisted colon-form keys migrate on the next save. |
| `readEnvVar(key, fallback?)` | Returns the trimmed variable, or `fallback` when it is unset or empty after trimming. |

`XDG_CONFIG_HOME` is the only variable this package reads, and it governs the `rpiv-*` config layer only — Pi's own `~/.pi/…` paths are a separate concern.

## Used by

| Package | Uses |
| --- | --- |
| [`rpiv-pi`](https://github.com/hs1n/pi-monocoque/tree/main/packages/rpiv-pi) | Path resolution, model-key codec, schema validation for model config |
| [`rpiv-advisor`](https://github.com/hs1n/pi-monocoque/tree/main/packages/rpiv-advisor) | Model-key codec, guidance fields, config load/save |
| [`rpiv-web-tools`](https://github.com/hs1n/pi-monocoque/tree/main/packages/rpiv-web-tools) | Provider config load/save, guidance schema and validation |
| [`rpiv-i18n`](https://github.com/hs1n/pi-monocoque/tree/main/packages/rpiv-i18n) | Config load/save |
| [`rpiv-todo`](https://github.com/hs1n/pi-monocoque/tree/main/packages/rpiv-todo) | Config load, guidance fields |
| [`rpiv-ask-user-question`](https://github.com/hs1n/pi-monocoque/tree/main/packages/rpiv-ask-user-question) | Config load, guidance fields |
| [`rpiv-workflow`](https://github.com/hs1n/pi-monocoque/tree/main/packages/rpiv-workflow) | Path resolution |

These are versioned in lockstep with this package.

## License

MIT — see [LICENSE](https://github.com/hs1n/pi-monocoque/blob/main/LICENSE).
