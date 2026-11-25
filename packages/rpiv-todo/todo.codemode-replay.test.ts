/**
 * Codemode replay regression (#290) — REAL Pi sessions, no mocks.
 *
 * A `todo` call made from a codemode script goes through `ctx.executeTool()`:
 * Pi records it only as a bounded `nestedCalls` summary on the outer `codemode`
 * result, never as a standalone `toolResult`, so its `details` snapshot is not on
 * the branch. Each test drives a scripted (faux) model through a real
 * `AgentSession` with Pi's built-in codemode extension and rpiv-todo loaded from
 * source, persists the session to disk, reopens it (what `pi -c` / `/resume`
 * do — `session_start` replays the branch), and reads the restored list with a
 * direct `todo list`.
 */

import { execFile } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const PACKAGE_DIR = fileURLToPath(new URL(".", import.meta.url));
const PI_AI_ENTRY = import.meta.resolve("@earendil-works/pi-ai");
const PI_ENTRY = import.meta.resolve("@earendil-works/pi-coding-agent");
const execFileAsync = promisify(execFile);

type JsonObject = Record<string, unknown>;
type Turn = { name: string; args: JsonObject };

// The sessions run in a CHILD process. Pi loads rpiv-todo with its own TS loader;
// inside the vitest worker, v8 coverage merged that run with vitest's run of the
// same files and dropped their per-file coverage (state-reducer.ts read 75%
// instead of 89%). The child is not instrumented, so the merge stays clean.
const DRIVER_SOURCE = `
import { writeFileSync } from "node:fs";
import { join } from "node:path";
const input = JSON.parse(process.argv[2]);
const { fauxAssistantMessage, fauxProvider, fauxToolCall } = await import(input.piAiEntry);
const { createAgentSession, createCodemodeExtension, DefaultResourceLoader, ModelRuntime, SessionManager, SettingsManager } =
	await import(input.piEntry);
const { agentDir, cwd, sessionDir } = input;
const faux = fauxProvider({ provider: "faux", models: [{ id: "scripted" }] });
const runtime = await ModelRuntime.create({
	authPath: join(agentDir, "auth.json"),
	modelsPath: join(agentDir, "models.json"),
});
runtime.registerNativeProvider(faux.provider);

async function openSession(sessionManager) {
	const settingsManager = SettingsManager.create(cwd, agentDir);
	const resourceLoader = new DefaultResourceLoader({
		cwd,
		agentDir,
		settingsManager,
		additionalExtensionPaths: [input.packageDir],
		extensionFactories: [{ name: "codemode", factory: createCodemodeExtension() }],
	});
	await resourceLoader.reload();
	const { session } = await createAgentSession({
		cwd,
		agentDir,
		modelRuntime: runtime,
		resourceLoader,
		settingsManager,
		sessionManager,
		model: faux.getModel(),
	});
	await session.bindExtensions({}); // fires session_start → rpiv-todo replays the branch
	return session;
}

async function closeSession(session) {
	await session.extensionRunner.emit({ type: "session_shutdown", reason: "quit" });
	session.dispose();
}

const toolCall = (t) => fauxAssistantMessage(fauxToolCall(t.name, t.args));

const first = await openSession(SessionManager.create(cwd, sessionDir));
for (const turn of input.turns) {
	faux.setResponses([toolCall(turn), fauxAssistantMessage("done")]);
	await first.prompt("go");
}
const file = first.sessionFile;
await closeSession(first);
if (!file) throw new Error("session was not persisted");

const resumed = await openSession(SessionManager.open(file, sessionDir));
let text = "<no todo result>";
try {
	faux.setResponses([toolCall({ name: "todo", args: { action: "list" } }), fauxAssistantMessage("ok")]);
	await resumed.prompt("list");
	const listed = resumed.sessionManager
		.getBranch()
		.filter((e) => e.type === "message" && e.message.role === "toolResult" && e.message.toolName === "todo")
		.at(-1);
	if (listed?.type === "message" && listed.message.role === "toolResult") {
		text = listed.message.content.map((c) => (c.type === "text" ? c.text : "")).join("");
	}
} finally {
	await closeSession(resumed);
}
writeFileSync(input.output, JSON.stringify({ text }));
process.exit(0);
`;

describe("todo calls made through codemode survive session replay (#290)", () => {
	let home: string;
	let agentDir: string;
	let cwd: string;
	let sessionDir: string;
	let prevOffline: string | undefined;

	beforeEach(() => {
		home = mkdtempSync(join(tmpdir(), "rpiv-todo-codemode-"));
		agentDir = join(home, "agent");
		cwd = join(home, "cwd");
		sessionDir = join(home, "sessions");
		mkdirSync(agentDir, { recursive: true });
		mkdirSync(cwd, { recursive: true });
		writeFileSync(join(agentDir, "auth.json"), "{}");
		// The issue's setting: the model reaches `todo` only through codemode scripts.
		writeFileSync(
			join(agentDir, "settings.json"),
			JSON.stringify({ defaultTools: ["+codemode"], codemode: { mode: "only" } }),
		);
		prevOffline = process.env.PI_OFFLINE;
		process.env.PI_OFFLINE = "1";
	});

	afterEach(() => {
		if (prevOffline === undefined) delete process.env.PI_OFFLINE;
		else process.env.PI_OFFLINE = prevOffline;
		rmSync(home, { recursive: true, force: true });
	});

	const toolCall = (name: string, args: JsonObject): Turn => ({ name, args });
	const codemode = (code: string) => toolCall("codemode", { code });

	/** Run each turn's scripted tool calls, close, reopen from disk, and return a direct `todo list`. */
	async function listAfterResume(turns: Turn[]): Promise<string> {
		const driver = join(home, "session-driver.mjs");
		const output = join(home, "listed.json");
		writeFileSync(driver, DRIVER_SOURCE);
		const input = {
			piAiEntry: PI_AI_ENTRY,
			piEntry: PI_ENTRY,
			packageDir: PACKAGE_DIR,
			agentDir,
			cwd,
			sessionDir,
			turns,
			output,
		};
		await execFileAsync(process.execPath, [driver, JSON.stringify(input)], { env: process.env });
		return (JSON.parse(readFileSync(output, "utf-8")) as { text: string }).text;
	}

	it("restores tasks created and updated only through codemode", async () => {
		const listed = await listAfterResume([
			codemode(`
await tools.todo({ action: "create", subject: "Task A" });
await tools.todo({ action: "create", subject: "Task B" });
await tools.todo({ action: "create", subject: "Task C" });
await tools.todo({ action: "update", id: 1, status: "in_progress" });
text("ok");`),
		]);
		expect(listed).toBe("[in_progress] #1 Task A\n[pending] #2 Task B\n[pending] #3 Task C");
	});

	it("keeps a completion made through codemode after direct create + in_progress calls", async () => {
		const listed = await listAfterResume([
			toolCall("todo", { action: "create", subject: "Completion persistence test" }),
			toolCall("todo", { action: "update", id: 1, status: "in_progress" }),
			codemode(`text(await tools.todo({ action: "update", id: 1, status: "completed" }));`),
		]);
		expect(listed).toBe("[completed] #1 Completion persistence test");
	});
});
