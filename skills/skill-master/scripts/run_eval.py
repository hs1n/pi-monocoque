#!/usr/bin/env python3
"""Run trigger evaluation for a skill description.

Tests whether a skill's description causes Pi to trigger (read the skill)
for a set of queries. Outputs results as JSON.

Each query runs headless through `pi -p --mode json`. To evaluate a candidate
description, the skill directory is copied to a temp location with the
candidate written into its SKILL.md frontmatter, and Pi is pointed at that copy
with `--skill`. Discovered skills are disabled with `-ns` so the tested skill is
the only one on offer.
"""

import argparse
import json
import re
import shutil
import subprocess
import sys
import tempfile
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path

from scripts.utils import parse_skill_md


def find_project_root() -> Path:
    """Return the working directory Pi runs in.

    Historically this walked up looking for a project marker; Pi needs no
    project root to load an explicit `--skill`, so the current directory is
    enough.
    """
    return Path.cwd()


def _replace_description(frontmatter_text: str, description: str) -> str:
    """Set the top-level `description` key, leaving the rest of the block alone.

    The value is written as a JSON double-quoted scalar, which is valid YAML and
    survives quotes and backslashes in the generated description. A `>` / `|`
    block scalar is consumed with its indented continuation lines.
    """
    lines = frontmatter_text.split("\n")
    out: list[str] = []
    i = 0
    replaced = False
    while i < len(lines):
        line = lines[i]
        if not replaced and re.match(r"^description:", line):
            out.append("description: " + json.dumps(description))
            i += 1
            while i < len(lines) and (lines[i].startswith(" ") or lines[i].startswith("\t")):
                i += 1
            replaced = True
            continue
        out.append(line)
        i += 1
    if not replaced:
        out.append("description: " + json.dumps(description))
    return "\n".join(out)


def materialize_skill(skill_path: Path, description: str) -> Path:
    """Copy the skill to a temp dir with `description` in its frontmatter.

    Returns the temp root; the copied skill sits at `<temp root>/<skill name>`.
    The caller owns cleanup.
    """
    src = Path(skill_path).resolve()
    tmp_root = Path(tempfile.mkdtemp(prefix="skill-master-eval-"))
    dst = tmp_root / src.name
    shutil.copytree(src, dst)

    skill_md = dst / "SKILL.md"
    text = skill_md.read_text()
    match = re.match(r"^---\n(.*?)\n---\n?(.*)$", text, re.DOTALL)
    if not match:
        raise ValueError(f"{skill_md} has no YAML frontmatter to override")
    frontmatter = _replace_description(match.group(1), description)
    skill_md.write_text(f"---\n{frontmatter}\n---\n\n{match.group(2)}")
    return tmp_root


def triggered(events_text: str, skill_dir: Path) -> bool:
    """Whether Pi consulted the skill, read from the JSON event stream.

    A skill triggers when the model reaches for it — in Pi that means a tool
    call that touches a file inside the skill directory (the `read` tool, or a
    shell command that cats it). We look for the skill directory path anywhere
    in a tool call's arguments rather than matching one tool name, so the signal
    survives a model that reads the file with `bash`.
    """
    marker = str(Path(skill_dir).resolve())
    relative_marker = f"{Path(skill_dir).name}/SKILL.md"
    for line in events_text.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            event = json.loads(line)
        except json.JSONDecodeError:
            continue
        if event.get("type") != "tool_execution_start":
            continue
        blob = json.dumps(event.get("args", {}))
        if marker in blob or relative_marker in blob:
            return True
    return False


def run_single_query(
    query: str,
    skill_name: str,
    skill_dir: str,
    timeout: int,
    cwd: str,
    model: str | None = None,
) -> bool:
    """Run one query and return whether the skill was triggered."""
    cmd = ["pi", "-p", "--mode", "json", "-ns", "--skill", skill_dir]
    if model:
        cmd.extend(["-m", model])
    cmd.append(query)

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            cwd=cwd,
            timeout=timeout,
        )
    except subprocess.TimeoutExpired:
        return False

    return triggered(result.stdout or "", Path(skill_dir))


