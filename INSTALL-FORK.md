# Installing this fork into Pi

This fork is an npm-workspaces monorepo of 15 packages, and **Pi's `git:` source
cannot install it directly**. Install the packages by local path from a checkout
instead.

## Why `pi install git:…` does not work here

Verified against `pi-coding-agent` 0.85.1 (`dist/bundle/chunks/chunk-JVUZSMYM.js`):

- A git source clones the repo and uses the **clone root** as the package root.
  There is no subdirectory support — `hosted-git-info` v9 drops
  `/tree/<ref>/<subdir>`, and `parseGitUrl` only keeps `user/project` + `committish`.
- Resource discovery reads `<root>/package.json`'s `pi` manifest, or the
  conventional `<root>/{extensions,skills,prompts,themes}` directories:

  ```js
  collectPackageResources(packageRoot) {
    if (readPiManifest(join(packageRoot, "package.json"))) { … }
    for (type of ["extensions", "skills", "prompts", "themes"])
      if (existsSync(join(packageRoot, type))) { … }
  }
  ```

The monorepo root declares neither (it is the private `rpiv-mono` root), so
`pi install git:git@github.com:hs1n/pi-monocoque@main` would load **zero resources**.
It would not even get that far: pi runs `npm install --omit=dev` in the clone, and the
root's `"prepare": "husky"` fails because husky is a devDependency —

```
$ npm install --omit=dev       # in a fixture with the same root scripts
> prepare
> husky
sh: husky: command not found
npm error code 127
```

### Why not just add an aggregate `pi` manifest to the root

It would make one-command installs work, but it merges all twelve extensions into a
single module root. Upstream deliberately ships them as separate packages
([`docs/packages.md`](https://github.com/juicesharp/rpiv-mono/blob/main/docs/packages.md):
*"Pi loads packages with separate module roots, so separate installs do not collide"*),
and `rpiv-pi`'s detached-child loader reads each sibling's own manifest flag
(`pi.ambientObserver`) from the owning package's `package.json`. Flattening them
changes that behavior. Not worth it.

## Install

SSH is used for the checkout; Pi then loads the packages from that path.

```bash
# 1. Clone over SSH (needs an SSH key registered on the GitHub account).
git clone git@github.com:hs1n/pi-monocoque ~/src/pi-monocoque

# 2. One-time dependency install — local-path packages resolve deps from here.
cd ~/src/pi-monocoque && npm install

# 3. Install the pipeline into Pi.
scripts/fork-pi-install.sh                 # global
scripts/fork-pi-install.sh -l              # project-local (./.pi/settings.json)
scripts/fork-pi-install.sh --with btw
scripts/fork-pi-install.sh --dry-run
```

The script installs the same sibling set `/rpiv-setup` would
(`packages/rpiv-pi/extensions/rpiv-core/siblings.ts`), plus `@tintinweb/pi-subagents`
from npm, **≥ 0.20.0** — earlier releases declare `typebox` as a `dependencies` entry,
which makes Pi warn at every startup about a duplicate runtime module (and `pi install`
reuses whatever version is already in `~/.pi/agent/npm`, so an unpinned install does not
upgrade it). The script replaces a stale one and never downgrades a newer one.
Skip `/rpiv-setup` afterwards — it would install the **upstream** registry
copies of those siblings next to your fork's local ones.

Update by `git pull` in the checkout, then `/reload` in Pi. Re-run the script only
when the set of packages changes.

### Verify

```bash
pi list          # global
pi list -l       # project-local
```

Local paths are recorded in settings, not copied, so keep the checkout where it is.
If you move it, remove the stale entries (`pi remove <path>`) and re-run the script.

## Executable check

pi's SDK (`@earendil-works/pi-coding-agent`, a root devDependency) can load the
resources headlessly — useful for confirming an install without starting a session:

```js
// .probe.mjs, run from the repo root so node resolves node_modules
import { createAgentSessionServices, SettingsManager } from "@earendil-works/pi-coding-agent";
import { homedir } from "node:os";

const cwd = process.cwd();
const agentDir = `${homedir()}/.pi/agent`;
const settingsManager = SettingsManager.create(cwd, agentDir, { projectTrusted: true });
const services = await createAgentSessionServices({ cwd, agentDir, settingsManager });
const ext = services.resourceLoader.getExtensions();
console.log("extensions:", ext.extensions.map((e) => e.path));
console.log("errors:", ext.errors.map((e) => `${e.path} → ${e.error?.message}`));
process.exit(0);
```

```bash
PI_OFFLINE=1 node .probe.mjs
```

Expected: the eight forks of `rpiv-*` under `packages/`, `errors: 0`.
