import { createMockCtx, createMockPi } from "@hs1n/rpiv-test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./pi-installer.js", () => ({ spawnPiInstall: vi.fn() }));
vi.mock("./package-checks.js", () => ({ findMissingSiblings: vi.fn() }));
vi.mock("./prune-legacy-siblings.js", () => ({
	findLegacySiblings: vi.fn(),
	pruneLegacySiblings: vi.fn(),
}));

import { findMissingSiblings } from "./package-checks.js";
import { spawnPiInstall } from "./pi-installer.js";
import { findLegacySiblings, pruneLegacySiblings } from "./prune-legacy-siblings.js";
import { registerSetupCommand } from "./setup-command.js";

const MISSING = [{ pkg: "npm:@x/a", matches: /./, provides: "A" }];

beforeEach(() => {
	vi.mocked(spawnPiInstall).mockReset();
	vi.mocked(spawnPiInstall).mockResolvedValue({ code: 0, stdout: "ok", stderr: "" });
	vi.mocked(findMissingSiblings).mockReset();
	vi.mocked(findMissingSiblings).mockReturnValue(MISSING);
	vi.mocked(findLegacySiblings).mockReset();
	vi.mocked(findLegacySiblings).mockReturnValue(["npm:pi-subagents"]);
	vi.mocked(pruneLegacySiblings).mockReset();
	vi.mocked(pruneLegacySiblings).mockReturnValue({ pruned: ["npm:pi-subagents"] });
});

async function run(args: string, hasUI: boolean) {
	const { pi, captured } = createMockPi();
	registerSetupCommand(pi);
	const ctx = createMockCtx({ hasUI });
	await captured.commands.get("mono-setup")?.handler(args, ctx as never);
	return ctx;
}

describe("/mono-setup --yes", () => {
	it.each([false, true])("prunes and installs with no confirmation (hasUI=%s)", async (hasUI) => {
		const ctx = await run("--yes", hasUI);
		expect(ctx.ui.confirm).not.toHaveBeenCalled();
		expect(pruneLegacySiblings).toHaveBeenCalledTimes(1);
		expect(spawnPiInstall).toHaveBeenCalledTimes(1);
		const report = (ctx.ui.notify as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0];
		expect(report).toContain("Installed");
	});

	it("accepts spaces around the flag", async () => {
		const ctx = await run("  --yes  ", false);
		expect(ctx.ui.confirm).not.toHaveBeenCalled();
		expect(spawnPiInstall).toHaveBeenCalledTimes(1);
	});

	it("reports nothing to do when no change is pending", async () => {
		vi.mocked(findMissingSiblings).mockReturnValue([]);
		vi.mocked(findLegacySiblings).mockReturnValue([]);
		const ctx = await run("--yes", false);
		expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("already installed"), "info");
		expect(pruneLegacySiblings).not.toHaveBeenCalled();
		expect(spawnPiInstall).not.toHaveBeenCalled();
	});
});

describe("/mono-setup — invalid argument", () => {
	it.each([false, true])("shows an error and changes nothing (hasUI=%s)", async (hasUI) => {
		const ctx = await run("--force", hasUI);
		expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("Unknown argument: --force"), "error");
		expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("/mono-setup [--yes]"), "error");
		expect(findMissingSiblings).not.toHaveBeenCalled();
		expect(ctx.ui.confirm).not.toHaveBeenCalled();
		expect(pruneLegacySiblings).not.toHaveBeenCalled();
		expect(spawnPiInstall).not.toHaveBeenCalled();
	});
});

describe("/mono-setup — no argument", () => {
	it("with no UI, reports nothing to do when no change is pending", async () => {
		vi.mocked(findMissingSiblings).mockReturnValue([]);
		vi.mocked(findLegacySiblings).mockReturnValue([]);
		const ctx = await run("", false);
		expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("already installed"), "info");
	});

	it("with a UI, asks for confirmation before it applies the changes", async () => {
		const ctx = await run("", true);
		expect(ctx.ui.confirm).toHaveBeenCalledTimes(1);
		expect(pruneLegacySiblings).toHaveBeenCalledTimes(1);
		expect(spawnPiInstall).toHaveBeenCalledTimes(1);
	});
});

describe("/mono-setup — argument completions", () => {
	function complete(prefix: string) {
		const { pi, captured } = createMockPi();
		registerSetupCommand(pi);
		return captured.commands.get("mono-setup")?.getArgumentCompletions?.(prefix);
	}

	it("offers --yes for an empty or matching prefix", () => {
		expect(complete("")).toEqual([expect.objectContaining({ value: "--yes" })]);
		expect(complete("--y")).toEqual([expect.objectContaining({ value: "--yes" })]);
	});

	it("offers nothing for a prefix that does not match", () => {
		expect(complete("all")).toBeNull();
	});
});
