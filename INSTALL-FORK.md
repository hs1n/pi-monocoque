# Installing this repo into Pi

This is a 11-package npm-workspaces monorepo. It is installed into Pi as a **Pi
source**, not as a registry package: there is no publish path here, and the repo has no
`@hs1n/*` entries on npm. Three ways to install, in order of how you should pick:

| You want | Command |
| --- | --- |
| Just use it | `pi install git:github.com/hs1n/pi-monocoque` |
| Develop it (edits picked up by `/reload`) | `pi install /path/to/pi-monocoque` |
| Only some packages / opt-ins like `rpiv-btw` | `scripts/fork-pi-install.sh [--with btw]` |

All three need one extra install for the pipeline's `Agent` tool, which is a third-party
package and does not live in this repo:

```bash
pi install npm:@tintinweb/pi-subagents@0.21.0
```

Install **one** of the three, never two at once — the same extension loaded twice
registers its tools twice.

## Why the monorepo root is installable at all

Pi's `git:` source clones the repo and uses the **clone root** as the package root, with
no subdirectory support (`hosted-git-info` v9 drops `/tree/<ref>/<subdir>`; `parseGitUrl`
keeps only `user/project` + `committish`). Resource discovery then reads
`<root>/package.json`'s `pi` manifest, or the conventional
`<root>/{extensions,skills,prompts,themes}` directories:

```js
collectPackageResources(packageRoot) {
  if (readPiManifest(join(packageRoot, "package.json"))) { … }
  for (type of ["extensions", "skills", "prompts", "themes"])
    if (existsSync(join(packageRoot, type))) { … }
}
```

So the root `package.json` carries a `pi` manifest listing all eight extensions plus
`packages/rpiv-pi/skills`. Two consequences worth knowing:

- **The per-package manifests stay independent.** Extensions load from
  `packages/rpiv-<name>/index.ts`, and `rpiv-core` reads each sibling's own
  `package.json` (the `pi.ambientObserver` flag, sibling detection) by walking up from the
  extension's resolved path — that still lands on the package's own manifest, which is why
  a root install is not a flattening of the packages.
- **`prepare` must survive `npm install --omit=dev`.** Pi installs the clone's
  dependencies with `npm install --omit=dev --legacy-peer-deps` (npm; `--prod` for pnpm,
  `--omit=dev --omit=peer` for bun), so the root `prepare` is `husky || true` — a bare
  `husky` fails there because husky is a devDependency, and a failing `prepare` fails the
  whole install.

## Install

```bash
# 1. Use it — Pi clones, installs the clone's prod deps, reads the root pi manifest.
pi install git:github.com/hs1n/pi-monocoque

# 2. The Agent dispatcher (third-party, rpiv-pi's parallel skills need it).
pi install npm:@tintinweb/pi-subagents@0.21.0

# 3. Restart Pi, or /reload in a running session.
```

Updates: `pi update git:github.com/hs1n/pi-monocoque` (re-pulls and re-installs), or
`pi update` for everything.

### Developing it instead

A local-path install points at your working copy, so edits are live:

```bash
cd /path/to/pi-monocoque
npm install                                  # workspace deps link from here
pi install /path/to/pi-monocoque             # the same root pi manifest
```

`pi install` records the path, it does not copy — `/reload` picks up edits with no
reinstall. Remove with `pi remove /path/to/pi-monocoque`.

### Per-package install

`scripts/fork-pi-install.sh` installs the sibling set `rpiv-pi`'s `SIBLINGS` registry
expects (`packages/rpiv-pi/extensions/rpiv-core/siblings.ts`), each by its own package
path, which is what you want when you do **not** want the whole set:

```bash
scripts/fork-pi-install.sh                 # global
scripts/fork-pi-install.sh -l              # project-local (./.pi/settings.json)
scripts/fork-pi-install.sh --with btw      # add the opt-in side-conversation command
scripts/fork-pi-install.sh --dry-run
```

It also floors `@tintinweb/pi-subagents` at `0.20.0` — earlier releases declare `typebox`
as a `dependencies` entry, which makes Pi warn at every startup about a duplicate runtime
module, and `pi install` keeps whatever version is already in `~/.pi/agent/npm` rather
than upgrading it.

### Verify

```bash
pi list          # global
pi list -l       # project-local
```

A root install shows as one entry (the repo path or the git source). The headless check
below reports the extensions and skills a settings file actually resolves:

```js
// .probe.mjs, run from the repo root so node resolves node_modules
import { createAgentSessionServices, SettingsManager } from "@earendil-works/pi-coding-agent";

const cwd = process.cwd();
const agentDir = `${process.env.HOME}/.pi/agent`;
const settingsManager = SettingsManager.create(cwd, agentDir, { projectTrusted: true });
const services = await createAgentSessionServices({ cwd, agentDir, settingsManager });
const ext = services.resourceLoader.getExtensions();
console.log("extensions:", ext.extensions.map((e) => e.resolvedPath ?? e.path));
console.log("errors:", ext.errors.map((e) => `${e.path} → ${e.error?.message}`));
process.exit(ext.errors.length === 0 ? 0 : 1);
```

```bash
PI_OFFLINE=1 node .probe.mjs
```

Expected: eight extensions under `packages/` (or under the clone in `~/.pi/agent/git/`),
`errors: 0`. Set `PI_CODING_AGENT_DIR` to a scratch directory to run that check against
an isolated settings file without touching your real install.

## Do not run `/rpiv-setup`

`/rpiv-setup` installs the sibling registry's `npm:@hs1n/rpiv-*` entries — names that do
not exist on any registry, because this fork has no publish path. It cannot install
anything here; use one of the three installs above.
