import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const HELPER = fileURLToPath(new URL("./artifact-index.mjs", import.meta.url));

let dir: string;

const run = (...argv: string[]) =>
	execFileSync("node", [HELPER, "--root", dir, ...argv], {
		cwd: dir,
		encoding: "utf-8",
		stdio: ["ignore", "pipe", "ignore"],
	});

/** Data rows (after `root:` and the header), split into columns. */
const rows = (out: string) =>
	out
		.trim()
		.split("\n")
		.slice(2)
		.map((l) => l.split("\t"));

const write = (path: string, contents = "") => {
	const full = join(dir, path);
	mkdirSync(dirname(full), { recursive: true });
	writeFileSync(full, contents);
};

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), "rpiv-artifact-index-"));
});

afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
});

describe("artifact-index.mjs", () => {
	it("prints `missing` for an absent root (exit 0)", () => {
		const missing = join(dir, "nope");
		const out = execFileSync("node", [HELPER, "--root", missing], { encoding: "utf-8" });
		expect(out.trim().split("\n")).toEqual([`root: ${missing}`, "missing"]);
	});

	it("prints `empty` when no Markdown artifact exists", () => {
		write("verdicts/x__dim__2026-01-01_00-00-00.json", "{}");
		expect(run().trim().split("\n")[1]).toBe("empty");
	});

	it("sorts by filename slug, newest first, and maps bucket to stage", () => {
		write("discover/2026-01-01_09-00-00_export-json.md");
		write("plans/2026-01-03_09-00-00_export-json.md");
		write("research/2026-01-02_09-00-00_export-json.md");
		const r = rows(run());
		expect(r.map((c) => c[1])).toEqual(["plans", "research", "discover"]);
		expect(r[0]?.[0]).toBe("2026-01-03 09:00:00");
		expect(r[0]?.[2]).toBe("plan/blueprint/quick-plan/synthesize");
		expect(r[2]?.[2]).toBe("discover");
	});

	it("labels per-slice designs as design-slice", () => {
		write("designs/2026-01-01_09-00-00_export_slice-2_api.md");
		write("designs/2026-01-01_08-00-00_export.md");
		expect(rows(run()).map((c) => c[2])).toEqual(["design-slice", "design"]);
	});

	it("filters by topic in the filename or the frontmatter, case-insensitively", () => {
		write("research/2026-01-02_09-00-00_export-json.md");
		write("research/2026-01-02_10-00-00_other.md");
		write("validation/2026-01-03_09-00-00_v.md", '---\ntopic: "Validation of Export JSON"\nstatus: ready\n---\n');
		const r = rows(run("EXPORT"));
		expect(r.map((c) => c[1])).toEqual(["validation", "research"]);
		expect(r[0]?.[3]).toBe("ready");
		expect(r[1]?.[3]).toBe("-");
	});

	it("keeps only the newest --limit rows per bucket", () => {
		for (let i = 1; i <= 5; i++) write(`reviews/2026-01-0${i}_09-00-00_r${i}.md`);
		const r = rows(run("--limit", "2"));
		expect(r.map((c) => c[0])).toEqual(["2026-01-05 09:00:00", "2026-01-04 09:00:00"]);
	});
});
