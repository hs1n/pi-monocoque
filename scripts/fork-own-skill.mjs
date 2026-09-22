#!/usr/bin/env node
/**
 * fork-own-skill.mjs — copy a bundled rpiv skill into your OWN skill library.
 *
 * Why this exists:
 *   Pi resolves skills by NAME, and user-level skills outrank package skills:
 *
 *     <cwd>/.agents/skills  >  <cwd>/.pi/skills  >  ~/.agents/skills
 *       >  ~/.pi/agent/skills  >  installed package (this fork)
 *
 *   So a copy of `skills/<name>/` placed in your own library SHADOWS the bundled
 *   one — you can take over skills one at a time, and `/reload` picks it up.
 *
 *   The skill's `contract:` frontmatter is what the `/wf` engine validates
 *   against. It is harvested by a SEPARATE provider (owner "user-skills") that
 *   enumerates Pi's default skill locations, and it WINS over the bundled
 *   contract (last writer wins). Two consequences worth knowing:
 *
 *     - Same contract, changed body   -> completely silent. This is the normal
 *                                        "own-ify" case.
 *     - Changed contract              -> one load-time collision message naming
 *                                        both owners. Never silent.
 *
 *   WHERE you put the copy matters less than it used to. Harvesting originally
 *   read only `<agentDir>/skills` + `<cwd>/.pi/skills` — pi's `loadSkills` helper
 *   ignores `.agents/skills` entirely — so a copy under any `.agents/skills` was
 *   dispatched while its contract stayed INVISIBLE, and a divergent contract was
 *   ignored with no collision message. This fork now enumerates `.agents/skills`
 *   too (`agentsSkillDirs` in skill-contracts-source.ts); upstream does not. All
 *   four locations work here. Prefer `~/.agents/skills` (global) or
 *   `<cwd>/.pi/skills` (per project): a PROJECT `.agents/skills` also depends on
 *   that fork-local fix, and pi gates dispatching from it on project trust.
 *
 *   Skills are NOT self-contained: 25 of 30 reference sibling helpers as
 *   `${SKILL_DIR}/../_shared/<file>.mjs`. Copying only `SKILL.md` yields a skill
 *   that breaks the first time that block runs, so this script copies the whole
 *   skill dir AND every referenced `_shared/` file.
 *
 * Usage:
 *   node scripts/fork-own-skill.mjs <skill>...        # own-ify one or more skills
 *   node scripts/fork-own-skill.mjs --list            # what you own today
 *   node scripts/fork-own-skill.mjs --check           # verify every owned skill
 *   node scripts/fork-own-skill.mjs --remove <skill>  # hand a skill back
 *
 * Options:
 *   --target <dir>   library root (default: ~/.agents/skills)
 *   --force          overwrite an already-owned skill
 *   --dry-run        report what would happen, touch nothing
 *
 * Deep verification (does the engine really receive the contract?) is a real
 * load-time check and needs the repo's runner — it is not replicated here:
 *   ./node_modules/.bin/vitest run <a co-located *.test.ts that calls
 *   buildUserSkillContracts(<tmpdir>)>   # from packages/rpiv-pi/extensions/rpiv-core
 */

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const BUNDLED_DIR = join(REPO_ROOT, "packages", "rpiv-pi", "skills");

/** A skill dir is one with a SKILL.md; `_shared` and other underscore dirs are not skills. */
function bundledSkillNames() {
	if (!existsSync(BUNDLED_DIR)) return [];
	return readdirSync(BUNDLED_DIR)
		.filter((n) => !n.startsWith("_") && !n.startsWith("."))
		.filter((n) => existsSync(join(BUNDLED_DIR, n, "SKILL.md")))
		.sort();
}

/** Frontmatter is the block between the first two `---` lines. */
function frontmatter(md) {
	const lines = md.split("\n");
	if (lines[0]?.trim() !== "---") return null;
	const end = lines.indexOf("---", 1);
	return end === -1 ? null : lines.slice(1, end).join("\n");
}

/** True iff the frontmatter declares a non-empty `contract:` block. */
function hasContract(md) {
	const fm = frontmatter(md);
	if (!fm) return false;
	const lines = fm.split("\n");
	const at = lines.findIndex((l) => l.startsWith("contract:"));
	if (at === -1) return false;
	return lines.slice(at + 1).some((l) => /^\s+\S/.test(l));
}

