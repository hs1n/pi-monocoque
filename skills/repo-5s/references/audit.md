# Audit reference

Read during **Sort** (the evidence table) and when presenting the run (the report template).

## Red-tag evidence table

A red tag without evidence is a guess. Run the check for the candidate's kind and paste the result into the tag.

| Candidate | Check | Keep if |
|---|---|---|
| Code with no references | `git grep -n '<symbol>'` across the tree, including configs and tests | any live reference, or it is a public entry point / export |
| File with no inbound references | `git grep -n '<basename-without-ext>'`; check imports and configs | referenced by manifest, CI, docs, or another tracked file |
| Superseded duplicate | `git log --all --oneline -- <path>`; read both files | the two serve different roles |
| Generated output | find the generator (`Makefile`, `package.json` script, CI step) that writes that path | no generator writes it — then it is a source file |
| Orphaned asset | `git grep -n '<filename>'`; check HTML/CSS/manifest references | referenced somewhere |
| Stale doc | grep the feature name in code and configs | the feature still exists |

Add `git log -1 --format='%cs %s' -- <path>` to every tag: the age and last change are the cheapest signal.

## Quarantine

Quarantine holds a red-tagged item in the working tree, out of the way, recoverable in one command: `git mv <path> red-tag/<path>`. The item stays tracked until confirmed.

Record the location in the report. A quarantine nobody can find is a delete with extra steps.

## Audit report template

```markdown
# 5S audit — <repo> — <date>

## Summary
- Keep: <n> files · Red-tagged: <n> · Applied fixes: <n> · Checks: <pass/fail>

## 1. Sort
| Path | Evidence | Disposition |
|---|---|---|
| `src/old.ts` | no references; last change 2023-04 | delete |

## 2. Set in order
| Current | Target | Status |
|---|---|---|
| `util/helpers.ts` | `src/util/helpers.ts` | moved |

## 3. Shine
| Finding | Check that surfaced it | Outcome |
|---|---|---|
| unused import in `a.ts` | `biome check` | fixed |

## 4. Standardize
| Decision | Home |
|---|---|
| format on commit | `biome.json` + pre-commit hook |

## 5. Sustain
- Re-run: <date> — reproduced
```
