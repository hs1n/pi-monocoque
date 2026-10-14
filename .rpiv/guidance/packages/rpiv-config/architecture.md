# rpiv-config

## Monorepo Context
Library (not published) in `pi-monocoque`. Lockstep version with the rest of the `@hs1n/rpiv-*` family — never bump independently. NOT a Pi extension — no `pi` field, no `siblings.ts` entry, not auto-suggested by `/rpiv-setup`. Opt-in dependency: siblings add it to their `dependencies` explicitly.

## Responsibility
Shared JSON config utilities for pi-monocoque sibling packages: load/save with crash-resistant defaults, path resolution, guidance-field validation, env-var fallback, TypeBox-driven schema validation, and the pi-tui KeyId grammar a config's key field is validated against (`keyspec.ts`). Stateless — no module-level singletons, no globalThis caches, no side effects.

## Dependencies
- **`typebox`** (`peerDependencies: "*"`, host-provided): `Value` (Clean, Clone, Create) for schema-driven validation; `TObject` / `Static` for type inference. Every consumer is a Pi extension and Pi aliases `typebox` for transitive imports too, so this package must not install its own copy — it was the transitive source of the duplicate every extension inherited (v2.12.0, #282)

## Consumers
- **`@hs1n/rpiv-todo`**: `loadJsonConfigWithLegacyFallback`, `validateGuidanceFields`, `GuidanceFields` (type); `resolveCollapseKeySpec`, `COLLAPSE_KEY_OFF`, `CollapseKeySpec` (type) for the overlay's collapse shortcut
- **`@hs1n/rpiv-ask-user-question`**: `loadJsonConfigWithLegacyFallback`, `validateGuidanceFields`, `GuidanceFields` (type); `resolveCollapseKeySpec`, `COLLAPSE_KEY_OFF`, `formatKeySpecForDisplay` for the overlay's collapse shortcut
- **`@hs1n/rpiv-advisor`**: `loadJsonConfigWithLegacyFallback`, `saveJsonConfig`, `configPath`, `validateGuidanceFields`, `modelKey`, `parseModelKey`, `GuidanceFields` (type)
- **`@hs1n/rpiv-web-tools`**: `loadJsonConfigWithLegacyFallback`, `saveJsonConfig`, `configPath`, `validateGuidanceFields`, `GuidanceFieldsSchema`
- **`@hs1n/rpiv-i18n`**: `loadJsonConfigWithLegacyFallback`, `saveJsonConfig`, `configPath`
- **`@hs1n/rpiv-pi`** (rpiv-core): `configPath`, `loadJsonConfigWithLegacyFallback`, `validateConfig`, `parseModelKey`, `modelKey`, `saveJsonConfig`
- **`@hs1n/rpiv-workflow`**: `configPath`

No consumer imports plain `loadJsonConfig` anymore — all config-reading siblings migrated to `loadJsonConfigWithLegacyFallback`.

## Module Structure
```
.                — config.ts (config I/O + validation), keyspec.ts (pi-tui's KeyId grammar,
                   its display casing, and the ladder a key field goes through),
                   index.ts (barrel re-export). No subdirectories, no assets, no prompts.
```

## Public API

| Export | Purpose |
|---|---|
| `configPath(name, file?)` | Resolve `<resolveConfigDir()>/<name>/<file>` (default: `config.json`) — XDG-aware, `~/.config` when `XDG_CONFIG_HOME` doesn't apply |
| `loadJsonConfig<T>(path)` | Read + parse JSON config; `{}` for missing/malformed/non-object |
| `loadJsonConfigWithLegacyFallback<T>(name, file?)` | Prefer the XDG-resolved path; read the legacy `~/.config/<name>/<file>` only when the XDG file is absent. Preferred load entry point for all consumers |
| `saveJsonConfig(path, data)` | Write formatted JSON with mkdir + chmod(0o600); returns `boolean` (false on fs failure) — callers MUST guard the success notification on it |
| `GuidanceFields` | Interface: `{ promptSnippet?: string; promptGuidelines?: string[]; description?: string }` |
| `GuidanceFieldsSchema` | TypeBox form of `GuidanceFields` (`additionalProperties: true`) for callers baking guidance into a larger validated config |
| `validateGuidanceFields(fields)` | Extract valid guidance fields from unknown value |
| `parseModelKey(key)` | Parse `provider/modelId` (or legacy `provider:modelId`) → `{ provider, modelId } \| undefined`; slash preferred |
| `modelKey({provider, id})` | Compose canonical `provider/modelId` string; slash-only emission |
| `readEnvVar(key, fallback?)` | Trimmed env-var lookup with optional fallback |
| `validateConfig<T>(schema, value)` | TypeBox-driven clean + defaults; `{}` on failure |
| `isValidCollapseKeySpec(spec)` | Strict pi-tui KeyId grammar check: distinct modifiers, then a single printable char or a named special key. Strict because `parseKeyId` ignores unknown parts — a loose check turns `ctr+]` into a global `]` capture |
| `formatKeySpecForDisplay(spec)` | Display casing for UI copy (`"ctrl+]"` → `"Ctrl+]"`, `"ctrl+pagedown"` → `"Ctrl+PageDown"`). Display-only — never feed the result back to `matchesKey` |
| `resolveCollapseKeySpec(raw, fallback)` | The ladder: trim + lowercase → `COLLAPSE_KEY_OFF` → the grammar → `fallback`. Applies the typeof guard itself, so a hand-edited non-string is a fallback, not a throw |
| `COLLAPSE_KEY_OFF` | `"off"` — the sentinel that switches a key field off. Deliberately not a valid KeyId, which is why the ladder checks it before validating |
| `CollapseKeySpec` (type) | `string` — a key spec in the grammar above; canonical form is lowercase |

## XDG Config Resolution
`resolveConfigDir()` (private, `config.ts`) honors `XDG_CONFIG_HOME` per spec: unset, empty-after-trim, whitespace-only, or relative values fall back to `~/.config`; the result is always absolute. Tilde contract: bare `~` and leading `~/` expand to the home directory, but `~user` does NOT (XDG defines no such form) — it fails the `isAbsolute` check and silently routes to the default. `loadJsonConfigWithLegacyFallback` pairs the XDG path with an always-legacy `~/.config/<name>/<file>` read so pre-XDG config files survive an operator setting `XDG_CONFIG_HOME` — but the fallback is one-way: a present-but-malformed XDG file warns and returns `{}` rather than silently reading legacy, so corruption is surfaced, not masked.

## Architectural Boundaries
- **NO Pi extension** — no `pi` field, no tools/commands/hooks
- **NO module-level state** — no singletons, no globalThis caches, no side effects at import time
- **NO test/setup.ts beforeEach reset needed** — stateless package has nothing to reset
- **NO `GuidanceFields` logic divergence** — single canonical implementation replaces 4 byte-identical copies
- **The KeyId grammar has one home** — `keyspec.ts`: a consumer supplies only its default (`ctrl+shift+t` / `ctrl+]`), re-exports the rest, and keeps no copy. The display table sits beside the grammar table because it is a function of it (`pageup`/`pagedown` are cased by hand), so a grammar addition and its casing are one edit in one file rather than a coupling held by a comment
- **`saveJsonConfig` returns `boolean`** — `false` on mkdir/write failure (disk full, EACCES, EROFS); callers MUST guard the "Saved …" notification on it. The chmod step is best-effort and never affects the return value
- **`loadJsonConfig` applies typeof guard universally** — rejects null, primitives, arrays (fixes Variant B latent bug)
- **`validateConfig` clones before Clean** — `Value.Clean` mutates; `Value.Clone` prevents caller-side mutation
- **`XDG_CONFIG_HOME` governs the rpiv-* sibling config layer only** — Pi-native paths (`~/.pi/…`, via `PI_CODING_AGENT_DIR`) are an orthogonal concern and intentionally NOT unified here
