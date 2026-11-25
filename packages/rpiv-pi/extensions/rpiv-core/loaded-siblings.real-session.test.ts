/**
 * Siblings loaded OUTSIDE the settings file are detected (#216) — a REAL Pi
 * session, no mocks. A kit (here: settings that list only the kit) bundles
 * siblings as extension resources, so Pi loads them by path; the settings-only
 * rule reported them missing, and /rpiv-setup then installed conflicting copies.
 * A probe extension takes the snapshot at session_start, exactly where
 * rpiv-core's startup maintenance takes it. Runs unchanged on Pi 0.80.x and 1.x.
 */

import { execFile } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { findInstalledSiblings, findMissingSiblings, type LoadedSiblingSources } from "./package-checks.js";
import { getPiAgentSettingsPath } from "./utils.js";

const PACKAGES = fileURLToPath(new URL("../../../", import.meta.url));
const sibling = (dir: string) => join(PACKAGES, dir);
const PI_ENTRY = import.meta.resolve("@earendil-works/pi-coding-agent");
const execFileAsync = promisify(execFile);

// Runs one Pi session and writes the probe's session_start snapshot to a file.
// No model: binding extensions fires session_start, which is all the probe needs —
// and keeps this test free of the model API that differs between Pi 0.80 and 1.x.
const DRIVER_SOURCE = `
import { writeFileSync } from "node:fs";
const input = JSON.parse(process.argv[2]);
const { createAgentSession, DefaultResourceLoader, SessionManager, SettingsManager } = await import(input.piEntry);
const settingsManager = SettingsManager.create(input.cwd, input.agentDir);
const resourceLoader = new DefaultResourceLoader({
	cwd: input.cwd,
	agentDir: input.agentDir,
	settingsManager,
	additionalExtensionPaths: input.extensionPaths,
});
await resourceLoader.reload();
const { session } = await createAgentSession({
	cwd: input.cwd,
	agentDir: input.agentDir,
	resourceLoader,
	settingsManager,
	sessionManager: SessionManager.inMemory(input.cwd),
});
await session.bindExtensions({});
session.dispose();
const snapshot = globalThis[Symbol.for("rpiv-216-probe")];
if (!snapshot) throw new Error("session_start never fired");
writeFileSync(input.output, JSON.stringify({ extensionPaths: snapshot.extensionPaths, markers: [...snapshot.markers] }));
process.exit(0);
`;

describe("siblings loaded outside the settings file are found (#216)", () => {
	let cwd: string;
	let prevOffline: string | undefined;

	beforeEach(() => {
		cwd = mkdtempSync(join(tmpdir(), "rpiv-216-"));
		prevOffline = process.env.PI_OFFLINE;
		process.env.PI_OFFLINE = "1";
		const settings = getPiAgentSettingsPath();
		mkdirSync(dirname(settings), { recursive: true });
		writeFileSync(join(dirname(settings), "auth.json"), "{}");
		// The kit is the only declared package; its bundled siblings load by path.
		writeFileSync(settings, JSON.stringify({ packages: ["npm:frida-pi-studio"] }));
	});

	afterEach(() => {
		if (prevOffline === undefined) delete process.env.PI_OFFLINE;
		else process.env.PI_OFFLINE = prevOffline;
		rmSync(cwd, { recursive: true, force: true });
	});

	async function snapshotWith(extensionPaths: string[]): Promise<LoadedSiblingSources> {
		// The session runs in a CHILD process. Pi loads the siblings with its own TS
		// loader; inside the vitest worker, v8 coverage merged that run with vitest's
		// run of the same files and dropped their per-file coverage (i18n-ui.ts read
		// 46% instead of 89%). The child is not instrumented, so the merge stays clean.
		const agentDir = dirname(getPiAgentSettingsPath());
		// The probe is an extension FILE loaded by path (the same way as the siblings) —
		// factory objects differ between Pi 0.80 and 1.x. It hands its session_start
		// snapshot back through a globalThis slot.
		const probe = join(cwd, "probe-extension.ts");
		writeFileSync(
			probe,
			`import { readLoadedSiblingSources } from ${JSON.stringify(fileURLToPath(new URL("./loaded-siblings.ts", import.meta.url)))};
export default function (pi) {
	pi.on("session_start", () => {
		globalThis[Symbol.for("rpiv-216-probe")] = readLoadedSiblingSources(pi);
	});
}
`,
		);
		const driver = join(cwd, "session-driver.mjs");
		const output = join(cwd, "snapshot.json");
		writeFileSync(driver, DRIVER_SOURCE);
		const input = { piEntry: PI_ENTRY, cwd, agentDir, extensionPaths: [...extensionPaths, probe], output };
		await execFileAsync(process.execPath, [driver, JSON.stringify(input)], { env: process.env });
		const raw = JSON.parse(readFileSync(output, "utf-8")) as { extensionPaths: string[]; markers: string[] };
		return { extensionPaths: raw.extensionPaths, markers: new Set(raw.markers) };
	}

	const names = (list: { pkg: string }[]) => list.map((s) => s.pkg.replace(/^npm:/, ""));

	it("tool-, command- and marker-only siblings loaded by path are not reported missing", async () => {
		const snapshot = await snapshotWith([sibling("rpiv-todo"), sibling("rpiv-i18n"), sibling("rpiv-args")]);
		const missing = names(findMissingSiblings(snapshot));
		expect(missing).not.toContain("@hs1n/rpiv-todo"); // tool + command
		expect(missing).not.toContain("@hs1n/rpiv-i18n"); // command only
		expect(missing).not.toContain("@hs1n/rpiv-args"); // event hooks only → marker
		expect(missing).toContain("@hs1n/rpiv-advisor"); // genuinely absent
		expect(names(findInstalledSiblings(snapshot)).sort()).toEqual([
			"@hs1n/rpiv-args",
			"@hs1n/rpiv-i18n",
			"@hs1n/rpiv-todo",
		]);
	});

	it("nothing bundled: the kit alone leaves every sibling missing (unchanged)", async () => {
		const snapshot = await snapshotWith([]);
		expect(names(findMissingSiblings(snapshot))).toEqual(names(findMissingSiblings()));
		expect(findInstalledSiblings(snapshot)).toEqual([]);
	});
});
