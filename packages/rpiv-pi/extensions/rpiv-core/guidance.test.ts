import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createMockPi, writeGuidanceTree } from "@hs1n/rpiv-test-utils";
import { afterEach, beforeEach, describe, expect, it, type vi } from "vitest";
import {
	clearInjectionState,
	handleToolCallGuidance,
	hasExactFile,
	injectRootGuidance,
	resolveAndFormatNewGuidance,
	resolveGuidance,
	takeDeepest,
	takeRootGuidance,
} from "./guidance.js";

let projectDir: string;

beforeEach(() => {
	projectDir = mkdtempSync(join(tmpdir(), "rpiv-guidance-"));
	clearInjectionState();
});
afterEach(() => {
	rmSync(projectDir, { recursive: true, force: true });
});

describe("resolveGuidance — ladder", () => {
	it("AGENTS.md > CLAUDE.md > architecture.md at depth > 0", () => {
		writeGuidanceTree(projectDir, {
			"src/AGENTS.md": "agents-body",
			"src/CLAUDE.md": "claude-body",
			".rpiv/guidance/src/architecture.md": "arch-body",
		});
		const resolved = resolveGuidance(join(projectDir, "src", "foo.ts"), projectDir);
		const srcEntry = resolved.find((r) => r.relativePath.startsWith("src/"));
		expect(srcEntry?.kind).toBe("agents");
	});

	it("depth 0 skips AGENTS/CLAUDE but keeps root architecture.md", () => {
		writeGuidanceTree(projectDir, {
			"AGENTS.md": "root-agents",
			".rpiv/guidance/architecture.md": "root-arch",
		});
		const resolved = resolveGuidance(join(projectDir, "any", "file.ts"), projectDir);
		const rootEntry = resolved.find((r) => r.relativePath === ".rpiv/guidance/architecture.md");
		expect(rootEntry?.kind).toBe("architecture");
		expect(resolved.some((r) => r.relativePath === "AGENTS.md")).toBe(false);
	});

	it("returns root-first, specific-last order", () => {
		writeGuidanceTree(projectDir, {
			".rpiv/guidance/architecture.md": "root",
			"a/AGENTS.md": "a",
			"a/b/AGENTS.md": "ab",
		});
		const resolved = resolveGuidance(join(projectDir, "a", "b", "c.ts"), projectDir);
		expect(resolved.map((r) => r.content)).toEqual(["root", "a", "ab"]);
	});

	it("returns empty when file is outside projectDir", () => {
		expect(resolveGuidance("/totally/elsewhere/foo.ts", projectDir)).toEqual([]);
	});

	it("returns empty when nothing exists along the ladder", () => {
		expect(resolveGuidance(join(projectDir, "x.ts"), projectDir)).toEqual([]);
	});
});

describe("injectRootGuidance", () => {
	it("sends root architecture.md when present", () => {
		writeGuidanceTree(projectDir, { ".rpiv/guidance/architecture.md": "body" });
		const { pi } = createMockPi();
		injectRootGuidance(projectDir, pi);
		expect(pi.sendMessage).toHaveBeenCalledTimes(1);
		const content = (pi.sendMessage as ReturnType<typeof vi.fn>).mock.calls[0][0].content;
		expect(content).toContain("body");
		expect(content).toContain("reference material, NOT a task");
		expect(content).toContain("auto-loaded at session start");
	});

	it("is idempotent across calls within a session", () => {
		writeGuidanceTree(projectDir, { ".rpiv/guidance/architecture.md": "body" });
		const { pi } = createMockPi();
		injectRootGuidance(projectDir, pi);
		injectRootGuidance(projectDir, pi);
		expect(pi.sendMessage).toHaveBeenCalledTimes(1);
	});

	it("re-injects after clearInjectionState", () => {
		writeGuidanceTree(projectDir, { ".rpiv/guidance/architecture.md": "body" });
		const { pi } = createMockPi();
		injectRootGuidance(projectDir, pi);
		clearInjectionState();
		injectRootGuidance(projectDir, pi);
		expect(pi.sendMessage).toHaveBeenCalledTimes(2);
	});

	it("a case-colliding root file is not injected as root guidance", () => {
		// `.rpiv/guidance/Architecture.md` is not `.rpiv/guidance/architecture.md`,
		// but a case-insensitive filesystem says otherwise to existsSync.
		writeGuidanceTree(projectDir, { ".rpiv/guidance/Architecture.md": "wrong-case" });
		const { pi } = createMockPi();
		injectRootGuidance(projectDir, pi);
		expect(pi.sendMessage).not.toHaveBeenCalled();
		expect(takeRootGuidance(projectDir)).toBeNull();
	});

	it("force-takes root guidance after another session marked it injected", () => {
		writeGuidanceTree(projectDir, { ".rpiv/guidance/architecture.md": "body" });
		const { pi } = createMockPi();
		injectRootGuidance(projectDir, pi);
		expect(takeRootGuidance(projectDir)).toBeNull();
		expect(takeRootGuidance(projectDir, "post compact", true)).toContain("body");
	});

	it("no-ops when root architecture.md is missing", () => {
		const { pi } = createMockPi();
		injectRootGuidance(projectDir, pi);
		expect(pi.sendMessage).not.toHaveBeenCalled();
	});
});

