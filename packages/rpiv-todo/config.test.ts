import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	COLLAPSE_KEY_OFF,
	DEFAULT_COLLAPSE_KEY,
	DEFAULT_MAX_WIDGET_LINES,
	getMaxWidgetLines,
	loadConfig,
	resolveCollapseKey,
} from "./config.js";

const CONFIG_PATH = join(process.env.HOME!, ".config", "rpiv-todo", "config.json");

function writeConfigFile(contents: string): void {
	mkdirSync(dirname(CONFIG_PATH), { recursive: true });
	writeFileSync(CONFIG_PATH, contents, "utf-8");
}
function removeConfigFile(): void {
	rmSync(CONFIG_PATH, { force: true });
}

beforeEach(removeConfigFile);
afterEach(removeConfigFile);

describe("getMaxWidgetLines", () => {
	it("returns the default when no config is present", () => {
		expect(getMaxWidgetLines()).toBe(DEFAULT_MAX_WIDGET_LINES);
	});
	it("returns the default when the field is absent", () => {
		writeConfigFile(JSON.stringify({}));
		expect(getMaxWidgetLines()).toBe(DEFAULT_MAX_WIDGET_LINES);
	});
	it("returns the default for non-number values", () => {
		writeConfigFile(JSON.stringify({ maxWidgetLines: "twelve" }));
		expect(getMaxWidgetLines()).toBe(DEFAULT_MAX_WIDGET_LINES);
	});
	it("returns the default for values below the floor (2, 1, 0, -5)", () => {
		writeConfigFile(JSON.stringify({ maxWidgetLines: 2 }));
		expect(getMaxWidgetLines()).toBe(DEFAULT_MAX_WIDGET_LINES);
		writeConfigFile(JSON.stringify({ maxWidgetLines: 1 }));
		expect(getMaxWidgetLines()).toBe(DEFAULT_MAX_WIDGET_LINES);
		writeConfigFile(JSON.stringify({ maxWidgetLines: 0 }));
		expect(getMaxWidgetLines()).toBe(DEFAULT_MAX_WIDGET_LINES);
		writeConfigFile(JSON.stringify({ maxWidgetLines: -5 }));
		expect(getMaxWidgetLines()).toBe(DEFAULT_MAX_WIDGET_LINES);
	});
	it("returns the configured value at the floor (3) and above — no ceiling", () => {
		writeConfigFile(JSON.stringify({ maxWidgetLines: 3 }));
		expect(getMaxWidgetLines()).toBe(3);
		writeConfigFile(JSON.stringify({ maxWidgetLines: 8 }));
		expect(getMaxWidgetLines()).toBe(8);
		writeConfigFile(JSON.stringify({ maxWidgetLines: 50 }));
		expect(getMaxWidgetLines()).toBe(50);
	});
});

describe("loadConfig — collapseKey", () => {
	it("surfaces a user-set collapseKey unchanged (validation happens in resolveCollapseKey, not at load)", () => {
		writeConfigFile(JSON.stringify({ collapseKey: "alt+o" }));
		expect(loadConfig().collapseKey).toBe("alt+o");
	});

	it("passes invalid specs through verbatim — the resolver, not the loader, decides validity", () => {
		writeConfigFile(JSON.stringify({ collapseKey: "ctr+t" }));
		expect(loadConfig().collapseKey).toBe("ctr+t");
	});
});

describe("resolveCollapseKey", () => {
	it("returns the default (ctrl+shift+t) when no config is present", () => {
		expect(resolveCollapseKey()).toBe(DEFAULT_COLLAPSE_KEY);
	});

	it("returns the default when the field is absent", () => {
		writeConfigFile(JSON.stringify({}));
		expect(resolveCollapseKey()).toBe(DEFAULT_COLLAPSE_KEY);
	});

	it("returns the default when the field is empty or blank", () => {
		writeConfigFile(JSON.stringify({ collapseKey: "" }));
		expect(resolveCollapseKey()).toBe(DEFAULT_COLLAPSE_KEY);
		writeConfigFile(JSON.stringify({ collapseKey: "   " }));
		expect(resolveCollapseKey()).toBe(DEFAULT_COLLAPSE_KEY);
	});

	it("returns COLLAPSE_KEY_OFF when set to the sentinel", () => {
		writeConfigFile(JSON.stringify({ collapseKey: "off" }));
		expect(resolveCollapseKey()).toBe(COLLAPSE_KEY_OFF);
	});

	it("returns the lowercased validated spec when valid", () => {
		writeConfigFile(JSON.stringify({ collapseKey: "Alt+O" }));
		expect(resolveCollapseKey()).toBe("alt+o");
	});

	it("returns the default when the spec is invalid", () => {
		writeConfigFile(JSON.stringify({ collapseKey: "ctr+t" }));
		expect(resolveCollapseKey()).toBe(DEFAULT_COLLAPSE_KEY);
	});

	it("returns the default for non-string values", () => {
		writeConfigFile(JSON.stringify({ collapseKey: 123 }));
		expect(resolveCollapseKey()).toBe(DEFAULT_COLLAPSE_KEY);
		writeConfigFile(JSON.stringify({ collapseKey: true }));
		expect(resolveCollapseKey()).toBe(DEFAULT_COLLAPSE_KEY);
		writeConfigFile(JSON.stringify({ collapseKey: ["alt+o"] }));
		expect(resolveCollapseKey()).toBe(DEFAULT_COLLAPSE_KEY);
		writeConfigFile(JSON.stringify({ collapseKey: { key: "alt+o" } }));
		expect(resolveCollapseKey()).toBe(DEFAULT_COLLAPSE_KEY);
	});

	it("is arg-less and reads config fresh on every call (no caching, parity with getMaxWidgetLines)", () => {
		// First call: no config → default.
		expect(resolveCollapseKey()).toBe(DEFAULT_COLLAPSE_KEY);
		writeConfigFile(JSON.stringify({ collapseKey: "off" }));
		// Second call: reads the just-written value without any re-import.
		expect(resolveCollapseKey()).toBe(COLLAPSE_KEY_OFF);
		writeConfigFile(JSON.stringify({ collapseKey: "alt+o" }));
		expect(resolveCollapseKey()).toBe("alt+o");
	});
});
