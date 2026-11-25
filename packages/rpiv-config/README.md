# @hs1n/rpiv-config

Shared JSON config I/O for the `@hs1n/rpiv-*` packages. It resolves XDG-aware paths. Its loads
return `{}` and do not throw. Its saves report failure and set mode `0600`. It also applies
TypeBox defaults. It is internal to the [pi-monocoque](https://github.com/hs1n/pi-monocoque)
monorepo. It is not published, it has no CLI, and it registers nothing with
[Pi Agent](https://github.com/badlogic/pi-mono).

## What it provides

Eleven exports. All are stateless: no singletons, no caches and no side effects at import time.

```ts
import { configPath, loadJsonConfig } from "@hs1n/rpiv-config";

const path = configPath("rpiv-todo"); // ~/.config/rpiv-todo/config.json
const config = loadJsonConfig<{ theme?: string }>(path); // {} if the file is missing
```

| Export | What it does |
| --- | --- |
| `configPath(name, file?)` | Resolves `<config dir>/<name>/<file>`. The default is `~/.config/<name>/config.json`. An absolute `XDG_CONFIG_HOME` (or `~`/`~/…`) overrides the directory. Other values are ignored. |
| `loadJsonConfig(path)` | Parses a JSON file. It returns `{}` for a missing file, a value that is not a plain object, or malformed JSON (with a warning). Thus a config edited by hand cannot crash the caller. |
| `loadJsonConfigWithLegacyFallback(name, file?)` | Reads the XDG path. Only when that file is absent, it reads the pre-XDG `~/.config/<name>/<file>`. It shows a corrupt file, and does not hide it behind the legacy file. |
| `saveJsonConfig(path, data)` | Runs `mkdir -p`, writes pretty JSON with a trailing newline, then sets mode `0600` (best effort). It returns `true`/`false` and does not throw. Show a "Saved" message only on `true`. |
| `validateConfig(schema, value)` | Removes unknown keys, adds the schema defaults under the value, and returns `{}` on a failure. |
| `validateGuidanceFields(fields)` | Keeps `promptSnippet` and `description` only if each is a non-empty string. Keeps `promptGuidelines` only if it is a non-empty array of non-empty strings. It removes all other values. |
| `GuidanceFieldsSchema` | The TypeBox object for the three guidance fields. It has `additionalProperties: true`, so you can put it in a larger config schema. |
| `GuidanceFields` | The type for the same shape: `{ promptSnippet?: string; promptGuidelines?: string[]; description?: string }`. |
| `parseModelKey(key)` | Splits `provider/modelId`. It also accepts the legacy `provider:modelId`. When both separators are present, the slash wins. It returns `undefined` if no separator is at index 1 or higher. |
| `modelKey({ provider, id })` | Gives the canonical `provider/id`. With `parseModelKey`, keys saved in colon form change to slash form on the next save. |
| `readEnvVar(key, fallback?)` | Returns the trimmed variable. It returns `fallback` when the variable is unset or empty after the trim. |

This package reads only `XDG_CONFIG_HOME`. It controls only the `rpiv-*` config files, not `~/.pi/…`.

## Used by

| Package | Uses |
| --- | --- |
| [`rpiv-pi`](https://github.com/hs1n/pi-monocoque/tree/main/packages/rpiv-pi) | Path resolution, model-key codec, schema validation for model config |
| [`rpiv-advisor`](https://github.com/hs1n/pi-monocoque/tree/main/packages/rpiv-advisor) | Model-key codec, guidance fields, config load/save |
| [`rpiv-web-tools`](https://github.com/hs1n/pi-monocoque/tree/main/packages/rpiv-web-tools) | Provider config load/save, guidance schema and validation |
| [`rpiv-i18n`](https://github.com/hs1n/pi-monocoque/tree/main/packages/rpiv-i18n) | Config load/save |
| [`rpiv-todo`](https://github.com/hs1n/pi-monocoque/tree/main/packages/rpiv-todo) | Config load, guidance fields |
| [`rpiv-ask-user-question`](https://github.com/hs1n/pi-monocoque/tree/main/packages/rpiv-ask-user-question) | Config load, guidance fields |

These packages have the same version as this package (lockstep).

## Conventions

- **Workspace links, not a registry.** Consumers declare `"@hs1n/rpiv-config": "^<lockstep version>"`.
  npm workspaces resolve it inside the monorepo.
- **TypeScript source, ESM only.** `exports` points to `./index.ts`. There is no `main`, no
  `types` and no compiled build. You need a bundler or a TypeScript-aware runtime (`tsx`, Bun).
  Plain `node` cannot load it. `--experimental-strip-types` refuses `.ts` files in `node_modules`.

## License

MIT. See [LICENSE](https://github.com/hs1n/pi-monocoque/blob/main/LICENSE).
