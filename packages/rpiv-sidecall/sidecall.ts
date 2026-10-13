/**
 * sidecall — the host-version-tolerant surface a sibling uses to make a one-off
 * model call outside the main transcript.
 *
 * Pi >= 0.80.1 moved the global dispatch API (`completeSimple` et al.) to the
 * "@earendil-works/pi-ai/compat" entrypoint; hosts <= 0.79.x export it from the
 * package root and have no /compat entrypoint at all. pi-ai resolves at runtime
 * against the HOST's copy (peerDependency "*"), so neither path can be a static
 * import — try /compat first, fall back to the root entrypoint.
 *
 * The fallback is reserved for RESOLUTION failures (the /compat subpath does not
 * exist on this host); any other /compat error — the entrypoint exists but throws
 * at module init — rethrows so the real failure surfaces at the call site
 * instead of being masked by a root import that may lack the export.
 *
 * Two host generations also differ in how credentials reach the call. A current
 * host keeps its canonical `ModelRuntime` behind the extension `ModelRegistry`'s
 * runtime-private `runtime` slot and applies credential-derived request fields
 * itself, so a caller prefers that facade and passes only `{ signal }`. A host
 * without the slot needs the legacy global path, which takes explicit
 * `apiKey`/`headers`. `resolveSideCall` reports which of the two this host takes.
 *
 * `/compat` is documented as temporary (deleted with pi's ModelManager
 * migration); when that lands, this module is the single place to migrate.
 */

import type { Message } from "@earendil-works/pi-ai";

export type CompleteSimpleFn = typeof import("@earendil-works/pi-ai/compat").completeSimple;
export type IsContextOverflowFn = typeof import("@earendil-works/pi-ai/compat").isContextOverflow;

/**
 * Which side-call path this host takes, and the callable that path resolves to.
 *
 * `mode` decides the request options a caller passes: a `facade` host applies
 * credential-derived fields (OAuth tokens for keyless providers, GitHub
 * Copilot's OAuth-specific `baseUrl`) inside the runtime, so the caller passes
 * only `{ signal }` — explicit overrides would bypass that resolution. A
 * `global` host takes `apiKey`/`headers` explicitly, which is also why a missing
 * literal API key is fatal only on that path.
 *
 * `completeSimple` is a thunk, deliberately. Three constraints pin this shape:
 * `resolveSideCall` must answer the mode question SYNCHRONOUSLY, because a caller
 * checks it before deciding whether the missing key is fatal; the global import
 * must not run at all when a facade exists; and it must run INSIDE the caller's
 * own error boundary, so a real `/compat` init failure surfaces at the call site.
 */
export interface SideCallDispatch {
	mode: "facade" | "global";
	completeSimple: () => Promise<CompleteSimpleFn>;
}

/**
 * Probe this host's side-call path.
 *
 * The facade lookup is a structural bridge: the launcher's canonical
 * `ModelRuntime` is not on the public extension surface, so it is recognised by
 * the `completeSimple` method the runtime drives its calls through, reading the
 * runtime-private `runtime` slot. Fail-soft — a malformed or private host shape
 * reads as "no facade" and keeps the version-tolerant global fallback. The
 * returned method is bound because `ModelRuntime.completeSimple()` calls other
 * runtime methods through `this`.
 */
export function resolveSideCall(modelRegistry: unknown): SideCallDispatch {
	const facade = facadeCompleteSimple(modelRegistry);
	if (facade) return { mode: "facade", completeSimple: () => Promise.resolve(facade) };
	return { mode: "global", completeSimple: loadCompleteSimple };
}

function facadeCompleteSimple(modelRegistry: unknown): CompleteSimpleFn | undefined {
	try {
		if (modelRegistry === null || typeof modelRegistry !== "object") return undefined;
		const runtime = (modelRegistry as { runtime?: unknown }).runtime;
		if (runtime === null || typeof runtime !== "object") return undefined;
		const completeSimple = (runtime as { completeSimple?: unknown }).completeSimple;
		return typeof completeSimple === "function" ? (completeSimple.bind(runtime) as CompleteSimpleFn) : undefined;
	} catch {
		// A malformed/private host shape should retain the version-tolerant fallback.
		return undefined;
	}
}

/**
 * Error codes meaning "the /compat entrypoint is not resolvable on this host":
 *   - `ERR_PACKAGE_PATH_NOT_EXPORTED` — Node's ESM resolver when the installed
 *     pi-ai (<= 0.79.x) resolves but has no "./compat" in its `exports` map —
 *     the code an old host actually produces. Without it the fallback could
 *     never fire, since a resolvable-but-unexported subpath is not a missing
 *     module.
 *   - `ERR_MODULE_NOT_FOUND` / `MODULE_NOT_FOUND` — Node's / jiti's resolver for
 *     an unresolvable module (jiti is what Pi loads `.ts` extensions with).
 * Module-private on purpose: consumers reach the /compat decision through
 * `resolveSideCall`, never by classifying an error themselves. rpiv-core keeps a
 * narrower two-code copy for its own question ("is this sibling installed?"),
 * which is not this one.
 */
