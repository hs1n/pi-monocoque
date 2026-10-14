/**
 * sidecall tests — the host-version-tolerant surface this module owns.
 *
 * The consumer test files mock `@earendil-works/pi-ai/compat` to SUCCEED, so the
 * version-tolerance arms the module exists for are exercised here instead:
 * /compat resolves (host >= 0.80.1), /compat unresolvable → root fallback
 * (host <= 0.79.x), a REAL /compat failure rethrows instead of masking, and a
 * host with neither export fails with a clear error.
 */

import type { Message } from "@earendil-works/pi-ai";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveSideCall, stripToolDeclarations } from "./sidecall.js";

describe("resolveSideCall — facade path", () => {
	it("reports `facade` and returns the runtime's own bound completeSimple", async () => {
		const runtime = {
			completeSimple: vi.fn(function (this: unknown) {
				expect(this).toBe(runtime);
				return Promise.resolve(undefined as never);
			}),
		};
		const dispatch = resolveSideCall({ runtime });

		expect(dispatch.mode).toBe("facade");
		const completeSimple = await dispatch.completeSimple();
		expect(completeSimple).toBeTypeOf("function");
		await completeSimple(undefined as never, undefined as never);
		expect(runtime.completeSimple).toHaveBeenCalledOnce();
	});

	it("reports `global` for missing or malformed runtime facades", () => {
		expect(resolveSideCall(undefined).mode).toBe("global");
		expect(resolveSideCall({ runtime: null }).mode).toBe("global");
		expect(resolveSideCall({ runtime: { completeSimple: "not-a-function" } }).mode).toBe("global");
	});

	it("reports `global`, rather than throwing, when reading the slot itself throws", () => {
		const registry = {
			get runtime(): unknown {
				throw new Error("private host shape");
			},
		};
		expect(resolveSideCall(registry).mode).toBe("global");
	});
});

describe("resolveSideCall — global path", () => {
	afterEach(() => {
		vi.doUnmock("@earendil-works/pi-ai/compat");
		vi.doUnmock("@earendil-works/pi-ai");
		vi.resetModules();
	});

	/** Import the module AFTER the per-test doMocks so its dynamic imports resolve
	 *  against them (vi.resetModules first drops any previously-cached copies). */
	async function load(): Promise<unknown> {
		const mod = await import("./sidecall.js");
		return mod.resolveSideCall(undefined).completeSimple();
	}

	it("resolves completeSimple from /compat when the host exposes it (pi >= 0.80.1)", async () => {
		vi.resetModules();
		const compatFn = vi.fn();
		vi.doMock("@earendil-works/pi-ai/compat", () => ({ completeSimple: compatFn }));
		await expect(load()).resolves.toBe(compatFn);
	});

	it("falls back to the package root when /compat is not exported (host <= 0.79.x)", async () => {
		vi.resetModules();
		vi.doMock("@earendil-works/pi-ai/compat", () => {
			// The code an installed-but-old pi-ai actually produces: the package
			// resolves, but "./compat" is missing from its exports map.
			throw Object.assign(new Error("Package subpath './compat' is not defined"), {
				code: "ERR_PACKAGE_PATH_NOT_EXPORTED",
			});
		});
		const rootFn = vi.fn();
		vi.doMock("@earendil-works/pi-ai", () => ({ completeSimple: rootFn }));
		await expect(load()).resolves.toBe(rootFn);
	});

	it("rethrows a non-resolution /compat failure instead of masking it with the root fallback", async () => {
		vi.resetModules();
		vi.doMock("@earendil-works/pi-ai/compat", () => {
			throw new Error("compat entrypoint exploded at module init");
		});
		// A WORKING root export proves the rejection comes from the rethrow: the
		// old catch-all `.catch` fallback would have resolved here.
		vi.doMock("@earendil-works/pi-ai", () => ({ completeSimple: vi.fn() }));
		await expect(load()).rejects.toThrow();
	});

	it("fails with a clear error when neither entrypoint exposes completeSimple", async () => {
		vi.resetModules();
		vi.doMock("@earendil-works/pi-ai/compat", () => ({}));
		await expect(load()).rejects.toThrow(/completeSimple/);
	});

	it("never touches pi-ai when a facade exists", async () => {
		vi.resetModules();
		vi.doMock("@earendil-works/pi-ai/compat", () => {
			throw new Error("the global entrypoint must not be reached");
		});
		const runtime = { completeSimple: vi.fn() };
		const mod = await import("./sidecall.js");
		const dispatch = mod.resolveSideCall({ runtime });
		expect(dispatch.mode).toBe("facade");
		await expect(dispatch.completeSimple()).resolves.toBeTypeOf("function");
	});
});

