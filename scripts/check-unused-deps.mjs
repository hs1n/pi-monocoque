// check-unused-deps.mjs — standing guard over dependency OWNERSHIP.
//
//   node scripts/check-unused-deps.mjs
//
// Flags a workspace manifest that declares a package it never imports.
//
// RULE
//   Whoever imports declares. Every entry in `dependencies`, `peerDependencies`
//   or `optionalDependencies` must be imported by that package's own sources —
//   statically or dynamically, exact specifier or a subpath.
//
// WHY THIS IS NOT check:host-provided-deps
//   That guard polices the CLASS of a declaration (host-provided modules must be
//   peer-pinned `"*"`). This one polices the OWNER. Both failures are silent: a
//   host-provided module installed as its own copy breaks at load, while a
//   mis-owned declaration just sits in the wrong manifest looking load-bearing.
//   `yaml` was declared by rpiv-pi and imported by nothing in the repo; `jiti`
//   and `@standard-schema/spec` were declared by both rpiv-pi and rpiv-workflow
//   while only rpiv-workflow imported them. Every one of those read as intent.
//
// WHY EXEMPTIONS ARE STRUCTURAL, NOT A LIST OF NAMES
//   - Host-provided modules are exempt wholesale: their declaration is mandated
//     by policy whatever the import graph says, and the other guard owns them.
//   - Registered siblings are exempt because the family contract forbids
//     importing them: presence is detected from settings ∪ loaded extensions
//     (`siblings.ts`), never from a specifier. The allowlist is parsed out of
//     that registry, so registering a sibling is the only step needed.
//
// WHY TESTS DO NOT COUNT AS USE
//   A package imported only from `*.test.ts` is a devDependency wearing a
//   runtime declaration: as a peer it lands in the user's install tree, as a
//   dependency it ships. Either way the manifest claims a runtime need that the
//   shipped sources do not have. Test files are therefore excluded from the
//   scan — which is the strict reading, and the one that keeps manifests honest.
//
// Exit 0 = every declaration is owned; exit 1 = `path: field: name` per orphan.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Verbatim copy of the host's set — kept in one place here for the same reason
// check-host-provided-deps.mjs keeps its own: a literal beats an import that
// would make the guard depend on what it guards.
const HOST_PROVIDED = new Set([
	"@earendil-works/pi-agent-core",
	"@earendil-works/pi-ai",
	"@earendil-works/pi-coding-agent",
	"@earendil-works/pi-tui",
	"@mariozechner/pi-agent-core",
	"@mariozechner/pi-ai",
	"@mariozechner/pi-coding-agent",
	"@mariozechner/pi-tui",
	"@sinclair/typebox",
	"typebox",
]);

// Declaration fields that make an install-time or runtime claim.
const CLAIM_FIELDS = ["dependencies", "peerDependencies", "optionalDependencies"];

const SIBLINGS_SOURCE = "packages/rpiv-pi/extensions/rpiv-core/siblings.ts";
const SCANNED_EXT = /\.(ts|mts|cts|mjs|cjs|js|jsx|tsx)$/;
const SKIP_BASENAME = /\.test\.[cm]?[jt]sx?$/;
const SKIP_DIRS = new Set(["node_modules", "__fixtures__"]);

/** Package names the family registers as siblings (never imported by contract). */
function registeredSiblings() {
	if (!existsSync(SIBLINGS_SOURCE)) return new Set();
	const source = readFileSync(SIBLINGS_SOURCE, "utf8");
	// Every scoped/quoted package token in the registry file. Over-collecting is
	// safe here — the allowlist only ever silences a name the family already
	// declares, and a stale entry cannot hide an unowned declaration elsewhere.
	const names = new Set();
	for (const m of source.matchAll(/["'`](?:npm:)?(@[a-z0-9][\w.-]*\/[\w.-]+)["'`]/gi)) names.add(m[1]);
	return names;
}

/** Source files of one workspace package, tests excluded. */
function packageSources(dir) {
	const out = [];
	const walk = (current) => {
		for (const ent of readdirSync(current, { withFileTypes: true })) {
			if (ent.isDirectory()) {
				if (!SKIP_DIRS.has(ent.name)) walk(join(current, ent.name));
				continue;
			}
			if (!SCANNED_EXT.test(ent.name) || SKIP_BASENAME.test(ent.name)) continue;
			out.push(join(current, ent.name));
		}
	};
	walk(dir);
	return out;
}

/** True iff any source file imports `name` (bare, subpath, static, dynamic, side-effect). */
function isImported(name, sources) {
	const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const specifier = `${escaped}(?:/[^"'\\s]*)?`;
	const patterns = [
		new RegExp(`\\bfrom\\s*["']${specifier}["']`),
		new RegExp(`\\bimport\\s*\\(\\s*["']${specifier}["']`),
		new RegExp(`^\\s*import\\s*["']${specifier}["']`, "m"),
		new RegExp(`\\brequire\\s*\\(\\s*["']${specifier}["']`),
	];
	for (const file of sources) {
		const text = readFileSync(file, "utf8");
		if (patterns.some((re) => re.test(text))) return true;
	}
	return false;
}

const siblings = registeredSiblings();
const violations = [];
let scannedPackages = 0;
let scannedDeclarations = 0;

const manifests = [process.cwd()];
const packagesDir = join(process.cwd(), "packages");
if (existsSync(packagesDir)) {
	for (const ent of readdirSync(packagesDir, { withFileTypes: true })) {
		if (ent.isDirectory()) manifests.push(join(packagesDir, ent.name));
	}
}

for (const dir of manifests) {
	const manifestPath = join(dir, "package.json");
	if (!existsSync(manifestPath)) continue;
	const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
	const declared = CLAIM_FIELDS.filter((f) => manifest[f]).flatMap((f) =>
		Object.keys(manifest[f]).map((name) => [f, name]),
	);
	if (declared.length === 0) continue;

	scannedPackages++;
	const sources = packageSources(dir);
	for (const [field, name] of declared) {
		scannedDeclarations++;
		if (HOST_PROVIDED.has(name) || siblings.has(name)) continue;
		if (isImported(name, sources)) continue;
		// Workspace-internal dependencies resolve through symlinks, so a relative
		// specifier cannot reach them; only the package name counts, which is what
		// isImported already checked.
		violations.push(`${manifestPath}: ${field}: ${name}`);
	}
}

if (violations.length) {
	console.error(`Found ${violations.length} declaration(s) with no matching import:`);
	for (const v of violations) console.error(`  ${v}`);
	console.error(
		"\nWhoever imports declares. Move the entry to the package that imports it,\n" +
			"or drop it — a declaration no source can reach is a claim, not a dependency.",
	);
	process.exit(1);
}

console.log(
	`OK — every declared dependency is imported by the package that declares it ` +
		`(${scannedDeclarations} declaration${scannedDeclarations === 1 ? "" : "s"} across ${scannedPackages} manifest${scannedPackages === 1 ? "" : "s"}).`,
);
