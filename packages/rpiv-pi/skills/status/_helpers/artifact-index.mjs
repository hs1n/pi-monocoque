// List the newest Markdown artifacts under .rpiv/artifacts/, one row per artifact.
// Usage: node artifact-index.mjs [topic] [--root <dir>] [--limit <n>]
//   [topic]   — case-insensitive substring; keeps rows whose filename or frontmatter
//               `topic:` contains it. Omitted → every row.
//   --root    — the artifacts directory. Default: .rpiv/artifacts under the git root
//               (or cwd if not in a repo).
//   --limit   — max rows per bucket, newest first (default 3).
// Output: `root: <abs>` then, when the root is missing or is not a directory, `missing`
// and nothing else; when no row matches, `empty`; else a tab-separated header and rows
// sorted newest first:
//   date  bucket  stage  status  path
// `date` comes from the `<YYYY-MM-DD_HH-MM-SS>` filename slug (see _shared/now.mjs);
// mtime is the fallback, because a clone resets mtime. Non-.md files are skipped.
// `status` is `unreadable` when the helper cannot read the file.
// Symlinked buckets and files are skipped. When there are some, a last line
// `skipped symlinks: <n>` gives their count.
// A bad flag value prints `error: <text>` and nothing else.
// Always exits 0 — a missing root or a bad flag is a state to report, not an error.
import { execFileSync } from "node:child_process";
import { closeSync, openSync, readdirSync, readSync, statSync } from "node:fs";
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
/** Print one error line and stop. The exit code stays 0. */
const badFlag = (text) => {
	console.log(`error: ${text}`);
	process.exit(0);
};
for (let i = 0; i < args.length; i++) {
	if (args[i] === "--root" || args[i] === "--limit") {
		const flag = args[i];
		const value = args[++i];
		// A value that starts with `--` is the next flag, not a value.
		if (value === undefined || value === "" || value.startsWith("--")) badFlag(`${flag} needs a value`);
		if (flag === "--root") rawRoot = value;
		else if (/^[1-9]\d*$/.test(value)) limit = Number(value);
		else badFlag(`--limit needs a positive integer, not "${value}"`);
	} else topic = topic ? `${topic} ${args[i]}` : args[i];
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
const isDir = (p) => {
	try {
		return statSync(p).isDirectory();
	} catch {
		return false;
	}
};
// A file at the root path is the same state as no root.
if (!isDir(root)) {
	console.log("missing");
	process.exit(0);
}

const SLUG = /^(\d{4}-\d{2}-\d{2})_(\d{2})-(\d{2})-(\d{2})/;
const pad = (n) => String(n).padStart(2, "0");
const fmtMtime = (ms) => {
	const d = new Date(ms);
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

/** Bytes to read from the start of a file. The frontmatter must be in this part. */
const HEAD_BYTES = 8 * 1024;

/** The first HEAD_BYTES of a file as text. A large file is not read in full. */
const readHead = (path) => {
	const fd = openSync(path, "r");
	try {
		const buf = Buffer.alloc(HEAD_BYTES);
		const n = readSync(fd, buf, 0, HEAD_BYTES, 0);
		return buf.toString("utf-8", 0, n);
	} finally {
		closeSync(fd);
	}
};

/**
 * `topic:` and `status:` from a leading `---` frontmatter block, if any.
 * An unreadable file gives `status: unreadable`, so one bad file does not stop the index.
 */
const frontmatter = (path) => {
	const out = { topic: "", status: "" };
	let lines;
	try {
		lines = readHead(path).split("\n", 60);
	} catch {
		out.status = "unreadable";
		return out;
	}
	if (lines[0]?.trim() !== "---") return out;
	for (const line of lines.slice(1)) {
		if (line.trim() === "---") break;
		const m = /^(topic|status):\s*"?(.*?)"?\s*$/.exec(line);
		if (m) out[m[1]] = m[2];
	}
	return out;
};

/** Directory entries, or none when the directory is unreadable. */
const entries = (p) => {
	try {
		return readdirSync(p, { withFileTypes: true });
	} catch {
		return [];
	}
};

const rows = [];
// Symlinks can point out of the root, so the helper does not follow them. It counts them.
let skippedLinks = 0;
for (const bucket of entries(root)) {
	if (bucket.isSymbolicLink()) skippedLinks++;
	if (!bucket.isDirectory()) continue;
	const dir = join(root, bucket.name);
	const bucketRows = [];
	for (const file of entries(dir)) {
		if (file.isSymbolicLink() && file.name.endsWith(".md")) skippedLinks++;
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

const linkNote = () => {
	if (skippedLinks > 0) console.log(`skipped symlinks: ${skippedLinks}`);
};

if (rows.length === 0) {
	console.log("empty");
	linkNote();
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
linkNote();
