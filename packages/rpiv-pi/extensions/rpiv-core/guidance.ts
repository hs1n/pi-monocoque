/**
 * Guidance injection — resolves and injects subfolder guidance files.
 *
 * At each directory depth from project root down to the touched file's
 * directory, picks the first existing of:
 *   AGENTS.md > CLAUDE.md > .rpiv/guidance/<sub>/architecture.md
 *
 * `resolveGuidance` returns that whole ladder; the TOOL path injects only its
 * deepest hit — see `TOOL_PATH_GUIDANCE_LIMIT`.
 *
 * Depth 0 (project root) skips AGENTS.md/CLAUDE.md because Pi's own
 * resource-loader (loadContextFileFromDir at resource-loader.js:30-46)
 * already loads <cwd>/AGENTS.md or <cwd>/CLAUDE.md into the system
 * prompt's # Project Context block. Depth 0 still checks
 * <cwd>/.rpiv/guidance/architecture.md — Pi's loader does not see that
 * path.
 *
 * `resolveGuidance` is pure logic with no ExtensionAPI references
 * (utility-module rule from extensions/rpiv-core/CLAUDE.md). Side
 * effects (sendMessage, in-memory dedup Set) live in
 * `handleToolCallGuidance` (sendMessage only), `resolveAndFormatNewGuidance`
 * and `injectRootGuidance` (dedup-Set owners), and `clearInjectionState`.
 */

import { readdirSync, readFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, sep } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { FLAG_DEBUG, MSG_TYPE_GUIDANCE } from "./constants.js";

// ---------------------------------------------------------------------------
// Module-local constants
// ---------------------------------------------------------------------------

const AGENTS_MD = "AGENTS.md";
const CLAUDE_MD = "CLAUDE.md";
const RPIV_DIR = ".rpiv";
const GUIDANCE_SUBDIR = "guidance";
export const ARTIFACTS_SUBDIR = "artifacts";
const ARCHITECTURE_MD = "architecture.md";
/** Forward-slash dedup key for root guidance — must NOT use join() for cross-platform compat. */
const ROOT_GUIDANCE_KEY = `${RPIV_DIR}/${GUIDANCE_SUBDIR}/${ARCHITECTURE_MD}`;
const FILE_WRITE_TOOLS = ["read", "edit", "write"] as const;

/**
 * How many of `resolveGuidance`'s hits the TOOL path may inject per touch,
 * counted from the most specific end.
 *
 * The ladder's depth-0 entry (the root `.rpiv/guidance/architecture.md`) is
 * already delivered at `session_start` and re-delivered by the post-compaction
 * block, so on the tool path it is always already in the dedup Set; what the
 * ladder actually adds per touch is the intermediate levels, which the leaf
 * largely restates. Measured on one working session: 7.3 KB of the 21.9 KB
 * pulled in by a single `rpiv-core` touch was the `packages/rpiv-pi` summary.
 *
 * `Number.POSITIVE_INFINITY` restores the pre-throttle behaviour (every
 * not-yet-injected ancestor); `0` (or negative) disables the tool path outright.
 * The three points are distinct on purpose — see `takeDeepest`.
 */
const TOOL_PATH_GUIDANCE_LIMIT = 1;

/**
 * The specific-end slice, with the knob's whole scale honoured.
 *
 * Extracted because `slice(-0)` is `slice(0)` — the WHOLE array — so a limit of
 * 0 would inject the entire ladder while reading as "inject nothing". Anything
 * at or below zero is therefore an explicit empty selection, not a slice.
 */
export function takeDeepest<T>(resolved: readonly T[], limit: number): T[] {
	if (limit <= 0) return [];
	return resolved.slice(-limit);
}

// ---------------------------------------------------------------------------
// Guidance Resolution
// ---------------------------------------------------------------------------

type GuidanceKind = "agents" | "claude" | "architecture";

interface GuidanceFile {
	/** Forward-slash-normalized path from project root — stable dedup key. */
	relativePath: string;
	absolutePath: string;
	content: string;
	kind: GuidanceKind;
}

/**
 * Exact-case existence check for one file inside `dir`.
 *
 * `existsSync(join(dir, name))` is not enough on a case-insensitive filesystem —
 * APFS and NTFS, the defaults on macOS and Windows. There the ladder's `AGENTS.md`
 * candidate matched a neighbouring `agents.md`, and this repo had one:
 * `packages/rpiv-pi/docs/agents.md`, a docs page about the bundled subagents, so
 * touching any file under that directory injected all 5,005 bytes of it labelled as
 * `AGENTS.md` guidance. Worse than the waste, the ladder stops at the first match,
 * so a real `.rpiv/guidance/<sub>/architecture.md` would have been shadowed by a
 * case-colliding unrelated file.
 *
 * That page is `bundled-agents.md` now, so this repo holds no such collision today.
 * The helper stays anyway: a project bringing its own lowercase `agents.md` is the
 * case it guards, and the shadowing half of the failure is silent.
 *
 * Comparing against the directory listing is case-exact on every filesystem, so a
 * candidate matches the file it actually names. A missing or unreadable directory is
 * a miss rather than an error, leaving the caller's next candidate to apply.
 *
 * Exported so tests can pin the case behaviour directly — the filesystem a test
 * runs on decides whether an integration case exercises it at all.
 */