describe("loadIsContextOverflow", () => {
	afterEach(() => {
		vi.doUnmock("@earendil-works/pi-ai/compat");
		vi.doUnmock("@earendil-works/pi-ai");
		vi.resetModules();
	});

	/** Import the module AFTER the per-test doMocks so its dynamic imports resolve
	 *  against them (vi.resetModules first drops any previously-cached copies). */
	async function load(): Promise<unknown> {
		const mod = await import("./sidecall.js");
		return mod.loadIsContextOverflow();
	}

	it("resolves isContextOverflow from /compat when the host exposes it", async () => {
		vi.resetModules();
		const compatFn = vi.fn();
		vi.doMock("@earendil-works/pi-ai/compat", () => ({ isContextOverflow: compatFn }));
		await expect(load()).resolves.toBe(compatFn);
	});

	it("returns undefined (does not throw) when neither entrypoint exports isContextOverflow", async () => {
		vi.resetModules();
		// Provide the key explicitly as `undefined`: a real ESM namespace returns
		// `undefined` (not throws) for a non-present export, but Vitest's strict mock
		// throws on access of a key the factory omitted — providing the key as
		// undefined faithfully simulates the production condition the loader degrades on.
		vi.doMock("@earendil-works/pi-ai/compat", () => ({ isContextOverflow: undefined }));
		await expect(load()).resolves.toBeUndefined();
	});

	it("falls back to the package root then returns undefined when /compat is unresolvable and root lacks the export", async () => {
		vi.resetModules();
		vi.doMock("@earendil-works/pi-ai/compat", () => {
			// The code an installed-but-old pi-ai actually produces: the package
			// resolves, but "./compat" is missing from its exports map.
			throw Object.assign(new Error("Package subpath './compat' is not defined"), {
				code: "ERR_PACKAGE_PATH_NOT_EXPORTED",
			});
		});
		vi.doMock("@earendil-works/pi-ai", () => ({ isContextOverflow: undefined }));
		await expect(load()).resolves.toBeUndefined();
	});

	it("rethrows a non-resolution /compat failure instead of masking it as undefined", async () => {
		vi.resetModules();
		vi.doMock("@earendil-works/pi-ai/compat", () => {
			throw new Error("compat entrypoint exploded at module init");
		});
		// A WORKING root export proves the rejection comes from the rethrow: the
		// graceful-degradation path would have resolved undefined here.
		vi.doMock("@earendil-works/pi-ai", () => ({ isContextOverflow: vi.fn() }));
		await expect(load()).rejects.toThrow();
	});
});

describe("stripToolDeclarations", () => {
	const userMessage = { role: "user", content: [{ type: "text", text: "hi" }], timestamp: 0 } as unknown as Message;
	const systemWithTools = {
		role: "system",
		content: [{ type: "text", text: "you have tools" }],
		timestamp: 0,
		toolsAdded: [{ name: "advisor" }],
		toolsRemoved: [{ name: "bash" }],
	} as unknown as Message;

	it("returns the same array when no system message declares tools", () => {
		const messages = [userMessage];
		expect(stripToolDeclarations(messages)).toBe(messages);
	});

	it("drops the deltas and keeps the prompt text by reference", () => {
		const [, stripped] = stripToolDeclarations([userMessage, systemWithTools]);
		expect((stripped as { toolsAdded?: unknown }).toolsAdded).toBeUndefined();
		expect((stripped as { toolsRemoved?: unknown }).toolsRemoved).toBeUndefined();
		expect(stripped.content).toBe(systemWithTools.content);
		// Untouched neighbours keep their identity.
		const untouched = [systemWithTools, userMessage];
		expect(stripToolDeclarations(untouched)[1]).toBe(userMessage);
	});
});
