// The renderer must refuse annotations that the git data does not support, and accept the gallery's own notes.
import { test, expect } from "bun:test";
import { readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const root = join(import.meta.dir, "..");
const render = join(root, "skills/repo-rings/scripts/render.ts");
const out = join(tmpdir(), "repo-rings-test.html");
const run = (rings: string, notes: string) =>
  Bun.spawnSync(["bun", render, rings, notes, "-o", out], { stdout: "pipe", stderr: "pipe" });

test("wrong annotations are rejected, one problem per broken rule", () => {
  const p = run(join(root, "gallery/jq/rings.json"), join(import.meta.dir, "bad-annotations.json"));
  const err = p.stderr.toString();
  expect(p.exitCode).toBe(1);
  expect(err).toContain("evidence tag:jq-9.9 is not a tag in 2018 Q4");
  expect(err).toContain("evidence commit:deadbee is not a commit in 2023 Q3");
  expect(err).toContain("evidence commit:a4eea16 is not a commit in 2015 Q3");
  expect(err).toContain(`period "2011 Q1" is not a ring label`);
  expect(err).toContain(`is "quiet" but 2023 Q3 has 205 commits`);
  expect(err).toContain("needs evidence");
  expect(err).toContain("callout titles must be <= 28");
});

test("every gallery specimen passes the evidence check", () => {
  const gallery = join(root, "gallery");
  const dirs = readdirSync(gallery).filter((d) => existsSync(join(gallery, d, "rings.json")));
  expect(dirs.length).toBeGreaterThanOrEqual(6);
  for (const d of dirs) {
    const p = run(join(gallery, d, "rings.json"), join(gallery, d, "annotations.json"));
    expect({ d, code: p.exitCode, err: p.stderr.toString() }).toEqual({ d, code: 0, err: "" });
  }
});
