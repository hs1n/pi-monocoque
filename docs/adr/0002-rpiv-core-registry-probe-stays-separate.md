# rpiv-core's runtime-slot probe is deliberately not merged with the side-call loaders

Three files probe the host's runtime-private slot off `ctx.modelRegistry`: the loaders behind
`rpiv-advisor` and `rpiv-btw`, and `rpiv-pi/extensions/rpiv-core/pi-compat.ts`. All three
describe themselves as mirrors of each other, which reads as an invitation to merge them. They
must not be merged. Across the three, only about ten lines are the same operation — read
`.runtime` off the registry facade, guard the object shapes, fail soft to `undefined` on a
throwing getter. Everything after that differs: the member probed is `completeSimple` for the
two side-call loaders and `streamSimple` for rpiv-core, the return is a bound callable versus
the runtime object itself, and the consumer is a one-off side call versus choosing a
`createAgentSession` option for a child session.

Merging them would need a member-parametrized generic primitive behind an interface whose two
wrappers have nothing in common, and it would drag `@earendil-works/pi-coding-agent` types into
a module whose only other host dependency is `pi-ai`.

## Consequences

When the side-call surface becomes a library package of its own (`rpiv-sidecall`, per the
architecture review that produced this record), rpiv-core's copy stays where it is. The three
files stay in sync by hand; their cross-references should point at each other as *related work*
rather than implying a merge. If a future host moves the slot or exposes the runtime publicly,
each is a separate migration point and the three should be revisited together — at that point
the shared primitive may be worth extracting, because two of the three wrappers will have
become dead code.
