#!/usr/bin/env bun
// Render rings.json + annotations.json into one self-contained HTML page (and optionally a bare SVG).
// Usage: bun render.ts rings.json [annotations.json] -o page.html [--svg figure.svg] [--frames dir]
// Without annotations.json it draws the bare tree: a plain title and specimen card, no field notes.
// --frames writes the growth animation as numbered SVG frames (for a GIF or video, see SKILL.md).
// Every annotation is checked against rings.json; a claim that cannot be found there stops the build.

import type { Annotations, LogEntry, Period, RingEvent, Rings } from "./types.ts";

const argv = process.argv.slice(2);
const opt = (n: string) => { const i = argv.indexOf(n); return i === -1 ? undefined : argv[i + 1]; };
const pos = argv.filter((a, i) => !a.startsWith("-") && !["-o", "--svg", "--frames"].includes(argv[i - 1]));
function fail(msg: string): never { process.stderr.write(`render: ${msg}\n`); process.exit(1); }
if (pos.length < 1) fail("usage: bun render.ts rings.json [annotations.json] -o page.html [--svg figure.svg] [--frames dir]");
const outHtml = opt("-o") ?? "rings.html";
const outSvg = opt("--svg");
const outFrames = opt("--frames");
const FRAMES = 60;

const D: Rings = await Bun.file(pos[0]).json();
const P: Period[] = D.periods;
const N = P.length;
const A: Annotations = pos[1] ? await Bun.file(pos[1]).json() : {
  title: `${D.repo.name}, read like a tree`,
  specimen: {
    binomial: D.repo.name,
    common: `${D.repo.remote ?? D.repo.name}, cut at HEAD`,
    note: `${N} ${D.unit} rings and ${D.totals.commits.toLocaleString("en-US")} commits by ${D.totals.authors} authors, from ${D.repo.firstCommit} to ${D.repo.lastCommit}.`,
  },
  events: [],
};

// ---------- validate annotations ----------
const problems: string[] = [];
for (const k of ["title", "specimen", "events"]) if (!(k in A)) problems.push(`annotations.${k} is missing`);
for (const k of ["binomial", "common", "note"] as const) if (!A.specimen?.[k]) problems.push(`annotations.specimen.${k} is missing`);
const byLabel = new Map(P.map((p) => [p.label, p]));
const KINDS = ["birth", "release", "surge", "rewrite", "pruning", "quiet", "arrival", "milestone"];
for (const [i, e] of (A.events ?? []).entries()) {
  const p = byLabel.get(e.period);
  if (!p) { problems.push(`events[${i}].period "${e.period}" is not a ring label (e.g. "${P[0].label}")`); continue; }
  if (!e.title) problems.push(`events[${i}].title is missing`);
  else if (e.title.length > 28) problems.push(`events[${i}].title "${e.title}" is ${e.title.length} chars; callout titles must be <= 28`);
  if (e.note && e.note.length > 46) problems.push(`events[${i}].note is ${e.note.length} chars; keep it <= 46`);
  if (!KINDS.includes(e.kind)) problems.push(`events[${i}].kind "${e.kind}" must be one of ${KINDS.join("|")}`);
  const ev: string[] = e.evidence ?? [];
  if (e.kind === "quiet") {
    if (p.commits > 2) problems.push(`events[${i}] is "quiet" but ${e.period} has ${p.commits} commits`);
  } else if (!ev.length) problems.push(`events[${i}] needs evidence: ["tag:<name>"] or ["commit:<hash>"] from ${e.period}`);
  for (const x of ev) {
    const [kind, val] = String(x).split(/:(.+)/);
    if (kind === "tag" && !p.tags.includes(val)) problems.push(`events[${i}] evidence ${x} is not a tag in ${e.period}`);
    else if (kind === "commit" && !(val?.length >= 7 && p.log.some((c) => c.h.startsWith(val.slice(0, 7)))))
      problems.push(`events[${i}] evidence ${x} is not a commit in ${e.period}`);
    else if (kind !== "tag" && kind !== "commit") problems.push(`events[${i}] evidence "${x}" must start with tag: or commit:`);
  }
}
if (problems.length) fail(`annotations do not match the data:\n  - ${problems.join("\n  - ")}`);

// ---------- deterministic noise ----------
function hash(s: string) { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; }
function rng(seed: number) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const rand = rng(hash(D.repo.name + D.repo.head));

// ---------- geometry ----------
const W = 1600, H = 1100, CX = 800, CY = 575, RW = 440, PITH = 7, S = 96;
let PX = CX, PY = CY; // pith position, set after the trunk is fitted
const TAU = Math.PI * 2;
const th = (k: number) => -Math.PI / 2 + (k / S) * TAU; // k=0 points up, clockwise
const sectors: string[] = D.sectors.map((s) => s.key);
const secAngle = (j: number) => -Math.PI / 2 + (j / sectors.length) * TAU;
const KAPPA = 2.2, ECC = 0.4;

