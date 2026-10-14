/**
 * rpiv-side-call — barrel. The implementation lives in ./sidecall.js; this file
 * keeps the package a single import specifier and the `exports` map one entry.
 *
 * NOT a Pi extension: no `pi` field, no `siblings.ts` entry, no line in the root
 * `pi` manifest. Siblings declare it in `dependencies` (see ADR 0001).
 */

export {
	type CompleteSimpleFn,
	type IsContextOverflowFn,
	loadIsContextOverflow,
	resolveSideCall,
	type SideCallDispatch,
	stripToolDeclarations,
} from "./sidecall.js";
