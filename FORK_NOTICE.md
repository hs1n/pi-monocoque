# Fork notice

This repository is a **personal fork** of **rpiv-mono**. [@hs1n](https://github.com/hs1n)
maintains it. The upstream author **does not endorse or support** this fork, and the fork has
no affiliation with the upstream author.

| | |
| --- | --- |
| Upstream | `juicesharp/rpiv-mono` on GitHub |
| Upstream author | Sergii Guslystyi ([@juicesharp](https://github.com/juicesharp), [rpiv-pi.com](https://rpiv-pi.com)) |
| This fork | https://github.com/hs1n/pi-monocoque |
| Forked from | `main` @ `d74b1c99830a565f3df3f37e0a36616d17ffc574` (v2.11.x) |
| Upstream merged through | `main` @ `2d88b79c`: v2.13.8, 2026-10-12 (the final sync; the remote was removed after it) |
| Current version | 3.0.0 |
| License | MIT. See [`LICENSE`](./LICENSE) and `packages/*/LICENSE` |

## License and attribution

Upstream uses the MIT license. The MIT terms are the only condition on reuse. This fork
satisfies them because it **keeps each upstream copyright notice and license text unchanged**:

- `LICENSE` (root)
- `packages/*/LICENSE`: **8 files today**, and 12 at the fork point. The fork deleted four of
  them with their packages: `rpiv-site`, `rpiv-voice`, `rpiv-warp` and (in 3.0.0)
  `rpiv-workflow`. `rpiv-telemetry`, `rpiv-config` and `test-utils` never had one.

A **second, unrelated MIT grant** covers `skills/matt-pocock/`. These files are the engineering
skills of Matt Pocock, copied from [`mattpocock/skills`](https://github.com/mattpocock/skills).
The copy lets a clone reproduce the setup without a dependency on an unversioned directory under
`$HOME`. The files do not belong to upstream or to this fork. Their `LICENSE` stays with them,
because that is the only condition of the license.

One file in that set **is** changed. `grilling/SKILL.md` has a paragraph from this fork that
copies its design tree into the Pi `todo` tool. Thus, an update must copy the other 21 files
verbatim and then apply that one edit again. Do not copy the full set without this check. The
`README.md` of that directory lists the parts that were not copied, why they must stay out, and
the drift record.

A **third-party Apache-2.0 grant** covers `skills/skill-master/`. It is a **changed derivative**
of the `skill-creator` skill by Anthropic, from the `claude-plugins-official` plugin marketplace
of Claude Code. The fork changed it to work with Pi. Its `LICENSE.txt` stays with it, and its
`README.md` states each change, as Apache-2.0 §4(b) requires for a changed copy. This fork edits
`skills/skill-master/` in place and maintains it, unlike `skills/matt-pocock/`.

The commits of this fork also mark its changes. The changes do not replace or relicense the
upstream parts. If you distribute this work again, you must keep the same notices.

## What this fork changes

**The fork stopped at upstream v2.13.8. It is now an independent project, not a tracking
fork.** The fork point was v2.11.x. The maintainer merged `upstream/main` @ `2d88b79c` (v2.13.8,
2026-10-12) as the **final** upstream sync, and then removed the `upstream` remote. The fork has
no merge path, and none is planned. The maintainer writes any later fixes and features here. To
examine an upstream commit later, cherry-pick that one commit. Do not merge an upstream branch.

The changes on top of v2.13.8 are in three groups.

**Identity and provenance changes:**

- The README has a fork banner. CI and badges do not point at the upstream repository or at
  Codecov. Codecov upload was removed from `.github/workflows/ci.yml`, because it needed the OIDC
  identity of upstream and failed the build in a fork.
- **The workspace scope is `@hs1n`, not `@juicesharp`.** `scripts/fork-rename-scope.mjs` changed
  each reference to the packages of *this* repo: package names, dependencies, peers, source
  imports, package READMEs and docs, and package agent guidance. The script takes the scope as a
  parameter, because the owner of the npm account (`npm whoami`) sets the correct scope. Each
  `package.json` has `author: hs1n` and a `contributors` entry for juicesharp. Thus the metadata
  also records upstream authorship, not only LICENSE.
- Some files describe *upstream*: this notice, `.rpiv/guidance/architecture.md`, the
  `CHANGELOG.md` bodies and `docs/upstream/`. These files can still name `@juicesharp` and the
  upstream repo, because they are records of upstream.
- **The fork has no npm distribution route.** The upstream release pipeline is gone.
  `scripts/release.mjs` is deleted, and so are the root `publish*`, `release:*` and `version:*`
  scripts. Nothing here is published to a registry. You install the repo into Pi as a Pi source.
- The root `package.json` has a `pi` manifest. The manifest lists the seven extensions and the
  skill trees (`packages/rpiv-pi/skills`, `skills/matt-pocock`, `skills/skill-master` and
  `skills/repo-5s`). Because of this manifest, `pi install git:github.com/hs1n/pi-monocoque`
  works. Pi clones the repo, uses the clone root as the package root, and runs
  `npm install --omit=dev` there. For this reason, the root `prepare` is `husky || true`.
- A local-checkout install (`pi install <checkout>`) loads the same manifest live.
  `scripts/fork-pi-install.sh` installs the packages one at a time from their paths. The root
  `package.json` is the only source of the lockstep version (`npm run versions:sync`).

**Deletions:**

- **The fork deleted four packages: `rpiv-site`, `rpiv-telemetry`, `rpiv-voice` and
  `rpiv-warp`.** Pi did not load any of them here, because all four were opt-in or private. Thus
  the deletion changed no runtime behavior. It removed the Astro site and its dependency tree,
  the MLflow instrumentation, the local-dictation extension and the Warp terminal bridge. It also
  removed their guidance files, tests, CI and config. The only consumer of `rpiv-warp` in the
  tree was `workflow-question-warp-bridge.ts` in `rpiv-core`, and the fork deleted it too.
  `scripts/fork-pi-install.sh` now accepts only `--with btw`. To add one of the packages again,
  use `git revert` on the deletion, then `pi install`.
- The fork deleted `packages/rpiv-site/public/CNAME`, so the site does not claim
  `rpiv-pi.com`. The fork also deleted `.github/workflows/deploy-site.yml`. Thus this fork cannot
  publish a site.
- **In 3.0.0, the fork deleted the `/wf` workflow runtime and the `rpiv-workflow` package.**
  This removed the typed graph, its four built-in workflows, the lane dock and `/lanes`. Agents
  now use the Pi `Agent` and `SubagentWorkflow` tools for multi-stage work. `/rpiv-setup` removes
  an installed `rpiv-workflow`. See
  [ADR 0005](./docs/adr/0005-the-typed-workflow-runtime-is-removed.md).
- With the runtime, the fork removed the `contract:` blocks from skill frontmatter and the
  `stages` and `presets` scopes from `models.json`. It also removed the `annotate-inline` and
  `migrate-to-guidance` skills, and the `packages/rpiv-pi/scripts/` CLI.

**Behavior changes:**

- **`zh-TW` (繁體中文) is in the locale picker**, with `locales/zh-TW.json` in `rpiv-todo` and
  `rpiv-ask-user-question`. The fork also fixed the `LANG` region, so the picker can select
  `zh-TW`. The ambiguous `zh` label now reads `简体中文`. The fork did not change the upstream
  `zh.json` maps. In `rpiv-ask-user-question`, those maps do not have three keys that `en.json`
  has (`review.global_hint`, `review.note_label` and `notes.global_header`). These keys show in
  English.
- The fork throttles guidance injection. The tool path injects only the deepest guidance file.
  A repeated `session_start` does not inject again for a session that already has the context.
- The guidance docs are split into rules that Pi injects and an on-demand `details.md`.
- `/rpiv-setup` resolves the siblings of this repo to local paths. It accepts `--yes`, so it
  works with no UI. `/rpiv-models`, `/advisor` and `/languages` also accept arguments.
- A session shows a warning when a skill copy with a higher precedence hides a bundled skill.
- **`grilling` is the one copied Matt Pocock skill that this fork edits.** It copies its design
  tree into the Pi `todo` tool. Each decision is a task, each prerequisite is a `blockedBy`, and
  the frontier is the set of unblocked pending tasks. Thus the full tree stays visible in the todo
  overlay for the session. The MIT grant covers it, as it covers the other files of the set.
  `skills/matt-pocock/README.md` and `PROVENANCE.json` record the drift, so a verbatim copy does
  not remove it without a warning.

The commit history records each later change.

## Names and trademarks

`rpiv`, `rpiv-pi`, `juicesharp`, `rpiv-pi.com` and the npm scope **`@juicesharp`** identify the
upstream project and its author. This fork:

- uses its own scope **`@hs1n`** for the packages that it builds, and publishes **nothing**. It
  does not publish to `@juicesharp` (not our scope) or to a different location (the repo has no
  publish path).
- does **not** operate `rpiv-pi.com`.
- does not show itself as the upstream project.

The GitHub repository name `pi-monocoque` is intentionally different from the upstream name.

## Upstream prose in this repository

The upstream README and roadmap are kept verbatim at `docs/upstream/README.md` and
`docs/upstream/roadmap.md`, so attribution stays complete. The repo URLs and `@juicesharp`
package names in them are correct, because they describe upstream. The root `README.md` is the
front page of this fork.

The package READMEs and the `docs/` files under `packages/` started from upstream prose. The fork
changed their package names and repo links to the `@hs1n` scope and this repo. The fork also
rewrote them to describe the fork as it is now.

Some sections in `docs/upstream/` give the views of the **upstream author**, not the views of the
maintainer of this fork. Examples are *Roadmap*, *Who built this*, *Contributions* and *Status
and expectations*, with the statements about Codemasters International and the professional role
of the author. The fork keeps them for provenance. They are not an endorsement, and they do not
state the position of this fork.

## Data flows you should know about

This is upstream behavior, and the fork did not change it. If you run the software, know these
facts:

- `rpiv-web-tools` sends queries and URLs to the third-party search or fetch provider that you
  configure, with your own API keys.
- The pipeline sends your source code and prompts to the model provider that you select.

The terms and the privacy policy of each third party apply.

## Third-party licenses

MIT covers the code of upstream. It does not cover the dependency tree. Upstream ships no
`NOTICE` or `COPYING` file and no third-party inventory. `scripts/fork-license-audit.mjs` reads
the installed tree and gives a summary. Run it after `npm install`:

```
node scripts/fork-license-audit.mjs .
```

Two snapshots are important. When the fork deleted `rpiv-site`, it also removed most of the
inventory with the Astro and Vite tree.

**At the fork point**: 633 deduplicated `name@version` entries:

| License | Count |
| --- | ---: |
| MIT | 435 |
| Apache-2.0 | 118 |
| ISC | 31 |
| BSD-3-Clause | 21 |
| BSD-2-Clause | 9 |
| BlueOak-1.0.0 | 7 |
| MIT OR Apache-2.0 | 2 |
| CC0-1.0 | 2 |
| MPL-2.0 | 2 |
| 0BSD / OFL-1.1 / LGPL-3.0-or-later / Python-2.0 / UNKNOWN | 1 each |

**Today**: 248 entries: MIT 168 · Apache-2.0 39 · BSD-3-Clause 18 · ISC 15 ·
MIT OR Apache-2.0 2 · MPL-2.0 2 · BlueOak-1.0.0 2 · 0BSD 1 · Unlicense 1.

**Two** entries are flagged (copyleft, restrictive or unknown): `lightningcss@1.33.0` and
`lightningcss-darwin-arm64@1.33.0`. Both use MPL-2.0, and both come through `vitest → vite`.
MPL-2.0 is copyleft at the file level. This fork does not change or distribute these files, so
no obligation applies.

The fork-point audit flagged three entries that are now gone with their packages:
`@img/sharp-libvips-darwin-arm64` (LGPL-3.0-or-later), `zod-to-ts` (no `license` field, through
`astro`) and `@fontsource/jetbrains-mono` (OFL-1.1). All three were `rpiv-site` dependencies.
Thus the LGPL question and the missing-license question do not apply to this tree. A `git revert`
of that deletion brings them back.

Run the script again after dependency changes. A new copyleft or `UNKNOWN` entry in the
`dependencies` of a package blocks a publish. But nothing here has a publish path.

## Support and warranty

Upstream has no obligation to support this fork. Do not send issues about this fork to upstream.
The MIT warranty disclaimer applies: this software is provided "as is", without warranty of any
kind.
