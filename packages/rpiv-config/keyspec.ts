/**
 * keyspec — pi-tui's KeyId grammar, and the ladder a config key field goes through.
 *
 * Two extensions let the user rebind the shortcut that collapses their overlay, and both need the
 * same strict answer to "will pi-tui actually match this spec?". The answer matters more than it
 * looks: pi-tui's `parseKeyId` takes the LAST `+`-part as the key and ignores the parts it does not
 * recognise, so `ctr+]` — one typo — is not rejected by the host. It resolves to a bare `]`, and
 * both consumers register a raw terminal listener for their key, so that typo silently swallows
 * every `]` press for the whole session. A loose check here is not "slightly permissive"; it is a
 * global input-capture bug whose only warning is the typo itself.
 *
 * The concept lives here in one piece: the grammar (`SPECIAL_KEYS`, `MODIFIERS`,
 * `isValidCollapseKeySpec`), its display form (`formatKeySpecForDisplay`, whose compound-word table
 * is a function of `SPECIAL_KEYS` and now cannot drift from it — they are twenty lines apart
 * because they are one concept, not two), the ladder from a raw config value to a usable spec
 * (`resolveCollapseKeySpec`), and the sentinel that switches the shortcut off
 * (`COLLAPSE_KEY_OFF`). A consumer supplies only the default it wants — the one part that genuinely
 * differs between them.
 */

/** A key spec in pi-tui's KeyId grammar, e.g. `"ctrl+shift+t"` or `"ctrl+]"`. The canonical form is
 *  lowercase; `resolveCollapseKeySpec` trims and lowercases what it returns. */
export type CollapseKeySpec = string;

/** Sentinel value for a key field that switches the shortcut off entirely. Never a valid KeyId,
 *  which is why `resolveCollapseKeySpec` checks for it before validating. */
export const COLLAPSE_KEY_OFF: CollapseKeySpec = "off";

// Named keys accepted by pi-tui's `matchesKey` (keys.js switches on the parsed base key).
// parseKeyId lowercases the id before matching, so lowercase spellings are canonical.
const SPECIAL_KEYS = new Set([
	"escape",
	"esc",
	"enter",
	"return",
	"tab",
	"space",
	"backspace",
	"delete",
	"insert",
	"clear",
	"home",
	"end",
	"pageup",
	"pagedown",
	"up",
	"down",
	"left",
	"right",
	...Array.from({ length: 12 }, (_, i) => `f${i + 1}`),
]);

const MODIFIERS = new Set(["ctrl", "shift", "alt", "super"]);

/** The only compound-word names in `SPECIAL_KEYS` — first-letter capitalization alone would render
 *  them "Pageup" / "Pagedown". Kept beside the table it mirrors, so adding a compound key to the
 *  grammar and its casing here is one edit in one file. */
const COMPOUND_KEY_DISPLAY: Record<string, string> = {
	pageup: "PageUp",
	pagedown: "PageDown",
};

/**
 * Validate a key spec against pi-tui's KeyId grammar: zero or more distinct modifiers, then a base
 * key that is a single printable character or a named special key.
 *
 * Strict on purpose. `parseKeyId` ignores unknown parts and takes the last `+`-part as the key, so
 * a loose check is how `ctr+]` becomes a global `]` capture (see the module header). Returns false
 * for anything that would not round-trip through `matchesKey` as written.
 */
export function isValidCollapseKeySpec(spec: string): boolean {
	if (!spec) return false;
	if (spec.startsWith("+") || spec.endsWith("+") || spec.includes("++")) return false;
	const parts = spec.split("+");
	const base = parts[parts.length - 1] ?? "";
	const modifiers = parts.slice(0, -1);
	if (modifiers.length !== new Set(modifiers).size) return false;
	if (!modifiers.every((m) => MODIFIERS.has(m))) return false;
	return base.length === 1 ? /[a-z0-9_\-!@#$%^&*()|~`'":;,./<>?[\]{}=\\]/.test(base) : SPECIAL_KEYS.has(base);
}

/**
 * Pretty-print a resolved key spec for UI copy: each `+`-part gets its first character uppercased
 * (`"ctrl+]"` → `"Ctrl+]"`, `"alt+o"` → `"Alt+O"`, `"f9"` → `"F9"`, `"ctrl+pagedown"` →
 * `"Ctrl+PageDown"`). Display-only — key matching always uses the raw lowercase spec
 * (`matchesKey` lowercases ids), so never feed the result back into it.
 */
export function formatKeySpecForDisplay(spec: CollapseKeySpec): string {
	return spec
		.split("+")
		.map(
			(part) =>
				COMPOUND_KEY_DISPLAY[part] ??
				(part.length <= 1 ? part.toUpperCase() : part.charAt(0).toUpperCase() + part.slice(1)),
		)
		.join("+");
}

/**
 * Turn a raw config value into a usable key spec: trim + lowercase, then the off sentinel, then the
 * grammar, else `fallback`. The ladder is the crash-resistant seam, so it applies the typeof guard
 * itself — a number or object from a hand-edited config file becomes the fallback, not a throw.
 *
 * The sentinel is checked BEFORE the grammar because `"off"` is deliberately not a valid KeyId:
 * validating first would make `collapseKey: "off"` fall through to the default shortcut, i.e.
 * disabling the shortcut would silently arm it.
 */
export function resolveCollapseKeySpec(raw: unknown, fallback: CollapseKeySpec): CollapseKeySpec {
	const spec = typeof raw === "string" ? raw.trim().toLowerCase() : undefined;
	if (spec === undefined || spec === "") return fallback;
	if (spec === COLLAPSE_KEY_OFF) return COLLAPSE_KEY_OFF;
	return isValidCollapseKeySpec(spec) ? spec : fallback;
}