/** The verbatim `contract:` block, for reporting. */
function contractBlock(md) {
	const fm = frontmatter(md);
	if (!fm) return "";
	const lines = fm.split("\n");
	const at = lines.findIndex((l) => l.startsWith("contract:"));
	if (at === -1) return "";
	const rest = [];
	for (const line of lines.slice(at)) {
		if (rest.length > 0 && /^\S/.test(line)) break;
		rest.push(line);
	}
	return rest.join("\n");
}

/** Sibling helpers a skill references as `${SKILL_DIR}/../_shared/<file>`. */
function sharedRefs(md) {
	const out = new Set();
	for (const m of md.matchAll(/\$\{SKILL_DIR\}\/\.\.\/_shared\/([\w.-]+)/g)) out.add(m[1]);
	return [...out].sort();
}

function readSkillMd(dir) {
	const p = join(dir, "SKILL.md");
	return existsSync(p) ? readFileSync(p, "utf8") : null;
}

/**
 * The one placement whose harvesting depends on this fork's `agentsSkillDirs`
 * fix, and whose DISPATCH pi gates on project trust. Warned about, not refused.
 */
function projectAgentsTarget(target) {
	if (target.startsWith(join(homedir(), ".agents", "skills"))) return false;
	return target.split(/[\\/]/).join("/").endsWith(".agents/skills");
}

function ownSkill(name, opts) {
	// Not refused: this fork harvests project `.agents/skills` (upstream does not)
	// and pi gates dispatch from it on project trust — both worth saying out loud.
	if (projectAgentsTarget(opts.target)) {
		console.error(`! ${opts.target} is a PROJECT-level .agents/skills.`);
		console.error("  Harvested only because of this fork's agentsSkillDirs fix (upstream's");
		console.error("  buildUserSkillContracts does not read it), and pi dispatches from it only");
		console.error("  when the project is trusted. ~/.agents/skills has neither caveat.");
	}
	const src = join(BUNDLED_DIR, name);
	const srcMd = readSkillMd(src);
	if (srcMd === null) {
		console.error(`✗ ${name}: no bundled skill at ${relative(REPO_ROOT, src)}`);
		return false;
	}
	const dest = join(opts.target, name);
	if (existsSync(dest) && !opts.force) {
		console.error(`✗ ${name}: already owned at ${dest} (use --force to overwrite)`);
		return false;
	}

	const refs = sharedRefs(srcMd);
	const missing = refs.filter((f) => !existsSync(join(BUNDLED_DIR, "_shared", f)));
	const already = existsSync(join(opts.target, "_shared"));

	if (opts.dryRun) {
		console.log(`[dry-run] would copy ${relative(REPO_ROOT, src)} -> ${dest}`);
		console.log(`[dry-run] would copy ${refs.length} _shared helper(s)${already ? " (target _shared exists)" : ""}`);
		return true;
	}

	rmSync(dest, { recursive: true, force: true });
	mkdirSync(dirname(dest), { recursive: true });
	cpSync(src, dest, { recursive: true });

	if (refs.length > 0) {
		const sharedDest = join(opts.target, "_shared");
		mkdirSync(sharedDest, { recursive: true });
		for (const f of refs) {
			if (missing.includes(f)) continue;
			cpSync(join(BUNDLED_DIR, "_shared", f), join(sharedDest, f));
		}
	}

	const isOverride = bundledSkillNames().includes(name);
	console.log(`${isOverride ? "↻" : "+"} ${name} → ${dest}${isOverride ? "  (overrides the bundled skill)" : ""}`);
	console.log(`    contract: ${hasContract(srcMd) ? "declared" : "MISSING — /wf will not see this skill"}`);
	console.log(`    _shared:  ${refs.length === 0 ? "none referenced" : `${refs.length} copied (${refs.join(", ")})`}`);
	for (const f of missing) console.error(`    ✗ ${f} referenced but absent from the bundled _shared/`);
	return true;
}