export function hasExactFile(dir: string, name: string): boolean {
	try {
		return readdirSync(dir).includes(name);
	} catch {
		return false;
	}
}

/**
 * Resolve guidance files for a given file path.
 *
 * Walks from project root to the file's directory. At each depth, picks
 * the first existing of AGENTS.md > CLAUDE.md > architecture.md (Pi's
 * own per-dir precedence at resource-loader.js:30-46, extended with
 * architecture.md as a third candidate). Depth 0 only checks
 * architecture.md — Pi's loader already handles <cwd>/AGENTS.md and
 * <cwd>/CLAUDE.md.
 *
 * Returns files root-first (general → specific), at most one per depth.
 */
export function resolveGuidance(filePath: string, projectDir: string): GuidanceFile[] {
	const fileDir = dirname(filePath);
	const relativeDir = relative(projectDir, fileDir);

	// Guard: file is outside project root
	if (relativeDir.startsWith("..") || isAbsolute(relativeDir)) {
		return [];
	}

	const parts = relativeDir ? relativeDir.split(sep) : [];
	const results: GuidanceFile[] = [];

	for (let depth = 0; depth <= parts.length; depth++) {
		const subPath = parts.slice(0, depth).join(sep);

		// Per-depth candidate ladder. First-match wins.
		const candidates: Array<{ relative: string; kind: GuidanceKind }> = [];

		// Depth 0: skip AGENTS/CLAUDE — Pi's loader handles <cwd> already.
		if (depth > 0) {
			candidates.push({ relative: join(subPath, AGENTS_MD), kind: "agents" });
			candidates.push({ relative: join(subPath, CLAUDE_MD), kind: "claude" });
		}
		candidates.push({
			relative: join(RPIV_DIR, GUIDANCE_SUBDIR, ...(subPath ? [subPath] : []), ARCHITECTURE_MD),
			kind: "architecture",
		});

		for (const candidate of candidates) {
			const absolute = join(projectDir, candidate.relative);
			if (!hasExactFile(dirname(absolute), basename(absolute))) continue;

			results.push({
				relativePath: candidate.relative.split(sep).join("/"),
				absolutePath: absolute,
				content: readFileSync(absolute, "utf-8"),
				kind: candidate.kind,
			});
			break; // first-match wins at this depth
		}
	}

	return results;
}

// ---------------------------------------------------------------------------
// Session State
// ---------------------------------------------------------------------------

/** In-memory set of injected guidance paths per session. */
const injectedGuidance = new Set<string>();

export function clearInjectionState() {
	injectedGuidance.clear();
}

// ---------------------------------------------------------------------------
// Root Guidance Injection (session_start)
// ---------------------------------------------------------------------------

/**
 * Take the root `.rpiv/guidance/architecture.md` payload without sending it.
 *
 * The split between take and send lets `before_agent_start` merge deferred
 * post-compaction context into ONE message. Calling `pi.sendMessage` from
 * `session_compact` queues a steering turn while overflow recovery is active;
 * one-at-a-time delivery can otherwise make the model answer injected context
 * instead of resuming the interrupted user task. `force` bypasses the
 * process-global dedup marker for a specifically compacted SessionManager, so
 * another concurrent session cannot suppress that session's restoration.
 */
export function takeRootGuidance(cwd: string, trigger = "auto-loaded at session start", force = false): string | null {
	const relativePath = ROOT_GUIDANCE_KEY;

	if (!force && injectedGuidance.has(relativePath)) return null;

	const absolutePath = join(cwd, relativePath);
	if (!hasExactFile(dirname(absolutePath), basename(absolutePath))) return null;

	let content: string;
	try {
		content = readFileSync(absolutePath, "utf-8");
	} catch {
		// Silent failure mirrors handleToolCallGuidance's posture. Don't mark as
		// injected so a later tool_call can retry.
		return null;
	}
	injectedGuidance.add(relativePath);

	const file: GuidanceFile = { relativePath, absolutePath, content, kind: "architecture" };
	return wrapGuidance(formatLabel(file), content, trigger);
}

/**
 * Inject root guidance at session start, before the first agent turn.
 * Uses the same `injectedGuidance` Set as tool-call injection.
 */
export function injectRootGuidance(cwd: string, pi: ExtensionAPI): void {
	const content = takeRootGuidance(cwd);
	if (content !== null) sendGuidanceMessage(pi, content);
}

// ---------------------------------------------------------------------------
// Tool-call Handler
// ---------------------------------------------------------------------------