const base = P.map((p) => (p.commits === 0 ? 0.3 : 0.7 + Math.sqrt(p.commits)));
const radii: number[][] = [];
let prev = new Array(S).fill(PITH);
for (let i = 0; i < N; i++) {
  const p = P[i];
  const w = sectors.map((k) => p.sectors[k].add + p.sectors[k].del);
  const wsum = w.reduce((a, b) => a + b, 0);
  const g = new Array(S).fill(1);
  if (wsum > 0) {
    for (let k = 0; k < S; k++) g[k] = w.reduce((a, wj, j) => a + (wj / wsum) * Math.exp(KAPPA * Math.cos(th(k) - secAngle(j))), 0);
    const mean = g.reduce((a, b) => a + b, 0) / S;
    for (let k = 0; k < S; k++) g[k] = 1 + ECC * (g[k] / mean - 1);
  }
  const ph = [rand() * TAU, rand() * TAU, rand() * TAU];
  const row = prev.map((r, k) => {
    const n = 1 + 0.07 * (Math.sin(2 * th(k) + ph[0]) / 2 + Math.sin(3 * th(k) + ph[1]) / 3 + Math.sin(5 * th(k) + ph[2]) / 5);
    return r + base[i] * Math.max(0.25, g[k]) * n;
  });
  radii.push(row);
  prev = row;
}
// Fit the trunk's bounding box (not the pith) to the plate, so eccentric trunks stay centred.
function bbox(row: number[]) {
  const xs = row.map((r, k) => r * Math.cos(th(k))), ys = row.map((r, k) => r * Math.sin(th(k)));
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
}
for (let pass = 0; pass < 2; pass++) {
  const b = bbox(radii[N - 1]);
  const k = (RW - PITH) / (Math.max(b.x1 - b.x0, b.y1 - b.y0) / 2 - PITH);
  for (const row of radii) for (let q = 0; q < S; q++) row[q] = PITH + (row[q] - PITH) * k;
}
{ const b = bbox(radii[N - 1]); PX = CX - (b.x0 + b.x1) / 2; PY = CY - (b.y0 + b.y1) / 2; }
const inner = (i: number) => (i === 0 ? new Array(S).fill(PITH) : radii[i - 1]);

const f1 = (n: number) => Math.round(n * 10) / 10;
const xy = (r: number, a: number) => [PX + r * Math.cos(a), PY + r * Math.sin(a)];
function closed(rs: number[]): string {
  const pts = rs.map((r, k) => xy(r, th(k)));
  const n = pts.length;
  let d = `M${f1(pts[0][0])} ${f1(pts[0][1])}`;
  for (let k = 0; k < n; k++) {
    const p0 = pts[(k - 1 + n) % n], p1 = pts[k], p2 = pts[(k + 1) % n], p3 = pts[(k + 2) % n];
    d += `C${f1(p1[0] + (p2[0] - p0[0]) / 6)} ${f1(p1[1] + (p2[1] - p0[1]) / 6)} ${f1(p2[0] - (p3[0] - p1[0]) / 6)} ${f1(p2[1] - (p3[1] - p1[1]) / 6)} ${f1(p2[0])} ${f1(p2[1])}`;
  }
  return d + "Z";
}
const lerpRow = (a: number[], b: number[], t: number) => a.map((v, k) => v + (b[k] - v) * t);
const rAt = (row: number[], a: number) => {
  const u = (((a + Math.PI / 2) / TAU) % 1 + 1) % 1 * S;
  const k0 = Math.floor(u) % S, k1 = (k0 + 1) % S, t = u - Math.floor(u);
  return row[k0] * (1 - t) + row[k1] * t;
};

// ---------- wood ----------
const mix = (a: string, b: string, t: number) => {
  const pa = a.match(/\w\w/g)!.map((h) => parseInt(h, 16)), pb = b.match(/\w\w/g)!.map((h) => parseInt(h, 16));
  return "#" + pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, "0")).join("");
};
const EARLY = "e8cba1", LATE = "b07843", FROST = "6e4527";
let wood = "";
for (let i = N - 1; i >= 0; i--) {
  const p = P[i];
  const ch = p.added + p.deleted;
  const prune = ch > 0 ? p.deleted / ch : 0.5;
  const jit = (rand() - 0.5) * 0.12;
  const late = p.commits === 0 ? `#${FROST}` : mix(LATE, FROST, Math.min(1, Math.max(0, prune * 0.8 + jit)));
  const lf = p.commits === 0 ? 1 : 0.14 + 0.42 * prune;
  wood += `<path d="${closed(radii[i])}" fill="${late}"/>`;
  if (lf < 1) wood += `<path d="${closed(lerpRow(inner(i), radii[i], 1 - lf))}" fill="${mix(EARLY, LATE, Math.max(0, 0.08 + jit))}"/>`;
}
wood += `<ellipse cx="${f1(PX)}" cy="${f1(PY)}" rx="${PITH}" ry="${PITH * 0.8}" fill="#5a3820"/>`;

