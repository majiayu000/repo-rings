#!/usr/bin/env bun
// Rebuild the gallery: render every gallery/<repo>/ (rings.json + annotations.json) into its page,
// capture a thumbnail with headless Chrome, and write gallery/index.html.
// Usage: bun tools/build-gallery.ts      (CHROME=/path/to/chrome to override the browser)
// Needs cwebp for thumbnails. Any annotation that fails the evidence check stops the build.
import { readdirSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const gallery = join(root, "gallery");
const render = join(root, "skills/repo-rings/scripts/render.ts");
const chrome = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

function run(cmd: string[]) {
  const p = Bun.spawnSync(cmd, { stdout: "pipe", stderr: "pipe" });
  if (p.exitCode !== 0) {
    process.stderr.write(p.stderr.toString() || p.stdout.toString());
    throw new Error(`failed: ${cmd.slice(0, 2).join(" ")}`);
  }
  return p.stdout.toString();
}

const esc = (s: string) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const fmt = (n: number) => n.toLocaleString("en-US");

const cards: string[] = [];
const dirs = readdirSync(gallery, { withFileTypes: true }).filter((d) => d.isDirectory() && existsSync(join(gallery, d.name, "rings.json"))).sort((a, b) => a.name.localeCompare(b.name));
for (const { name } of dirs) {
  const dir = join(gallery, name);
  const svg = join(dir, ".figure.svg"), png = join(dir, ".figure.png");
  process.stdout.write(run(["bun", render, join(dir, "rings.json"), join(dir, "annotations.json"), "-o", join(dir, `${name}-rings.html`), "--svg", svg]));
  // Thumbnail: the trunk alone (callouts stripped), cropped square around it.
  await Bun.write(svg, (await Bun.file(svg).text()).replace(/<g class="co"[^>]*>[\s\S]*?<\/g>/g, ""));
  run([chrome, "--headless=new", "--hide-scrollbars", "--window-size=1600,1100", `--screenshot=${png}`, `file://${svg}`]);
  run(["cwebp", "-quiet", "-crop", "300", "75", "1000", "1000", "-resize", "600", "600", "-q", "82", png, "-o", join(dir, "thumb.webp")]);
  rmSync(svg); rmSync(png);

  const D = await Bun.file(join(dir, "rings.json")).json();
  const A = await Bun.file(join(dir, "annotations.json")).json();
  const story = String(A.specimen.note).split(/(?<=\.)\s/)[0];
  const slug = D.repo.remote?.replace(/^https:\/\/github\.com\//, "") ?? D.repo.name;
  cards.push(`<a class="card" href="${name}/${name}-rings.html">
<img src="${name}/thumb.webp" width="600" height="600" alt="Tree-ring cross-section of ${esc(slug)}" loading="lazy">
<div class="meta"><div class="slug">${esc(slug)}</div><div class="bin">${esc(A.specimen.binomial)}</div>
<div class="stats">${D.periods.length} ${D.unit} rings · ${fmt(D.totals.commits)} commits · ${D.repo.firstCommit.slice(0, 4)}–${D.repo.lastCommit.slice(0, 4)}</div>
<p>${esc(story)}</p></div></a>`);
}

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>repo-rings gallery</title>
<meta name="description" content="Famous open-source repositories cut open and read like trees: one ring per period of commits, every note checked against git.">
<style>
:root{--bg:#efe8dc;--panel:#fbf7f0;--ink:#231d17;--mute:#7a6a58;--line:#d9cdbb;--accent:#b0612a}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#17130f;--panel:#221c16;--ink:#efe6d8;--mute:#a8987f;--line:#3a3027;--accent:#e59a55}}
:root[data-theme="dark"]{--bg:#17130f;--panel:#221c16;--ink:#efe6d8;--mute:#a8987f;--line:#3a3027;--accent:#e59a55}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.55 "Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif}
.wrap{max-width:1240px;margin:0 auto;padding:36px 16px 64px}
h1{margin:0;font-size:clamp(30px,5vw,48px);line-height:1.1;font-weight:600}
.lede{max-width:62ch;color:var(--mute);margin:10px 0 28px;font-size:18px}
.lede a{color:var(--accent)}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:20px}
.card{display:block;background:var(--panel);border:1px solid var(--line);border-radius:10px;overflow:hidden;color:inherit;text-decoration:none;transition:border-color .2s,transform .2s}
.card:hover,.card:focus-visible{border-color:var(--accent);transform:translateY(-2px)}
.card:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
@media (prefers-reduced-motion:reduce){.card{transition:none}.card:hover,.card:focus-visible{transform:none}}
.card img{display:block;width:100%;height:auto;background:#f4eee3}
.meta{padding:14px 18px 18px}
.slug{font:600 15px ui-monospace,SFMono-Regular,Menlo,monospace}
.bin{font-style:italic;font-size:20px;margin-top:2px}
.stats{color:var(--mute);font:13px ui-monospace,SFMono-Regular,Menlo,monospace;margin-top:4px}
.meta p{margin:8px 0 0;font-size:15px}
footer{margin-top:36px;color:var(--mute);font-size:14px;max-width:70ch}
</style></head><body><div class="wrap">
<h1>Repositories, read like trees</h1>
<p class="lede">Each cross-section is one repository's whole history: the pith is the first commit, the bark is HEAD, and every ring is a period of commits. Open one to watch it grow and to read any ring. Made with <a href="https://github.com/majiayu000/repo-rings">repo-rings</a>; every field note cites a real tag or commit and was checked against git before rendering.</p>
<div class="grid">
${cards.join("\n")}
</div>
<footer>Histories were read from fresh clones in October 2026. Lockfiles and build output are not counted. Thin rings only mean fewer commits; they are not a judgement on anyone's work.</footer>
</div></body></html>`;
await Bun.write(join(gallery, "index.html"), html);
process.stdout.write(`gallery: ${cards.length} specimens -> gallery/index.html\n`);
