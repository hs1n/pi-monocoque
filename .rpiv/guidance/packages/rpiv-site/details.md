# rpiv-site — modules, spec loading and deploy detail (NOT auto-injected)

Reference material split out of `architecture.md`. Read this when you are changing
the build, the spec adapters, or the page tree.

## Responsibility (full)

The home page is positioning-first ("correct ≠ aligned, keep the driver in the loop")
and composes AltHero → AltThesis → Install → AltFirstRun → WorkflowCatalog →
InsideBuild → AltSurface → SiblingGrid → AltModels → AltRoadmap → SetupTrace
(`Colophon` mounts globally in `Base.astro`); the earlier mechanism-first landing
(`/classic`) is retired — git history keeps it. The flow surfaces the rpiv-pi
pipelines, skills, agents, and sibling extensions.

## Dependencies

- **`astro` ^5.0.0** (devDep): the entire framework — `.astro` SFCs, content collections, static output
- **`@astrojs/sitemap` ^3.2.0** / **`@astrojs/rss` ^4.0.0** (devDep): `/sitemap-index.xml`; `/blog/rss.xml` feed builder
- **`pagefind` ^1.5.2** (devDep): static search index + UI, mounted on docs pages via `Search.astro`
- **`@fontsource/jetbrains-mono`** (runtime dep): bundled font, imported + preloaded in `src/layouts/Base.astro` (no CDN)
- **`sharp`** (ambient — used only by `scripts/generate-og.mjs`, not in `package.json`): operator-only OG/apple-touch-icon rasteriser

## Consumers

- **GitHub Pages (upstream only)** — see the fork delta in `architecture.md`. No runtime callers; fully static, no API or backend.

## Module Structure

```
Build config         — astro.config.mjs (static output; /docs/getting-started → /docs redirect; Shiki
                       transformer remapping github-dark inline colors to a CSS var; sitemap filter)
                       + tsconfig.json; site has its own type universe
public/              — Static assets copied verbatim (favicon.svg, apple-touch-icon, og-* images, robots.txt, .nojekyll); `CNAME` was removed in the fork
scripts/generate-og.mjs — Operator-only build helper (sharp); NOT invoked by `astro build`
src/pages/           — File-based routes (home + blog + docs trees) → see src/pages/architecture.md
src/layouts/         — Base.astro (HTML shell, SEO, JSON-LD, bundled font) + DocsLayout.astro
src/components/      — UI layer → see src/components/architecture.md
src/content/ + content.config.ts — Content collections → see src/content/architecture.md
src/lib/ + src/styles/ — Typed adapters/spec readers → see src/lib/architecture.md; global.css + tokens.css + prose.css (sumi/washi palette)
```

## Cross-Package Spec Loading (build-time only)

```typescript
// src/content.config.ts — spec-mirror collections reach OUT of the package via Astro's glob
// loader so the site reads upstream rpiv-pi sources directly (no dup).
const skillSpecs  = defineCollection({ loader: glob({ pattern: "*/SKILL.md", base: "../rpiv-pi/skills" }), schema: ... });
const agentSpecs  = defineCollection({ loader: glob({ pattern: "*.md",       base: "../rpiv-pi/agents" }), schema: ... });
// Visitor copy lives locally, joined by slug == upstream `name`. Schemas carry structured doc fields
// (purpose/when_to_use/inputs/outputs/key_steps/related). Skills without visitor copy still index via
// the spec fallback in src/lib/skills.ts — partial coverage is fine.
// Local-only collections (no upstream mirror): extensions, posts, docs.
```

## Spec-Data Files (`src/lib/`)

```typescript
// siblings.ts — reads each sibling's package.json directly via readFileSync from
//   "../../../<name>/package.json"; SIBLING_NAMES is the hand-curated tuple.
// compat.ts — reads packages/rpiv-pi/package.json (rpiv-pi version) and the monorepo
//   root package.json devDependencies pin of @earendil-works/pi-coding-agent (the tested
//   compatibility anchor — every package peer-depends on "*", so there is no published
//   floor); throws if the devDependency key is missing (build-time guard).
// agents.ts / skills.ts — Astro content-collection adapters (use `astro:content`).
//   Embed hand-curated tables: TIER_BY_NAME (capability tier per named agent), the
//   PIPELINE/SECONDARY/CODE_REVIEW_FLOW tuples + ARTIFACT_WRITE_SITES / PIPELINE_META.
// workflows.ts — hand-maintained presentation mirror of all four built-in pipelines
//   (build/vet/polish/ship; nothing is omitted); build's runtime stages fold into a curated
//   act spine. Components consume these typed APIs — never `getCollection()` directly.
```
