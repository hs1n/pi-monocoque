/**
 * The root `pi` manifest ↔ workspace reality.
 *
 * The monorepo root is its own Pi package root: `package.json`'s `pi.extensions` /
 * `pi.skills` lists are what `pi install git:<repo>` and a root local-path install
 * load. Each extension package ALSO carries its own `pi` field, which is what
 * `/rpiv-setup` and `scripts/fork-pi-install.sh` use. Two lists, one reality — and
 * only the per-package half is discovered automatically.
 *
 * The drift this guards is silent in both directions:
 *   - A new extension package that nobody added to the root manifest installs
 *     cleanly per-package and never loads in a git install.
 *   - A root entry pointing at a path that moved, or at a package that dropped its
 *     `pi` field, fails at load with no test to catch it.
 *
 * The checklist item this replaces said "add the package's extension entry to the
 * root `package.json`". A rule a person has to remember is not an invariant.
 *
 * Opt-in packages are the one legitimate gap, and they are defined structurally
 * rather than by name: opt-in means absent from the root manifest AND absent from
 * `SIBLINGS`, so a *registered* sibling missing from the root manifest is always a
 * bug, while an unregistered package is always deliberate.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SIBLINGS } from "./siblings.js";

/** Repo root, resolved from this file (`packages/rpiv-pi/extensions/rpiv-core/`). */
const REPO_ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
const PACKAGES_DIR = join(REPO_ROOT, "packages");

const rootManifest = JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8")) as {
	pi?: { extensions?: string[]; skills?: string[] };
};
const manifestExtensions = rootManifest.pi?.extensions ?? [];
const manifestSkills = rootManifest.pi?.skills ?? [];

/** Workspace package directory names, in `packages/` order. */
const workspacePackages = readdirSync(PACKAGES_DIR, { withFileTypes: true })
	.filter((e) => e.isDirectory())
	.map((e) => e.name);

/** `pi` field of a workspace package, or undefined when it ships no Pi surface. */
function piField(pkg: string): { extensions?: string[]; skills?: string[] } | undefined {
	const path = join(PACKAGES_DIR, pkg, "package.json");
	if (!existsSync(path)) return undefined;
	const manifest = JSON.parse(readFileSync(path, "utf8")) as { pi?: { extensions?: string[]; skills?: string[] } };
	return manifest.pi;
}

/** Package names the family registers as siblings — the non-opt-in set. */
const registeredSiblings = new Set(
	SIBLINGS.map((s) => /^npm:@hs1n\/(rpiv-[a-z0-9-]+)$/.exec(s.pkg)?.[1]).filter(
		(n): n is string => typeof n === "string",
	),
);

/** Workspace package a repo-root-relative path lives in, or null when it lives outside `packages/`. */
function owningPackage(relPath: string): string | null {
	const resolved = resolve(REPO_ROOT, relPath);
	const rel = relative(PACKAGES_DIR, resolved);
	if (rel.startsWith("..") || isAbsolute(rel)) return null;
	return rel.split(sep)[0] ?? null;
}

describe("root pi manifest", () => {
	it("sanity: the manifest declares both surfaces", () => {
		expect(manifestExtensions.length).toBeGreaterThan(0);
		expect(manifestSkills.length).toBeGreaterThan(0);
	});

	it("every extension entry exists on disk", () => {
		const missing = manifestExtensions.filter((entry) => !existsSync(resolve(REPO_ROOT, entry)));
		expect(missing).toEqual([]);
	});

	it("every extension entry targets a workspace package that declares its own pi manifest", () => {
		const unowned = manifestExtensions
			.map((entry) => ({ entry, pkg: owningPackage(entry) }))
			.filter(({ pkg }) => pkg === null || piField(pkg)?.extensions === undefined)
			.map(({ entry }) => entry);
		expect(unowned).toEqual([]);
	});

	it("every registered sibling that ships an extension is reachable from the root manifest", () => {
		const covered = new Set(
			manifestExtensions.map((entry) => owningPackage(entry)).filter((pkg): pkg is string => pkg !== null),
		);
		const unreachable = [...registeredSiblings]
			.filter((pkg) => piField(pkg)?.extensions !== undefined && !covered.has(pkg))
			.sort();
		expect(unreachable).toEqual([]);
	});

	it("a package absent from the root manifest is opt-in, never a forgotten one", () => {
		const covered = new Set(
			manifestExtensions.map((entry) => owningPackage(entry)).filter((pkg): pkg is string => pkg !== null),
		);
		const unlisted = workspacePackages.filter((pkg) => piField(pkg)?.extensions !== undefined && !covered.has(pkg));
		// Structural definition of opt-in: unregistered. A sibling here means the root
		// manifest was not updated, which is the failure mode this file exists for.
		expect(unlisted.filter((pkg) => registeredSiblings.has(pkg))).toEqual([]);
	});

	it("every skills entry exists and holds at least one SKILL.md", () => {
		const broken = manifestSkills.filter((entry) => {
			const dir = resolve(REPO_ROOT, entry);
			if (!existsSync(dir)) return true;
			// A skills entry is either ONE skill (`skills/skill-master/SKILL.md`) or a
			// directory OF skills (`packages/rpiv-pi/skills/<name>/SKILL.md`), so both
			// depths count. A bare directory with neither is a stale manifest entry.
			if (existsSync(join(dir, "SKILL.md"))) return false;
			return readdirSync(dir, { withFileTypes: true }).every(
				(e) => !e.isDirectory() || !existsSync(join(dir, e.name, "SKILL.md")),
			);
		});
		expect(broken).toEqual([]);
	});
});
