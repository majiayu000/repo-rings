// Git quotes unusual paths unless --numstat uses NUL-delimited records.
import { test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const dir = mkdtempSync(join(tmpdir(), "repo-rings-paths-"));
const unicodeRepo = join(dir, "unicode");
const unusualRepo = join(dir, "unusual");
const renamedRepo = join(dir, "renamed");
const byteRepo = join(dir, "bytes");
const dominantByteRepo = join(dir, "dominant-bytes");
const script = join(import.meta.dir, "../skills/repo-rings/scripts/extract.ts");
const unusualDirs = ['quote"', "back\\slash", "tab\tfolder", "line\nfolder", "record\x1efolder", "unit\x1ffolder", "emoji😀", "space folder"];
const env = {
  ...process.env, GIT_AUTHOR_NAME: "Ann", GIT_AUTHOR_EMAIL: "ann@example.com",
  GIT_COMMITTER_NAME: "Ann", GIT_COMMITTER_EMAIL: "ann@example.com",
  GIT_AUTHOR_DATE: "2024-01-10T12:00:00Z", GIT_COMMITTER_DATE: "2024-01-10T12:00:00Z",
  GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "core.quotePath", GIT_CONFIG_VALUE_0: "true",
};
function git(repo: string, args: string[], date?: string) {
  const p = Bun.spawnSync(["git", "-C", repo, ...args], {
    env: { ...env, ...(date ? { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date } : {}) }, stdout: "pipe", stderr: "pipe",
  });
  if (p.exitCode !== 0) throw new Error(p.stderr.toString());
}
const lines = (n: number) => "line\n".repeat(n);
function writeBytePath(repo: string, path: Buffer, count: number) {
  const fullPath = Buffer.concat([Buffer.from(`${repo}/`), path]);
  mkdirSync(fullPath.subarray(0, fullPath.lastIndexOf(0x2f)), { recursive: true });
  writeFileSync(fullPath, lines(count));
}
async function init(repo: string) {
  const p = Bun.spawnSync(["git", "init", "-q", "-b", "main", repo], { env, stdout: "pipe", stderr: "pipe" });
  if (p.exitCode !== 0) throw new Error(p.stderr.toString());
  await Bun.write(join(repo, "src/a.ts"), lines(10));
  git(repo, ["add", "."]);
  git(repo, ["commit", "-qm", "initial source"]);
}
async function extract(repo: string, extra: string[] = [], quotePath = "true") {
  const out = join(dir, `rings-${Math.random().toString(36).slice(2)}.json`);
  const p = Bun.spawnSync(["bun", script, repo, "-o", out, "--unit", "month", "--sectors", "12", ...extra], {
    env: { ...env, GIT_CONFIG_VALUE_0: quotePath }, stdout: "pipe", stderr: "pipe",
  });
  if (p.exitCode !== 0) throw new Error(p.stderr.toString());
  return Bun.file(out).json();
}

beforeAll(async () => {
  // Raw-byte filenames are a POSIX facility; the existing Unicode tests also run on Windows.
  if (process.platform !== "win32") {
    await init(byteRepo);
    for (const [folder, count] of [["ff", 2], ["fe", 3], ["efbfbd", 5]] as const)
      writeBytePath(byteRepo, Buffer.concat([Buffer.from(folder, "hex"), Buffer.from("/a.txt")]), count);
    writeBytePath(byteRepo, Buffer.from("ff2f646973742f62756e646c652e6a73", "hex"), 7);
    writeBytePath(byteRepo, Buffer.from("fe2f7061636b6167652d6c6f636b2e6a736f6e", "hex"), 11);
    git(byteRepo, ["add", "."]);
    git(byteRepo, ["commit", "-qm", "add byte paths, 中文 and 😀"], "2024-02-10T12:00:00Z");

    await init(dominantByteRepo);
    for (const [folder, count] of [
      [Buffer.from([0xff]), 20], [Buffer.from([0xfe]), 21],
      [Buffer.from([0xc3, 0x28]), 22], [Buffer.from([0xc3]), 23],
      [Buffer.from([0xed, 0xa0, 0x80]), 24], [Buffer.from([0xc0, 0xaf]), 25],
      [Buffer.from("%FF"), 26], [Buffer.from("\\xff"), 27],
      [Buffer.from("文档"), 28], [Buffer.from("\ufeffBOM"), 29],
    ] as const) writeBytePath(dominantByteRepo, Buffer.concat([Buffer.from("src/"), folder, Buffer.from("/a.txt")]), count);
    git(dominantByteRepo, ["add", "."]);
    git(dominantByteRepo, ["commit", "-qm", "add distinct nested byte paths"]);
  }
  await init(unicodeRepo);
  for (const [path, count] of Object.entries({ "docs/中文.md": 20, "文档/说明.md": 3, "dist/中文.js": 30, "中文/package-lock.json": 40 }))
    await Bun.write(join(unicodeRepo, path), lines(count));
  git(unicodeRepo, ["add", "."]);
  git(unicodeRepo, ["commit", "-qm", "add Unicode paths"]);

  await init(unusualRepo);
  for (const folder of unusualDirs)
    await Bun.write(join(unusualRepo, folder, `${folder}.txt`), lines(2));
  await Bun.write(join(unusualRepo, "binary/中文.bin"), new Uint8Array([0, 1, 2]));
  git(unusualRepo, ["add", "."]);
  git(unusualRepo, ["commit", "-qm", "add unusual paths and binary file"]);
  git(unusualRepo, ["commit", "--allow-empty", "-qm", "empty commit"]);

  await init(renamedRepo);
  await Bun.write(join(renamedRepo, "docs/旧名.md"), lines(6));
  await Bun.write(join(renamedRepo, "docs/delete\nme.md"), lines(3));
  git(renamedRepo, ["add", "."]);
  git(renamedRepo, ["commit", "-qm", "add documents"], "2024-01-20T12:00:00Z");
  await Bun.write(join(renamedRepo, "docs/旧名.md"), lines(4));
  git(renamedRepo, ["rm", "-q", "docs/delete\nme.md"]);
  git(renamedRepo, ["add", "."]);
  git(renamedRepo, ["commit", "-qm", "prune documents"], "2024-02-01T12:00:00Z");
  await Bun.write(join(renamedRepo, "文档/new\tname.md"), lines(4));
  git(renamedRepo, ["rm", "-q", "docs/旧名.md"]);
  git(renamedRepo, ["add", "."]);
  git(renamedRepo, ["commit", "-qm", "move document"], "2024-03-01T12:00:00Z");
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

test("--exclude matches ASCII and Unicode prefixes of quoted Git paths", async () => {
  const d = await extract(unicodeRepo, ["--exclude", "docs/,文档/"]);
  expect(d.totals.added).toBe(10);
  expect(d.sectors.map((s: { key: string }) => s.key)).toEqual(["src/"]);
});

test("Unicode paths retain their folder labels and generated-file filtering", async () => {
  const d = await extract(unicodeRepo);
  expect(d.totals.added).toBe(33);
  expect(d.sectors.map((s: { key: string }) => s.key).sort()).toEqual(["docs/", "src/", "文档/"]);
  const kept = await extract(unicodeRepo, ["--keep-generated"]);
  expect(kept.totals.added).toBe(103);
  expect(kept.sectors.map((s: { key: string }) => s.key)).toContain("dist/");
  expect(kept.sectors.map((s: { key: string }) => s.key)).toContain("中文/");
});

test("quotes, backslashes, whitespace and separators remain literal path characters", async () => {
  const d = await extract(unusualRepo);
  expect(d.totals).toMatchObject({ commits: 3, added: 26, deleted: 0 });
  expect(d.sectors.map((s: { key: string }) => s.key).sort())
    .toEqual(["src/", "binary/", ...unusualDirs.map((p) => `${p}/`)].sort());
  for (const folder of unusualDirs)
    expect(d.periods[0].sectors[`${folder}/`]).toEqual({ add: 2, del: 0 });
  expect(d.periods[0].sectors["binary/"]).toEqual({ add: 0, del: 0 });
  expect(d.periods[0].log.find((c: { s: string }) => c.s === "empty commit").churn).toBe(0);
});

test("--exclude matches literal quotes, backslashes, tabs, newlines and separators", async () => {
  const d = await extract(unusualRepo, ["--exclude", [...unusualDirs.map((p) => `${p}/`), "binary/"].join(",")]);
  expect(d.totals.added).toBe(10);
  expect(d.sectors.map((s: { key: string }) => s.key)).toEqual(["src/"]);
});

test("path extraction does not depend on core.quotePath", async () => {
  expect(await extract(unicodeRepo, [], "false")).toEqual(await extract(unicodeRepo));
  expect(await extract(unusualRepo, [], "false")).toEqual(await extract(unusualRepo));
});

test("modifications, deletions and renames keep their commit and period counts", async () => {
  const d = await extract(renamedRepo);
  expect(d.totals).toMatchObject({ commits: 4, added: 23, deleted: 9 });
  expect(d.periods.map((p: { added: number; deleted: number }) => [p.added, p.deleted]))
    .toEqual([[19, 0], [0, 5], [4, 4]]);
  expect(d.periods[1].log.map((c: { s: string; churn: number }) => [c.s, c.churn])).toEqual([["prune documents", 5]]);
  expect(d.periods[2].log.map((c: { s: string; churn: number }) => [c.s, c.churn])).toEqual([["move document", 8]]);
  // --no-renames deliberately counts a move as deletion from the old folder and addition to the new one.
  expect(d.periods[2].sectors["docs/"]).toEqual({ add: 0, del: 4 });
  expect(d.periods[2].sectors["文档/"]).toEqual({ add: 4, del: 0 });
});


const byteTest = process.platform === "win32" ? test.skip : test;
byteTest("invalid UTF-8 byte paths stay distinct from each other and the replacement character", async () => {
  const d = await extract(byteRepo);
  expect(d.totals).toMatchObject({ commits: 2, added: 20, deleted: 0 });
  expect(d.sectors).toEqual([
    { key: "src/", churn: 10 }, { key: "�/", churn: 5 },
    { key: "%FE/", churn: 3 }, { key: "%FF/", churn: 2 },
  ]);
  expect(d.periods[1].sectors["%FF/"]).toEqual({ add: 2, del: 0 });
  expect(d.periods[1].sectors["%FE/"]).toEqual({ add: 3, del: 0 });
  expect(d.periods[1].sectors["�/"]).toEqual({ add: 5, del: 0 });
  expect(d.periods[1].log[0].s).toBe("add byte paths, 中文 and 😀");
  expect(await extract(byteRepo, [], "false")).toEqual(d);
});

byteTest("--exclude compares original path bytes, not lossy Unicode labels", async () => {
  const d = await extract(byteRepo, ["--exclude", "�/"]);
  expect(d.totals.added).toBe(15);
  expect(d.sectors.map((s: { key: string }) => s.key).sort()).toEqual(["%FE/", "%FF/", "src/"]);
  const ascii = await extract(byteRepo, ["--exclude", "src/"]);
  expect(ascii.totals.added).toBe(10);
  const kept = await extract(byteRepo, ["--keep-generated"]);
  expect(kept.totals.added).toBe(38);
});

byteTest("byte labels remain collision-free when a dominant folder is split", async () => {
  const d = await extract(dominantByteRepo);
  expect(d.totals.added).toBe(255);
  expect(d.sectors.map((s: { key: string }) => s.key).sort()).toEqual([
    "src/", "src/%FF/", "src/%FE/", "src/%C3%28/", "src/%C3/",
    "src/%ED%A0%80/", "src/%C0%AF/", "src/%25FF/", "src/\\xff/",
    "src/文档/", "src/\ufeffBOM/",
  ].sort());
  const excluded = await extract(dominantByteRepo, ["--exclude", "src/%FF/,src/\\xff/,src/文档/"]);
  expect(excluded.totals.added).toBe(174);
  expect(excluded.periods[0].sectors["src/%FF/"]).toEqual({ add: 20, del: 0 });
});
