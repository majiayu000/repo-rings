#!/usr/bin/env bun
// Rebuild the site served by GitHub Pages: render every gallery/<repo>/ (rings.json + annotations.json) into its page,
// capture thumbnails with headless Chrome, and write the landing page (index.html), sitemap.xml and robots.txt.
// Usage: bun tools/build-gallery.ts      (CHROME=/path/to/chrome, SITE_URL=https://.../ to override)
// Needs cwebp and sips (macOS) for images. Any annotation that fails the evidence check stops the build.
import { readdirSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { Annotations, Rings } from "../skills/repo-rings/scripts/types.ts";

const root = join(import.meta.dir, "..");
const gallery = join(root, "gallery");
const render = join(root, "skills/repo-rings/scripts/render.ts");
const chrome = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const site = process.env.SITE_URL ?? "https://majiayu000.github.io/repo-rings/";
const repoUrl = "https://github.com/majiayu000/repo-rings";

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
const pages: string[] = [];
const dirs = readdirSync(gallery, { withFileTypes: true }).filter((d) => d.isDirectory() && existsSync(join(gallery, d.name, "rings.json"))).sort((a, b) => a.name.localeCompare(b.name));
for (const { name } of dirs) {
  const dir = join(gallery, name);
  const svg = join(dir, ".figure.svg"), png = join(dir, ".figure.png");
  process.stdout.write(run(["bun", render, join(dir, "rings.json"), join(dir, "annotations.json"), "-o", join(dir, `${name}-rings.html`), "--svg", svg]));
  // Thumbnail: the trunk alone (callouts stripped), cropped square around it.
  await Bun.write(svg, (await Bun.file(svg).text()).replace(/<g class="co"[^>]*>[\s\S]*?<\/g>/g, ""));
  run([chrome, "--headless=new", "--hide-scrollbars", "--window-size=1600,1100", `--screenshot=${png}`, `file://${svg}`]);
  run(["cwebp", "-quiet", "-crop", "300", "75", "1000", "1000", "-resize", "600", "600", "-q", "82", png, "-o", join(dir, "thumb.webp")]);
  run(["sips", "-s", "format", "jpeg", "-s", "formatOptions", "80", "-Z", "1200", png, "--out", join(dir, "og.jpg")]);
  rmSync(svg); rmSync(png);

  const D: Rings = await Bun.file(join(dir, "rings.json")).json();
  const A: Annotations = await Bun.file(join(dir, "annotations.json")).json();
  const story = String(A.specimen.note).split(/(?<=\.)\s/)[0];
  const slug = D.repo.remote?.replace(/^https:\/\/github\.com\//, "") ?? D.repo.name;
  const page = `gallery/${name}/${name}-rings.html`;
  pages.push(page);
  // Hosted copies get a canonical URL and a preview image; the skill's own output stays host-agnostic.
  const htmlPath = join(root, page);
  await Bun.write(htmlPath, (await Bun.file(htmlPath).text()).replace('<meta name="twitter:card"',
    `<link rel="canonical" href="${site}${page}"><meta property="og:url" content="${site}${page}"><meta property="og:image" content="${site}gallery/${name}/og.jpg"><meta name="twitter:card"`));
  cards.push(`<a class="card" href="${page}">
<img src="gallery/${name}/thumb.webp" width="600" height="600" alt="Tree-ring cross-section of ${esc(slug)}'s git history" loading="lazy">
<div class="meta"><div class="slug">${esc(slug)}</div><div class="bin">${esc(A.specimen.binomial)}</div>
<div class="stats">${D.periods.length} ${D.unit} rings · ${fmt(D.totals.commits)} commits · ${D.repo.firstCommit.slice(0, 4)}–${D.repo.lastCommit.slice(0, 4)}</div>
<p>${esc(story)}</p></div></a>`);
}

const title = "repo-rings: git history visualized as tree rings";
const description = "An agent skill for Claude Code, Codex and Cursor that turns any git repository's commit history into an animated tree-ring cross-section. Every note is checked against git. Gallery: jq, XZ Utils, Express, Moment.js, Vue 2 and more.";
const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${site}">
<meta property="og:type" content="website"><meta property="og:url" content="${site}"><meta property="og:title" content="${title}">
<meta property="og:description" content="${esc(description)}"><meta property="og:image" content="${site}docs/og.png">
<meta property="og:image:width" content="1280"><meta property="og:image:height" content="640">
<meta name="twitter:card" content="summary_large_image">
<style>
:root{--bg:#efe8dc;--panel:#fbf7f0;--ink:#231d17;--mute:#7a6a58;--line:#d9cdbb;--accent:#b0612a}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#17130f;--panel:#221c16;--ink:#efe6d8;--mute:#a8987f;--line:#3a3027;--accent:#e59a55}}
:root[data-theme="dark"]{--bg:#17130f;--panel:#221c16;--ink:#efe6d8;--mute:#a8987f;--line:#3a3027;--accent:#e59a55}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.55 "Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif}
.wrap{max-width:1240px;margin:0 auto;padding:36px 16px 64px}
h1{margin:0;font-size:clamp(30px,5vw,48px);line-height:1.1;font-weight:600}
h2{font-size:26px;margin:44px 0 6px;font-weight:600}
.lede{max-width:64ch;color:var(--mute);margin:10px 0 18px;font-size:18px}
a{color:var(--accent)}
.hero{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(0,1fr);gap:28px;align-items:center}
@media (max-width:860px){.hero{grid-template-columns:1fr}}
.hero img,.hero picture{display:block;width:100%;height:auto;border-radius:10px;border:1px solid var(--line);background:#f4eee3}
pre{background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:12px 14px;overflow-x:auto;font:14px ui-monospace,SFMono-Regular,Menlo,monospace;margin:8px 0}
.links{font:14px ui-monospace,SFMono-Regular,Menlo,monospace;display:flex;gap:16px;flex-wrap:wrap}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:20px;margin-top:16px}
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
<div class="hero"><div>
<h1>Git history, visualized as tree rings</h1>
<p class="lede">repo-rings is an agent skill for Claude Code, Codex and Cursor. It cuts any git repository open like a tree: the pith is the first commit, the bark is HEAD, every ring is a week, month, quarter or year of commits. The page grows from the pith to the bark, and every field note on it cites a real tag or commit, checked against git before rendering.</p>
<pre>npx skills add majiayu000/repo-rings</pre>
<p>Then ask your agent: <em>“Draw the tree rings of this repository.”</em> No API keys, no network; needs git and Bun.</p>
<div class="links"><a href="${repoUrl}">GitHub</a><a href="${repoUrl}/blob/main/docs/comparison.md">Compared with Gource, Git History and others</a><a href="${repoUrl}/tree/main/examples/github-action">Monthly README refresh</a></div>
</div><picture><source srcset="assets/jq-rings.png" media="(prefers-reduced-motion: reduce)"><img src="assets/jq-rings.gif" width="800" height="550" alt="jq's git history growing as tree rings, from the first commit in 2012 to HEAD in 2026"></picture></div>
<h2>Gallery</h2>
<p class="lede">Famous open-source repositories, read like trees. Open one to watch it grow and to read any ring.</p>
<div class="grid">
${cards.join("\n")}
</div>
<footer>Histories were read from fresh clones in October 2026. Lockfiles and build output are not counted. Thin rings only mean fewer commits; they are not a judgement on anyone's work. MIT licensed.</footer>
</div></body></html>`;
await Bun.write(join(root, "index.html"), html);
const today = new Date().toISOString().slice(0, 10);
await Bun.write(join(root, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${["", ...pages].map((p) => `  <url><loc>${site}${p}</loc><lastmod>${today}</lastmod></url>`).join("\n")}
</urlset>
`);
await Bun.write(join(root, "robots.txt"), `User-agent: *\nAllow: /\nSitemap: ${site}sitemap.xml\n`);
process.stdout.write(`site: ${cards.length} specimens -> index.html, sitemap.xml, robots.txt\n`);