/**
 * Resolve, dedup, mark, and format guidance for a touched file — the "build"
 * half of tool-call injection (no `ExtensionAPI`, no `sendMessage`). Owns the
 * `injectedGuidance` Set read+mark so the dedup filter and the mark step stay
 * in one function: marking before returning content lets the caller send with
 * idempotence > reliability.
 *
 * Throttled to `TOOL_PATH_GUIDANCE_LIMIT` files, taken from the specific end of
 * the ladder AFTER the dedup filter. That order is the contract: the filter
 * removes what is already in context, the throttle then picks the most specific
 * of what remains. Slicing first would resolve to an already-injected leaf,
 * return `null`, and drop a resolved-but-never-injected ancestor forever — the
 * next touch of the same directory resolves the same leaf and skips again. So
 * `null` here means "every resolved file is already injected", exactly once.
 *
 * The consequence is deliberate: an intermediate level is delivered on a LATER
 * touch of that directory rather than alongside the leaf, which keeps any single
 * touch to one file.
 *
 * Returns the `"\n\n---\n\n"`-joined formatted blocks, or `null` when nothing
 * resolves along the ladder OR every resolved file is already injected (marks
 * nothing in the null cases).
 */
export function resolveAndFormatNewGuidance(filePath: string, cwd: string, toolName: string): string | null {
	const resolved = resolveGuidance(filePath, cwd);
	const newFiles = takeDeepest(
		resolved.filter((g) => !injectedGuidance.has(g.relativePath)),
		TOOL_PATH_GUIDANCE_LIMIT,
	);
	if (newFiles.length === 0) return null;

	// Mark before send — idempotence > reliability.
	for (const g of newFiles) {
		injectedGuidance.add(g.relativePath);
	}

	const trigger = `auto-loaded because ${toolName} touched ${shortenPath(filePath, cwd)}`;
	const contextParts = newFiles.map((g) => wrapGuidance(formatLabel(g), g.content, trigger));

	return contextParts.join("\n\n---\n\n");
}

/**
 * Handle guidance injection on tool_call events for read/edit/write — a thin
 * wiring pipeline: filter → extract → delegate → send. Resolve/dedup/mark/format
 * live in `resolveAndFormatNewGuidance`; this handler adds no direct
 * `injectedGuidance` reference.
 */
export function handleToolCallGuidance(
	event: { toolName: string; input: Record<string, unknown> },
	ctx: { cwd: string },
	pi: ExtensionAPI,
): void {
	if (!(FILE_WRITE_TOOLS as readonly string[]).includes(event.toolName)) return;

	const filePath = (event.input as any).file_path ?? (event.input as any).path;
	if (!filePath) return;

	const content = resolveAndFormatNewGuidance(filePath, ctx.cwd, event.toolName);
	if (content !== null) sendGuidanceMessage(pi, content);
}

/**
 * Wrap guidance content in a non-task envelope. The opening disclaimer tells
 * the agent this block is reference material — not an instruction — and states
 * the trigger so the agent can judge whether the block is relevant to the
 * current user request. Heading is `## Architecture Guidance:` to match the
 * `PreToolUse:Read` hook output and the actual content (architecture.md).
 */
function wrapGuidance(label: string, content: string, trigger: string): string {
	return [
		`[rpiv-guidance — reference material, NOT a task. ${trigger}.`,
		`Consult only if directly relevant to the user's current request; otherwise ignore.]`,
		"",
		`## Architecture Guidance: ${label}`,
		"",
		content,
	].join("\n");
}

/**
 * Render a project-relative, forward-slash-normalized path for the trigger
 * disclaimer. Falls back to the absolute path if the file lives outside the
 * project root (defensive — `handleToolCallGuidance` already short-circuits
 * via `resolveGuidance` in that case, so this branch is unreachable today).
 */
function shortenPath(filePath: string, cwd: string): string {
	const r = relative(cwd, filePath);
	return r && !r.startsWith("..") ? r.split(sep).join("/") : filePath;
}

/**
 * Format a guidance file's heading label.
 *   extensions/rpiv-core/AGENTS.md          → "extensions/rpiv-core (AGENTS.md)"
 *   scripts/CLAUDE.md                       → "scripts (CLAUDE.md)"
 *   .rpiv/guidance/scripts/architecture.md  → "scripts (architecture.md)"
 *   .rpiv/guidance/architecture.md          → "root (architecture.md)"
 */
function sendGuidanceMessage(pi: ExtensionAPI, content: string): void {
	pi.sendMessage({
		customType: MSG_TYPE_GUIDANCE,
		content,
		display: !!pi.getFlag(FLAG_DEBUG),
	});
}

function formatLabel(g: GuidanceFile): string {
	if (g.kind === "architecture") {
		const stripped = g.relativePath.replace(/^\.rpiv\/guidance\//, "");
		const sub = stripped === "architecture.md" ? "" : stripped.replace(/\/architecture\.md$/, "");
		return `${sub || "root"} (architecture.md)`;
	}
	const fileName = g.kind === "agents" ? "AGENTS.md" : "CLAUDE.md";
	const idx = g.relativePath.lastIndexOf("/");
	const sub = idx > 0 ? g.relativePath.slice(0, idx) : "";
	return `${sub || "root"} (${fileName})`;
}