describe("takeDeepest — the throttle knob's scale", () => {
	it("0 or negative selects nothing, rather than the whole ladder", () => {
		// `slice(-0)` is `slice(0)`: the whole array. The guard is what makes 0 mean off.
		expect(takeDeepest(["a", "b", "c"], 0)).toEqual([]);
		expect(takeDeepest(["a", "b", "c"], -1)).toEqual([]);
	});

	it("1 selects only the most specific hit (the default)", () => {
		expect(takeDeepest(["a", "b", "c"], 1)).toEqual(["c"]);
	});

	it("n selects the n most specific, and Infinity the whole ladder", () => {
		expect(takeDeepest(["a", "b", "c"], 2)).toEqual(["b", "c"]);
		expect(takeDeepest(["a", "b", "c"], Number.POSITIVE_INFINITY)).toEqual(["a", "b", "c"]);
	});
});

describe("resolveAndFormatNewGuidance", () => {
	it("returns null when nothing resolves along the ladder", () => {
		expect(resolveAndFormatNewGuidance(join(projectDir, "x.ts"), projectDir, "read")).toBeNull();
	});

	it("returns null when all resolved files are already injected (cross-call dedup)", () => {
		writeGuidanceTree(projectDir, { "src/AGENTS.md": "a" });
		const filePath = join(projectDir, "src", "x.ts");
		const { pi } = createMockPi();
		// Handler marks via the helper on the first tool_call.
		handleToolCallGuidance({ toolName: "read", input: { file_path: filePath } }, { cwd: projectDir }, pi);
		// Helper now sees everything as injected → null.
		expect(resolveAndFormatNewGuidance(filePath, projectDir, "read")).toBeNull();
	});

	it("injects only the most specific hit — the root file is delivered at session start", () => {
		writeGuidanceTree(projectDir, {
			".rpiv/guidance/architecture.md": "root",
			"src/AGENTS.md": "src",
		});
		const content = resolveAndFormatNewGuidance(join(projectDir, "src", "x.ts"), projectDir, "write");
		expect(content).toContain("src");
		expect(content).not.toContain("root");
		expect(content).toContain("auto-loaded because write touched src/x.ts");
		expect(content?.split("\n\n---\n\n")).toHaveLength(1);
	});

	it("never injects the intermediate levels on the tool path", () => {
		writeGuidanceTree(projectDir, {
			".rpiv/guidance/architecture.md": "root",
			".rpiv/guidance/packages/architecture.md": "mid",
			".rpiv/guidance/packages/app/architecture.md": "leaf",
		});
		const content = resolveAndFormatNewGuidance(join(projectDir, "packages", "app", "x.ts"), projectDir, "read");
		expect(content).toContain("leaf");
		expect(content).not.toContain("mid");
		expect(content).not.toContain("root");
	});

	it("delivers an intermediate level on a LATER touch rather than dropping it", () => {
		// The discriminating case for filter-then-slice: the first touch sends only the
		// leaf; the ancestor that was resolved but never injected is delivered by the
		// next touch of that directory. Slicing before filtering drops it forever.
		writeGuidanceTree(projectDir, {
			".rpiv/guidance/architecture.md": "root",
			".rpiv/guidance/packages/architecture.md": "mid",
			".rpiv/guidance/packages/app/architecture.md": "leaf",
		});
		const first = resolveAndFormatNewGuidance(join(projectDir, "packages", "app", "x.ts"), projectDir, "read");
		expect(first).toContain("leaf");
		expect(first).not.toContain("mid");

		const second = resolveAndFormatNewGuidance(join(projectDir, "packages", "app", "y.ts"), projectDir, "read");
		expect(second).toContain("mid");
		expect(second).not.toContain("root");
	});

	it("uses the deepest existing level when the leaf directory has no guidance of its own", () => {
		writeGuidanceTree(projectDir, { ".rpiv/guidance/src/architecture.md": "src-level" });
		const content = resolveAndFormatNewGuidance(join(projectDir, "src", "deep", "x.ts"), projectDir, "read");
		expect(content).toContain("src-level");
	});

	it("marks injected files before returning — a second call returns null", () => {
		writeGuidanceTree(projectDir, { "src/AGENTS.md": "a" });
		const filePath = join(projectDir, "src", "x.ts");
		// First call returns content AND marks the dedup Set.
		expect(resolveAndFormatNewGuidance(filePath, projectDir, "read")).not.toBeNull();
		// The mark landed before the return, so the dedup filter now excludes it.
		expect(resolveAndFormatNewGuidance(filePath, projectDir, "read")).toBeNull();
	});
});

