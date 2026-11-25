/**
 * Argument tests for the /advisor command: the argument path sets the state
 * without a UI, an invalid argument changes nothing, and the no-argument
 * paths still print the setting (no UI) or open the picker (UI).
 */

import { type Api, getSupportedThinkingLevels, type Model } from "@earendil-works/pi-ai";
import { createMockCtx, createMockPi } from "@hs1n/rpiv-test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./advisor-ui.js", () => ({
	showAdvisorPicker: vi.fn(),
	showEffortPicker: vi.fn(),
}));

import {
	ADVISOR_TOOL_NAME,
	getAdvisorEffort,
	getAdvisorModel,
	loadAdvisorConfig,
	registerAdvisorCommand,
	setAdvisorEffort,
	setAdvisorModel,
} from "./advisor/index.js";
import { showAdvisorPicker, showEffortPicker } from "./advisor-ui.js";

const modelA = { provider: "anthropic", id: "opus", name: "Opus" } as unknown as Model<Api>;
const modelR = {
	provider: "anthropic",
	id: "opus-thinking",
	name: "Opus Thinking",
	reasoning: true,
} as unknown as Model<Api>;
const USAGE = "Usage: /advisor <provider/model-id> [effort] | /advisor off";

beforeEach(() => {
	vi.mocked(showAdvisorPicker).mockReset();
	vi.mocked(showEffortPicker).mockReset();
	setAdvisorModel(undefined);
	setAdvisorEffort(undefined);
});

function register() {
	const { pi, captured } = createMockPi();
	registerAdvisorCommand(pi);
	const command = captured.commands.get("advisor");
	if (!command) throw new Error("advisor command not registered");
	return { pi, captured, command };
}

async function run(args: string, models: Model<Api>[] = [modelA, modelR], hasUI = false) {
	const { pi, command } = register();
	const ctx = createMockCtx({ hasUI, models });
	await command.handler(args, ctx as never);
	return { pi, ctx, notify: ctx.ui.notify as ReturnType<typeof vi.fn> };
}

describe("/advisor <args> — valid arguments set the state without a UI", () => {
	it("model + effort: sets both, persists, activates the tool", async () => {
		const { pi, notify } = await run("anthropic/opus-thinking low");
		expect(getAdvisorModel()).toBe(modelR);
		expect(getAdvisorEffort()).toBe("low");
		expect(loadAdvisorConfig()).toMatchObject({ modelKey: "anthropic/opus-thinking", effort: "low" });
		expect(pi.setActiveTools).toHaveBeenCalledWith(expect.arrayContaining([ADVISOR_TOOL_NAME]));
		expect(notify).toHaveBeenLastCalledWith("Advisor: anthropic/opus-thinking, low", "info");
		expect(showAdvisorPicker).not.toHaveBeenCalled();
		expect(showEffortPicker).not.toHaveBeenCalled();
	});

	it("effort 'off' sends no reasoning (effort undefined)", async () => {
		setAdvisorEffort("high");
		await run("anthropic/opus-thinking off");
		expect(getAdvisorModel()).toBe(modelR);
		expect(getAdvisorEffort()).toBeUndefined();
	});

	it("reasoning model without effort: same as Esc at the effort picker", async () => {
		const { notify } = await run("anthropic/opus-thinking");
		expect(getAdvisorModel()).toBe(modelR);
		expect(getAdvisorEffort()).toBeUndefined();
		expect(notify).toHaveBeenCalledWith("Effort not set — advisor uses the model default", "info");
	});

	it("non-reasoning model without effort: enables, no effort notice", async () => {
		const { notify } = await run("  anthropic/opus  ");
		expect(getAdvisorModel()).toBe(modelA);
		expect(notify).toHaveBeenLastCalledWith("Advisor: anthropic/opus", "info");
		expect(notify).not.toHaveBeenCalledWith(expect.stringContaining("Effort not set"), "info");
	});

	it("'off' disables: clears state and removes the tool", async () => {
		setAdvisorModel(modelA);
		const { pi, command } = register();
		pi.setActiveTools([ADVISOR_TOOL_NAME, "other"]);
		const ctx = createMockCtx({ hasUI: false, models: [modelA] });
		await command.handler("off", ctx as never);
		expect(getAdvisorModel()).toBeUndefined();
		expect(pi.setActiveTools).toHaveBeenLastCalledWith(["other"]);
		expect(ctx.ui.notify).toHaveBeenCalledWith("Advisor disabled", "info");
	});
});

