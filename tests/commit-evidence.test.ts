// Commit evidence must identify one recorded commit, without ignoring its suffix.
import { test, expect, afterAll } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { LogEntry, Rings } from "../skills/repo-rings/scripts/types.ts";

const dir = mkdtempSync(join(tmpdir(), "repo-rings-commit-evidence-"));
const render = join(import.meta.dir, "../skills/repo-rings/scripts/render.ts");
const hash = "abcdef0123456789abcdef0123456789abcdef01";
const collision = "abcdef0999999999999999999999999999999999";
const entry = (fullHash: string): LogEntry => ({ h: fullHash.slice(0, 7), fullHash, s: "change", a: "Ann", churn: 1 });
afterAll(() => rmSync(dir, { recursive: true, force: true }));

async function run(log: LogEntry[], evidence: string, period = "2024-01") {
  const d: Rings = {
    generator: "test", repo: { name: "test", remote: null, head: "1234567", firstCommit: "2024-01-01", lastCommit: "2024-02-01" },
    unit: "month", excludedGenerated: true, sectors: [{ key: "src/", churn: 1 }],
    totals: { commits: log.length, authors: 1, added: 1, deleted: 0, tags: 0 }, authors: [],
    periods: ["2024-01", "2024-02"].map((label, index) => ({
      index, label, start: `${label}-01`, commits: index ? 0 : log.length, added: index ? 0 : 1, deleted: 0,
      authors: index ? 0 : 1, newAuthors: [], sectors: { "src/": { add: index ? 0 : 1, del: 0 } }, tags: [], log: index ? [] : log,
    })),
  };
  const prefix = join(dir, Math.random().toString(36).slice(2));
  await Bun.write(`${prefix}.rings.json`, JSON.stringify(d));
  await Bun.write(`${prefix}.notes.json`, JSON.stringify({
    title: "Test", specimen: { binomial: "Test", common: "Test", note: "Test" },
    events: [{ period, kind: "milestone", title: "Change", evidence: [`commit:${evidence}`] }],
  }));
  return Bun.spawnSync(["bun", render, `${prefix}.rings.json`, `${prefix}.notes.json`, "-o", `${prefix}.html`], { stdout: "pipe", stderr: "pipe" });
}

test("unique short, longer and full commit evidence is accepted", async () => {
  for (const length of [7, 8, 12, hash.length]) {
    const p = await run([entry(hash)], hash.slice(0, length));
    expect({ code: p.exitCode, err: p.stderr.toString() }).toEqual({ code: 0, err: "" });
  }
});

test("a wrong suffix after the seventh character is rejected", async () => {
  for (const value of [hash.slice(0, 7) + "9", hash.slice(0, -1) + "2", hash + "0", hash.slice(0, 7) + "not-a-hash"]) {
    const p = await run([entry(hash)], value);
    expect(p.exitCode).toBe(1);
    expect(p.stderr.toString()).toContain(`evidence commit:${value} is not a commit in 2024-01`);
  }
});

test("commit evidence still needs seven characters and the correct ring", async () => {
  const short = await run([entry(hash)], hash.slice(0, 6));
  expect(short.exitCode).toBe(1);
  const wrongRing = await run([entry(hash)], hash, "2024-02");
  expect(wrongRing.exitCode).toBe(1);
  expect(wrongRing.stderr.toString()).toContain("is not a commit in 2024-02");
});

test("line terminators cannot hide an unvalidated evidence suffix", async () => {
  const { fullHash, ...legacy } = entry(hash);
  for (const separator of ["\n", "\r", "\r\n", "\u2028", "\u2029"]) {
    for (const suffix of [separator, separator + "ignored"]) {
      for (const [log, value] of [[[entry(hash)], hash + suffix], [[legacy], legacy.h + suffix]] as const) {
        const p = await run([...log], value);
        expect(p.exitCode).toBe(1);
        expect(p.stderr.toString()).toContain(`evidence commit:${value} is not a commit in 2024-01`);
      }
    }
  }
});

test("ambiguous short prefixes are rejected but longer unique prefixes pass", async () => {
  const log = [entry(hash), entry(collision)];
  const ambiguous = await run(log, hash.slice(0, 7));
  expect(ambiguous.exitCode).toBe(1);
  expect(ambiguous.stderr.toString()).toContain("is ambiguous in 2024-01");
  for (const value of [hash.slice(0, 8), collision.slice(0, 8), hash, collision]) {
    const p = await run(log, value);
    expect({ code: p.exitCode, err: p.stderr.toString() }).toEqual({ code: 0, err: "" });
  }
});

test("legacy short evidence passes, but unrecorded suffixes need re-extraction", async () => {
  const { fullHash, ...legacy } = entry(hash);
  const short = await run([legacy], legacy.h);
  expect(short.exitCode).toBe(0);
  for (const value of [hash.slice(0, 8), hash, hash.slice(0, -1) + "2"]) {
    const p = await run([legacy], value);
    expect(p.exitCode).toBe(1);
    expect(p.stderr.toString()).toContain("cannot be verified from the stored short hash");
    expect(p.stderr.toString()).toContain("re-run extract.ts");
  }
});

test("legacy collisions and mixed legacy/full collisions remain ambiguous", async () => {
  const { fullHash, ...legacy } = entry(hash);
  for (const log of [[legacy, { ...legacy }], [legacy, entry(collision)]]) {
    const p = await run(log, legacy.h);
    expect(p.exitCode).toBe(1);
    expect(p.stderr.toString()).toContain("is ambiguous in 2024-01");
  }
  const p = await run([legacy, entry(collision)], collision);
  expect(p.exitCode).toBe(1);
  expect(p.stderr.toString()).toContain("is ambiguous in 2024-01");
});

test("an empty full hash cannot validate an arbitrary short citation", async () => {
  for (const value of [hash.slice(0, 7), "1234567"]) {
    const p = await run([{ ...entry(hash), fullHash: "" }], value);
    expect(p.exitCode).toBe(1);
    expect(p.stderr.toString()).toContain(`evidence commit:${value} is not a commit in 2024-01`);
  }
});

test("64-character identities work without accepting uppercase or overlong citations", async () => {
  const sha256 = hash + "0123456789abcdef01234567";
  expect(sha256.length).toBe(64);
  for (const value of [sha256.slice(0, 12), sha256]) {
    const p = await run([entry(sha256)], value);
    expect(p.exitCode).toBe(0);
  }
  for (const value of [sha256 + "0", sha256.toUpperCase()]) {
    const p = await run([entry(sha256)], value);
    expect(p.exitCode).toBe(1);
    expect(p.stderr.toString()).toContain(`evidence commit:${value} is not a commit in 2024-01`);
  }
});
