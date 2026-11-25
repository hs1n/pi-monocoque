# @hs1n/rpiv-side-call

A sibling uses this package to make a one-off model call outside the main
[Pi Agent](https://github.com/badlogic/pi-mono) transcript. It works on old and new host
versions. It is internal to the [pi-monocoque](https://github.com/hs1n/pi-monocoque) monorepo,
and it is not published. It is not a Pi extension: it has no `pi` field and no line in the
root `pi` manifest.

## What it provides

Three functions and three types, from one entry point.

| Export | What it does |
| --- | --- |
| `resolveSideCall(modelRegistry)` | Tells you which path this host uses, synchronously. It gives `mode: "facade"` when the registry has a `ModelRuntime` with `completeSimple`. Otherwise it gives `mode: "global"`. |
| `loadIsContextOverflow()` | Loads `isContextOverflow` from pi-ai. It returns `undefined` when neither entrypoint of the host exports it. Then the caller skips its retry and does not crash. |
| `stripToolDeclarations(messages)` | Removes `toolsAdded` / `toolsRemoved` from copied `system` messages, so the side call cannot call the tools of the executor. It keeps the prompt text. |
| `SideCallDispatch` | `{ mode, completeSimple }`. `completeSimple` is a thunk that resolves the callable. |
| `CompleteSimpleFn`, `IsContextOverflowFn` | The types of `completeSimple` and `isContextOverflow` from pi-ai. |

```ts
import { resolveSideCall } from "@hs1n/rpiv-side-call";

const dispatch = resolveSideCall(ctx.modelRegistry);
const completeSimple = await dispatch.completeSimple();
```

On a `facade` host, give only `{ signal }`. The runtime adds the credential fields itself. On a
`global` host, give `apiKey` and `headers` explicitly.

## Used by

| Package | Uses |
| --- | --- |
| [`rpiv-advisor`](https://github.com/hs1n/pi-monocoque/tree/main/packages/rpiv-advisor) | `resolveSideCall`, `stripToolDeclarations` |
| [`rpiv-btw`](https://github.com/hs1n/pi-monocoque/tree/main/packages/rpiv-btw) | `resolveSideCall`, `loadIsContextOverflow`, `stripToolDeclarations` |

Consumers declare it in `dependencies` and resolve it through the workspace links. It has the
same version as its consumers (lockstep). For the reason that this is a library package and
not a sibling import, see
[ADR 0001](https://github.com/hs1n/pi-monocoque/blob/main/docs/adr/0001-shared-family-behaviour-lives-in-library-packages.md).

## Conventions

- **Try `/compat` first. Use the package root only if `/compat` does not resolve.** Pi 0.80.1
  and later export the global dispatch API from `@earendil-works/pi-ai/compat`. Hosts 0.79.x
  and earlier export it from the root. Other `/compat` errors are thrown again, so a real init
  failure shows at the call site.
- **pi-ai is the copy of the host.** It is a `peerDependency` of `*`, so neither entrypoint is
  a static import.
- **TypeScript source, ESM only.** `exports` points to `./index.ts`. There is no compiled build.
- **One place to change.** pi-ai says that `/compat` is temporary. When it goes, change this
  package, not its consumers.
