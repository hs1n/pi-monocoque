# Installing this repo into Pi

This repo is an 11-package monorepo with npm workspaces. You install it into Pi as a **Pi
source**, not as a registry package. The repo has no publish path, and npm has no `@hs1n/*`
entries for it. Select one of these three install routes:

| You want | Command |
| --- | --- |
| To use it | `pi install git:github.com/hs1n/pi-monocoque` |
| To develop it (`/reload` applies your edits) | `pi install /path/to/pi-monocoque` |
| Each package as a separate entry, plus opt-in packages such as `rpiv-btw` | `scripts/fork-pi-install.sh [--with btw]` |

Each route also needs the third-party package that supplies the `Agent` tool of the pipeline.
That package is not in this repo:

```bash
pi install npm:@tintinweb/pi-subagents@0.26.3
```

Install **one** route only. Do not install two routes together. If Pi loads the same extension
two times, the extension registers its tools two times.

## Why you can install the monorepo root

The Pi `git:` source clones the repo and uses the **clone root** as the package root. It does
not support subdirectories. (`hosted-git-info` v9 drops `/tree/<ref>/<subdir>`, and
`parseGitUrl` keeps only `user/project` and `committish`.) Resource discovery then reads the
`pi` manifest in `<root>/package.json`. If no manifest exists, it reads the conventional
`<root>/{extensions,skills,prompts,themes}` directories:

```js
collectPackageResources(packageRoot) {
  if (readPiManifest(join(packageRoot, "package.json"))) { … }
  for (type of ["extensions", "skills", "prompts", "themes"])
    if (existsSync(join(packageRoot, type))) { … }
}
```

For this reason, the root `package.json` has a `pi` manifest. The manifest lists the seven
extensions and the skill trees (`packages/rpiv-pi/skills`, `skills/matt-pocock`,
`skills/skill-master` and `skills/repo-5s`). This has two results:

- **The manifest of each package stays independent.** Pi loads each extension from its
  package directory. `rpiv-core` reads the `package.json` of each sibling (the
  `pi.ambientObserver` flag and sibling detection). It finds that file when it walks up from
  the resolved path of the extension. The walk stops at the manifest of the package, so a
  root install does not flatten the packages.
- **`prepare` must not fail under `npm install --omit=dev`.** Pi installs the dependencies of
  the clone with `npm install --omit=dev --legacy-peer-deps`. (pnpm uses `--prod`, and bun
  uses `--omit=dev --omit=peer`.) For this reason, the root `prepare` is `husky || true`.
  Husky is a devDependency, so a bare `husky` fails there. If `prepare` fails, the full
  install fails.

## Install

```bash
# 1. Use it. Pi clones the repo, installs the prod deps of the clone, and reads the root pi manifest.
pi install git:github.com/hs1n/pi-monocoque

# 2. The Agent dispatcher (third-party; the parallel skills of rpiv-pi need it).
pi install npm:@tintinweb/pi-subagents@0.26.3

# 3. Restart Pi, or run /reload in a running session.
```

To update, run `pi update git:github.com/hs1n/pi-monocoque`. It pulls and installs again. To
update all sources, run `pi update`.

### Develop it

A local-path install points at your working copy, so your edits are live:

```bash
cd /path/to/pi-monocoque
npm install                                  # workspace deps link from here
pi install /path/to/pi-monocoque             # the same root pi manifest
```

`pi install` records the path and does not copy it. `/reload` applies your edits with no new
install. To remove it, run `pi remove /path/to/pi-monocoque`.

### Install each package from its path

`scripts/fork-pi-install.sh` installs `rpiv-pi` and each sibling in the `SIBLINGS` registry of
`rpiv-pi` (`packages/rpiv-pi/extensions/rpiv-core/siblings.ts`). It always installs the seven
packages that the root manifest loads. It installs each package from its package path, as a
separate Pi entry. `--with` adds an opt-in package. Use the script when you want an opt-in
package, such as `rpiv-btw`:

```bash
scripts/fork-pi-install.sh                 # global
scripts/fork-pi-install.sh -l              # project-local (./.pi/settings.json)
scripts/fork-pi-install.sh --with btw      # add the opt-in side-conversation command
scripts/fork-pi-install.sh --dry-run
```

The script also sets a minimum version of `0.20.0` for `@tintinweb/pi-subagents`. Below that
version, it installs `0.26.3`. Earlier releases declare `typebox` in `dependencies`. Because of
this, Pi shows a duplicate runtime module warning at each startup. `pi install` does not upgrade
a version that is already in `~/.pi/agent/npm`, so the script does this step.

### Verify

```bash
pi list          # global
pi list -l       # project-local
```

A root install shows as one entry (the repo path or the git source). The headless check below
reports the extensions and skills that a settings file resolves:

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

Expected result: seven extensions under `packages/` (or under the clone in
`~/.pi/agent/git/`), and `errors: 0`. To run the check against an isolated settings file, set
`PI_CODING_AGENT_DIR` to a scratch directory. Your real install then stays unchanged.

## `/rpiv-setup` installs from this checkout

`/rpiv-setup` reads the sibling registry (`siblings.ts`). It installs each sibling that is not
declared and not loaded. This repo has no publish path, so `resolveInstallSpec()` maps each
`npm:@hs1n/rpiv-*` entry to the local package directory. A third-party entry
(`@tintinweb/pi-subagents`) keeps its npm spec. Thus the command is safe to run here. It cannot
pull an upstream copy of these extensions, because no such registry entry exists.

With no UI, `/rpiv-setup` lists the changes and tells you to run `/rpiv-setup --yes`.
`/rpiv-setup --yes` applies the changes with no confirmation.
