# @hs1n/rpiv-test-utils

The shared fixture library for the tests in this monorepo. It has mock [Pi Agent](https://github.com/badlogic/pi-mono) extension APIs, scripted child sessions, synthetic transcripts and host-environment stubs. It is internal to this repo. It is `private: true`, it is not published to npm, and the Pi host does not load it.

## What it provides

- **A mock Pi that you inspect, not stub**: `createMockPi()` gives `{ pi, captured }`. Each `registerTool`, `registerCommand`, `registerShortcut`, `registerFlag`, `on` and `events.emit` call goes into a typed bucket. Your test asserts on the buckets after the call.
- **Scripted child sessions**: `createMockSessionChain({ steps })` takes one step for each `spawnChild()` call (`branch`, `cancelled`, `toolTimeout`, `sessionFile`). It collects `sentMessages`, `notifications` and `statusUpdates` from all children.
- **Synthetic transcripts from plain literals**: `buildSessionEntries()` with `makeUserMessage`, `makeAssistantMessage` and `makeToolResult` gives you `SessionEntry[]`. The `as unknown as` casts stay here, not in your test file.
- **One host stub for each concern**: `stubFetch` (matcher-driven, records each call), `stubGitExec`, `makeSpawnStub`, `writeGuidanceTree`, and `makeTheme`/`makeTui` for view tests with no ANSI codes.
- **Structural tool-contract checks**: `assertToolContract(tool, { name, requiredFields, optionalFields })` checks the name, the description, `execute` and the exact `required` set. It does not need a schema library.
- **Ship-manifest checks**: `verifyShipManifest(import.meta.url)` compares the production `.ts` tree of a package on disk with the `files` list in `package.json`, in both directions. It reports `missing` and `stale`.

For the full export list with signatures and defaults, see [docs/api.md](./docs/api.md). For the ship-manifest rules and the manifest of this package, see [docs/ship-manifest.md](./docs/ship-manifest.md). For design notes, see [architecture.md](../../.rpiv/guidance/packages/test-utils/architecture.md).

## Used by

Nine workspace packages use it, in 70 `*.test.ts` files. All packages except `rpiv-side-call` and this package import it. npm workspaces put a symlink to the package in `node_modules/`, so you do not need a `devDependencies` entry. Import it by its bare name:

```ts
import { createMockPi, stubGitExec } from "@hs1n/rpiv-test-utils";
```

The fixtures work only with vitest. Each factory calls `vi`, and the package is TypeScript source, so plain node or a different runner cannot load it. The root `vitest.config.ts` runs only test files that match `packages/*/**/*.test.ts`. Run the tests from the repo root:

```sh
npm test              # whole suite
npx vitest run packages/test-utils/manifest.test.ts   # one file
```

## Conventions

- **Do not use fixtures in production code.** An import would put `vi` into the runtime bundle. The only permitted coupling is a type-only import of the types of a declared dependency.
- **Use `as unknown as` casts here and nowhere else.** pi-ai and pi-coding-agent do not export all internal discriminators. When the casts stay in fixtures, they do not go into runtime types.
- **Factories return capture buckets.** If you override one call at a time, add a factory variant.
- **Globals restore themselves.** The repo sets `unstubGlobals: true`, so `stubFetch` needs no manual teardown.
