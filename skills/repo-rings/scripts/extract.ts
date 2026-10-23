#!/usr/bin/env bun
// Read a git repository's history and write rings.json: one "growth ring" per period.
// Usage: bun extract.ts <repo-dir> [-o rings.json] [--unit auto|week|month|quarter|year]
//        [--sectors 8] [--keep-generated] [--since YYYY-MM-DD] [--exclude dir/,other/]
// Only reads the repository (git log / for-each-ref). No network.

import type { Period, Rings } from "./types.ts";

type Commit = { h: string; t: number; a: string; s: string; files: { p: string; add: number; del: number }[] };

const args = process.argv.slice(2);
function flag(name: string, fallback?: string): string | undefined {
  const i = args.indexOf(name);
  if (i === -1) return fallback;
  const v = args[i + 1];
  if (!v || v.startsWith("--")) fail(`${name} needs a value`);
  return v;
}
function fail(msg: string): never {
  process.stderr.write(`extract: ${msg}\n`);
  process.exit(1);
}

const repo = args.find((a, i) => !a.startsWith("-") && !["-o", "--unit", "--sectors", "--since", "--exclude"].includes(args[i - 1]));
if (!repo) fail("usage: bun extract.ts <repo-dir> [-o rings.json] [--unit auto|week|month|quarter|year]");
const out = flag("-o", "rings.json")!;
const unitArg = flag("--unit", "auto")!;
const sectorCount = Number(flag("--sectors", "8"));
const since = flag("--since");
const keepGenerated = args.includes("--keep-generated");
// Path prefixes to leave out, for build output a project commits under its own name (e.g. moment's min/).
const exclude = (flag("--exclude") ?? "").split(",").map((x) => x.trim()).filter(Boolean);
if (!["auto", "week", "month", "quarter", "year"].includes(unitArg)) fail(`unknown --unit ${unitArg}`);
if (!Number.isInteger(sectorCount) || sectorCount < 3 || sectorCount > 12) fail("--sectors must be an integer 3..12");

// Lockfiles and build output distort growth; they are skipped unless --keep-generated.
const GENERATED = [
  /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb?|Cargo\.lock|go\.sum|poetry\.lock|uv\.lock|composer\.lock|Gemfile\.lock)$/,
  /(^|\/)(dist|build|vendor|node_modules)\//,
  /\.min\.(js|css)$/,
  /\.snap$/,
];

function git(argv: string[]): string {
  const p = Bun.spawnSync(["git", "-C", repo!, ...argv], { stdout: "pipe", stderr: "pipe" });
  if (p.exitCode !== 0) fail(`git ${argv[0]} failed: ${p.stderr.toString().trim()}`);
  return p.stdout.toString();
}

if (git(["rev-parse", "--is-shallow-repository"]).trim() === "true")
  fail("repository is a shallow clone; history would be truncated. Run `git fetch --unshallow` first.");

const RS = "\x1e", US = "\x1f";
const logArgs = ["log", "--no-merges", "--numstat", "-z", "--no-renames", `--format=${RS}%H${US}%at${US}%aN${US}%s`];
if (since) logArgs.push(`--since=${since}`);
const raw = git(logArgs);

const commits: Commit[] = [];
let current: Commit | undefined;
// -z leaves paths unquoted and separates records without splitting literal newlines or RS in filenames.
for (const record of raw.split("\0")) {
  if (record.startsWith(RS)) {
    const [h, at, a, s] = record.slice(1).split(US);
    current = { h, t: +at * 1000, a, s, files: [] };
    commits.push(current);
    continue;
  }
  // Git inserts a newline before the first numstat record after a commit header.
  const m = record.match(/^\n?(\d+|-)\t(\d+|-)\t([\s\S]+)$/);
  if (!current || !m) continue;
  const p = m[3];
  if (!keepGenerated && GENERATED.some((r) => r.test(p))) continue;
  if (exclude.some((x) => p.startsWith(x))) continue;
  current.files.push({ p, add: m[1] === "-" ? 0 : +m[1], del: m[2] === "-" ? 0 : +m[2] });
}
if (commits.length < 2) fail(`only ${commits.length} commit(s) found; need at least 2 to grow rings`);
commits.sort((x, y) => x.t - y.t);

// ---- periods ----
const first = new Date(commits[0].t), last = new Date(commits[commits.length - 1].t);
const spanMonths = (last.getUTCFullYear() - first.getUTCFullYear()) * 12 + last.getUTCMonth() - first.getUTCMonth() + 1;
let unit = unitArg as Rings["unit"] | "auto";
if (unit === "auto") unit = spanMonths < 24 ? "week" : spanMonths <= 84 ? "month" : spanMonths <= 252 ? "quarter" : "year";

function periodStart(t: number): Date {
  const d = new Date(t);
  const y = d.getUTCFullYear(), m = d.getUTCMonth();
  if (unit === "year") return new Date(Date.UTC(y, 0, 1));
  if (unit === "quarter") return new Date(Date.UTC(y, m - (m % 3), 1));
  if (unit === "month") return new Date(Date.UTC(y, m, 1));
  const day = Date.UTC(y, m, d.getUTCDate());
  const dow = (new Date(day).getUTCDay() + 6) % 7; // Monday start
  return new Date(day - dow * 86400000);
}
function nextStart(d: Date): Date {
  const y = d.getUTCFullYear(), m = d.getUTCMonth();
  if (unit === "year") return new Date(Date.UTC(y + 1, 0, 1));
  if (unit === "quarter") return new Date(Date.UTC(y, m + 3, 1));
  if (unit === "month") return new Date(Date.UTC(y, m + 1, 1));
  return new Date(d.getTime() + 7 * 86400000);
}
function label(d: Date): string {
  const y = d.getUTCFullYear(), m = d.getUTCMonth();
  if (unit === "year") return `${y}`;
  if (unit === "quarter") return `${y} Q${m / 3 + 1}`;
  if (unit === "month") return `${y}-${String(m + 1).padStart(2, "0")}`;
  return d.toISOString().slice(0, 10);
}