describe("handleToolCallGuidance", () => {
	it("skips non-read/edit/write tools", () => {
		const { pi } = createMockPi();
		handleToolCallGuidance({ toolName: "bash", input: {} }, { cwd: projectDir }, pi);
		expect(pi.sendMessage).not.toHaveBeenCalled();
	});

	it("dedupes per-file across multiple tool_calls", () => {
		writeGuidanceTree(projectDir, { "src/AGENTS.md": "a" });
		const { pi } = createMockPi();
		const ev = { toolName: "read", input: { file_path: join(projectDir, "src", "x.ts") } };
		handleToolCallGuidance(ev, { cwd: projectDir }, pi);
		handleToolCallGuidance(ev, { cwd: projectDir }, pi);
		expect(pi.sendMessage).toHaveBeenCalledTimes(1);
	});

	it("supports both 'path' and 'file_path' input keys", () => {
		writeGuidanceTree(projectDir, { "src/AGENTS.md": "a" });
		const { pi } = createMockPi();
		handleToolCallGuidance(
			{ toolName: "edit", input: { path: join(projectDir, "src", "x.ts") } },
			{ cwd: projectDir },
			pi,
		);
		expect(pi.sendMessage).toHaveBeenCalledTimes(1);
	});

	it("emits one sendMessage for the most specific newly-resolved file", () => {
		writeGuidanceTree(projectDir, {
			".rpiv/guidance/architecture.md": "root",
			"src/AGENTS.md": "src",
		});
		const { pi } = createMockPi();
		handleToolCallGuidance(
			{ toolName: "write", input: { file_path: join(projectDir, "src", "x.ts") } },
			{ cwd: projectDir },
			pi,
		);
		expect(pi.sendMessage).toHaveBeenCalledTimes(1);
		const content = (pi.sendMessage as ReturnType<typeof vi.fn>).mock.calls[0][0].content;
		expect(content).toContain("src (AGENTS.md)");
		expect(content).not.toContain("root (architecture.md)");
		expect(content).toContain("auto-loaded because write touched src/x.ts");
	});
});

describe("guidance candidates are case-exact", () => {
	// The ladder used to test `existsSync(join(dir, "AGENTS.md"))`, which on a
	// case-insensitive filesystem (APFS, NTFS — the macOS and Windows defaults) matches
	// a lowercase `agents.md`. This repo had one — `packages/rpiv-pi/docs/agents.md`, a
	// docs page about the bundled subagents, since renamed to `bundled-agents.md`; the
	// fixtures below rebuild that shape, so they keep exercising it.
	//
	// The two resolveGuidance cases below are true regressions on such a filesystem and
	// pass vacuously on a case-sensitive one, which is why the helper's own behaviour is
	// pinned separately — that assertion holds on either.

	it("hasExactFile matches the stored name, not a case-insensitive sibling", () => {
		writeGuidanceTree(projectDir, { "docs/agents.md": "docs-page" });
		expect(hasExactFile(join(projectDir, "docs"), "AGENTS.md")).toBe(false);
		expect(hasExactFile(join(projectDir, "docs"), "agents.md")).toBe(true);
	});

	it("a missing or unreadable directory is a miss, not a throw", () => {
		expect(hasExactFile(join(projectDir, "nope"), "AGENTS.md")).toBe(false);
	});

	it("a lowercase agents.md is never injected under the agents kind", () => {
		writeGuidanceTree(projectDir, { "src/agents.md": "docs-page" });
		const resolved = resolveGuidance(join(projectDir, "src", "foo.ts"), projectDir);
		expect(resolved.some((r) => r.kind === "agents")).toBe(false);
		expect(resolved.some((r) => r.content === "docs-page")).toBe(false);
	});

	it("a case-colliding sibling does not shadow the shadow tree", () => {
		writeGuidanceTree(projectDir, {
			"docs/agents.md": "docs-page",
			".rpiv/guidance/docs/architecture.md": "real-guidance",
		});
		const resolved = resolveGuidance(join(projectDir, "docs", "x.ts"), projectDir);
		expect(resolved.map((r) => r.content)).toEqual(["real-guidance"]);
		expect(resolved[0]?.kind).toBe("architecture");
	});
});