// fire scars: rings where far more code was deleted than added
const dels = P.map((p) => p.deleted).sort((a, b) => a - b);
const p85 = dels[Math.floor(dels.length * 0.85)] ?? 0;
let scars = "";
const scarRings: number[] = [];
for (let i = 0; i < N; i++) {
  const p = P[i];
  if (!(p.deleted > 1.4 * p.added && p.deleted >= p85 && p.deleted > 150)) continue;
  scarRings.push(i);
  const j = sectors.reduce((best, k, jj) => (p.sectors[k].del > p.sectors[sectors[best]].del ? jj : best), 0);
  const a0 = secAngle(j), span = 0.22;
  const outer: number[][] = [], inn: number[][] = [];
  for (let s = 0; s <= 16; s++) {
    const a = a0 - span + (2 * span * s) / 16, taper = Math.sin((Math.PI * s) / 16);
    outer.push(xy(rAt(radii[i], a), a));
    inn.push(xy(rAt(inner(i), a) + (rAt(radii[i], a) - rAt(inner(i), a)) * (1 - 0.9 * taper), a));
  }
  const pts = [...outer, ...inn.reverse()];
  scars += `<path d="M${pts.map((q) => `${f1(q[0])} ${f1(q[1])}`).join("L")}Z" fill="#2e1c10" opacity=".9"/>`;
}

// rays: one per human contributor among the top authors, from first to last ring
let rays = "";
const people = D.authors.filter((a) => !/\[bot\]$/.test(a.name)).slice(0, 8);
const maxC = Math.max(...people.map((a) => a.commits), 1);
for (const a of people) {
  const ang = ((hash(a.name) % 3600) / 3600) * TAU;
  const r0 = rAt(inner(a.firstPeriod), ang), r1 = rAt(radii[a.lastPeriod], ang);
  if (r1 - r0 < 4) continue;
  const [x0, y0] = xy(r0, ang), [x1, y1] = xy(r1, ang);
  rays += `<line x1="${f1(x0)}" y1="${f1(y0)}" x2="${f1(x1)}" y2="${f1(y1)}" stroke="#f6e3c3" stroke-width="${f1(0.8 + 2.6 * Math.sqrt(a.commits / maxC))}" stroke-linecap="round" opacity=".7"/>`;
}

// resin beads: tags, on the latewood band of their ring
let beads = "";
const milestone = (t: string) => { const m = t.match(/^v?(\d+)\.(\d+)\.0$/); return !!m && (m[2] === "0" || m[1] === "0"); };
let tagN = 0;
for (let i = 0; i < N; i++) for (const t of P[i].tags) {
  const ang = -Math.PI / 2 + tagN++ * 2.39996; // golden angle spreads them
  const r = rAt(inner(i), ang) + (rAt(radii[i], ang) - rAt(inner(i), ang)) * 0.88;
  const [x, y] = xy(r, ang);
  const big = milestone(t);
  beads += `<circle cx="${f1(x)}" cy="${f1(y)}" r="${big ? 3.6 : 2}" fill="${big ? "#f2a33a" : "#e7913a"}" stroke="#7a3e0e" stroke-width="${big ? 0.9 : 0.5}" opacity="${big ? 1 : 0.85}"/>`;
}

// bark
const outer = radii[N - 1];
const barkPts: string[] = [];
const bp = [rand() * TAU, rand() * TAU, rand() * TAU];
for (let s = 0; s < 360; s++) {
  const a = -Math.PI / 2 + (s / 360) * TAU;
  const w = 20 + 4 * Math.sin(17 * a + bp[0]) + 3 * Math.sin(41 * a + bp[1]) + 2.5 * Math.sin(83 * a + bp[2]) + (rand() - 0.5) * 3;
  const [x, y] = xy(rAt(outer, a) + w, a);
  barkPts.push(`${f1(x)} ${f1(y)}`);
}
let fissures = "";
for (let s = 0; s < 70; s++) {
  const a = rand() * TAU, r0 = rAt(outer, a) + 3, len = 8 + rand() * 12;
  const [x0, y0] = xy(r0, a), [x1, y1] = xy(r0 + len, a + (rand() - 0.5) * 0.02);
  fissures += `<line x1="${f1(x0)}" y1="${f1(y0)}" x2="${f1(x1)}" y2="${f1(y1)}" stroke="#2a1a10" stroke-width="${f1(1 + rand() * 1.6)}" stroke-linecap="round"/>`;
}
const bark = `<path d="M${barkPts.join("L")}Z" fill="#4b3121"/>${fissures}<path d="${closed(outer)}" fill="none" stroke="#8a5a34" stroke-width="2.2"/>`;

// sector labels around the bark
const esc = (s: string) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
let secLabels = "";
sectors.forEach((k, j) => {
  const a = secAngle(j), r = rAt(outer, a) + 44;
  const [x, y] = xy(r, a), [tx, ty] = xy(r - 12, a);
  const anchor = Math.abs(Math.cos(a)) < 0.25 ? "middle" : Math.cos(a) > 0 ? "start" : "end";
  secLabels += `<line x1="${f1(tx)}" y1="${f1(ty)}" x2="${f1(xy(r - 3, a)[0])}" y2="${f1(xy(r - 3, a)[1])}" stroke="#8b7a66" stroke-width="1"/>`;
  secLabels += `<text x="${f1(x)}" y="${f1(y + (Math.sin(a) > 0.5 ? 10 : Math.sin(a) < -0.5 ? -2 : 4))}" text-anchor="${anchor}" class="sec">${esc(k)}</text>`;
});

