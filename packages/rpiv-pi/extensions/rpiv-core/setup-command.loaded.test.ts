/**
 * /rpiv-setup never re-installs a sibling that is already loaded (#216) — real
 * detection (package-checks + loaded-siblings) over a real settings file; only
 * the installer is mocked. Installing a copy of a sibling another package
 * already loads makes both copies register the same tools on every session.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { createMockCtx, createMockPi } from "@hs1n/rpiv-test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./pi-installer.js", () => ({ spawnPiInstall: vi.fn(async () => ({ code: 0, stdout: "", stderr: "" })) }));

import { spawnPiInstall } from "./pi-installer.js";
import { registerSetupCommand } from "./setup-command.js";
import { resolveInstallSpec, SIBLINGS } from "./siblings.js";
import { getPiAgentSettingsPath } from "./utils.js";

const KIT = "/home/u/.pi/agent/npm/node_modules/frida-pi-studio/node_modules";

function writeSettings(packages: unknown[]) {
	const path = getPiAgentSettingsPath();
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, JSON.stringify({ packages }), "utf-8");
}

async function runSetup(loadedToolPaths: string[]) {
	const { pi, captured } = createMockPi();
	captured.allTools.push(...loadedToolPaths.map((path) => ({ name: "t", sourceInfo: { path } }) as never));
	registerSetupCommand(pi);
	const ctx = createMockCtx({ hasUI: true });
	vi.mocked(ctx.ui.confirm).mockResolvedValue(true);
	await captured.commands.get("rpiv-setup")?.handler("", ctx as never);
	return ctx;
}

describe("/rpiv-setup — siblings loaded outside settings (#216)", () => {
	beforeEach(() => {
		delete (globalThis as Record<symbol, unknown>)[Symbol.for("@hs1n/rpiv-args:loaded")];
	});

	it("everything else declared, rpiv-todo bundled in a kit: nothing to install", async () => {
		writeSettings(["npm:frida-pi-studio", ...SIBLINGS.map((s) => s.pkg).filter((p) => !p.includes("rpiv-todo"))]);
		const ctx = await runSetup([`${KIT}/@hs1n/rpiv-todo/index.ts`]);
		expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("already installed"), "info");
		expect(ctx.ui.confirm).not.toHaveBeenCalled();
		expect(spawnPiInstall).not.toHaveBeenCalled();
	});

	it("installs only the siblings that are neither declared nor loaded", async () => {
		writeSettings(["npm:frida-pi-studio"]);
		await runSetup([`${KIT}/@hs1n/rpiv-todo/index.ts`, `${KIT}/@hs1n/rpiv-advisor/index.ts`]);
		const installed = vi.mocked(spawnPiInstall).mock.calls.map(([pkg]) => pkg);
		expect(installed).not.toContain("npm:@hs1n/rpiv-todo");
		expect(installed).not.toContain("npm:@hs1n/rpiv-advisor");
		expect(installed).toHaveLength(SIBLINGS.length - 2);
	});

	it("nothing loaded: offers every undeclared sibling, as before", async () => {
		writeSettings([]);
		await runSetup([]);
		// Registry order, with this repo's own siblings resolved to local paths (no publish path).
		expect(vi.mocked(spawnPiInstall).mock.calls.map(([pkg]) => pkg)).toEqual(
			SIBLINGS.map((s) => resolveInstallSpec(s.pkg)),
		);
	});
});
