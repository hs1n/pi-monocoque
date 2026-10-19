#!/usr/bin/env node

/**
 * Lockstep versions, from ONE source of truth.
 *
 *   node scripts/sync-versions.js            write mode (npm run versions:sync)
 *   node scripts/sync-versions.js --check    verify only (npm run versions:check)
 *
 * The root `package.json` `version` is the truth. Every `packages/*` manifest
 * takes that number, and every intra-monorepo `dependencies`/`devDependencies`
 * range is rewritten to `^<version>`.
 *
 * WHY THE DIRECTION FLIPPED
 *   This used to be a VERIFIER: 12 hand-written versions had to agree, and any
 *   drift exited 1 with "bump every package.json by hand, then re-run". That made
 *   the model a bug in one file into a manual repair across twelve, and it only
 *   ever existed because upstream published each package to npm under its own
 *   number. This fork has no registry and no publish path, so there is exactly one
 *   number to decide — the bump — and twelve copies of it to keep in step, which
 *   is what a program should do. `--check` keeps the invariant enforced where it
 *   matters (CI) without keeping the ceremony in the edit path.
 *
 * WHY peerDependencies ARE UNTOUCHED
 *   `"*"` is the zero-cross-imports contract, not a version claim. Rewriting it
 *   would smuggle a range into a field that exists to state "whatever the host /
 *   sibling provides".
 *
 * IDEMPOTENT + DIFF-AWARE
 *   A manifest is written only when something in it would change, in this repo's
 *   JSON convention (tab-indented, trailing newline), so re-running on a synced
 *   tree touches nothing.
 *
 * Exit 0 = in sync (write mode: after writing); exit 1 = drift found in --check
 * mode, an unreadable/malformed manifest, or a root version that is not semver.
 */

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PACKAGES_DIR = join(REPO_ROOT, "packages");
const ROOT_MANIFEST = join(REPO_ROOT, "package.json");
const CHECK_MODE = process.argv.includes("--check");
const SEMVER_RE = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)*$/;

/** Fields whose intra-monorepo ranges are managed here. */
const SYNCED_FIELDS = ["dependencies", "devDependencies"];

function fail(message) {
	console.error(`❌ ${message}`);
	process.exit(1);
}

function readManifest(path) {
	try {
		return JSON.parse(readFileSync(path, "utf8"));
	} catch (e) {
		fail(`cannot read ${path}: ${e instanceof Error ? e.message : String(e)}`);
	}
}

const rootManifest = readManifest(ROOT_MANIFEST);
const version = rootManifest.version;
if (typeof version !== "string" || !SEMVER_RE.test(version)) {
	fail(
		`root package.json version ${JSON.stringify(version)} is not a semver version — ` +
			"it is the single source of truth for the whole workspace, so it has to be one.",
	);
}

const packages = readdirSync(PACKAGES_DIR, { withFileTypes: true })
	.filter((d) => d.isDirectory())
	.map((d) => {
		const path = join(PACKAGES_DIR, d.name, "package.json");
		return { dir: d.name, path, data: readManifest(path) };
	});

const workspaceNames = new Set(packages.map((p) => p.data.name));
console.log(`Source of truth: root package.json → ${version}${CHECK_MODE ? " (check mode)" : ""}`);

const drift = [];
const written = [];

for (const pkg of packages) {
	const changes = [];

	if (pkg.data.version !== version) {
		changes.push(`version ${pkg.data.version} → ${version}`);
		pkg.data.version = version;
	}

	for (const field of SYNCED_FIELDS) {
		const deps = pkg.data[field];
		if (!deps) continue;
		for (const [name, range] of Object.entries(deps)) {
			if (!workspaceNames.has(name)) continue;
			const want = `^${version}`;
			if (range === want) continue;
			changes.push(`${field}.${name} ${range} → ${want}`);
			deps[name] = want;
		}
	}

	if (changes.length === 0) continue;
	if (CHECK_MODE) {
		drift.push({ name: pkg.data.name, changes });
		continue;
	}
	writeFileSync(pkg.path, `${JSON.stringify(pkg.data, null, "\t")}\n`);
	written.push({ name: pkg.data.name, changes });
}

if (drift.length > 0) {
	console.error(`\n❌ ${drift.length} package(s) out of step with root ${version}:`);
	for (const { name, changes } of drift) {
		console.error(`  ${name}`);
		for (const change of changes) console.error(`    ${change}`);
	}
	console.error("\nRun `npm run versions:sync` to take the root version everywhere.");
	process.exit(1);
}

if (CHECK_MODE) {
	console.log(`✅ All ${packages.length} packages in lockstep at ${version}, every intra-monorepo range ^${version}.`);
	process.exit(0);
}

if (written.length === 0) {
	console.log(`✅ Already in sync — ${packages.length} packages at ${version}, nothing written.`);
} else {
	for (const { name, changes } of written) {
		console.log(`\n${name}`);
		for (const change of changes) console.log(`  ${change}`);
	}
	console.log(`\n✅ Rewrote ${written.length} package manifest(s) to ${version}.`);
}
