import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { findShadowedSkills, formatShadowWarning } from "./skill-shadow.js";

/** Create `<dir>/<name>/SKILL.md` — the shape Pi discovers as a skill. */
function makeSkill(dir: string, name: string): void {
	mkdirSync(join(dir, name), { recursive: true });
	writeFileSync(join(dir, name, "SKILL.md"), "---\nname: x\n---\n");
}

let root: string;

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), "rpiv-shadow-"));
});
afterEach(() => {
	rmSync(root, { recursive: true, force: true });
});

describe("findShadowedSkills", () => {
	it("reports every location holding a same-named SKILL.md, in probe order", () => {
		const first = join(root, "project", ".agents", "skills");
		const second = join(root, "home", ".agents", "skills");
		makeSkill(first, "research");
		makeSkill(second, "research");

		expect(findShadowedSkills(new Set(["research"]), [first, second])).toEqual([
			{ name: "research", locations: [join(first, "research"), join(second, "research")] },
		]);
	});

	it("ignores a same-named directory with no SKILL.md (not a skill, cannot shadow)", () => {
		const dir = join(root, "skills");
		mkdirSync(join(dir, "research"), { recursive: true });

		expect(findShadowedSkills(new Set(["research"]), [dir])).toEqual([]);
	});

	it("returns nothing when every bundled name resolves inside the package", () => {
		const dir = join(root, "skills");
		makeSkill(dir, "unrelated");

		expect(findShadowedSkills(new Set(["research", "implement"]), [dir])).toEqual([]);
	});

	it("ignores missing directories and keeps scanning (fail-soft)", () => {
		const real = join(root, "real");
		makeSkill(real, "commit");

		const found = findShadowedSkills(new Set(["commit"]), [join(root, "nope"), real]);
		expect(found.map((s) => s.name)).toEqual(["commit"]);
	});

	it("orders names deterministically so the banner is stable between sessions", () => {
		const dir = join(root, "skills");
		for (const name of ["validate", "commit", "discover"]) makeSkill(dir, name);

		const names = findShadowedSkills(new Set(["validate", "commit", "discover"]), [dir]).map((s) => s.name);
		expect(names).toEqual(["commit", "discover", "validate"]);
	});
});

describe("formatShadowWarning", () => {
	const shadowed = [
		{ name: "research", locations: ["/home/u/.agents/skills/research"] },
		{ name: "commit", locations: ["/repo/.agents/skills/commit"] },
	];

	it("says nothing when nothing is shadowed", () => {
		expect(formatShadowWarning([])).toBe("");
	});

	it("names each shadowed skill with the winning path", () => {
		const text = formatShadowWarning(shadowed);
		expect(text).toContain("2 bundled skills shadowed");
		expect(text).toContain("research → /home/u/.agents/skills/research");
		expect(text).toContain("commit → /repo/.agents/skills/commit");
	});

	it("never claims /wf routing for a skill that is not contract-carrying", () => {
		const text = formatShadowWarning([{ name: "commit", locations: ["/x/commit"] }], new Set(["research"]));
		expect(text).not.toContain("/wf routes");
	});

	it("calls out contract-carrying names, which strand the graph rather than just a body", () => {
		const text = formatShadowWarning(shadowed, new Set(["research"]));
		expect(text).toContain("/wf routes research by name");
		expect(text).not.toContain("commit by name");
	});

	it("folds the tail once the list gets long, so the banner stays readable", () => {
		const many = Array.from({ length: 7 }, (_, i) => ({ name: `s${i}`, locations: [`/x/s${i}`] }));
		const text = formatShadowWarning(many);
		expect(text).toContain("7 bundled skills shadowed");
		expect(text).toContain("… and 3 more");
		expect(text).not.toContain("/x/s6");
	});
});
