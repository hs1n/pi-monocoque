#!/usr/bin/env bash
#
# fork-pi-install.sh — install THIS fork's Pi packages into Pi.
#
# Why this exists instead of `pi install git:<repo>`:
#   This is an npm-workspaces monorepo. Pi's git source clones the repo and
#   treats the CLONE ROOT as the package root, and it has no subdirectory
#   support (verified against pi-coding-agent 0.85.1: hosted-git-info drops
#   `/tree/<ref>/<subdir>`, and collectPackageResources only reads
#   <root>/package.json#pi plus <root>/{extensions,skills,prompts,themes}).
#   The monorepo root declares neither, so a root git install loads nothing —
#   and it fails earlier still, because `npm install --omit=dev` cannot run the
#   root's `prepare: husky` script.
#
#   Installing each package by LOCAL PATH keeps every package's own root, which
#   is what upstream's package layout and the `pi.ambientObserver` marker
#   (rpiv-warp) depend on. Your edits apply on the next `/reload`.
#
# Usage:
#   scripts/fork-pi-install.sh              # global (~/.pi/agent/settings.json)
#   scripts/fork-pi-install.sh -l           # project-local (./.pi/settings.json)
#   scripts/fork-pi-install.sh --with btw,voice,warp,telemetry
#   scripts/fork-pi-install.sh --dry-run
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Empty-array-safe expansion for bash 3.2 (macOS default).
expand() { if [ "$#" -gt 0 ]; then printf '%s\n' "$@"; fi; }

SCOPE=()          # empty => global
OPTINS=""
DRY_RUN=0

while [ "$#" -gt 0 ]; do
	case "$1" in
		-l | --local) SCOPE=(-l) ;;
		--with)
			shift
			[ "$#" -gt 0 ] || { echo "error: --with needs a value, e.g. --with btw,voice" >&2; exit 2; }
			OPTINS="${OPTINS:+$OPTINS,}$1"
			;;
		--dry-run) DRY_RUN=1 ;;
		-h | --help) sed -n '2,25p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
		*) echo "error: unknown argument: $1" >&2; exit 2 ;;
	esac
	shift
done

# Mirrors rpiv-pi's SIBLINGS registry: packages/rpiv-pi/extensions/rpiv-core/siblings.ts
# (the same set /rpiv-setup installs). Keep in sync if upstream adds a sibling.
CORE="rpiv-pi rpiv-args rpiv-ask-user-question rpiv-todo rpiv-advisor rpiv-i18n rpiv-web-tools rpiv-workflow"
# Opt-ins the pipeline does not need, as short-name:package-dir pairs. telemetry
# ships private and self-hosts in MLflow; voice downloads a ~198 MB model on
# first use; warp needs the Warp terminal.
OPT="btw:rpiv-btw voice:rpiv-voice warp:rpiv-warp telemetry:rpiv-telemetry"

echo "repo:  $REPO_ROOT"
if [ "${#SCOPE[@]}" -gt 0 ]; then echo "scope: project-local (./.pi/settings.json)"; else echo "scope: global (~/.pi/agent/settings.json)"; fi

# Local-path packages are not copied, so their dependencies must already be
# linked in the checkout. Pi installs deps only for npm/git sources.
if [ ! -d "$REPO_ROOT/node_modules" ]; then
	echo
	echo "node_modules is missing — local-path packages resolve their deps from the checkout."
	echo "Running: npm install"
	[ "$DRY_RUN" -eq 1 ] || ( cd "$REPO_ROOT" && npm install )
fi

run() {
	echo "+ $*"
	[ "$DRY_RUN" -eq 1 ] || "$@"
}

# Third-party sibling that does not live in this repo (SIBLINGS[0] upstream).
run pi install ${SCOPE[@]+"${SCOPE[@]}"} --approve "npm:@tintinweb/pi-subagents"

for pkg in $CORE; do
	dir="$REPO_ROOT/packages/$pkg"
	[ -d "$dir" ] || { echo "error: missing $dir (is REPO_ROOT right?)" >&2; exit 1; }
	run pi install ${SCOPE[@]+"${SCOPE[@]}"} --approve "$dir"
done

if [ -n "$OPTINS" ]; then
	for entry in $OPT; do
		name="${entry%%:*}"
		pkg="${entry##*:}"
		case ",$OPTINS," in
			*",$name,"* | *",$pkg,"*) ;;
			*) continue ;;
		esac
		dir="$REPO_ROOT/packages/$pkg"
		[ -d "$dir" ] || { echo "error: missing $dir" >&2; exit 1; }
		run pi install ${SCOPE[@]+"${SCOPE[@]}"} --approve "$dir"
	done
fi

echo
echo "done. Restart Pi, or /reload inside a running session, to pick up changes."
echo "Note: local paths are recorded in settings, not copied — re-run this script"
echo "      after adding/removing a package, and keep the checkout where it is."