const MODULE_NOT_FOUND_CODES = new Set(["ERR_PACKAGE_PATH_NOT_EXPORTED", "ERR_MODULE_NOT_FOUND", "MODULE_NOT_FOUND"]);

/** True for a module-resolution failure. Walks the `cause` chain — ESM loaders
 *  and tooling (vitest's mock layer, some bundlers) nest the real code under
 *  `.cause`. Bounded against pathological self-referential chains. */
function isModuleNotFound(err: unknown): boolean {
	for (
		let cur: unknown = err, depth = 0;
		cur != null && depth < 16;
		cur = (cur as { cause?: unknown }).cause, depth++
	) {
		if (typeof cur === "object" && MODULE_NOT_FOUND_CODES.has((cur as { code?: unknown }).code as string)) {
			return true;
		}
	}
	return false;
}

/** The legacy global entrypoint: /compat first, package root only on a resolution
 *  failure, and a clear error when neither exposes `completeSimple`. */
async function loadCompleteSimple(): Promise<CompleteSimpleFn> {
	let mod: { completeSimple?: CompleteSimpleFn };
	try {
		mod = (await import("@earendil-works/pi-ai/compat")) as { completeSimple?: CompleteSimpleFn };
	} catch (err) {
		if (!isModuleNotFound(err)) throw err; // a real /compat failure must surface, not mask as a fallback
		mod = (await import("@earendil-works/pi-ai")) as { completeSimple?: CompleteSimpleFn };
	}
	const completeSimple = mod.completeSimple;
	if (typeof completeSimple !== "function") {
		throw new Error(
			"pi-ai does not expose completeSimple on /compat or the package root — unsupported host pi-ai version",
		);
	}
	return completeSimple;
}

/**
 * Host-version-tolerant loader for pi-ai's `isContextOverflow` — the overflow
 * detector that gates a side call's single retry.
 *
 * `isContextOverflow` is re-exported from BOTH the `/compat` entrypoint and the
 * package root (defined in pi-ai's `utils/overflow`), so the resolution path
 * mirrors `completeSimple`: try `/compat`, fall back to the root only on a
 * module-resolution failure, and rethrow a real `/compat` init failure so it is
 * not masked by the fallback. Unlike `completeSimple`, the export's ABSENCE is
 * an expected host state (older pi-ai, or a host that surfaces it from neither
 * entrypoint), not an unsupported-host error: the missing-export case returns
 * `undefined` so a caller degrades gracefully — skips the retry — instead of
 * crashing. A non-resolution `/compat` failure still rethrows.
 */
export async function loadIsContextOverflow(): Promise<IsContextOverflowFn | undefined> {
	let mod: { isContextOverflow?: IsContextOverflowFn };
	try {
		mod = (await import("@earendil-works/pi-ai/compat")) as { isContextOverflow?: IsContextOverflowFn };
	} catch (err) {
		if (!isModuleNotFound(err)) throw err; // a real /compat failure must surface, not mask as a fallback
		mod = (await import("@earendil-works/pi-ai")) as { isContextOverflow?: IsContextOverflowFn };
	}
	const isContextOverflow = mod.isContextOverflow;
	if (typeof isContextOverflow !== "function") {
		return undefined; // expected absence on a host lacking the export — degrade, don't crash
	}
	return isContextOverflow;
}

/**
 * Drop the executor's callable tool declarations from a copied system message.
 *
 * Pi >= 1.0 records the executor's system prompt and tool loadout in the
 * transcript as `system` messages, and every provider resolves the request's
 * tools from those `toolsAdded`/`toolsRemoved` deltas — so passing `tools: []`
 * alone leaves the executor's tools callable and the side call can stop on
 * `toolUse` with no text (#295). Drop the deltas, keep the prompt text. Returns
 * the input array unchanged when no system message declares tools, and shares
 * each message's `content` by reference otherwise, so prompt-cache prefixes stay
 * byte-stable.
 */
export function stripToolDeclarations(messages: Message[]): Message[] {
	if (!messages.some((m) => m.role === "system" && (m.toolsAdded || m.toolsRemoved))) return messages;
	return messages.map((m) => {
		if (m.role !== "system" || (!m.toolsAdded && !m.toolsRemoved)) return m;
		const { toolsAdded: _added, toolsRemoved: _removed, ...rest } = m;
		return rest;
	});
}
