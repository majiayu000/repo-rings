// extract.ts on a small synthetic repository with known dates, authors, deletions and a tag.
import { test, expect, beforeAll } from "bun:test";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const scripts = join(import.meta.dir, "../skills/repo-rings/scripts");
const dir = mkdtempSync(join(tmpdir(), "repo-rings-"));
const repo = join(dir, "repo");

function git(args: string[], date?: string, author = "Ann") {
  const env = { ...process.env, GIT_AUTHOR_NAME: author, GIT_AUTHOR_EMAIL: `${author}@example.com`, GIT_COMMITTER_NAME: author,
    GIT_COMMITTER_EMAIL: `${author}@example.com`, ...(date ? { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date } : {}) };
  const p = Bun.spawnSync(["git", "-C", repo, ...args], { env, stdout: "pipe", stderr: "pipe" });
  if (p.exitCode !== 0) throw new Error(p.stderr.toString());
}
const lines = (n: number) => Array.from({ length: n }, (_, i) => `line ${i}`).join("\n") + "\n";
async function commit(files: Record<string, string>, date: string, author = "Ann") {
  for (const [p, body] of Object.entries(files)) {
    if (body === "") git(["rm", "-q", p]);
    else { await Bun.write(join(repo, p), body); git(["add", p]); }
  }
  git(["commit", "-q", "-m", `change ${date}`], date, author);
}
const bun = (args: string[]) => Bun.spawnSync(["bun", ...args], { stdout: "pipe", stderr: "pipe" });
const extract = async (extra: string[] = [], from = repo) => {
  const out = join(dir, `rings-${Math.random().toString(36).slice(2)}.json`);
  const p = bun([join(scripts, "extract.ts"), from, "-o", out, ...extra]);
  return { p, d: p.exitCode === 0 ? await Bun.file(out).json() : null, out };
};

beforeAll(async () => {
  Bun.spawnSync(["git", "init", "-q", "-b", "main", repo]);
  await commit({ "src/a.ts": lines(10) }, "2024-01-10T12:00:00Z");
  await commit({ "docs/x.md": lines(5) }, "2024-01-20T12:00:00Z", "Bob");
  await commit({ "src/a.ts": lines(4) }, "2024-03-05T12:00:00Z");
  git(["tag", "v1.0.0"], "2024-03-05T12:00:00Z");
  await commit({ "min/bundle.js": lines(100), "docs/x.md": "" }, "2024-03-06T12:00:00Z", "Bob");
});

test("one ring per month, empty months kept, tags and authors placed", async () => {
  const { p, d } = await extract(["--unit", "month"]);
  expect(p.exitCode).toBe(0);
  expect(d.periods.map((x: { label: string }) => x.label)).toEqual(["2024-01", "2024-02", "2024-03"]);
  expect(d.periods.map((x: { commits: number }) => x.commits)).toEqual([2, 0, 2]);
  expect(d.periods[2].tags).toEqual(["v1.0.0"]);
  expect(d.totals).toMatchObject({ commits: 4, authors: 2, tags: 1, added: 115, deleted: 11 });
});

test("auto unit picks weeks for a short history", async () => {
  const { d } = await extract();
  expect(d.unit).toBe("week");
  expect(d.periods[0].label).toBe("2024-01-08");
});

test("logs retain the full commit identity alongside the short display hash", async () => {
  const { p, d } = await extract(["--unit", "month"]);
  expect(p.exitCode).toBe(0);
  const hashes = Bun.spawnSync(["git", "-C", repo, "log", "--reverse", "--format=%H"], { stdout: "pipe", stderr: "pipe" });
  expect(hashes.exitCode).toBe(0);
  const expected = hashes.stdout.toString().trim().split("\n");
  const log = d.periods.flatMap((period: { log: { h: string; fullHash?: string }[] }) => period.log);
  expect(log.map((c: { fullHash?: string }) => c.fullHash)).toEqual(expected);
  expect(log.map((c: { h: string }) => c.h)).toEqual(expected.map((h: string) => h.slice(0, 7)));
});

test("--exclude leaves path prefixes out of the line counts", async () => {
  const { d } = await extract(["--unit", "month", "--exclude", "min/"]);
  expect(d.totals.added).toBe(15);
  expect(d.excludedPaths).toEqual(["min/"]);
  expect(d.sectors.map((s: { key: string }) => s.key)).not.toContain("min/");
});

test("shallow clones are refused", async () => {
  const shallow = join(dir, "shallow");
  Bun.spawnSync(["git", "clone", "-q", "--depth", "1", `file://${repo}`, shallow]);
  const { p } = await extract([], shallow);
  expect(p.exitCode).toBe(1);
  expect(p.stderr.toString()).toContain("shallow clone");
});

test("render draws a bare tree without annotations", async () => {
  const { out } = await extract(["--unit", "month"]);
  const html = join(dir, "bare.html");
  const p = bun([join(scripts, "render.ts"), out, "-o", html]);
  expect(p.exitCode).toBe(0);
  const page = await Bun.file(html).text();
  expect(page).toContain("<title>repo, read like a tree</title>");
  expect(page).toContain('property="og:title"');
  expect(page).not.toContain("Field notes");
});
