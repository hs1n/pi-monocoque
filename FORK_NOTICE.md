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

## Support and warranty

Upstream is under no obligation to support anything in this fork — please do not file this
fork's issues upstream. The MIT warranty disclaimer applies: this software is provided
"as is", without warranty of any kind.
