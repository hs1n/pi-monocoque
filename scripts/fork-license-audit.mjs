#!/usr/bin/env node
/**
 * fork-license-audit.mjs — summarize the license distribution of the installed
 * dependency tree, and flag anything copyleft / restrictive / unlicensed.
 *
 * Why it exists: MIT covers rpiv-mono's own code, but redistributing a fork also
 * means redistributing whatever its dependencies require. Upstream ships no
 * NOTICE/COPYING and declares no third-party license inventory, so this is the
 * check to re-run before publishing or deploying anything.
 *
 * Node built-ins only — no npx, no extra dependency (matches the scripts/
 * convention in .rpiv/guidance/scripts/architecture.md).
 *
 * Usage:
 *   node scripts/fork-license-audit.mjs .        # after `npm install`
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const roots = process.argv.slice(2);
const seen = new Map(); // name@version -> {license, dir, scope}

function scanNM(dir, scope) {
	let entries;
	try {
		entries = readdirSync(dir, { withFileTypes: true });
	} catch {
		return;
	}
	for (const e of entries) {
		if (!e.isDirectory() && !e.isSymbolicLink()) continue;
		if (e.name === ".bin" || e.name === ".cache") continue;
		const p = join(dir, e.name);
		if (e.name.startsWith("@")) {
			scanNM(p, scope);
			continue;
		}
		const pj = join(p, "package.json");
		if (existsSync(pj)) {
			try {
				const j = JSON.parse(readFileSync(pj, "utf8"));
				if (j.name && j.version) {
					const lic =
						typeof j.license === "string"
							? j.license
							: (j.license?.type ??
								(Array.isArray(j.licenses) ? j.licenses.map((l) => l.type ?? l).join(" OR ") : undefined));
					const key = `${j.name}@${j.version}`;
					if (!seen.has(key)) seen.set(key, { license: lic ?? "UNKNOWN", dir: p, scope });
				}
			} catch {}
		}
		scanNM(join(p, "node_modules"), scope);
	}
}

for (const r of roots) {
	scanNM(join(r, "node_modules"), "prod+dev");
	for (const e of readdirSync(join(r, "packages"), { withFileTypes: true })) {
		if (e.isDirectory()) scanNM(join(r, "packages", e.name, "node_modules"), "prod+dev");
	}
}

const byLicense = new Map();
for (const v of seen.values()) byLicense.set(v.license, (byLicense.get(v.license) ?? 0) + 1);

const total = seen.size;
console.log(`packages scanned (deduped name@version): ${total}\n`);
console.log("license distribution:");
for (const [lic, n] of [...byLicense].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(5)}  ${lic}`);

const copyleft = /(A|L)?GPL|SSPL|CDDL|EPL|CPAL|OSL|MPL-2|CC-BY-NC|BUSL|Elastic/i;
const flagged = [...seen.entries()].filter(([, v]) => copyleft.test(v.license) || v.license === "UNKNOWN");
console.log(`\nflagged (copyleft / restrictive / unknown): ${flagged.length}`);
for (const [k, v] of flagged) console.log(`  ${k}  →  ${v.license}`);
