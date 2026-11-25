/**
 * command-aliases — register one slash command under a primary name and its old names.
 *
 * Pi's `registerCommand` has no alias field, so each alias is a second
 * registration with the same handler and the same argument completions. The
 * `{ name, aliases }` literal at each call site is the one source of truth for
 * the names of that command.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export type CommandOptions = Parameters<ExtensionAPI["registerCommand"]>[1];

export interface CommandNames {
	/** The primary name, without the leading slash. */
	readonly name: string;
	/** Old names that still work. Each one gets the same handler. */
	readonly aliases: readonly string[];
}

/** Description that Pi shows for an alias in the command list. */
export const aliasDescription = (primary: string): string => `Alias of /${primary} (old name).`;

export function registerCommandWithAliases(
	pi: Pick<ExtensionAPI, "registerCommand">,
	names: CommandNames,
	options: CommandOptions,
): void {
	pi.registerCommand(names.name, options);
	for (const alias of names.aliases) {
		pi.registerCommand(alias, { ...options, description: aliasDescription(names.name) });
	}
}
