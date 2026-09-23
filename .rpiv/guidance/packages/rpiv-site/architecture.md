# rpiv-site

Astro 5 static marketing site for the rpiv-pi family. Workspace package
(`@juicesharp/rpiv-site`, `private: true`) — joins lockstep + shared CI
infrastructure but **NOT a Pi extension**: no `pi` field, never published, never
loaded by the Pi runtime. **Excluded from the root TypeScript project**
(`tsconfig.base.json:exclude` lists `packages/rpiv-site/**`); it has its own
`tsconfig.json` extending `astro/tsconfigs/strict`. Biome lints/formats `.ts` here
via the root `packages/*/**/*.ts` include (plus site-only `.css`/`.html` patterns) —
only `.astro`/`.mjs` and type-checking fall to Astro's own pipeline. Build invoked at
the monorepo root via `npm run build:site`.

Hand-built marketing tour plus a `/blog` and a `/docs` route tree. Spec content
(skills, agents) is **read directly from the rpiv-pi sibling at build time** via
cross-package globs — never duplicated.

**This fork does not deploy it.** Upstream serves `dist/` via GitHub Pages with
`public/CNAME` pinning the domain, deployed by `.github/workflows/deploy-site.yml` on
pushes touching `packages/rpiv-site/**`. In this fork that workflow is
`workflow_dispatch`-only and `public/CNAME` is deleted — the fork does not operate
`rpiv-pi.com`, so nothing here publishes the site automatically; `site:` in
`astro.config.mjs` still names upstream's domain and is inert until repointed.

The dependency list, the consumers/deploy detail, the module map, the cross-package
spec-loading code, and the `src/lib/` spec-file inventory are in `details.md` beside
this file — NOT auto-injected. Read it when you are changing the build, the spec
adapters, or the page tree.

## Architectural Boundaries
- **NO runtime — output is `static`** (`astro.config.mjs`); every data lookup runs in frontmatter at build time
- **NO duplicated specs** — agents and skills are loaded from `packages/rpiv-pi/` via cross-package glob; local content is the visitor-copy overlay (tagline + structured doc fields) plus the `extensions`, `posts`, `docs` collections
- **NO `getCollection` in components** — components import from the typed `src/lib/` adapters; `astro:content` is touched only by `src/lib/` and page frontmatter (e.g. `docs/reference/agents/[slug].astro` calls `getCollection`/`render` directly)
- **NO root-tsconfig coverage; `.astro` escapes Biome** — Astro's own pipeline owns type-check and `.astro` files; Biome lints `.ts`/`.css`/`.html` via the root config
- **`scripts/generate-og.mjs` is operator-only** — depends on an ambient `sharp`, reads a local `~/Downloads/...jpg`; never run by `astro build`
- **Hand-curated spec tables in `src/lib/`** — when an upstream agent/skill is added or its tier changes, update `TIER_BY_NAME` / `PIPELINE` etc. in the same change; when the pipeline shape changes in rpiv-pi's `built-in-workflows.ts`, re-sync the spine in `src/lib/workflows.ts` (deliberate folding only)

<important if="you are adding a new section component to the marketing site">
## Adding a Section
1. Create `src/components/<Section>.astro` — frontmatter `await`s its data from a typed `src/lib/` resolver, body emits scoped markup with `<style>`
2. Use only `tokens.css` custom properties for color/spacing/type — see `src/components/architecture.md`
3. Mount the section inside `src/pages/index.astro` between existing sections; ordering is the navigation order
4. If the section needs new spec data (e.g. a different agent slice), extend the resolver in `src/lib/` rather than calling `getCollection` from the component
</important>

<important if="you are adding or removing an upstream skill, agent, or sibling extension">
## Sync Checklist for Spec Changes
1. **New skill**: optionally add the visitor-copy `src/content/skills/<slug>.md` (tagline + structured `purpose`/`when_to_use`/`inputs`/`outputs`/`key_steps`/`related`) — the upstream `SKILL.md` is auto-loaded by `skillSpecs` and the skill indexes even without copy (spec fallback). If the skill belongs to a section flow, append it to `PIPELINE` / `SECONDARY` / `CODE_REVIEW_FLOW` in `src/lib/skills.ts`. If it writes an artifact, add an `ARTIFACT_WRITE_SITES` row. If the pipeline shape itself changes (stages added/removed in rpiv-pi's `built-in-workflows.ts`), re-sync the spine in `src/lib/workflows.ts`.
2. **New agent**: add `src/content/agents/<slug>.md` (tagline + `purpose`/`when_to_use`/`dispatched_by`) and a `TIER_BY_NAME` row in `src/lib/agents.ts`; `agentSpecs` picks the upstream `.md` up automatically.
3. **New sibling extension**: create `src/content/extensions/<slug>.md` with `package`/`status`/`order` frontmatter. Only add a `SIBLING_NAMES` + `ROLES` entry in `src/lib/siblings.ts` if the sibling should appear in the curated SiblingGrid — `SIBLING_NAMES` is a hand-picked subset, NOT 1:1 with `extensions/`.
4. **Sibling renamed/removed**: update `SIBLING_NAMES`/`ROLES` if it was listed, AND delete the matching `extensions/<slug>.md`. The build fails loudly if a name in the tuple has no `package.json`.
5. The compat floor shown in the Install section is the root `package.json` devDependencies pin of `@earendil-works/pi-coding-agent` — dependency bumps update it automatically, no manual sync; `src/lib/compat.ts` reads it at build time and throws if the pin is missing or empty.
</important>
