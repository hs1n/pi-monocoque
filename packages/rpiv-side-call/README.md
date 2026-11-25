# @hs1n/rpiv-side-call

The host-version-tolerant surface a sibling uses to make a one-off model call outside the
main [Pi Agent](https://github.com/badlogic/pi-mono) transcript. It is internal to the
[pi-monocoque](https://github.com/hs1n/pi-monocoque) monorepo, and nothing is published. It is
not a Pi extension: it has no `pi` field and no line in the root `pi` manifest.

## What it provides

Three functions and three types, from one entry point.

| Export | What it does |
| --- | --- |
| `resolveSideCall(modelRegistry)` | Reports which path this host takes, synchronously. `mode: "facade"` when the registry exposes a `ModelRuntime` with `completeSimple`; `mode: "global"` otherwise. |
| `loadIsContextOverflow()` | Loads pi-ai's `isContextOverflow`. Returns `undefined` when the host exports it from neither entrypoint, so a caller skips its retry instead of crashing. |
| `stripToolDeclarations(messages)` | Drops `toolsAdded` / `toolsRemoved` from copied `system` messages, so the executor's tools are not callable in the side call. Keeps the prompt text. |
| `SideCallDispatch` | `{ mode, completeSimple }`. `completeSimple` is a thunk that resolves the callable. |
| `CompleteSimpleFn`, `IsContextOverflowFn` | Types of pi-ai's `completeSimple` and `isContextOverflow`. |

```ts
import { resolveSideCall } from "@hs1n/rpiv-side-call";

const dispatch = resolveSideCall(ctx.modelRegistry);
const completeSimple = await dispatch.completeSimple();
```

On a `facade` host, pass only `{ signal }` — the runtime applies credential-derived fields
itself. On a `global` host, pass `apiKey` and `headers` explicitly.

## Used by

| Package | Uses |
| --- | --- |
| [`rpiv-advisor`](https://github.com/hs1n/pi-monocoque/tree/main/packages/rpiv-advisor) | `resolveSideCall`, `stripToolDeclarations` |
| [`rpiv-btw`](https://github.com/hs1n/pi-monocoque/tree/main/packages/rpiv-btw) | `resolveSideCall`, `loadIsContextOverflow`, `stripToolDeclarations` |

Consumers declare it in `dependencies` and resolve it through the workspace links. It is
versioned in lockstep with them. Why this is a library package and not a sibling import:
[ADR 0001](https://github.com/hs1n/pi-monocoque/blob/main/docs/adr/0001-shared-family-behaviour-lives-in-library-packages.md).

## Conventions

- **`/compat` first, package root only on a resolution failure.** Pi >= 0.80.1 exports the
  global dispatch API from `@earendil-works/pi-ai/compat`; hosts <= 0.79.x export it from the
  root. Any other `/compat` error rethrows, so a real init failure surfaces at the call site.
- **pi-ai is the host's copy.** It is a `peerDependency` of `*`, so neither entrypoint is a
  static import.
- **TypeScript source, ESM only.** `exports` points at `./index.ts`, with no compiled build.
- **One place to migrate.** pi-ai documents `/compat` as temporary; when it goes, change this
  package, not its consumers.
