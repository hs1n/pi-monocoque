/**
 * Shadowed bundled skills — the runtime half of a trap that is currently
 * documented only in prose.
 *
 * Pi resolves a skill name through a precedence chain:
 *
 *   <cwd>/.agents/skills > <cwd>/.pi/skills > ~/.agents/skills >
 *   ~/.pi/agent/skills > the installed package
 *
 * A same-named copy anywhere above the package wins, and nothing complains: the
 * built-in `/wf` graphs dispatch a skill BY NAME, so the graph keeps routing to
 * that name while a different body runs — and because `contract:` blocks are
 * harvested per skill, a copy that declares none leaves the graph validating
 * against nothing. `skills/matt-pocock/README.md` explains this at length and
 * tells whoever updates the vendored set not to re-run the installer, because
 * the installer's lock still carries `research`, `implement` and `code-review`.
 * That is a rule a person has to remember, which is the failure mode.
 *
 * So it is a probe instead: enumerate the directories Pi reads ahead of the
 * package, look for a `SKILL.md` under each bundled name, and let the session
 * announce what it found. Pure filesystem work, no `ExtensionAPI` — the caller
 * owns the UI and the decision to speak.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { renderBanner } from "./banner.js";

/** A bundled skill name that resolves to a copy outside this package. */
export interface ShadowedSkill {
	readonly name: string;
	/** Directories holding a same-named `SKILL.md`, in the order probed. */
	readonly locations: readonly string[];
}

/**
 * Bundled skills shadowed by a higher-precedence copy.
 *
 * `searchDirs` is everything Pi reads ahead of the installed package — the
 * caller builds it (`agentsSkillDirs` + the project `.pi/skills` + the agent
 * dir) so this module needs no knowledge of Pi's own path rules. Every hit is
 * reported rather than just the winner: the first entry is what Pi dispatches,
 * the rest are the leftovers a person has to clean up.
 *
 * Never throws. An unreadable probe location simply contributes nothing — a
 * permissions problem is not a shadow, and a warning is not worth an error.
 */
export function findShadowedSkills(bundledNames: ReadonlySet<string>, searchDirs: readonly string[]): ShadowedSkill[] {
	const shadowed: ShadowedSkill[] = [];
	for (const name of [...bundledNames].sort()) {
		const locations: string[] = [];
		for (const dir of searchDirs) {
			try {
				const candidate = join(dir, name);
				if (existsSync(join(candidate, "SKILL.md"))) locations.push(candidate);
			} catch {
				// fail-soft: an unusable probe location contributes no hit
			}
		}
		if (locations.length > 0) shadowed.push({ name, locations });
	}
	return shadowed;
}

/** Rows the banner shows before folding the remainder into one line. */
const REPORT_LIMIT = 4;

/**
 * Render the warning banner for `shadowed`. `criticalNames` are the bundled
 * skills carrying a `contract:` block — for those the shadowing copy does not
 * merely replace a body, it strands the graph that routes to that name, so they
 * get called out by name. Returns "" when there is nothing to say.
 */
export function formatShadowWarning(
	shadowed: readonly ShadowedSkill[],
	criticalNames: ReadonlySet<string> = new Set(),
): string {
	if (shadowed.length === 0) return "";
	const critical = shadowed.filter((s) => criticalNames.has(s.name)).map((s) => s.name);
	const shown = shadowed.slice(0, REPORT_LIMIT);
	const hidden = shadowed.length - shown.length;
	const title = `rpiv-pi: ${shadowed.length} bundled skill${shadowed.length === 1 ? "" : "s"} shadowed`;
	return renderBanner(title, [
		...shown.map((s) => `• ${s.name} → ${s.locations[0]}`),
		...(hidden > 0 ? [`… and ${hidden} more`] : []),
		"",
		...(critical.length > 0
			? [
					`/wf routes ${critical.join(", ")} by name: the graph still runs`,
					"that stage, the copy declares no matching contract.",
					"",
				]
			: []),
		"Delete the higher-precedence copy, or expect that body to run.",
	]);
}
