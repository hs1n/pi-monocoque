import { createMockPi } from "@hs1n/rpiv-test-utils";
import { describe, expect, it } from "vitest";
import { aliasDescription, registerCommandWithAliases } from "./command-aliases.js";
import { MSG_MODELS_USAGE } from "./rpiv-models/args.js";
import { registerRpivModelsCommand } from "./rpiv-models/index.js";
import { registerSetupCommand } from "./setup-command.js";
import { registerUpdateAgentsCommand } from "./update-agents-command.js";

describe("registerCommandWithAliases", () => {
	it("registers the primary name with its options and each alias with the same handler", () => {
		const { pi, captured } = createMockPi();
		const handler = async () => {};
		const getArgumentCompletions = () => null;
		registerCommandWithAliases(
			pi,
			{ name: "mono-x", aliases: ["rpiv-x", "old-x"] },
			{ description: "Do x", handler, getArgumentCompletions },
		);
		expect(captured.commands.get("mono-x")?.description).toBe("Do x");
		for (const alias of ["rpiv-x", "old-x"]) {
			const cmd = captured.commands.get(alias);
			expect(cmd?.handler).toBe(handler);
			expect(cmd?.getArgumentCompletions).toBe(getArgumentCompletions);
			expect(cmd?.description).toBe("Alias of /mono-x (old name).");
		}
	});

	it("registers only the primary name when there are no aliases", () => {
		const { pi, captured } = createMockPi();
		registerCommandWithAliases(pi, { name: "mono-y", aliases: [] }, { description: "y", handler: async () => {} });
		expect([...captured.commands.keys()]).toEqual(["mono-y"]);
	});
});

const COMMANDS = [
	{ primary: "mono-setup", alias: "rpiv-setup", register: registerSetupCommand, completes: true },
	{ primary: "mono-models", alias: "rpiv-models", register: registerRpivModelsCommand, completes: true },
	{
		primary: "mono-update-agents",
		alias: "rpiv-update-agents",
		register: registerUpdateAgentsCommand,
		completes: false,
	},
] as const;

describe.each(COMMANDS)("/$primary keeps /$alias as an alias", ({ primary, alias, register, completes }) => {
	it("registers both names with the same handler and completions", () => {
		const { pi, captured } = createMockPi();
		register(pi);
		const main = captured.commands.get(primary);
		const old = captured.commands.get(alias);
		expect(main).toBeDefined();
		expect(old).toBeDefined();
		expect(old?.handler).toBe(main?.handler);
		expect(old?.getArgumentCompletions).toBe(main?.getArgumentCompletions);
		expect(typeof main?.getArgumentCompletions === "function").toBe(completes);
		expect(old?.description).toBe(aliasDescription(primary));
		expect(main?.description).not.toBe(aliasDescription(primary));
	});
});

describe("usage text names the primary command", () => {
	it("/mono-models usage lines use the registered primary name", () => {
		const { pi, captured } = createMockPi();
		registerRpivModelsCommand(pi);
		const usageLines = MSG_MODELS_USAGE.split("\n").filter((l) => l.trim().startsWith("/"));
		expect(usageLines.length).toBeGreaterThan(0);
		for (const line of usageLines) expect(line.trim().startsWith("/mono-models ")).toBe(true);
		expect(captured.commands.has("mono-models")).toBe(true);
		expect(MSG_MODELS_USAGE).not.toContain("/rpiv-models");
	});
});
