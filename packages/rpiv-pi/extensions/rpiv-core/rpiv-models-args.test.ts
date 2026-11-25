import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { createMockPi } from "@hs1n/rpiv-test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { bundledAgentNames } from "./models-config-sources.js";
import { registerRpivModelsCommand } from "./rpiv-models/index.js";

vi.mock("./models-picker.js", () => ({
	showFilterablePicker: vi.fn(),
}));

const { showFilterablePicker } = await import("./models-picker.js");

const CONFIG_PATH = join(process.env.HOME!, ".config", "rpiv-pi", "models.json");
const stubSourceInfo = { path: "/stub/SKILL.md", baseDir: "/stub" };
const COMMANDS = [
	{ name: "skill:commit", description: "Commit changes", source: "skill", sourceInfo: stubSourceInfo },
	{ name: "rpiv-models", description: "Configure models", source: "extension", sourceInfo: stubSourceInfo },
];

function setup() {
	const { pi, captured } = createMockPi();
	(pi as unknown as { getCommands: () => unknown[] }).getCommands = () => COMMANDS;
	registerRpivModelsCommand(pi as unknown as ExtensionAPI);
	const cmd = captured.commands.get("rpiv-models")!;
	return { cmd };
}

function makeCtx(hasUI: boolean) {
	const models = [
		{ name: "GLM-4.7", provider: "zai", id: "glm-4-7", reasoning: false },
		{ name: "GPT-5.5", provider: "openai", id: "gpt-5.5", reasoning: true },
	];
	return {
		hasUI,
		cwd: process.cwd(),
		ui: { notify: vi.fn(), confirm: vi.fn(async () => true) },
		modelRegistry: { getAvailable: () => models },
	} as unknown as ExtensionContext;
}

async function run(args: string, hasUI: boolean) {
	const { cmd } = setup();
	const ctx = makeCtx(hasUI);
	await cmd.handler(args, ctx as never);
	return ctx;
}

const lastNotify = (ctx: ExtensionContext) => vi.mocked(ctx.ui.notify).mock.calls.at(-1)!;
const stored = () => JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));

function seed(config: object) {
	mkdirSync(dirname(CONFIG_PATH), { recursive: true });
	writeFileSync(CONFIG_PATH, JSON.stringify(config), "utf-8");
}

beforeEach(() => {
	rmSync(CONFIG_PATH, { force: true });
	vi.mocked(showFilterablePicker).mockReset();
});

describe("/rpiv-models set — valid arguments", () => {
	it.each([false, true])("writes defaults with no picker (hasUI=%s)", async (hasUI) => {
		const ctx = await run("set defaults zai/glm-4-7", hasUI);
		expect(stored().defaults).toBe("zai/glm-4-7");
		expect(lastNotify(ctx)).toEqual([expect.stringContaining("Saved defaults"), "info"]);
		expect(showFilterablePicker).not.toHaveBeenCalled();
	});

	it("writes a model and an effort for a bundled agent", async () => {
		const agent = bundledAgentNames()[0];
		expect(agent).toBeDefined();
		await run(`set agents ${agent} openai/gpt-5.5 high`, false);
		expect(stored().agents[agent]).toEqual({ model: "openai/gpt-5.5", thinking: "high" });
	});

	it("writes thinking:'off' when the effort is off", async () => {
		await run("set skills commit openai/gpt-5.5 off", false);
		expect(stored().skills.commit).toEqual({ model: "openai/gpt-5.5", thinking: "off" });
	});

	it("keeps the other overrides", async () => {
		seed({ defaults: "zai/glm-4-7" });
		await run("set skills commit zai/glm-4-7", false);
		expect(stored()).toEqual({ defaults: "zai/glm-4-7", skills: { commit: "zai/glm-4-7" } });
	});
});

describe("/rpiv-models unset — valid arguments", () => {
	it("removes one override", async () => {
		seed({ defaults: "zai/glm-4-7", skills: { commit: "zai/glm-4-7" } });
		const ctx = await run("unset skills commit", false);
		expect(stored()).toEqual({ defaults: "zai/glm-4-7" });
		expect(lastNotify(ctx)).toEqual([expect.stringContaining("Removed skills/commit"), "info"]);
	});

	it("reports when there is no override to remove, and does not write", async () => {
		const ctx = await run("unset defaults", false);
		expect(lastNotify(ctx)).toEqual([expect.stringContaining("No override set for defaults"), "info"]);
		expect(existsSync(CONFIG_PATH)).toBe(false);
	});
});

