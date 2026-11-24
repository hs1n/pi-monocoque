# The typed workflow runtime is removed, not kept unreferenced

`@hs1n/rpiv-workflow` defined a typed multi-stage graph — stages, route edges, gates,
contract validation, a run journal, detached child sessions — and `rpiv-pi` supplied the
production content: four built-in graphs (build, vet, polish, ship), a meta preset, the
compute clusters behind them, contract harvesting from skill frontmatter, and the lane
dock that displayed the runs. Its only consumer was the `/wf` command. When `/wf` went,
nothing else loaded the package: the registries it exported had no writer, the host ports
had no runner, and the package could only be reached by a test.

The decision is removal rather than keeping it as an unreferenced library. Multi-stage
work is orchestrated by hand with Pi's own `Agent` and `SubagentWorkflow` tools, which
ship with the host and need no graph definition, no contract schema, and no per-run state
directory. A graph whose stages nothing routes to is not a library; it is a second
orchestration layer waiting for someone to write a third.

## Considered Options

- **Keep the package, unused** — rejected: it would still be a published-looking
  workspace with a lockstep version, a peer-pinned manifest entry, a guidance tree, and a
  test suite, all of which read as intent. It would also keep `rpiv-pi`'s four
  registrars, its contract provider, and its Pi-SDK child-spawn host in place, because
  those are what make the registries non-empty.
- **Keep only the registries and validation, drop the runner** — rejected: validation
  exists to reject graphs, and the graph authoring layer is the only thing that produced
  them. The remaining surface would be a schema for a file format nobody writes.
- **Reimplement `/wf` on `Agent` / `SubagentWorkflow`** — rejected: that is the same
  runtime with the host's name on it, and it would re-create the maintenance load the
  removal is meant to end. The tools already compose; the composition lives in a plan
  and in the conversation, per task.

## Consequences

Four concepts stop existing as first-class ideas, and this is the accepted trade-off:

- **Stage routing** — nothing reads a run's state to decide the next stage. The
  orchestrating agent decides, from the plan and from what the last tool returned.
- **Per-stage model presets** — `models.json` keeps `defaults`, `agents`, and `skills`;
  the `stages` and `presets` scopes are gone because their keys named workflow stages.
  A skill override is the finest rung left.
- **The lane UI** — the dock, `/lanes`, the Ctrl-Q switcher, the transcript replay, and
  the parked-question badge were views of a run registry that no longer fills. Detached
  child sessions are gone with them; `Agent` dispatches inline or backgrounded by Pi.
- **Skill-declared contracts** — a `SKILL.md` no longer carries a `produces` / `consumes`
  block. A downstream skill that names its upstream artifact in prose is the whole
  contract.

The `.rpiv/workflows/` run journal goes too: it held per-run state that only the runner
wrote.

Rebuilding any of this means rebuilding the runtime first, not restoring a file. The
minimum set is: a graph schema plus a validator, a loader that merges config layers, a
runner that spawns and resumes child sessions, a host-port contract for the launcher, a
state directory and its path resolution, and a view layer over the registry. The decision
to revisit is a consumer that needs routing *as data* — a CI job that replays a named
graph, or a second front-end over the same run state. Wanting a repeatable sequence of
stages is not that consumer; `Agent` and `SubagentWorkflow` cover it.