// event callouts in two columns. Events alternate sides in ring order; in each column the inner rings take the
// middle slots and the outer rings the ends, and each anchor sits on its ring at its slot's height, so leader lines
// run nearly level and do not cross. An explicit "angle" (degrees clockwise from the top) overrides the placement.
type Call = { i: number; e: RingEvent; ax: number; ay: number; side: number; y: number };
const GAP = 78;
const evs = A.events.map((e) => ({ e, i: P.findIndex((p) => p.label === e.period) })).sort((x, y) => x.i - y.i);
const calls: Call[] = [];
for (const side of [1, -1]) {
  const col = evs.filter((_, k) => (k % 2 === 0) === (side === 1));
  const slots = col.map((_, k) => Math.min(H - 60, Math.max(70, PY + (k - (col.length - 1) / 2) * GAP)))
    .sort((x, y) => Math.abs(x - PY) - Math.abs(y - PY));
  col.forEach(({ e, i }, k) => {
    let a: number;
    if (typeof e.angle === "number") a = (e.angle - 90) * Math.PI / 180;
    else {
      const a0 = side > 0 ? 0 : Math.PI, r0 = (rAt(inner(i), a0) + rAt(radii[i], a0)) / 2;
      const sn = Math.min(0.9, Math.max(-0.9, (slots[k] - PY) / r0));
      a = side > 0 ? Math.asin(sn) : Math.PI - Math.asin(sn);
    }
    const r = (rAt(inner(i), a) + rAt(radii[i], a)) / 2;
    const [ax, ay] = xy(r, a);
    calls.push({ i, e, ax, ay, side: Math.cos(a) >= 0 ? 1 : -1, y: typeof e.angle === "number" ? ay : slots[k] });
  });
}
for (const side of [-1, 1]) {
  const col = calls.filter((c) => c.side === side).sort((a, b) => a.y - b.y);
  const top = 70, bottom = H - 60;
  for (let k = 0; k < col.length; k++) col[k].y = Math.max(col[k].y, k ? col[k - 1].y + GAP : top);
  for (let k = col.length - 1; k >= 0; k--) col[k].y = Math.min(col[k].y, k < col.length - 1 ? col[k + 1].y - GAP : bottom);
}
// Each callout is its own group so the growth animation can reveal it when its ring appears.
const calloutGroups = calls.map((c) => {
  let callouts = "";
  const tx = c.side > 0 ? 1316 : 284, ex = c.side > 0 ? tx - 14 : tx + 14;
  const anchor = c.side > 0 ? "start" : "end";
  callouts += `<polyline points="${f1(c.ax)},${f1(c.ay)} ${f1(ex)},${f1(c.y - 4)} ${f1(tx - 4 * c.side)},${f1(c.y - 4)}" fill="none" stroke="#3b3128" stroke-width="1" opacity=".75"/>`;
  callouts += `<circle cx="${f1(c.ax)}" cy="${f1(c.ay)}" r="3.2" fill="#fffaf0" stroke="#3b3128" stroke-width="1.2"/>`;
  callouts += `<text x="${tx}" y="${f1(c.y)}" text-anchor="${anchor}" class="ct">${esc(c.e.title)}</text>`;
  callouts += `<text x="${tx}" y="${f1(c.y + 17)}" text-anchor="${anchor}" class="cs">${esc(c.e.period)} · ring ${c.i + 1}</text>`;
  if (c.e.note) callouts += `<text x="${tx}" y="${f1(c.y + 33)}" text-anchor="${anchor}" class="cn">${esc(c.e.note)}</text>`;
  return { i: c.i, svg: callouts };
});