// ---- sectors: where the code grew ----
function topDir(p: string, depth: number): string {
  const parts = p.split("/");
  if (parts.length === 1) return "(root)";
  return parts.slice(0, Math.min(depth, parts.length - 1)).join("/") + "/";
}
function churnBy(depthFor: (p: string) => number) {
  const m = new Map<string, number>();
  for (const c of commits) for (const f of c.files) {
    const k = topDir(f.p, depthFor(f.p));
    m.set(k, (m.get(k) ?? 0) + f.add + f.del);
  }
  return m;
}
// If one top-level dir holds >55% of all churn (e.g. src/ or packages/), split it one level deeper.
let level1 = churnBy(() => 1);
const total1 = [...level1.values()].reduce((a, b) => a + b, 0) || 1;
const dominant = [...level1.entries()].find(([k, v]) => k !== "(root)" && v / total1 > 0.55)?.[0];
const depthFor = (p: string) => (dominant && p.startsWith(dominant) ? 2 : 1);
const churn = churnBy(depthFor);
const ranked = [...churn.entries()].sort((a, b) => b[1] - a[1]);
const keep = ranked.slice(0, ranked.length > sectorCount ? sectorCount - 1 : sectorCount).map(([k]) => k);
const sectorOf = (p: string) => {
  const k = topDir(p, depthFor(p));
  return keep.includes(k) ? k : "(other)";
};
const sectorKeys = ranked.length > sectorCount ? [...keep, "(other)"] : keep;

// ---- tags ----
const tagRaw = git(["for-each-ref", "refs/tags", "--format=%(refname:short)%09%(creatordate:unix)%09%(*objectname)%(objectname)"]);
const tags = tagRaw.split("\n").filter(Boolean).map((l) => {
  const [name, ts] = l.split("\t");
  return { name, t: +ts * 1000 };
}).filter((x) => x.t >= commits[0].t && x.t <= nextStart(periodStart(commits[commits.length - 1].t)).getTime());

// ---- build periods ----
const periods: Period[] = [];
const seenAuthors = new Set<string>();
const authorStats = new Map<string, { commits: number; first: number; last: number }>();
let ci = 0;
for (let s = periodStart(commits[0].t); s.getTime() <= last.getTime(); s = nextStart(s)) {
  const e = nextStart(s).getTime();
  const p: Period = {
    index: periods.length, label: label(s), start: s.toISOString().slice(0, 10), commits: 0, added: 0, deleted: 0,
    authors: 0, newAuthors: [], sectors: Object.fromEntries(sectorKeys.map((k) => [k, { add: 0, del: 0 }])), tags: [], log: [],
  };
  const authors = new Set<string>();
  while (ci < commits.length && commits[ci].t < e) {
    const c = commits[ci++];
    p.commits++;
    authors.add(c.a);
    if (!seenAuthors.has(c.a)) { seenAuthors.add(c.a); p.newAuthors.push(c.a); }
    const st = authorStats.get(c.a) ?? { commits: 0, first: p.index, last: p.index };
    st.commits++; st.last = p.index; authorStats.set(c.a, st);
    let cc = 0;
    for (const f of c.files) {
      const sec = p.sectors[sectorOf(f.p)];
      sec.add += f.add; sec.del += f.del;
      p.added += f.add; p.deleted += f.del; cc += f.add + f.del;
    }
    p.log.push({ h: c.h.slice(0, 7), fullHash: c.h, s: c.s.slice(0, 100), a: c.a, churn: cc });
  }
  p.authors = authors.size;
  p.tags = tags.filter((t) => t.t >= s.getTime() && t.t < e).map((t) => t.name);
  periods.push(p);
}

const remote = (() => {
  const p = Bun.spawnSync(["git", "-C", repo!, "remote", "get-url", "origin"], { stdout: "pipe", stderr: "pipe" });
  return p.exitCode === 0 ? p.stdout.toString().trim().replace(/\.git$/, "") : null;
})();

const result: Rings = {
  generator: "repo-rings/extract 0.1",
  repo: {
    name: (remote ?? repo!).split("/").filter(Boolean).pop() ?? repo!,
    remote,
    head: git(["rev-parse", "--short", "HEAD"]).trim(),
    firstCommit: new Date(commits[0].t).toISOString().slice(0, 10),
    lastCommit: last.toISOString().slice(0, 10),
  },
  unit,
  excludedGenerated: !keepGenerated,
  excludedPaths: exclude,
  sectors: sectorKeys.map((k) => ({ key: k, churn: k === "(other)" ? ranked.slice(keep.length).reduce((a, [, v]) => a + v, 0) : churn.get(k)! })),
  totals: {
    commits: commits.length,
    authors: seenAuthors.size,
    added: periods.reduce((a, p) => a + p.added, 0),
    deleted: periods.reduce((a, p) => a + p.deleted, 0),
    tags: tags.length,
  },
  authors: [...authorStats.entries()].sort((a, b) => b[1].commits - a[1].commits).slice(0, 12)
    .map(([name, s]) => ({ name, commits: s.commits, firstPeriod: s.first, lastPeriod: s.last })),
  periods,
};
await Bun.write(out, JSON.stringify(result));
process.stdout.write(`extract: ${commits.length} commits -> ${periods.length} ${unit} rings, ${sectorKeys.length} sectors, ${tags.length} tags -> ${out}\n`);
