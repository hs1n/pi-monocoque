import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	DEFAULT_MAX_CONCURRENCY,
	findUnknownModelKeys,
	getAgentModelConfig,
	invalidateModelsConfigCache,
	loadModelsConfig,
	type ModelsConfig,
	resolveMaxConcurrency,
} from "./models-config.js";

const TEST_HOME = process.env.HOME!;

describe("models-config", () => {
	describe("loadModelsConfig", () => {
		const configDir = join(TEST_HOME, ".config", "rpiv-pi");
		const configFilePath = join(configDir, "models.json");

		beforeEach(() => {
			mkdirSync(configDir, { recursive: true });
		});

		it("returns empty config for missing file", () => {
			expect(loadModelsConfig()).toEqual({});
		});

		it("returns empty config for malformed JSON", () => {
			writeFileSync(configFilePath, "not json", "utf-8");
			expect(loadModelsConfig()).toEqual({});
		});

		it("returns empty config for non-object JSON", () => {
			writeFileSync(configFilePath, "42", "utf-8");
			expect(loadModelsConfig()).toEqual({});
		});

		it("returns empty config for array JSON", () => {
			writeFileSync(configFilePath, "[]", "utf-8");
			expect(loadModelsConfig()).toEqual({});
		});

		it("loads a valid config with all sections", () => {
			writeFileSync(
				configFilePath,
				JSON.stringify({
					defaults: "anthropic:claude-sonnet-4-20250514",
					agents: {
						"codebase-analyzer": { model: "openai:o3-pro", thinking: "high" },
						"web-search-researcher": "anthropic:claude-sonnet-4-20250514",
					},
					skills: {
						research: { thinking: "xhigh" },
						plan: "anthropic:claude-sonnet-4-20250514",
					},
				}),
				"utf-8",
			);

			const config = loadModelsConfig();
			expect(config.defaults).toEqual({ model: "anthropic:claude-sonnet-4-20250514" });
			expect(config.agents).toBeDefined();
			expect(config.agents!["codebase-analyzer"]).toEqual({
				model: "openai:o3-pro",
				thinking: "high",
			});
			expect(config.agents!["web-search-researcher"]).toEqual({
				model: "anthropic:claude-sonnet-4-20250514",
			});
			expect(config.skills).toBeDefined();
			expect(config.skills!.research).toEqual({
				thinking: "xhigh",
				model: "anthropic:claude-sonnet-4-20250514", // cascaded from defaults
			});
			expect(config.skills!.plan).toEqual({
				model: "anthropic:claude-sonnet-4-20250514",
			});
		});

		it("cascades defaults into agent entries", () => {
			writeFileSync(
				configFilePath,
				JSON.stringify({
					defaults: "anthropic:claude-sonnet-4-20250514",
					agents: {
						"codebase-analyzer": { thinking: "high" },
					},
				}),
				"utf-8",
			);

			const config = loadModelsConfig();
			expect(config.agents!["codebase-analyzer"]).toEqual({
				model: "anthropic:claude-sonnet-4-20250514", // from defaults
				thinking: "high", // from agent override
			});
		});

		it("cascades defaults into skills entries (per-field)", () => {
			writeFileSync(
				configFilePath,
				JSON.stringify({
					defaults: "anthropic/opus",
					skills: {
						commit: { thinking: "minimal" },
					},
				}),
				"utf-8",
			);
			const config = loadModelsConfig();
			expect(config.skills!.commit).toEqual({
				model: "anthropic/opus", // from defaults
				thinking: "minimal",
			});
		});

		it("loads skills alongside agents", () => {
			writeFileSync(
				configFilePath,
				JSON.stringify({
					defaults: "anthropic/opus",
					agents: { "codebase-analyzer": "openai/gpt-5.5" },
					skills: {
						commit: "zai/glm-4-7",
						research: { model: "openai/gpt-5.5", thinking: "high" },
					},
				}),
				"utf-8",
			);
			const config = loadModelsConfig();
			expect(config.agents!["codebase-analyzer"]).toEqual({ model: "openai/gpt-5.5" });
			expect(config.skills!.commit).toEqual({ model: "zai/glm-4-7" });
			expect(config.skills!.research).toEqual({
				model: "openai/gpt-5.5",
				thinking: "high",
			});
		});

		it("treats empty `skills: {}` identically to absent `skills` (no-bleed)", () => {
			writeFileSync(configFilePath, JSON.stringify({ defaults: "anthropic/opus", skills: {} }), "utf-8");
			const config = loadModelsConfig();
			expect(config.skills).toBeUndefined();
		});

		it("strips unknown keys with additionalProperties: false", () => {
			writeFileSync(
				configFilePath,
				JSON.stringify({
					defaults: "openai:gpt-5.5",
					unknownKey: "should be stripped",
					agents: {
						"test-agent": "openai:gpt-5.5",
					},
				}),
				"utf-8",
			);

			const config = loadModelsConfig();
			expect(config).not.toHaveProperty("unknownKey");
		});

		it("warns and drops invalid thinking level", () => {
			const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

			writeFileSync(
				configFilePath,
				JSON.stringify({
					agents: {
						"test-agent": { model: "openai:gpt-5.5", thinking: "ultra" },
					},
				}),
				"utf-8",
			);

			const config = loadModelsConfig();
			expect(config.agents!["test-agent"].thinking).toBeUndefined();
			expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("unknown thinking level"));

			warnSpy.mockRestore();
		});

		it("accepts an explicit 'off' thinking level (disable reasoning)", () => {
			writeFileSync(
				configFilePath,
				JSON.stringify({ agents: { "test-agent": { model: "openai/gpt-5.5", thinking: "off" } } }),
				"utf-8",
			);
			expect(loadModelsConfig().agents!["test-agent"]).toEqual({ model: "openai/gpt-5.5", thinking: "off" });
		});

		it("accepts Pi's 'max' thinking level", () => {
			writeFileSync(
				configFilePath,
				JSON.stringify({ agents: { "test-agent": { model: "openai/gpt-5.5", thinking: "max" } } }),
				"utf-8",
			);
			expect(loadModelsConfig().agents!["test-agent"]).toEqual({ model: "openai/gpt-5.5", thinking: "max" });
		});

		it("cascades defaults.thinking 'off' into a model-only entry", () => {
			writeFileSync(
				configFilePath,
				JSON.stringify({ defaults: { thinking: "off" }, agents: { a: "openai/gpt-5.5" } }),
				"utf-8",
			);
			expect(loadModelsConfig().agents!.a).toEqual({ model: "openai/gpt-5.5", thinking: "off" });
		});

		it("round-trips maxConcurrency into the resolved config (guards the manual result copy)", () => {
			writeFileSync(configFilePath, JSON.stringify({ maxConcurrency: 8 }), "utf-8");
			const config = loadModelsConfig();
			expect(config.maxConcurrency).toBe(8);
		});
	});

	describe("loadModelsConfig cache", () => {
		const configDir = join(TEST_HOME, ".config", "rpiv-pi");
		const configFilePath = join(configDir, "models.json");

		beforeEach(() => {
			invalidateModelsConfigCache();
			mkdirSync(configDir, { recursive: true });
		});

		it("returns cached result on second call", () => {
			writeFileSync(configFilePath, JSON.stringify({ defaults: "openai:gpt-5.5" }), "utf-8");

			const first = loadModelsConfig();
			const second = loadModelsConfig();
			expect(first).toBe(second); // strict reference equality — same object
		});

		it("re-reads after invalidateModelsConfigCache", () => {
			writeFileSync(configFilePath, JSON.stringify({ defaults: "openai:gpt-5.5" }), "utf-8");

			const first = loadModelsConfig();

			writeFileSync(configFilePath, JSON.stringify({ defaults: "anthropic:claude-sonnet-4-20250514" }), "utf-8");

			invalidateModelsConfigCache();
			const afterReset = loadModelsConfig();
			expect(afterReset).not.toBe(first); // different object — re-read
			expect(afterReset.defaults?.model).toBe("anthropic:claude-sonnet-4-20250514");
		});
	});

	describe("agent-axis fields (extensions/tools)", () => {
		const configDir = join(TEST_HOME, ".config", "rpiv-pi");
		const configFilePath = join(configDir, "models.json");

		beforeEach(() => {
			mkdirSync(configDir, { recursive: true });
		});

		it("loads per-agent extensions/tools as string arrays", () => {
			writeFileSync(
				configFilePath,
				JSON.stringify({
					agents: {
						"integration-scanner": {
							model: "openai/o3-pro",
							tools: ["ext:rpiv-web-tools/tool_a"],
							extensions: ["rpiv-web-tools"],
						},
					},
				}),
				"utf-8",
			);
			expect(loadModelsConfig().agents!["integration-scanner"]).toEqual({
				model: "openai/o3-pro",
				tools: ["ext:rpiv-web-tools/tool_a"],
				extensions: ["rpiv-web-tools"],
			});
		});

		it("drops tools/extensions entries carrying newlines with a warn (S1: frontmatter-line injection)", () => {
			// These strings land on one logical frontmatter line of a synced
			// agent .md — an interior newline becomes a physical line the Pi
			// runtime reads as capability config ("x\nisolated: false" would
			// silently un-isolate an agent).
			const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
			writeFileSync(
				configFilePath,
				JSON.stringify({
					agents: {
						"integration-scanner": {
							tools: ["grep", "x\nisolated: false"],
							extensions: ["rpiv-web-tools", "bad\rentry"],
						},
					},
				}),
				"utf-8",
			);
			invalidateModelsConfigCache();
			expect(loadModelsConfig().agents?.["integration-scanner"]).toEqual({
				tools: ["grep"],
				extensions: ["rpiv-web-tools"],
			});
			expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("newline"));
			warnSpy.mockRestore();
		});

		it("strips tools/extensions on the skills axis with one warn naming it (I3)", () => {
			// Only the agents-axis lookup consumes the agent-axis fields; an entry
			// carrying them on any other axis passed validation and silently
			// granted nothing.
			const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
			writeFileSync(
				configFilePath,
				JSON.stringify({
					skills: { grade: { model: "openai/o3-pro", extensions: ["rpiv-web-tools"] } },
				}),
				"utf-8",
			);
			invalidateModelsConfigCache();
			const cfg = loadModelsConfig();
			expect(cfg.skills?.grade).toEqual({ model: "openai/o3-pro" });
			expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("skills"));
			warnSpy.mockRestore();
		});

		it("preserves an empty tools array ([] suppresses map additions downstream)", () => {
			writeFileSync(configFilePath, JSON.stringify({ agents: { "integration-scanner": { tools: [] } } }), "utf-8");
			expect(loadModelsConfig().agents!["integration-scanner"]).toEqual({ tools: [] });
		});

		it("filters non-string elements per-field without zeroing the entry", () => {
			writeFileSync(
				configFilePath,
				JSON.stringify({
					agents: {
						"integration-scanner": {
							model: "openai/gpt-5.5",
							tools: ["ext:rpiv-web-tools/tool_a", 5, null],
							extensions: [true],
						},
					},
				}),
				"utf-8",
			);
			expect(loadModelsConfig().agents!["integration-scanner"]).toEqual({
				model: "openai/gpt-5.5",
				tools: ["ext:rpiv-web-tools/tool_a"],
				extensions: [],
			});
		});

		it("drops non-array values for the fields (falls back to map defaults downstream)", () => {
			writeFileSync(
				configFilePath,
				JSON.stringify({ agents: { "integration-scanner": { tools: "grep", extensions: 7 } } }),
				"utf-8",
			);
			expect(loadModelsConfig().agents!["integration-scanner"]).toEqual({});
		});

		it("ignores extensions/tools in defaults with exactly one warn and no cascade leak", () => {
			const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
			writeFileSync(
				configFilePath,
				JSON.stringify({
					defaults: {
						model: "openai/gpt-5.5",
						tools: ["ext:rpiv-web-tools/tool_a"],
						extensions: ["rpiv-web-tools"],
					},
					agents: { "codebase-analyzer": { thinking: "high" } },
				}),
				"utf-8",
			);
			const config = loadModelsConfig();
			expect(config.defaults).toEqual({ model: "openai/gpt-5.5" });
			// No cascade: the agent entry inherits only model/thinking.
			expect(config.agents!["codebase-analyzer"]).toEqual({ model: "openai/gpt-5.5", thinking: "high" });
			expect(warnSpy).toHaveBeenCalledTimes(1);
			expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("defaults"));
			warnSpy.mockRestore();
		});
	});

	describe("getAgentModelConfig", () => {
		it("returns agent-specific config when present", () => {
			const config: ModelsConfig = {
				defaults: { model: "anthropic:claude-sonnet-4-20250514" },
				agents: {
					"codebase-analyzer": { model: "openai:o3-pro", thinking: "high" },
				},
			};
			expect(getAgentModelConfig(config, "codebase-analyzer")).toEqual({
				model: "openai:o3-pro",
				thinking: "high",
			});
		});

		it("falls back to defaults when agent not configured", () => {
			const config: ModelsConfig = {
				defaults: { model: "anthropic:claude-sonnet-4-20250514" },
			};
			expect(getAgentModelConfig(config, "unknown-agent")).toEqual({
				model: "anthropic:claude-sonnet-4-20250514",
			});
		});

		it("returns undefined when neither agent nor defaults configured", () => {
			const config: ModelsConfig = {};
			expect(getAgentModelConfig(config, "unknown-agent")).toBeUndefined();
		});
	});

	describe("resolveMaxConcurrency", () => {
		it("returns the default when maxConcurrency is absent", () => {
			expect(resolveMaxConcurrency({})).toBe(DEFAULT_MAX_CONCURRENCY);
		});

		it("returns the default when maxConcurrency is null", () => {
			expect(resolveMaxConcurrency({ maxConcurrency: null } as unknown as ModelsConfig)).toBe(
				DEFAULT_MAX_CONCURRENCY,
			);
		});

		it("passes through a valid positive integer", () => {
			expect(resolveMaxConcurrency({ maxConcurrency: 8 })).toBe(8);
		});

		it("passes through the boundary value 1", () => {
			expect(resolveMaxConcurrency({ maxConcurrency: 1 })).toBe(1);
		});

		it("falls back to default for 0 (fails the >= 1 guard)", () => {
			expect(resolveMaxConcurrency({ maxConcurrency: 0 })).toBe(DEFAULT_MAX_CONCURRENCY);
		});

		it("falls back to default for negative integers", () => {
			expect(resolveMaxConcurrency({ maxConcurrency: -1 })).toBe(DEFAULT_MAX_CONCURRENCY);
		});

		it("falls back to default for non-integer numbers", () => {
			expect(resolveMaxConcurrency({ maxConcurrency: 4.5 })).toBe(DEFAULT_MAX_CONCURRENCY);
		});

		it("falls back to default for a numeric string (Value.Clean does not coerce)", () => {
			expect(resolveMaxConcurrency({ maxConcurrency: "4" } as unknown as ModelsConfig)).toBe(
				DEFAULT_MAX_CONCURRENCY,
			);
		});
	});

	describe("findUnknownModelKeys", () => {
		const known = {
			agents: ["codebase-analyzer", "codebase-locator"],
			skills: ["commit", "design"],
		};

		it("returns [] when every key matches", () => {
			const config: ModelsConfig = {
				agents: { "codebase-analyzer": { model: "a/b" } },
				skills: { commit: { model: "a/b" } },
			};
			expect(findUnknownModelKeys(config, known)).toEqual([]);
		});

		it("flags typo'd keys across every axis as dotted paths", () => {
			const config: ModelsConfig = {
				agents: { "codebase-analzyer": { model: "a/b" } },
				skills: { committ: { model: "a/b" } },
			};
			expect(findUnknownModelKeys(config, known).sort()).toEqual(
				["agents.codebase-analzyer", "skills.committ"].sort(),
			);
		});

		it("skips an axis whose known-list is undefined (universe unknown)", () => {
			const config: ModelsConfig = { skills: { anything: { model: "a/b" } } };
			// No `skills` list provided → that axis is not validated.
			expect(findUnknownModelKeys(config, { agents: ["codebase-analyzer"] })).toEqual([]);
		});

		it("ignores defaults (no key to validate)", () => {
			const config: ModelsConfig = { defaults: { model: "a/b" } };
			expect(findUnknownModelKeys(config, known)).toEqual([]);
		});
	});
});
