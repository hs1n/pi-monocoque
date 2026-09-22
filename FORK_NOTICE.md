# Fork notice

This repository is a **personal fork** of **rpiv-mono**, maintained by [@hs1n](https://github.com/hs1n).
It is **not affiliated with, endorsed by, or supported by** the upstream author.

| | |
| --- | --- |
| Upstream | https://github.com/juicesharp/rpiv-mono |
| Upstream author | Sergii Guslystyi ([@juicesharp](https://github.com/juicesharp), [rpiv-pi.com](https://rpiv-pi.com)) |
| This fork | https://github.com/hs1n/pi-monocoque |
| Forked from | `main` @ `d74b1c99830a565f3df3f37e0a36616d17ffc574` |
| License | MIT — see [`LICENSE`](./LICENSE) and `packages/*/LICENSE` |

## License and attribution

Upstream is MIT licensed. The MIT terms are the only condition on reuse, and they are
satisfied here by **keeping every upstream copyright notice and license text unmodified**:

- `LICENSE` (root)
- `packages/*/LICENSE` (12 files, each shipped inside the published package `files` list)

Modifications made in this fork are additionally marked in their own commits. They do not
replace or relicense the upstream portions. Anyone redistributing this work must keep the
same notices.

## What this fork changes

Only the following divergences exist, and they are all provenance/identity fixes rather
than behavioral changes:

- `upstream` git remote added for syncing.
- README fork banner; CI/badges no longer point at the upstream repository or Codecov.
- `packages/rpiv-site/public/CNAME` removed; the site's canonical URL no longer claims
  `rpiv-pi.com`.
- `.github/workflows/deploy-site.yml` is manual-only, so this fork can never auto-publish a
  site that looks like the upstream one.
- Codecov upload removed from `.github/workflows/ci.yml` (it required upstream's OIDC
  identity and failed the build in a fork).

Anything added later on top of this list is documented in the commit history.

## Names and trademarks

`rpiv`, `rpiv-pi`, `juicesharp`, `rpiv-pi.com`, and the npm scope **`@juicesharp`** identify
the upstream project and its author. This fork:

- does **not** publish anything to npm under `@juicesharp` (that scope is not ours and
  `npm publish` would be rejected),
- does **not** operate `rpiv-pi.com`, and
- will not present itself as the upstream project.

The GitHub repository name `pi-monocoque` is deliberately distinct from upstream.

## Upstream prose in this repository

`README.md`, `roadmap.md`, `docs/`, and the per-package READMEs are upstream's original text
and are preserved verbatim so attribution stays intact. Sections such as *Roadmap*,
*Who built this*, *Contributions*, and *Status and expectations* — including the statements
about Codemasters International and the author's professional role — express the **upstream
author's** views, not those of this fork's maintainer. They are kept as-is for provenance,
not as an endorsement or as this fork's position.

## Data flows you should know about

This is upstream behavior, unchanged here, but worth stating plainly for anyone running it:

- `rpiv-telemetry` instruments lifecycle and sub-agent activity into MLflow.
- `rpiv-web-tools` sends queries/URLs to whichever third-party search/fetch provider you
  configure, under your own API keys.
- The pipeline sends your source code and prompts to whichever model provider you select.
- `rpiv-voice` downloads a ~198 MB `sherpa-onnx-whisper-base` archive from the
  `k2-fsa/sherpa-onnx` GitHub releases at first use (weights are not redistributed here).

Each of these is subject to that third party's own terms and privacy policy.

## Third-party licenses

MIT covers upstream's own code. It does not cover the dependency tree, and upstream ships
no `NOTICE`/`COPYING` or third-party inventory. `scripts/fork-license-audit.mjs` walks the
installed tree and summarizes it; run it after `npm install`:

```
node scripts/fork-license-audit.mjs .
```

As of the fork point (633 deduplicated `name@version` entries):

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

Four entries are worth knowing about, and **none of them ship in the twelve published
packages** — they are all build-time or private-package dependencies:

- `lightningcss`, `lightningcss-darwin-arm64` — MPL-2.0 (Astro/Vite build tooling).
  File-level copyleft; nothing is modified or redistributed, so no obligation is triggered.
- `@img/sharp-libvips-darwin-arm64` — LGPL-3.0-or-later (optional binary behind `sharp`,
  a devDependency of the private site package). Dynamically linked, unmodified. Distributing
  a built site artefact that bundles it would mean shipping the LGPL text and offering the
  library source; the npm packages are unaffected.
- `zod-to-ts` — no `license` field at all, reached transitively through `astro`. Absent a
  license, no permission is granted by default. It is build-time only, so nothing is
  distributed — but do not add it to a published package without resolving this.
- `@fontsource/jetbrains-mono` — OFL-1.1. The built site serves JetBrains Mono webfonts to
  the browser, so anyone hosting a built `rpiv-site` must ship the font's OFL license text
  alongside it. Not a concern for the extensions.

Re-run the script after dependency changes; treat a new copyleft or `UNKNOWN` entry in a
package's `dependencies` as a blocker before publishing.

## Support and warranty

Upstream is under no obligation to support anything in this fork — please do not file this
fork's issues upstream. The MIT warranty disclaimer applies: this software is provided
"as is", without warranty of any kind.