// scale bar: ring count ticks along the radius pointing down-left
const fmt = (n: number) => n.toLocaleString("en-US");
const unitWord: Record<string, string> = { week: "week", month: "month", quarter: "quarter", year: "year" };
// The figure at a growth stage: `grown` rings (fractional) are visible; grown >= N is the finished tree.
// The page animates the same structure by moving #growp; --frames writes it out stage by stage.
const fullD = closed(outer);
function growthPath(grown: number): string {
  if (grown >= N) return fullD;
  const i = Math.floor(grown);
  return closed(lerpRow(inner(i), radii[i], grown - i));
}
function figure(grown: number): string {
  const done = grown >= N;
  const gd = growthPath(grown);
  const callouts = calloutGroups.map((c) => `<g class="co" data-ring="${c.i}"${grown > c.i ? "" : ' opacity="0"'}>${c.svg}</g>`).join("");
  const clock = done ? "" : `${esc(P[Math.min(N - 1, Math.floor(grown))].label)} · ring ${Math.min(N, Math.floor(grown) + 1)}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Tree-ring cross-section of ${esc(D.repo.name)}: ${N} ${unitWord[D.unit]} rings">
<style>
.sec{font:500 15px ui-monospace,SFMono-Regular,Menlo,monospace;fill:#6f604f;paint-order:stroke;stroke:#f4eee3;stroke-width:4px}
.ct{font:600 18px "Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif;fill:#231d17}
.cs{font:13px ui-monospace,SFMono-Regular,Menlo,monospace;fill:#7a6a58}
.cn{font:italic 14px "Iowan Old Style",Palatino,Georgia,serif;fill:#4d4136}
.hd{font:italic 600 30px "Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif;fill:#231d17}
.sm{font:13px ui-monospace,SFMono-Regular,Menlo,monospace;fill:#7a6a58}
</style>
<defs>
<filter id="grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.55 0.06" numOctaves="3" seed="${hash(D.repo.name) % 997}"/><feColorMatrix values="0 0 0 0 0.25  0 0 0 0 0.15  0 0 0 0 0.07  0 0 0 0.55 0"/><feComposite in2="SourceGraphic" operator="in"/></filter>
<radialGradient id="shade" cx="50%" cy="50%" r="50%"><stop offset="70%" stop-color="#000" stop-opacity="0"/><stop offset="100%" stop-color="#000" stop-opacity=".22"/></radialGradient>
<filter id="drop" x="-10%" y="-10%" width="120%" height="120%"><feDropShadow dx="0" dy="10" stdDeviation="14" flood-color="#3b2a1a" flood-opacity=".28"/></filter>
<clipPath id="grow"><path id="growp" d="${gd}"/></clipPath>
</defs>
<rect width="${W}" height="${H}" fill="#f4eee3"/>
<text x="40" y="60" class="hd">${esc(A.specimen.binomial)}</text>
<text x="40" y="86" class="sm">${esc(D.repo.name)} @ ${esc(D.repo.head)} · ${N} ${unitWord[D.unit]} rings · ${D.repo.firstCommit} → ${D.repo.lastCommit}</text>
<g id="bark" filter="url(#drop)"${done ? "" : ' opacity="0"'}>${bark}</g>
<g id="tree" clip-path="url(#grow)"><g id="wood">${wood}</g>
<path d="${fullD}" fill="#000" filter="url(#grain)" opacity=".5"/>
<path d="${fullD}" fill="url(#shade)"/>
${scars}${rays}${beads}</g>
<path id="edge" d="${done ? "" : gd}" fill="none" stroke="#4b3121" stroke-width="5"/>
<path id="hl" d="" fill="none" stroke="#fffaf0" stroke-width="2.5" opacity="0" pointer-events="none"/>
<path id="hl2" d="" fill="none" stroke="#1d140c" stroke-width="1" opacity="0" pointer-events="none"/>
${secLabels}${callouts}
<text id="clock" x="${W - 40}" y="60" text-anchor="end" class="hd">${clock}</text>
<text x="${W - 40}" y="${H - 28}" text-anchor="end" class="sm">repo-rings · ${fmt(D.totals.commits)} commits · ${D.totals.authors} authors · +${fmt(D.totals.added)} / −${fmt(D.totals.deleted)} lines</text>
</svg>`;
}
const svg = figure(N);

// ---------- page ----------
const ringsData = P.map((p, i) => {
  const secs = sectors.map((k) => [k, p.sectors[k].add + p.sectors[k].del] as [string, number]).filter((x) => x[1] > 0).sort((a, b) => b[1] - a[1]).slice(0, 3);
  return {
    l: p.label, c: p.commits, a: p.added, d: p.deleted, u: p.authors, n: p.newAuthors.slice(0, 3), nn: p.newAuthors.length,
    s: secs, t: p.tags.slice(0, 6), tn: p.tags.length,
    g: [...p.log].sort((x, y) => y.churn - x.churn).slice(0, 3).map((c: LogEntry) => [c.h, c.s]),
    scar: scarRings.includes(i) ? 1 : 0,
  };
});
const geo = { cx: f1(PX), cy: f1(PY), S, pith: PITH, radii: radii.map((r) => r.map(f1)) };
const paths = radii.map((r) => closed(r));

const eventsHtml = A.events.map((e) => {
  const ev = (e.evidence ?? []).map((x: string) => {
    const [k, v] = x.split(/:(.+)/);
    const href = D.repo.remote?.startsWith("https://github.com/") ? (k === "tag" ? `${D.repo.remote}/releases/tag/${encodeURIComponent(v)}` : `${D.repo.remote}/commit/${v}`) : null;
    return href ? `<a href="${esc(href)}">${esc(x)}</a>` : `<code>${esc(x)}</code>`;
  }).join(" ");
  return `<li><button class="ev" data-ring="${P.findIndex((p) => p.label === e.period)}"><b>${esc(e.title)}</b><span>${esc(e.period)} · ${esc(e.kind)}</span></button>${e.note ? `<p>${esc(e.note)}</p>` : ""}${ev ? `<p class="evd">${ev}</p>` : ""}</li>`;
}).join("");

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(A.title)}</title>
${(() => { const d = esc(`${D.repo.name}: ${N} ${unitWord[D.unit]} rings, ${D.totals.commits} commits, ${D.totals.authors} authors, read like a tree.`);
  return `<meta name="description" content="${d}">\n<meta property="og:type" content="article"><meta property="og:title" content="${esc(A.title)}"><meta property="og:description" content="${d}"><meta name="twitter:card" content="summary_large_image">`; })()}