describe("/advisor <args> — invalid arguments: error, state unchanged", () => {
	let savedConfig: ReturnType<typeof loadAdvisorConfig>;
	beforeEach(() => {
		setAdvisorModel(modelA);
		setAdvisorEffort("medium");
		savedConfig = loadAdvisorConfig();
	});

	function expectUnchanged(pi: ReturnType<typeof createMockPi>["pi"]) {
		expect(getAdvisorModel()).toBe(modelA);
		expect(getAdvisorEffort()).toBe("medium");
		expect(loadAdvisorConfig()).toEqual(savedConfig);
		expect(pi.setActiveTools).not.toHaveBeenCalled();
	}

	it("unknown model: lists 'off' and the available model keys", async () => {
		const { pi, notify } = await run("ghost/nonesuch");
		expect(notify).toHaveBeenCalledWith(
			"Unknown advisor model: ghost/nonesuch. Valid values: off, anthropic/opus, anthropic/opus-thinking",
			"error",
		);
		expectUnchanged(pi);
	});

	it("invalid effort: lists the efforts of that model", async () => {
		const { pi, notify } = await run("anthropic/opus-thinking turbo");
		expect(notify).toHaveBeenCalledWith(
			"Effort turbo is not valid for anthropic/opus-thinking. Valid values: off, minimal, low, medium, high",
			"error",
		);
		expectUnchanged(pi);
	});

	it("effort above the model's levels is rejected", async () => {
		vi.mocked(getSupportedThinkingLevels).mockReturnValueOnce(["off", "low", "high"]);
		const { pi, notify } = await run("anthropic/opus-thinking max");
		expect(notify).toHaveBeenCalledWith(expect.stringContaining("Valid values: off, low, high"), "error");
		expectUnchanged(pi);
	});

	it("effort for a non-reasoning model", async () => {
		const { pi, notify } = await run("anthropic/opus high");
		expect(notify).toHaveBeenCalledWith(
			"Model anthropic/opus does not support effort. Remove the effort argument.",
			"error",
		);
		expectUnchanged(pi);
	});

	it.each(["anthropic/opus-thinking high extra", "off now"])("too many arguments: %s", async (args) => {
		const { pi, notify } = await run(args);
		expect(notify).toHaveBeenCalledWith(`Too many arguments. ${USAGE}`, "error");
		expectUnchanged(pi);
	});
});

describe("/advisor — no arguments", () => {
	it("no UI: prints the current model, effort, and usage", async () => {
		setAdvisorModel(modelR);
		setAdvisorEffort("high");
		const { notify } = await run("");
		expect(notify).toHaveBeenCalledWith(`Advisor: anthropic/opus-thinking, high\n${USAGE}`, "info");
		expect(showAdvisorPicker).not.toHaveBeenCalled();
		expect(getAdvisorModel()).toBe(modelR);
	});

	it("UI: opens the picker as before", async () => {
		vi.mocked(showAdvisorPicker).mockResolvedValueOnce(null);
		const { notify } = await run("", [modelA], true);
		expect(showAdvisorPicker).toHaveBeenCalledTimes(1);
		expect(notify).not.toHaveBeenCalled();
	});
});

describe("/advisor — argument completions", () => {
	async function completionsAfterSessionStart(prefix: string) {
		const { captured, command } = register();
		const ctx = createMockCtx({ models: [modelA, modelR] });
		for (const handler of captured.events.get("session_start") ?? []) await handler({}, ctx);
		return command.getArgumentCompletions?.(prefix);
	}

	it("first word: 'off' and the model keys that match the prefix", async () => {
		expect((await completionsAfterSessionStart(""))?.map((i) => i.value)).toEqual([
			"off",
			"anthropic/opus",
			"anthropic/opus-thinking",
		]);
		expect((await completionsAfterSessionStart("anthropic/opus-"))?.map((i) => i.value)).toEqual([
			"anthropic/opus-thinking",
		]);
	});

	it("second word: efforts, with the model word in the value", async () => {
		const items = await completionsAfterSessionStart("anthropic/opus-thinking h");
		expect(items).toEqual([{ value: "anthropic/opus-thinking high", label: "high" }]);
	});

	it("no match, a non-reasoning model, or no session yet: null", async () => {
		expect(await completionsAfterSessionStart("zzz")).toBeNull();
		expect(await completionsAfterSessionStart("anthropic/opus ")).toBeNull();
		expect(register().command.getArgumentCompletions?.("anthropic/")).toBeNull();
	});
});
