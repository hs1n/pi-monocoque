# The lane display order stays in the registry; it is a shared UI order, not a display concern

An architecture review proposed moving the lane priority sort — needs-input → running → terminal,
insertion-stable, in `run-lane-registry.ts`'s `listLanesForDisplay()` — into the display layer, on
the grounds that a rendering concern was living in the data module. It was rejected on the
evidence. That order has nine production consumers and **three of them never render**:
`lane-dock-editor.ts` takes its row count and its top row, `lane-switcher.ts` takes its top row,
and `lane-console.ts` indexes a selection with it in five places. They all need the same order, so
what the function returns is the order the *user steps through*, not a property of drawing it.
Moving it would force those non-render consumers to build a render snapshot to read row 0 — worse
than the layering it was meant to fix.

## Consequences

`LaneReader` keeps `listLanesForDisplay()` among its four reads, and `lane-snapshot.ts` renders the
order it is given rather than sorting. A future "the data module renders" cleanup should not target
this function; the display concerns that did belong in the renderer (glyph priority, the column
measure, the fold) moved in the same change that recorded this.
