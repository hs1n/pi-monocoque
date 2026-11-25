import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
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
	rmSync(`${dir}-outside`, { recursive: true, force: true });
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

	it("prints `missing` when the root is a file (exit 0)", () => {
		write("not-a-dir", "x");
		const file = join(dir, "not-a-dir");
		const out = execFileSync("node", [HELPER, "--root", file], { encoding: "utf-8" });
		expect(out.trim().split("\n")).toEqual([`root: ${file}`, "missing"]);
	});

	// Root can read a chmod 000 file, so the test has no meaning as root.
	it.skipIf(process.getuid?.() === 0)("lists an unreadable file and keeps the other rows", () => {
		write("plans/2026-01-02_09-00-00_locked.md", "---\nstatus: ready\n---\n");
		write("plans/2026-01-01_09-00-00_open.md", "---\nstatus: draft\n---\n");
		const locked = join(dir, "plans/2026-01-02_09-00-00_locked.md");
		chmodSync(locked, 0o000);
		try {
			const r = rows(run());
			expect(r.map((c) => c[3])).toEqual(["unreadable", "draft"]);
		} finally {
			chmodSync(locked, 0o644);
		}
	});

	it("reads the frontmatter of a file that is larger than the read limit", () => {
		write("plans/2026-01-01_09-00-00_big.md", `---\ntopic: big\nstatus: ready\n---\n${"x".repeat(64 * 1024)}\n`);
		expect(rows(run("big")).map((c) => c[3])).toEqual(["ready"]);
	});

	it("reads only the start of a file, not the full file", () => {
		// The `status:` line is after the first 8 KB, so a bounded read does not see it.
		write(
			"plans/2026-01-01_09-00-00_deep.md",
			`---\ntopic: deep\nnote: ${"x".repeat(16 * 1024)}\nstatus: ready\n---\n`,
		);
		expect(rows(run("deep")).map((c) => c[3])).toEqual(["-"]);
	});

	it("skips symlinked buckets and files, and counts them", () => {
		write("plans/2026-01-01_09-00-00_real.md");
		const outside = `${dir}-outside`;
		mkdirSync(join(outside, "bucket"), { recursive: true });
		writeFileSync(join(outside, "2026-01-02_09-00-00_link.md"), "");
		symlinkSync(join(outside, "2026-01-02_09-00-00_link.md"), join(dir, "plans/2026-01-02_09-00-00_link.md"));
		symlinkSync(join(outside, "bucket"), join(dir, "research"));
		const lines = run().trim().split("\n");
		expect(lines.at(-1)).toBe("skipped symlinks: 2");
		expect(lines.slice(2, -1).map((l) => l.split("\t")[4])).toEqual(["plans/2026-01-01_09-00-00_real.md"]);
	});

	it("prints no symlink line when there is no symlink", () => {
		write("plans/2026-01-01_09-00-00_real.md");
		expect(run()).not.toContain("skipped symlinks");
	});

	it.each([
		[["--limit", "--root", "x"], "error: --limit needs a value"],
		[["--limit", "abc"], 'error: --limit needs a positive integer, not "abc"'],
		[["--limit", "0"], 'error: --limit needs a positive integer, not "0"'],
		[["--limit"], "error: --limit needs a value"],
	])("prints an error line for a bad flag value %j (exit 0)", (argv, error) => {
		const out = execFileSync("node", [HELPER, ...argv], { cwd: dir, encoding: "utf-8" });
		expect(out.trim().split("\n")).toEqual([error]);
	});

	it("prints an error line when --root has no value (exit 0)", () => {
		const out = execFileSync("node", [HELPER, "--root", "--limit", "2"], { cwd: dir, encoding: "utf-8" });
		expect(out.trim()).toBe("error: --root needs a value");
	});
});