describe("/rpiv-models show", () => {
	it("shows the current overrides", async () => {
		seed({ defaults: "zai/glm-4-7" });
		const ctx = await run("show", false);
		expect(lastNotify(ctx)).toEqual([expect.stringContaining('"defaults": "zai/glm-4-7"'), "info"]);
	});

	it("says when no override is set", async () => {
		const ctx = await run("show", true);
		expect(lastNotify(ctx)).toEqual([expect.stringContaining("No model overrides are set"), "info"]);
		expect(showFilterablePicker).not.toHaveBeenCalled();
	});
});

describe("/rpiv-models — invalid arguments do not write", () => {
	it.each([
		["frobnicate", "Unknown subcommand: frobnicate"],
		["show extra", "Too many arguments: extra"],
		["set", "Scope is missing"],
		["set presets x zai/glm-4-7", "Unknown scope: presets"],
		["set agents", "The agent name is missing"],
		["set agents no-such-agent zai/glm-4-7", "Unknown agent: no-such-agent"],
		["set skills nope zai/glm-4-7", "Unknown skill: nope"],
		["set defaults", "Model is missing"],
		["set defaults no/such-model", "Unknown model: no/such-model"],
		["set defaults zai/glm-4-7 high", "does not support a reasoning effort"],
		["set defaults openai/gpt-5.5 extreme", "Unknown effort: extreme"],
		["set defaults openai/gpt-5.5 high extra", "Too many arguments: extra"],
		["unset defaults extra", "Too many arguments: extra"],
		["unset skills", "The skill name is missing"],
	])("%s → error", async (args, message) => {
		const ctx = await run(args, false);
		const [text, level] = lastNotify(ctx);
		expect(level).toBe("error");
		expect(text).toContain(message);
		expect(text).toContain("Usage:");
		expect(existsSync(CONFIG_PATH)).toBe(false);
	});

	it("leaves an existing file unchanged", async () => {
		seed({ defaults: "zai/glm-4-7" });
		await run("set defaults no/such-model", false);
		expect(stored()).toEqual({ defaults: "zai/glm-4-7" });
	});
});

describe("/rpiv-models — no arguments", () => {
	it("with no UI, shows the config and the usage, and opens no picker", async () => {
		seed({ defaults: "zai/glm-4-7" });
		const ctx = await run("   ", false);
		const [text, level] = lastNotify(ctx);
		expect(level).toBe("info");
		expect(text).toContain('"defaults": "zai/glm-4-7"');
		expect(text).toContain("/rpiv-models set defaults <model> [effort]");
		expect(showFilterablePicker).not.toHaveBeenCalled();
	});

	it("with a UI, opens the scope picker (old path)", async () => {
		vi.mocked(showFilterablePicker).mockResolvedValueOnce(null);
		const ctx = await run("", true);
		expect(showFilterablePicker).toHaveBeenCalledTimes(1);
		expect(ctx.ui.notify).not.toHaveBeenCalled();
		expect(existsSync(CONFIG_PATH)).toBe(false);
	});
});

describe("/rpiv-models — argument completions", () => {
	const complete = (prefix: string) => setup().cmd.getArgumentCompletions?.(prefix);
	const values = (prefix: string) => (complete(prefix) as { value: string }[] | null)?.map((i) => i.value) ?? null;

	it("completes subcommands", () => {
		expect(values("")).toEqual(["show", "set", "unset"]);
		expect(values("se")).toEqual(["set"]);
	});

	it("completes scopes after set and unset", () => {
		expect(values("set ")).toEqual(["set defaults", "set agents", "set skills"]);
		expect(values("unset sk")).toEqual(["unset skills"]);
	});

	it("completes skill and agent names", () => {
		expect(values("set skills c")).toEqual(["set skills commit"]);
		const agent = bundledAgentNames()[0];
		expect(values(`unset agents ${agent}`)).toContain(`unset agents ${agent}`);
	});

	it("returns null for skill names when getCommands throws before the runtime binds", () => {
		const { pi, captured } = createMockPi();
		(pi as unknown as { getCommands: () => unknown[] }).getCommands = () => {
			throw new Error("Extension runtime not initialized");
		};
		registerRpivModelsCommand(pi as unknown as ExtensionAPI);
		const cmd = captured.commands.get("rpiv-models")!;
		expect(cmd.getArgumentCompletions?.("set skills c")).toBeNull();
		expect(cmd.getArgumentCompletions?.("se")).toEqual([expect.objectContaining({ value: "set" })]);
	});

	it("returns null when nothing matches or no completion applies", () => {
		expect(values("zzz")).toBeNull();
		expect(values("show ")).toBeNull();
		expect(values("set defaults ")).toBeNull();
	});
});
