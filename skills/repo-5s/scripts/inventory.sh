#!/usr/bin/env bash
# inventory.sh — read-only fact-gathering for the Sort and Shine passes.
#
# Prints the raw material an agent classifies into keep / red-tag.
# Nothing here writes, stages, or deletes anything.
#
# Usage: bash scripts/inventory.sh [repo-root]

set -u

root="${1:-.}"
cd "$root" || { echo "no such directory: $root" >&2; exit 1; }

if ! git rev-parse --git-dir >/dev/null 2>&1; then
	echo "not a git repository: $root" >&2
	exit 1
fi

hr() { printf '\n== %s ==\n' "$1"; }

hr "tracked files"
git ls-files | wc -l

hr "worktree status"
git status --porcelain=v1 --untracked-files=all 2>/dev/null | head -50

hr "files by extension (top 25)"
git ls-files | awk -F/ '
	{ n=$NF
	  if (n !~ /\./) { print "no-extension"; next }
	  sub(/.*\./, "", n); print n }' \
	| sort | uniq -c | sort -rn | head -25

hr "largest tracked files (bytes)"
git ls-tree -r -l HEAD 2>/dev/null | sort -k4 -n -r | head -20

hr "empty tracked files"
git ls-files | while IFS= read -r f; do
	[ -f "$f" ] && [ ! -s "$f" ] && echo "$f"
done

hr "tracked paths that look generated or vendored"
git ls-files | grep -Ei '(^|/)(dist|build|out|coverage|\.next|__pycache__|\.cache|node_modules|vendor|target)/' | head -40

hr "leftover markers (TODO/FIXME/HACK/XXX)"
git grep -nE '\<(TODO|FIXME|HACK|XXX)\>' 2>/dev/null | head -40

hr "untracked files"
git ls-files --others --exclude-standard 2>/dev/null | head -40

hr "ignored top-level names"
git ls-files --others --ignored --exclude-standard 2>/dev/null | sed 's#/.*##' | sort -u | head -40
