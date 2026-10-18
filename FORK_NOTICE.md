# Fork notice

This repository is a **personal fork** of **rpiv-mono**, maintained by [@hs1n](https://github.com/hs1n).
It is **not affiliated with, endorsed by, or supported by** the upstream author.

| | |
| --- | --- |
| Upstream | https://github.com/juicesharp/rpiv-mono |
| Upstream author | Sergii Guslystyi ([@juicesharp](https://github.com/juicesharp), [rpiv-pi.com](https://rpiv-pi.com)) |
| This fork | https://github.com/hs1n/pi-monocoque |
| Forked from | `main` @ `d74b1c99830a565f3df3f37e0a36616d17ffc574` (v2.11.x) |
| Upstream merged through | `main` @ `2d88b79c` — v2.13.8, 2026-10-12 (final sync; the remote was removed afterwards) |
| License | MIT — see [`LICENSE`](./LICENSE) and `packages/*/LICENSE` |

## License and attribution

Upstream is MIT licensed. The MIT terms are the only condition on reuse, and they are
satisfied here by **keeping every upstream copyright notice and license text unmodified**:

- `LICENSE` (root)
- `packages/*/LICENSE` — **9 files today**, 12 at the fork point. The three that went were
  `rpiv-site`, `rpiv-voice` and `rpiv-warp`, deleted along with their packages;
  `rpiv-telemetry`, `rpiv-config` and `test-utils` have never carried one.

A **second, unrelated MIT grant** covers `skills/matt-pocock/` — Matt Pocock's engineering
skills, vendored into this repo from [`mattpocock/skills`](https://github.com/mattpocock/skills)
so that a clone reproduces the setup instead of depending on an unversioned directory under
`$HOME`. Those files are neither upstream's nor this fork's; their `LICENSE` travels with them
because that is the licence's only condition. One file in that set **is** modified:
`grilling/SKILL.md` gained this fork's paragraph mirroring its design tree into Pi's `todo` tool,
so an update should re-copy the other 21 verbatim and re-apply that single edit rather than copying
the whole set blindly — see that directory's `README.md` for what was deliberately left out, why
leaving it out is load-bearing, and the drift record.

A **third-party Apache-2.0 grant** covers `skills/skill-master/` — a **modified derivative** of
Anthropic's `skill-creator`, taken from Claude Code's `claude-plugins-official` plugin marketplace
and retargeted at Pi. Its `LICENSE.txt` travels with it, and its `README.md` states every change,
which is what Apache-2.0 §4(b) asks of a modified copy. Unlike `skills/matt-pocock/`, this one is
edited in place and maintained as part of the fork.

Modifications made in this fork are additionally marked in their own commits. They do not
replace or relicense the upstream portions. Anyone redistributing this work must keep the
same notices.

## What this fork changes

Only the following divergences exist, and they are all provenance/identity fixes rather
than behavioral changes:

- **Frozen at upstream v2.13.8 — this is a standalone project now, not a tracking fork.**
  The fork point was v2.11.x; `upstream/main` @ `2d88b79c` (v2.13.8, 2026-10-12) was merged in
  as the **final** upstream sync, and the `upstream` remote was then removed. There is no
  merge path any more and none is planned: upstream's later fixes and features are the
  maintainer's to write here. What rides on top of that revision is the scope rename, the
  four deletions below, the fork's own install path and provenance docs, and six behavioral
  changes: the `zh-TW` locale (+ the `LANG` region fix that makes it reachable),
  guidance-injection throttling, the guidance docs split into auto-injected rules +
  on-demand `details.md`, `.agents/skills` contract harvesting, project-trust gating for
  that harvest, and local-path resolution in `/rpiv-setup`.
  (To consult upstream later without adopting tracking: `git remote add upstream
  https://github.com/juicesharp/rpiv-mono.git && git fetch upstream`, then `git
  cherry-pick <sha>` — take a commit; don't merge a branch.)
- README fork banner; CI/badges no longer point at the upstream repository or Codecov.
- `packages/rpiv-site/public/CNAME` removed; the site's canonical URL no longer claims
  `rpiv-pi.com`.
- `.github/workflows/deploy-site.yml` is deleted (it was manual-only after the fork point,
  then removed along with `rpiv-site`), so this fork can never publish a site, automatically
  or otherwise.
- **Four packages are deleted outright: `rpiv-site`, `rpiv-telemetry`, `rpiv-voice`,
  `rpiv-warp`.** None of them was loaded by Pi here (all four were opt-in or private), so
  removing them changes no runtime behavior — it removes the Astro site and its dependency
  tree, the MLflow instrumentation, the local-dictation extension, and the Warp terminal
  bridge, along with the guidance files, tests, and CI/config wiring that pointed at them.
  `rpiv-warp`'s only in-tree consumer was the guarded `workflow-question-warp-bridge.ts` in
  `rpiv-core`, which is deleted with it. `scripts/fork-pi-install.sh` now takes only
  `--with btw`. Re-adding one of those packages is a `git revert` of this deletion plus a
  `pi install`.
- Codecov upload removed from `.github/workflows/ci.yml` (it required upstream's OIDC
  identity and failed the build in a fork).
- **The workspace scope is `@hs1n`, not `@juicesharp`.** Every reference that describes
  *this* repo's packages — package names, dependencies, peers, source imports, per-package
  READMEs and docs, per-package agent guidance — was retargeted by
  `scripts/fork-rename-scope.mjs`, which is parameterized because the authoritative scope is
  whatever npm account owns it (`npm whoami`). Each `package.json` also carries `author: hs1n`
  plus a `contributors` entry for juicesharp, so upstream authorship survives in the metadata
  and not just LICENSE. Files that describe *upstream* — this notice, `README.md`,
  `.rpiv/guidance/architecture.md`, and the per-package `CHANGELOG.md` bodies — were
  deliberately left naming `@juicesharp` and upstream's repo URLs, because they are records
  of or statements about upstream rather than about this fork's artifacts.
- **There is no npm distribution route.** Upstream's release pipeline is gone:
  `scripts/release.mjs` is deleted, and the root `publish*` / `release:*` / `version:*`
  scripts with it. Nothing here is published to a registry; the repo is installed into Pi as
  a Pi source. The root `package.json` carries a `pi` manifest (the eight extensions +
  `packages/rpiv-pi/skills`) so `pi install git:github.com/hs1n/pi-monocoque` works — Pi
  clones the repo, treats the clone root as the package root, and runs
  `npm install --omit=dev` there, which is why the root `prepare` is `husky || true`. A
  local-checkout install (`pi install <checkout>`) loads the same manifest live, and
  `scripts/fork-pi-install.sh` still installs the packages individually by path. Versions
  stay hand-maintained lockstep (`npm run versions:sync`).
- **`zh-TW` (繁體中文) joined the locale picker**, with `locales/zh-TW.json` in
  `rpiv-todo` and `rpiv-ask-user-question`; the ambiguous `zh` label now reads
  `简体中文`. Upstream's own `zh.json` maps are untouched — note that they are three keys
  behind `en.json` in `rpiv-ask-user-question` (`review.global_hint`, `review.note_label`,
  `notes.global_header`), which fall back to English.
- **`grilling` is the one vendored Matt Pocock skill this fork edits.** Its design tree is
  mirrored into Pi's `todo` tool — each decision a task, prerequisites as `blockedBy`, the
  frontier as the unblocked pending set — so the whole tree stays visible in the todo overlay for
  the session. It is MIT-covered like the rest of that set;
  `skills/matt-pocock/README.md` and `PROVENANCE.json` record the drift, so a verbatim re-copy
  does not silently drop it.

Anything added later on top of this list is documented in the commit history.

## Names and trademarks

`rpiv`, `rpiv-pi`, `juicesharp`, `rpiv-pi.com`, and the npm scope **`@juicesharp`** identify
the upstream project and its author. This fork:

- uses its own scope **`@hs1n`** for the packages it builds, and publishes **nothing** —
  neither to `@juicesharp` (not our scope) nor anywhere else (there is no publish path left
  in the repo),
- does **not** operate `rpiv-pi.com`, and
- will not present itself as the upstream project.

The GitHub repository name `pi-monocoque` is deliberately distinct from upstream.

## Upstream prose in this repository

`README.md` and the root `docs/` carried upstream's original text, preserved verbatim so
attribution stays intact. Since the no-publish change, the root `README.md` is this fork's
own front door and upstream's version is kept at `docs/upstream/README.md` (as is
`roadmap.md`) — upstream's repo URLs and `@juicesharp` package names inside them are correct
as written, because they describe upstream. The per-package READMEs and `docs/` files under
`packages/` keep upstream's prose but have their package-name and repo-URL references
retargeted to this fork's `@hs1n` scope by `scripts/fork-rename-scope.mjs`. Sections such as
*Roadmap*, *Who built this*, *Contributions*, and *Status and expectations* — including the
statements about Codemasters International and the author's professional role — express the
**upstream author's** views, not those of this fork's maintainer. They are kept as-is for
provenance, not as an endorsement or as this fork's position.

## Data flows you should know about

This is upstream behavior, unchanged here, but worth stating plainly for anyone running it:

- `rpiv-web-tools` sends queries/URLs to whichever third-party search/fetch provider you
  configure, under your own API keys.
- The pipeline sends your source code and prompts to whichever model provider you select.

Each of these is subject to that third party's own terms and privacy policy.

## Third-party licenses

MIT covers upstream's own code. It does not cover the dependency tree, and upstream ships
no `NOTICE`/`COPYING` or third-party inventory. `scripts/fork-license-audit.mjs` walks the
installed tree and summarizes it; run it after `npm install`:

```
node scripts/fork-license-audit.mjs .
```

Two snapshots matter, because deleting `rpiv-site` and its Astro/Vite tree took most of the
inventory with it.

**At the fork point** — 633 deduplicated `name@version` entries:

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

**Today** — 248 entries: MIT 168 · Apache-2.0 39 · BSD-3-Clause 18 · ISC 15 ·
MIT OR Apache-2.0 2 · MPL-2.0 2 · BlueOak-1.0.0 2 · 0BSD 1 · Unlicense 1.

Flagged (copyleft / restrictive / unknown) is **down to 2**: `lightningcss@1.33.0` and
`lightningcss-darwin-arm64@1.33.0`, both MPL-2.0, both reached through `vitest → vite`.
File-level copyleft; nothing is modified or redistributed, so no obligation is triggered.

Three entries the fork-point audit called out are gone with the packages that carried them.
`@img/sharp-libvips-darwin-arm64` (LGPL-3.0-or-later), `zod-to-ts` (no `license` field at
all, reached transitively through `astro`) and `@fontsource/jetbrains-mono` (OFL-1.1) were
all `rpiv-site` dependencies, so the LGPL question and the missing-license question no
longer apply to this tree. They would return with a `git revert` of that deletion.

Re-run the script after dependency changes; treat a new copyleft or `UNKNOWN` entry in a
package's `dependencies` as a blocker before publishing — while remembering that nothing
here has a publish path at all.

## Support and warranty

Upstream is under no obligation to support anything in this fork — please do not file this
fork's issues upstream. The MIT warranty disclaimer applies: this software is provided
"as is", without warranty of any kind.
