import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { isManagedAgentName, safeJoin } from "./agents-allowlist.js";

describe("isManagedAgentName", () => {
	it("accepts a plain .md basename", () => {
		expect(isManagedAgentName("codebase-locator.md")).toBe(true);
	});

	it.each([
		["empty string", ""],
		["NUL byte", "agent\0.md"],
		["forward slash", "sub/agent.md"],
		["backslash", "sub\\agent.md"],
		["current dir", "."],
		["parent dir", ".."],
		["embedded double dot", "agent..md"],
		["absolute path", "/etc/agent.md"],
		["wrong extension", "agent.txt"],
	])("rejects %s", (_label, name) => {
		expect(isManagedAgentName(name)).toBe(false);
	});

	it("rejects a non-string value that slips past the type checker", () => {
		expect(isManagedAgentName(42 as unknown as string)).toBe(false);
	});
});

describe("safeJoin", () => {
	const target = resolve("/tmp/rpiv-agents");

	it("returns the resolved path for a name inside targetDir", () => {
		expect(safeJoin(target, "agent.md")).toBe(join(target, "agent.md"));
	});

	it("returns null when the name escapes targetDir", () => {
		expect(safeJoin(target, "../outside.md")).toBeNull();
	});

	it("returns null for an absolute name outside targetDir", () => {
		expect(safeJoin(target, "/etc/passwd")).toBeNull();
	});

	it("returns null when the name resolves to targetDir itself", () => {
		expect(safeJoin(target, ".")).toBeNull();
	});
});
