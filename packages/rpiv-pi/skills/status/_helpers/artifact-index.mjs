// List the newest Markdown artifacts under .rpiv/artifacts/, one row per artifact.
// Usage: node artifact-index.mjs [topic] [--root <dir>] [--limit <n>]
//   [topic]   — case-insensitive substring; keeps rows whose filename or frontmatter
//               `topic:` contains it. Omitted → every row.
//   --root    — the artifacts directory. Default: .rpiv/artifacts under the git root
//               (or cwd if not in a repo).
//   --limit   — max rows per bucket, newest first (default 3).
// Output: `root: <abs>` then, when the root is missing, `missing` and nothing else;
// when no row matches, `empty`; else a tab-separated header and rows sorted newest first:
//   date  bucket  stage  status  path
// `date` comes from the `<YYYY-MM-DD_HH-MM-SS>` filename slug (see _shared/now.mjs);
// mtime is the fallback, because a clone resets mtime. Non-.md files are skipped.
// Always exits 0 — a missing root is a state to report, not an error.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";

/** Bucket → the skill(s) whose own text names that bucket as their output. */
const STAGE_BY_BUCKET = {
	discover: "discover",
	research: "research",
	solutions: "explore",
	slices: "slice",
	designs: "design",
	acceptance: "acceptance",
	plans: "plan/blueprint/quick-plan/synthesize",
	subplans: "synthesize",
	elaborations: "elaborate",
	validation: "validate",
	reviews: "code-review",
	"architecture-reviews": "architecture-review",
	triage: "pr-triage",
	handoffs: "create-handoff",
};

const args = process.argv.slice(2);
let topic = "";
let rawRoot = "";
let limit = 3;
for (let i = 0; i < args.length; i++) {
	if (args[i] === "--root") rawRoot = args[++i] ?? "";
	else if (args[i] === "--limit") limit = Math.max(1, Number.parseInt(args[++i] ?? "", 10) || 3);
	else topic = topic ? `${topic} ${args[i]}` : args[i];
}
topic = topic.trim().toLowerCase();

const gitRoot = (() => {
	try {
		return execFileSync("git", ["rev-parse", "--show-toplevel"], {
			encoding: "utf-8",
			stdio: ["ignore", "pipe", "ignore"],
		}).trim();
	} catch {
		return "";
	}
})();
const base = gitRoot || process.cwd();
const root = rawRoot ? (isAbsolute(rawRoot) ? rawRoot : resolve(base, rawRoot)) : join(base, ".rpiv", "artifacts");

console.log(`root: ${root}`);
if (!existsSync(root)) {
	console.log("missing");
	process.exit(0);
}

const SLUG = /^(\d{4}-\d{2}-\d{2})_(\d{2})-(\d{2})-(\d{2})/;
const pad = (n) => String(n).padStart(2, "0");
const fmtMtime = (ms) => {
	const d = new Date(ms);
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

/** `topic:` and `status:` from a leading `---` frontmatter block, if any. */
const frontmatter = (path) => {
	const lines = readFileSync(path, "utf-8").split("\n", 60);
	const out = { topic: "", status: "" };
	if (lines[0]?.trim() !== "---") return out;
	for (const line of lines.slice(1)) {
		if (line.trim() === "---") break;
		const m = /^(topic|status):\s*"?(.*?)"?\s*$/.exec(line);
		if (m) out[m[1]] = m[2];
	}
	return out;
};

const rows = [];
for (const bucket of readdirSync(root, { withFileTypes: true })) {
	if (!bucket.isDirectory()) continue;
	const dir = join(root, bucket.name);
	const bucketRows = [];
	for (const file of readdirSync(dir, { withFileTypes: true })) {
		if (!file.isFile() || !file.name.endsWith(".md")) continue;
		const path = join(dir, file.name);
		const fm = frontmatter(path);
		if (topic && !`${file.name} ${fm.topic}`.toLowerCase().includes(topic)) continue;
		const m = SLUG.exec(file.name);
		const date = m ? `${m[1]} ${m[2]}:${m[3]}:${m[4]}` : fmtMtime(statSync(path).mtimeMs);
		let stage = STAGE_BY_BUCKET[bucket.name] ?? "unknown";
		if (bucket.name === "designs" && /_slice-\d+_/.test(file.name)) stage = "design-slice";
		bucketRows.push({ date, bucket: bucket.name, stage, status: fm.status || "-", path });
	}
	bucketRows.sort((a, b) => b.date.localeCompare(a.date));
	rows.push(...bucketRows.slice(0, limit));
}

if (rows.length === 0) {
	console.log("empty");
	process.exit(0);
}

rows.sort((a, b) => b.date.localeCompare(a.date) || a.bucket.localeCompare(b.bucket));
console.log("date\tbucket\tstage\tstatus\tpath");
/** Repo-relative when the artifact sits under the repo, else absolute. */
const show = (p) => {
	const rel = relative(base, p);
	return rel.startsWith("..") || isAbsolute(rel) ? p : rel;
};
for (const r of rows) console.log([r.date, r.bucket, r.stage, r.status, show(r.path)].join("\t"));
