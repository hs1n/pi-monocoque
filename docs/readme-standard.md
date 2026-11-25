# README standard

This standard tells you how to write each README in this repo. All READMEs have one shape.
Thus a reader who knows one README knows all of them.

## The premise

A README is a **front page, not a manual**. It is the package page on GitHub. It is also,
more and more, the first file that a coding agent reads before it decides to install
something. All these readers want the same answers in the first 30 seconds: *what is this,
is it for me, and how do I start.* They do not want the authoring DSL in paragraph four.

This standard fixes a problem that these packages had: their READMEs became reference
manuals. All the facts were true, and most were useful to *someone*. But a person who wanted
to decide on `pi install` had to read 400 lines first. Do not delete reference material. Move
it to `docs/`, where its readers look for it. Then the README can do its job again.

## The split

| Goes in the README | Goes in `docs/` |
| --- | --- |
| What it is, who it is for | Complete option and flag reference |
| Install and restart | Full tool JSON schemas |
| The shortest path to a working state | Authoring guides, DSL specs |
| The 5–7 capabilities that make someone want it | Setup steps for each provider |
| The 3–5 config settings that most people change | Step-by-step integration tutorials |
| Where the full docs are | Architecture, internals, extension points |

Put a section in the README only if a *first-time reader* needs it to get to a working
state. Put each fact that a *returning* reader looks up in `docs/`.

## Section order

The order is fixed. Do not change the order, and do not add new top-level sections. Do not
write a section that is empty or that has no real content.

```
# <package name>
[cover image]

<lede — 2–3 sentences>

## Install
## Quick start
## What you get
## Configuration      (only if user-configurable)
## Reference          (only if docs/*.md exist)
## Requirements       (only if non-obvious: native deps, runtimes, API keys)
## Troubleshooting    (only for failures users actually hit)
## Related            (only for real coupling to sibling packages)
## License
```

### `# <package name>`

Use the package name, `@hs1n/rpiv-x`, because readers search for it. **Do not add badges.**
Nothing here is published, so an npm-version badge gives a 404 error. A license badge only
repeats the `## License` line, and it points at an external service. Put the cover image
directly under the H1.

### Lede

Write two to three sentences, with no heading. Sentence one says what the package does, in
the words of the user, not the words of the code. Sentence two gives the mechanism: the
command, the tool or the surface that it adds. If necessary, sentence three says who it is
for, or what it works with. Link [Pi Agent](https://github.com/badlogic/pi-mono) when you
first name it.

Do not use marketing adjectives. "Powerful", "seamless" and "blazing" tell the reader
nothing. A specific capability persuades the reader.

### `## Install`

Give the one command and the restart note. Give nothing more.

````md
```sh
pi install git:github.com/hs1n/pi-monocoque
```

Restart Pi, or `/reload` in a running session.
````

There is one exception. An opt-in package (`rpiv-btw`) is not in the root `pi` manifest.
Thus its README gives its own local-path install.

### `## Quick start`

Give the shortest complete path from install to a visible result. If possible, give one
command and what the user sees. A screenshot is useful here. Do not use a screenshot in
place of an explanation. If the package needs an API key or a model before it does
something, state that step here. Do not put it only in Configuration.

### `## What you get`

Write five to seven bullets. Each bullet has a bold lead-in and one sentence. Give the
benefit first and the mechanism second. Example: **Survives compaction**: the extension
restores the state from the session file on `/reload`, and does not keep it in memory. Do
not list each code path. List the reasons to install the package.

### `## Configuration`

Give the settings that most people change, in a table: setting, what it does, default. Put
the full option surface in `docs/`. State the path of the config file one time, literally
(`~/.config/rpiv-x/config.json`). Also state the file-permission behavior.

### `## Reference`

Give a short list of links into `docs/`. Write one line for each link. The line tells the
reader what the file contains, so the reader does not need to open it to find out.

### `## Troubleshooting`

Give only real failures that users reported and that you can reproduce. Write each one as
symptom, cause and fix. An empty Troubleshooting section is worse than no section, because
it makes the package look fragile.

### `## License`

Write `MIT` and a link to `LICENSE`, on one line.

## Rules

1. **Length limit.** Extension READMEs must have 150 lines or fewer. The `rpiv-pi` umbrella
   README must have 200 lines or fewer. If a README is longer, move content to `docs/`.
2. **Each command runs as written.** The reader can copy and paste it. Use a placeholder
   only when it is clearly a placeholder. Do not invent flags. If the code does not have
   it, the README does not have it.
3. **Do not repeat `package.json`.** Version, dependency lists and keywords are metadata.
4. **Use tables for lists of items.** Config keys, providers, commands and flags go in
   tables. Use prose when the text gives a reason.
5. **Use absolute image URLs.**
   `https://raw.githubusercontent.com/hs1n/pi-monocoque/main/packages/<pkg>/docs/<file>`.
   Relative paths do not work outside the repo. Give each image useful alt text.
6. **Use the second person and the present tense.** Write "You select a model with
   `/advisor`". Do not write "the user may configure an advisor model".
7. **Give only facts.** Do not describe planned features, a roadmap or long design reasons.
   If a design decision needs a defense, write it in `docs/`.
8. **Sibling links are real links.** A link to a different package points at its directory
   under `packages/`. Do not use a bare name. Do not link an npm page, because none exist.
9. **Do not use badges or links to badge or registry services.** This repo publishes
   nothing, so badge links and npm registry links give no correct information.

## `files` arrays (hygiene, not shipping)

Nothing here is published, so no tarball is made. But each package still declares `files`.
`verifyShipManifest` fails a test when that declaration and the production `.ts` tree on
disk do not agree. Keep this invariant. Then a future distribution route (a tarball, a
registry or a copy) needs only one step.

`docs/` holds two types of content with opposite costs. Declare them differently:

| | Reference markdown | Cover and screenshot art |
| --- | --- | --- |
| Size | 4–6 KB each | 122–435 KB each |
| Changes with the version | Yes: it documents the flags and defaults of this release | No |
| How readers get it | Read as a file | Fetched over HTTP by absolute URL |

The declaration is the set that you can ship. The repo is the set that changes all the time.
A package with a `docs/` directory declares:

```json
"files": ["…", "docs/", "!docs/*.png", "!docs/*.jpg", "!docs/*.svg", "…"]
```

Declare the Markdown, and do not declare the art. READMEs refer to art only by absolute
`raw.githubusercontent.com` URL. Thus the exclusion costs nothing, and it removes about 92%
of the packable size from a package with many images. (Pi puts a third-party npm package
under `~/.pi/agent/npm/node_modules/`, so its Markdown is on disk there.)

Use the `docs/` form with negations. Do not use a `docs/*.md` glob. `verifyShipManifest`
checks for missing entries with a literal `existsSync`, so it flags a glob as a ghost entry.
Both of its checks skip the entries that start with `!`.

> [!NOTE]
> This is a known gap, and it stays unfixed on purpose. README links point at `/blob/main/`.
> Thus a reader on an older commit gets the current docs. No publish step exists to keep an
> older copy, so the repo is the only artifact. If the repo is ever distributed by tag, look
> at this again.

## Internal packages

`rpiv-config`, `rpiv-side-call` and `test-utils` are not installed by consumers. They get a
short internal README. It must have fewer than 60 lines:

```
# <package name>

<one line: what it is and that it is internal to this repo>

## What it provides
## Used by
## Conventions        (only if there are non-obvious ones)
```

An internal README has no install section, no badges and no cover art.
