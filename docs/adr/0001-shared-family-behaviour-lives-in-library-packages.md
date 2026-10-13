# Shared family behaviour lives in library packages, not cross-sibling imports

Siblings in this monorepo must be loadable independently, which the zero-cross-imports
contract enforces by forbidding runtime imports between them. The cost surfaced as three
near-identical `pi-compat.ts` files — 213 lines of host-version-tolerant code, two of them
byte-identical, each carrying a comment explaining that it is duplicated *because* siblings
never import each other. The decision: when behaviour is genuinely shared, it moves into a
non-extension **library package** that consumers declare in `dependencies` — the shape
`rpiv-config` (and `test-utils`) already established — rather than being re-implemented per
package.

The contract's purpose is that no extension depends on another extension being installed. A
library package satisfies it while giving the shared contract one home, so the extraction is
compatible with the rule rather than an exception to it.

## Considered Options

- **Keep duplicating per package** — rejected: the copies are already 213 lines and one of the
  three has deliberately diverged (a two-code resolution-failure set where the others match
  three), so drift is not hypothetical.
- **Import across siblings** — rejected: breaks the contract; a sibling must not need another
  sibling present to load.
- **Deepen an existing library package instead of adding one** — rejected: it gives that module
  a second, unrelated reason to change. `rpiv-config` is the shared config I/O module; host
  compatibility varies with the Pi version, config I/O with the config format.

## Consequences

Each extraction pays a package's boilerplate — `package.json`, `CHANGELOG.md`, a guidance
`architecture.md`, and a lockstep version — so it earns its keep only when the shared surface
has a name of its own and more than one real consumer. A library package is never a sibling: no
`pi` field, no `siblings.ts` entry, and no line in the root `pi` manifest.
