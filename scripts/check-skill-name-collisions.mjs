// check-skill-name-collisions.mjs — standing guard over the vendored skill set.
//
//   node scripts/check-skill-name-collisions.mjs
//
// Asserts that no skill under skills/matt-pocock/ shares a name with a skill
// under packages/rpiv-pi/skills/.
//
// RULE
//   A name present in both sets is a broken workflow graph, not a style wart.
//   Three names collide in the two upstream collections — `research`, `implement`
//   and `code-review` — and all three are dispatched BY NAME from the built-in
//   /wf workflows: `implement` is an `acts` stage in all four, `code-review` a
//   gate stage in polish and vet, `research` build's second stage. The vendored
//   set therefore leaves them out. CONTEXT.md's Skill ownership section records
//   that omission as load-bearing rather than tidy, and skills/matt-pocock/README.md
//   explains it to whoever updates the directory.
//
// WHY A CHECK AND NOT A NOTE
//   Skill precedence is
//     <cwd>/.agents/skills > <cwd>/.pi/skills > ~/.agents/skills >
//     ~/.pi/agent/skills > installed package
//   A second copy of a name anywhere above the package shadows rpiv-pi's body while
//   the graph keeps routing by that name — and the `contract:` the graph validates
//   against is harvested by a separate provider, which finds nothing to replace it
//   with because matt's skills declare none. Nothing complains. Updating the
//   vendored set means re-applying the exclusions by hand, which is exactly the
//   instruction a person forgets, and the failure it produces is silent. So it is a
//   gate instead.
//
// WHY DIRECTORY NAMES, NOT FRONTMATTER
//   Pi discovers skills by directory ("Directories containing SKILL.md are discovered
//   recursively") and only warns when a declared `name:` differs from the parent
//   directory. Directory names are therefore what collides at load time, which is
//   what this compares. A directory with no SKILL.md is skipped — it is not a skill,
//   which is how packages/rpiv-pi/skills/_shared stays out of the comparison.
//
// Exit 0 = no collision; exit 1 = each colliding name, with both paths.

import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const VENDORED_ROOT = "skills/matt-pocock";
const PACKAGE_ROOT = "packages/rpiv-pi/skills";

/** Directory names under `root` that hold a SKILL.md, sorted. */
function skillNames(root) {
	if (!existsSync(root)) return null;
	const names = [];
	for (const ent of readdirSync(root, { withFileTypes: true })) {
		if (!ent.isDirectory() || ent.name.startsWith(".")) continue;
		if (existsSync(join(root, ent.name, "SKILL.md"))) names.push(ent.name);
	}
	return names.sort();
}

const vendored = skillNames(VENDORED_ROOT);
const pkg = skillNames(PACKAGE_ROOT);

// A missing root is a failure, not an empty set: it means the skill layout changed
// shape and this guard silently stopped comparing anything, which reads as success.
const missing = [vendored === null ? VENDORED_ROOT : null, pkg === null ? PACKAGE_ROOT : null].filter(Boolean);
if (missing.length) {
	console.error(`Nothing to compare — missing skill root(s): ${missing.join(", ")}`);
	console.error("This guard compares two skill sets; an absent one voids it rather than emptying it.");
	process.exit(1);
}

const collisions = vendored.filter((name) => pkg.includes(name));

if (collisions.length) {
	console.error(`Found ${collisions.length} skill name(s) present in both skill sets:`);
	for (const name of collisions) {
		console.error(`  ${name}`);
		console.error(`    ${join(VENDORED_ROOT, name)}/`);
		console.error(`    ${join(PACKAGE_ROOT, name)}/`);
	}
	console.error(
		"\nA duplicated name shadows the package's skill for the built-in /wf graphs, which dispatch\n" +
			"by name, and no `contract:` replaces the one those graphs validate against.\n" +
			"Leave it out of the vendored set — do not ship both.",
	);
	process.exit(1);
}

console.log(
	`OK — no vendored skill name collides with the package's (${vendored.length} vendored, ${pkg.length} package).`,
);