function listOwned(opts) {
	if (!existsSync(opts.target)) {
		console.log(`no library at ${opts.target}`);
		return true;
	}
	const bundled = new Set(bundledSkillNames());
	const owned = readdirSync(opts.target)
		.filter((n) => !n.startsWith(".") && !n.startsWith("_"))
		.filter((n) => existsSync(join(opts.target, n, "SKILL.md")))
		.sort();
	if (owned.length === 0) {
		console.log(`no owned skills in ${opts.target}`);
		return true;
	}
	console.log(`${owned.length} skill(s) in ${opts.target}:`);
	for (const n of owned) {
		const md = readSkillMd(join(opts.target, n));
		const refs = md ? sharedRefs(md) : [];
		const broken = refs.filter((f) => !existsSync(join(opts.target, "_shared", f)));
		// Only skills that override a bundled one or declare a contract participate
		// in the /wf contract system; anything else is a foreign conversational skill.
		const participates = bundled.has(n) || (md !== null && hasContract(md));
		const tags = [
			bundled.has(n) ? "overrides bundled" : "new skill",
			participates && md && !hasContract(md) ? "NO CONTRACT" : "",
			broken.length > 0 ? `BROKEN _shared (${broken.join(", ")})` : "",
		].filter(Boolean);
		console.log(`  ${n.padEnd(28)} ${tags.join(" · ")}`);
	}
	return true;
}

function checkOwned(opts) {
	if (!existsSync(opts.target)) {
		console.log(`no library at ${opts.target}`);
		return true;
	}
	const bundled = new Set(bundledSkillNames());
	let bad = 0;
	let checked = 0;
	let skipped = 0;
	for (const n of readdirSync(opts.target).sort()) {
		if (n.startsWith(".") || n.startsWith("_")) continue;
		const md = readSkillMd(join(opts.target, n));
		if (md === null) continue;
		if (!bundled.has(n) && !hasContract(md)) {
			skipped += 1;
			continue;
		}
		checked += 1;
		const problems = [];
		if (!hasContract(md)) problems.push("no contract: block — /wf cannot validate this skill");
		for (const f of sharedRefs(md)) {
			if (!existsSync(join(opts.target, "_shared", f))) problems.push(`missing _shared/${f}`);
		}
		if (bundled.has(n)) {
			const src = readSkillMd(join(BUNDLED_DIR, n));
			if (src && contractBlock(src) !== contractBlock(md)) {
				problems.push("contract diverges from the bundled one — expect one collision message at /wf load");
			}
		}
		if (problems.length === 0) {
			console.log(`  ✓ ${n}`);
		} else {
			bad += 1;
			console.log(`  ✗ ${n}`);
			for (const p of problems) console.log(`      ${p}`);
		}
	}
	console.log(`\n${checked} checked, ${skipped} skipped (no contract: block and not overriding a bundled skill)`);
	return bad === 0;
}

function main(argv) {
	const opts = { target: join(homedir(), ".agents", "skills"), force: false, dryRun: false };
	const rest = [];
	for (let i = 0; i < argv.length; i += 1) {
		const a = argv[i];
		if (a === "--target") opts.target = argv[++i];
		else if (a === "--force") opts.force = true;
		else if (a === "--dry-run") opts.dryRun = true;
		else rest.push(a);
	}
	const [mode, ...args] = rest;

	if (mode === undefined || mode === "--help" || mode === "-h") {
		console.log("usage: node scripts/fork-own-skill.mjs <skill>... | --list | --check | --remove <skill>");
		console.log("       [--target <dir>] [--force] [--dry-run]");
		console.log(`\nbundled skills:\n  ${bundledSkillNames().join(" ")}`);
		return 0;
	}
	if (mode === "--list") return listOwned(opts) ? 0 : 1;
	if (mode === "--check") return checkOwned(opts) ? 0 : 1;
	if (mode === "--remove") {
		if (args.length === 0) {
			console.error("✗ --remove needs at least one skill name");
			return 1;
		}
		for (const n of args) {
			const dest = join(opts.target, n);
			if (!existsSync(dest) || !statSync(dest).isDirectory()) {
				console.error(`✗ ${n}: not owned (nothing at ${dest})`);
				continue;
			}
			if (opts.dryRun) console.log(`[dry-run] would remove ${dest}`);
			else {
				rmSync(dest, { recursive: true, force: true });
				console.log(`- ${n} removed; the bundled skill takes over on /reload`);
			}
		}
		return 0;
	}

	let ok = true;
	for (const name of [mode, ...args]) {
		if (name.startsWith("--")) {
			console.error(`✗ unknown option ${name}`);
			ok = false;
			continue;
		}
		if (!ownSkill(name, opts)) ok = false;
	}
	if (ok && !opts.dryRun) console.log("\nrun /reload in Pi (or start a new session) to pick it up");
	return ok ? 0 : 1;
}

try {
	process.exit(main(process.argv.slice(2)));
} catch (err) {
	console.error(`✗ fork-own-skill failed: ${err instanceof Error ? err.message : String(err)}`);
	process.exit(1);
}