def run_eval(
    eval_set: list[dict],
    skill_name: str,
    description: str,
    num_workers: int,
    timeout: int,
    project_root: Path,
    runs_per_query: int = 1,
    trigger_threshold: float = 0.5,
    model: str | None = None,
    skill_path: Path | None = None,
) -> dict:
    """Run the full eval set and return results."""
    results = []

    effective_dir = str(Path(skill_path).resolve()) if skill_path else None
    tmp_root = None
    if skill_path and description:
        tmp_root = materialize_skill(Path(skill_path), description)
        effective_dir = str((tmp_root / Path(skill_path).name).resolve())
    if effective_dir is None:
        raise ValueError("run_eval needs skill_path so it can offer the skill to Pi")

    try:
        with ProcessPoolExecutor(max_workers=num_workers) as executor:
            future_to_info = {}
            for item in eval_set:
                for _ in range(runs_per_query):
                    future = executor.submit(
                        run_single_query,
                        item["query"],
                        skill_name,
                        effective_dir,
                        timeout,
                        str(project_root),
                        model,
                    )
                    future_to_info[future] = item

            query_triggers: dict[str, list[bool]] = {}
            query_items: dict[str, dict] = {}
            for future in as_completed(future_to_info):
                item = future_to_info[future]
                query = item["query"]
                query_items[query] = item
                query_triggers.setdefault(query, [])
                try:
                    query_triggers[query].append(future.result())
                except Exception as e:
                    print(f"Warning: query failed: {e}", file=sys.stderr)
                    query_triggers[query].append(False)
    finally:
        if tmp_root:
            shutil.rmtree(tmp_root, ignore_errors=True)

    for query, triggers in query_triggers.items():
        item = query_items[query]
        trigger_rate = sum(triggers) / len(triggers)
        should_trigger = item["should_trigger"]
        if should_trigger:
            did_pass = trigger_rate >= trigger_threshold
        else:
            did_pass = trigger_rate < trigger_threshold
        results.append({
            "query": query,
            "should_trigger": should_trigger,
            "trigger_rate": trigger_rate,
            "triggers": sum(triggers),
            "runs": len(triggers),
            "pass": did_pass,
        })

    passed = sum(1 for r in results if r["pass"])
    total = len(results)

    return {
        "skill_name": skill_name,
        "description": description,
        "results": results,
        "summary": {
            "total": total,
            "passed": passed,
            "failed": total - passed,
        },
    }


def main():
    parser = argparse.ArgumentParser(description="Run trigger evaluation for a skill description")
    parser.add_argument("--eval-set", required=True, help="Path to eval set JSON file")
    parser.add_argument("--skill-path", required=True, help="Path to skill directory")
    parser.add_argument("--description", default=None, help="Override description to test")
    parser.add_argument("--num-workers", type=int, default=10, help="Number of parallel workers")
    parser.add_argument("--timeout", type=int, default=30, help="Timeout per query in seconds")
    parser.add_argument("--runs-per-query", type=int, default=3, help="Number of runs per query")
    parser.add_argument("--trigger-threshold", type=float, default=0.5, help="Trigger rate threshold")
    parser.add_argument("--model", default=None, help="Model to use for pi -p (default: user's configured model)")
    parser.add_argument("--verbose", action="store_true", help="Print progress to stderr")
    args = parser.parse_args()

    eval_set = json.loads(Path(args.eval_set).read_text())
    skill_path = Path(args.skill_path)

    if not (skill_path / "SKILL.md").exists():
        print(f"Error: No SKILL.md found at {skill_path}", file=sys.stderr)
        sys.exit(1)

    name, original_description, _ = parse_skill_md(skill_path)
    description = args.description or original_description
    project_root = find_project_root()

    if args.verbose:
        print(f"Evaluating: {description}", file=sys.stderr)

    output = run_eval(
        eval_set=eval_set,
        skill_name=name,
        description=description,
        num_workers=args.num_workers,
        timeout=args.timeout,
        project_root=project_root,
        runs_per_query=args.runs_per_query,
        trigger_threshold=args.trigger_threshold,
        model=args.model,
        skill_path=skill_path,
    )

    if args.verbose:
        summary = output["summary"]
        print(f"Results: {summary['passed']}/{summary['total']} passed", file=sys.stderr)
        for r in output["results"]:
            status = "PASS" if r["pass"] else "FAIL"
            rate_str = f"{r['triggers']}/{r['runs']}"
            print(f"  [{status}] rate={rate_str} expected={r['should_trigger']}: {r['query'][:70]}", file=sys.stderr)

    print(json.dumps(output, indent=2))


if __name__ == "__main__":
    main()