<style>
:root{--bg:#efe8dc;--panel:#fbf7f0;--ink:#231d17;--mute:#7a6a58;--line:#d9cdbb;--accent:#b0612a}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#17130f;--panel:#221c16;--ink:#efe6d8;--mute:#a8987f;--line:#3a3027;--accent:#e59a55}}
:root[data-theme="dark"]{--bg:#17130f;--panel:#221c16;--ink:#efe6d8;--mute:#a8987f;--line:#3a3027;--accent:#e59a55}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.55 "Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif}
.wrap{max-width:1240px;margin:0 auto;padding:28px 16px 64px}
header{display:flex;justify-content:space-between;gap:16px;align-items:flex-end;flex-wrap:wrap;margin-bottom:16px}
h1{margin:0;font-size:clamp(28px,4vw,44px);line-height:1.1;font-weight:600}
.sub{color:var(--mute);font:14px ui-monospace,SFMono-Regular,Menlo,monospace;margin-top:6px}
.tools{display:flex;gap:8px;flex-wrap:wrap}
button,.btn{font:13px ui-monospace,SFMono-Regular,Menlo,monospace;background:var(--panel);color:var(--ink);border:1px solid var(--line);border-radius:6px;padding:7px 11px;cursor:pointer}
button:hover{border-color:var(--accent)}
figure{margin:0;background:#f4eee3;border-radius:10px;overflow:hidden;box-shadow:0 1px 0 var(--line),0 18px 40px -24px rgba(0,0,0,.45)}
figure svg{display:block;width:100%;height:auto;cursor:crosshair;touch-action:manipulation}
.hint{color:var(--mute);font-size:14px;margin:10px 2px 22px}
.player{display:flex;gap:12px;align-items:center;margin:12px 2px 0}
.player input{flex:1;min-width:0;accent-color:var(--accent)}
#play{min-width:9.5em}
#bark,.co{transition:opacity .5s}
@media (prefers-reduced-motion:reduce){#bark,.co{transition:none}}
.grid{display:grid;grid-template-columns:1.1fr 1fr 1fr;gap:16px}
@media (max-width:900px){.grid{grid-template-columns:1fr}}
.card{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:18px 20px}
.card h2{margin:0 0 10px;font-size:13px;letter-spacing:.12em;text-transform:uppercase;color:var(--mute);font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-weight:500}
.bin{font-style:italic;font-size:24px;line-height:1.2}
.common{color:var(--mute);margin-bottom:12px}
dl{display:grid;grid-template-columns:auto 1fr;gap:4px 14px;margin:0 0 12px;font:14px ui-monospace,SFMono-Regular,Menlo,monospace}
dt{color:var(--mute)}dd{margin:0}
#read .big{font-size:26px;font-weight:600}
#read .row{font:14px ui-monospace,SFMono-Regular,Menlo,monospace;margin:4px 0;overflow-wrap:anywhere}
#read ul{padding-left:18px;margin:6px 0;font-size:14px}
ol.events{list-style:none;padding:0;margin:0}
ol.events li{border-top:1px solid var(--line);padding:10px 0}
ol.events li:first-child{border-top:0;padding-top:0}
.ev{all:unset;cursor:pointer;display:block}
.ev b{display:block}.ev span{color:var(--mute);font:13px ui-monospace,SFMono-Regular,Menlo,monospace}
.ev:focus-visible{outline:2px solid var(--accent);outline-offset:3px}
ol.events p{margin:4px 0 0;font-size:14px}
.evd a,.evd code{font:12px ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--accent)}
.legend{display:grid;grid-template-columns:28px 1fr;gap:8px 10px;align-items:center;font-size:14px}
.sw{width:28px;height:16px;border-radius:3px}
.epi{margin-top:22px;font-size:17px;max-width:70ch}
a{color:var(--accent)}
</style></head><body><div class="wrap">
<header><div><h1>${esc(A.title)}</h1><div class="sub">${esc(D.repo.remote ?? D.repo.name)} · HEAD ${esc(D.repo.head)} · one ring = one ${unitWord[D.unit]}</div></div>
<div class="tools"><button id="theme" aria-label="Toggle dark mode">theme</button><button id="dlsvg">download SVG</button><button id="dlpng">download PNG</button></div></header>
<figure id="fig">${svg}</figure>
<div class="player"><button id="play" aria-pressed="false">replay growth</button><input id="scrub" type="range" min="0" max="1000" value="1000" aria-label="Growth, from the pith (first commit) to the bark (HEAD)"></div>
<p class="hint">Drag the slider to grow the tree ring by ring. Hover or tap a ring to read that ${unitWord[D.unit]}. Arrow keys step through the rings from the pith (first commit) to the bark (HEAD).</p>
<div class="grid">
<section class="card"><h2>Specimen</h2><div class="bin">${esc(A.specimen.binomial)}</div><div class="common">${esc(A.specimen.common)}</div>
<dl><dt>collected</dt><dd>${D.repo.lastCommit} · ${esc(D.repo.head)}</dd><dt>age</dt><dd>${N} rings (${unitWord[D.unit]}s), since ${D.repo.firstCommit}</dd>
<dt>commits</dt><dd>${fmt(D.totals.commits)} (merges excluded)</dd><dt>authors</dt><dd>${D.totals.authors}</dd><dt>lines</dt><dd>+${fmt(D.totals.added)} / −${fmt(D.totals.deleted)}</dd><dt>tags</dt><dd>${D.totals.tags}</dd></dl>
<p>${esc(A.specimen.note)}</p></section>
<section class="card" id="read" aria-live="polite"><h2>Ring reader</h2><div class="big">—</div><div class="row">Hover the cross-section.</div></section>
<section class="card"><h2>How to read it</h2><div class="legend">
<div class="sw" style="background:linear-gradient(90deg,#e8cba1 70%,#b07843 70%)"></div><div>Ring width = commits that ${unitWord[D.unit]} (√ scaled).</div>
<div class="sw" style="background:linear-gradient(90deg,#e8cba1 40%,#6e4527 40%)"></div><div>Dark band = share of lines deleted. Pruning shows as dense latewood.</div>
<div class="sw" style="background:#f4eee3;border:1px dashed #8b7a66"></div><div>Lopsided growth = where the code grew: each direction around the trunk is one folder (labels on the bark).</div>
<div class="sw" style="background:#6e4527"></div><div>Thin dark line = a ${unitWord[D.unit]} with no commits.</div>
<div class="sw" style="background:#2e1c10"></div><div>Scar = a ${unitWord[D.unit]} that deleted far more than it added.</div>
<div class="sw" style="background:radial-gradient(circle,#f2a33a 35%,transparent 40%)"></div><div>Resin bead = a tag. Big beads are x.0.0 / 0.x.0 releases.</div>
<div class="sw" style="background:linear-gradient(90deg,transparent 30%,#f6e3c3 30%,#f6e3c3 70%,transparent 70%),#b07843"></div><div>Ray = a top contributor, from their first ring to their last.</div>
</div>${D.excludedGenerated ? `<p class="sub">Lockfiles, build output and snapshots are not counted.</p>` : ""}${D.excludedPaths?.length ? `<p class="sub">Also left out: ${esc(D.excludedPaths.join(", "))}</p>` : ""}</section>
</div>
${eventsHtml ? `<section class="card" style="margin-top:16px"><h2>Field notes</h2><ol class="events">${eventsHtml}</ol></section>` : ""}
${A.epilogue ? `<p class="epi">${esc(A.epilogue)}</p>` : ""}
</div>
<script>
const R=${JSON.stringify(ringsData)};
const G=${JSON.stringify(geo)};
const PATHS=${JSON.stringify(paths)};
const svg=document.querySelector("#fig svg"),hl=document.getElementById("hl"),hl2=document.getElementById("hl2"),read=document.getElementById("read");
let cur=-1,pinned=false;
const esc=s=>String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const nf=n=>n.toLocaleString("en-US");
function show(i){
  if(i<0||i>=R.length){hl.style.opacity=0;hl2.style.opacity=0;cur=-1;return}
  cur=i;const r=R[i];hl.setAttribute("d",PATHS[i]);hl2.setAttribute("d",PATHS[i]);hl.style.opacity=.95;hl2.style.opacity=.9;
  read.innerHTML='<h2>Ring reader</h2><div class="big">'+esc(r.l)+'</div>'+
  '<div class="row">ring '+(i+1)+' of '+R.length+(r.scar?' · scar':'')+'</div>'+
  '<div class="row">'+r.c+' commits · '+r.u+' authors · +'+nf(r.a)+' / −'+nf(r.d)+'</div>'+
  (r.s.length?'<div class="row">grew in: '+r.s.map(x=>esc(x[0])+' '+nf(x[1])).join(', ')+'</div>':'')+
  (r.nn?'<div class="row">new: '+r.n.map(esc).join(', ')+(r.nn>3?' +'+(r.nn-3):'')+'</div>':'')+
  (r.tn?'<div class="row">tags: '+r.t.map(esc).join(', ')+(r.tn>6?' +'+(r.tn-6):'')+'</div>':'')+
  (r.g.length?'<ul>'+r.g.map(x=>'<li><code>'+esc(x[0])+'</code> '+esc(x[1])+'</li>').join('')+'</ul>':'');
}
function ringAt(evt){
  const pt=svg.createSVGPoint();pt.x=evt.clientX;pt.y=evt.clientY;
  const p=pt.matrixTransform(svg.getScreenCTM().inverse());
  const dx=p.x-G.cx,dy=p.y-G.cy,r=Math.hypot(dx,dy);
  let u=((Math.atan2(dy,dx)+Math.PI/2)/(2*Math.PI)%1+1)%1*G.S;
  const k0=Math.floor(u)%G.S,k1=(k0+1)%G.S,t=u-Math.floor(u);
  for(let i=0;i<G.radii.length;i++){const ri=G.radii[i][k0]*(1-t)+G.radii[i][k1]*t;if(r<=ri)return i}
  return -1;
}
const grownAt=e=>{const i=ringAt(e);return i<grown?i:-1};
svg.addEventListener("mousemove",e=>{if(!pinned)show(grownAt(e))});
svg.addEventListener("mouseleave",()=>{if(!pinned)show(-1)});
svg.addEventListener("click",e=>{const i=grownAt(e);pinned=i>=0&&!(pinned&&i===cur);show(i)});
document.addEventListener("keydown",e=>{
  if(e.key==="ArrowRight"||e.key==="ArrowUp"){pinned=true;show(Math.min(R.length-1,cur+1));e.preventDefault()}
  else if(e.key==="ArrowLeft"||e.key==="ArrowDown"){pinned=true;show(Math.max(0,cur<0?R.length-1:cur-1));e.preventDefault()}
  else if(e.key==="Escape"){pinned=false;show(-1)}
});
document.querySelectorAll(".ev").forEach(b=>b.addEventListener("click",()=>{pinned=true;show(+b.dataset.ring);document.getElementById("fig").scrollIntoView({behavior:"smooth",block:"center"})}));
function svgText(){const c=svg.cloneNode(true);c.querySelector("#hl").remove();c.querySelector("#hl2").remove();
  c.querySelector("#growp").setAttribute("d",FULL);c.querySelector("#edge").setAttribute("d","");c.querySelector("#clock").textContent="";
  c.querySelectorAll("[style]").forEach(n=>n.removeAttribute("style"));return new XMLSerializer().serializeToString(c)}
function save(blob,name){const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
const base=${JSON.stringify(D.repo.name + "-rings")};
document.getElementById("dlsvg").onclick=()=>save(new Blob([svgText()],{type:"image/svg+xml"}),base+".svg");
document.getElementById("dlpng").onclick=()=>{
  const img=new Image();img.onload=()=>{const c=document.createElement("canvas");c.width=${W * 2};c.height=${H * 2};const x=c.getContext("2d");x.drawImage(img,0,0,c.width,c.height);c.toBlob(b=>{if(!b){alert("PNG export failed in this browser; use download SVG.");return}save(b,base+".png")},"image/png")};
  img.onerror=()=>alert("PNG export failed in this browser; use download SVG.");
  img.src="data:image/svg+xml;charset=utf-8,"+encodeURIComponent(svgText());
};
document.getElementById("theme").onclick=()=>{const r=document.documentElement;const dark=r.dataset.theme?r.dataset.theme==="dark":matchMedia("(prefers-color-scheme: dark)").matches;r.dataset.theme=dark?"light":"dark";try{localStorage.setItem("repo-rings-theme",r.dataset.theme)}catch(e){}};
try{const t=localStorage.getItem("repo-rings-theme");if(t)document.documentElement.dataset.theme=t}catch(e){}
// Growth: the clip path #growp moves from the pith to the bark; callouts appear as their ring is reached.
const growp=document.getElementById("growp"),edge=document.getElementById("edge"),barkG=document.getElementById("bark"),clock=document.getElementById("clock"),
  cos=[...document.querySelectorAll(".co")],scrub=document.getElementById("scrub"),playB=document.getElementById("play"),FULL=growp.getAttribute("d");
function ringPath(row){
  const n=row.length,f=v=>v.toFixed(1),p=row.map((r,k)=>{const a=-Math.PI/2+k/n*2*Math.PI;return[G.cx+r*Math.cos(a),G.cy+r*Math.sin(a)]});
  let d="M"+f(p[0][0])+" "+f(p[0][1]);
  for(let k=0;k<n;k++){const p0=p[(k-1+n)%n],p1=p[k],p2=p[(k+1)%n],p3=p[(k+2)%n];
    d+="C"+f(p1[0]+(p2[0]-p0[0])/6)+" "+f(p1[1]+(p2[1]-p0[1])/6)+" "+f(p2[0]-(p3[0]-p1[0])/6)+" "+f(p2[1]-(p3[1]-p1[1])/6)+" "+f(p2[0])+" "+f(p2[1])}
  return d+"Z";
}
const N=R.length,DUR=Math.min(12000,Math.max(6000,N*110));
let grown=N,playing=false,t0=0,from=0;
function setGrowth(x){
  grown=Math.max(0,Math.min(N,x));const done=grown>=N,i=Math.min(N-1,Math.floor(grown));
  let d=FULL;
  if(!done){const t=grown-i,a=i?G.radii[i-1]:G.radii[0].map(()=>G.pith),b=G.radii[i];d=ringPath(a.map((v,k)=>v+(b[k]-v)*t))}
  growp.setAttribute("d",d);edge.setAttribute("d",done?"":d);barkG.style.opacity=done?1:0;
  cos.forEach(c=>c.style.opacity=grown>+c.dataset.ring?1:0);
  clock.textContent=done?"":R[i].l+" · ring "+(i+1);
  scrub.value=Math.round(grown/N*1000);scrub.setAttribute("aria-valuetext",done?"full tree, "+N+" rings":R[i].l);
  if(cur>=grown&&!done)show(-1);
}
function tick(now){if(!playing)return;const x=from+(now-t0)/DUR*N;setGrowth(x);if(x>=N)stop();else requestAnimationFrame(tick)}
function play(){if(grown>=N)setGrowth(0);from=grown;t0=performance.now();playing=true;playB.textContent="pause";playB.setAttribute("aria-pressed","true");requestAnimationFrame(tick)}
function stop(){playing=false;playB.textContent=grown>=N?"replay growth":"play";playB.setAttribute("aria-pressed","false")}
playB.onclick=()=>playing?stop():play();
scrub.oninput=()=>{stop();setGrowth(scrub.value/1000*N)};
if(!matchMedia("(prefers-reduced-motion: reduce)").matches)play();
</script></body></html>`;

await Bun.write(outHtml, html);
if (outSvg) await Bun.write(outSvg, svg);
if (outFrames) {
  for (let k = 0; k <= FRAMES; k++)
    await Bun.write(`${outFrames}/frame-${String(k).padStart(3, "0")}.svg`, figure((N * k) / FRAMES));
  process.stdout.write(`render: ${FRAMES + 1} growth frames -> ${outFrames}/frame-000.svg .. frame-${FRAMES}.svg\n`);
}
process.stdout.write(`render: ${N} rings, ${scarRings.length} scars, ${tagN} beads, ${calls.length} callouts -> ${outHtml}${outSvg ? ` + ${outSvg}` : ""} (${Math.round(html.length / 1024)} KB)\n`);
