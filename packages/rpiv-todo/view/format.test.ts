import type { Theme } from "@earendil-works/pi-coding-agent";
import { makeTheme } from "@hs1n/rpiv-test-utils";
import { describe, expect, it } from "vitest";
import type { TaskState } from "../state/state.js";
import type { Task } from "../tool/types.js";
import { formatOverlayTaskLine, renderTodoCall, renderTodoResult } from "./format.js";

const recordingTheme = makeTheme({
	fg: (color, text) => `<${color}>${text}</${color}>`,
	strikethrough: (text) => `<strike>${text}</strike>`,
}) as unknown as Theme;

function task(overrides: Partial<Task> = {}): Task {
	return {
		id: 1,
		subject: "quiet task",
		status: "pending",
		...overrides,
	};
}

describe("formatOverlayTaskLine — semantic color hierarchy", () => {
	it("keeps pending subjects primary while rendering IDs quietly", () => {
		expect(formatOverlayTaskLine(task(), recordingTheme, true)).toBe(
			"<dim>○</dim> <dim>#1</dim> <text>quiet task</text>",
		);
	});

	it("emphasizes the current task while muting its supporting metadata", () => {
		expect(
			formatOverlayTaskLine(
				task({ status: "in_progress", activeForm: "Working", blockedBy: [2, 3] }),
				recordingTheme,
				true,
			),
		).toBe(
			"<warning>◐</warning> <dim>#1</dim> <accent>quiet task</accent> <muted>(Working)</muted> <muted>⛓ #2,#3</muted>",
		);
	});

	it("mutes and strikes completed subjects", () => {
		expect(formatOverlayTaskLine(task({ status: "completed" }), recordingTheme, false)).toBe(
			"<success>✓</success> <strike><muted>quiet task</muted></strike>",
		);
	});
});

describe("formatOverlayTaskLine — terminal control characters", () => {
	it("strips escape sequences from subject and activeForm before theming", () => {
		expect(
			formatOverlayTaskLine(
				task({ status: "in_progress", subject: "quiet\u001b[2Jtask", activeForm: "Work\u009bcing" }),
				recordingTheme,
				false,
			),
		).toBe("<warning>◐</warning> <accent>quiettask</accent> <muted>(Working)</muted>");
	});
});

describe("formatOverlayTaskLine — deleted rows", () => {
	it("marks deleted subjects with the error glyph and strikes them", () => {
		expect(formatOverlayTaskLine(task({ status: "deleted" }), recordingTheme, false)).toBe(
			"<error>✗</error> <strike><muted>quiet task</muted></strike>",
		);
	});
});

const textOf = (node: unknown) => (node as { text: string }).text;

describe("renderTodoCall — id lookups", () => {
	const state: TaskState = { tasks: [task({ id: 1, subject: "known" })], nextId: 2 };

	it("renders the subject of a known task", () => {
		expect(textOf(renderTodoCall({ action: "get", id: 1 }, recordingTheme, state))).toContain(
			"<accent>known</accent>",
		);
	});

	it("falls back to #id when the task is unknown", () => {
		expect(textOf(renderTodoCall({ action: "delete", id: 7 }, recordingTheme, state))).toContain(
			"<accent>#7</accent>",
		);
	});
});

describe("renderTodoResult — delete", () => {
	it("echoes the deleted task's status from the details snapshot", () => {
		const details = {
			action: "delete",
			params: { id: 2 },
			tasks: [task({ id: 1 }), task({ id: 2, status: "deleted" })],
			nextId: 3,
		};
		expect(textOf(renderTodoResult({ details }, recordingTheme))).toBe("<muted>⊘ deleted</muted>");
	});

	it("falls back to a plain check when the deleted id is not in the snapshot", () => {
		const details = { action: "delete", params: { id: 9 }, tasks: [task({ id: 1 })], nextId: 2 };
		expect(textOf(renderTodoResult({ details }, recordingTheme))).toBe("<success>✓</success>");
	});
});
