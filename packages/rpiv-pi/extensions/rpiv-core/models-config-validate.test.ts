import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./models-config-sources.js", () => ({
	bundledAgentNames: vi.fn(() => ["codebase-analyzer"]),
	skillCommandNames: vi.fn(() => ["commit"]),
}));

import { skillCommandNames } from "./models-config-sources.js";
import { registerModelsConfigValidation } from "./models-config-validate.js";

function writeModels(config: unknown) {
	const dir = join(process.env.HOME!, ".config", "rpiv-pi");
	mkdirSync(dir, { recursive: true });
	writeFileSync(join(dir, "models.json"), JSON.stringify(config), "utf-8");
}

function makePi() {
	let handler: ((event: unknown, ctx: unknown) => unknown) | undefined;
	const pi = {
		on: vi.fn((event: string, h: (...args: unknown[]) => unknown) => {
			if (event === "session_start") handler = h;
		}),
	} as unknown as ExtensionAPI;
	return { pi, fire: (ctx: unknown = { cwd: "/tmp" }) => handler?.({}, ctx) };
}

afterEach(() => {
	vi.mocked(skillCommandNames).mockReset();
	vi.mocked(skillCommandNames).mockReturnValue(["commit"]);
});

describe("models-config-validate — session_start warn-on-miss", () => {
	it("warns once for each typo'd key across all axes", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		writeModels({
			agents: { "codebase-analzyer": "a/b" },
			skills: { committ: "a/b" },
		});
		const { pi, fire } = makePi();
		registerModelsConfigValidation(pi);
		await fire();

		const warned = warn.mock.calls.map((c) => String(c[0]));
		expect(warned.some((w) => w.includes("agents.codebase-analzyer"))).toBe(true);
		expect(warned.some((w) => w.includes("skills.committ"))).toBe(true);
		warn.mockRestore();
	});

	it("stays silent when every key is valid", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		writeModels({
			agents: { "codebase-analyzer": "a/b" },
			skills: { commit: "a/b" },
		});
		const { pi, fire } = makePi();
		registerModelsConfigValidation(pi);
		await fire();
		expect(warn).not.toHaveBeenCalled();
		warn.mockRestore();
	});

	it("warns only once per process even across repeated session_start", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		writeModels({ skills: { committ: "a/b" } });
		const { pi, fire } = makePi();
		registerModelsConfigValidation(pi);
		await fire();
		const afterFirst = warn.mock.calls.length;
		await fire();
		expect(warn.mock.calls.length).toBe(afterFirst);
		warn.mockRestore();
	});

	it("does nothing when no record axes are configured", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		writeModels({ defaults: "a/b" });
		const { pi, fire } = makePi();
		registerModelsConfigValidation(pi);
		await fire();
		expect(warn).not.toHaveBeenCalled();
		warn.mockRestore();
	});

	it("reports every key as unknown when the skill registry is empty, without throwing", async () => {
		// Defensive: an empty skill registry should not crash; every configured
		// key is unknown against an empty known-list.
		vi.mocked(skillCommandNames).mockReturnValue([]);
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		writeModels({ skills: { research: "a/b" } });
		const { pi, fire } = makePi();
		registerModelsConfigValidation(pi);
		await fire();
		expect(warn).toHaveBeenCalledWith(expect.stringContaining("skills.research"));
		warn.mockRestore();
	});
});
