#!/usr/bin/env bun
// Print the facts an annotator needs from rings.json, so the agent does not have to read the whole file.
// Usage: bun summarize.ts rings.json
import type { Period, Rings } from "./types.ts";

const file = process.argv[2];
const say = (line: string) => process.stdout.write(line + "\n");
// Readers often pipe this into head; a closed pipe is the end of the report, not an error.
process.stdout.on("error", (e: NodeJS.ErrnoException) => { if (e.code === "EPIPE") process.exit(0); throw e; });
if (!file) { process.stderr.write("usage: bun summarize.ts rings.json\n"); process.exit(1); }
const d: Rings = await Bun.file(file).json();
const P = d.periods;
const fmt = (n: number) => n.toLocaleString("en-US");

say(`# ${d.repo.name} @ ${d.repo.head}  (${d.repo.firstCommit} .. ${d.repo.lastCommit})`);
say(`${P.length} ${d.unit} rings · ${fmt(d.totals.commits)} commits · ${d.totals.authors} authors · +${fmt(d.totals.added)} / -${fmt(d.totals.deleted)} lines · ${d.totals.tags} tags`);
say(`sectors (clockwise from top): ${d.sectors.map((s) => `${s.key} ${fmt(s.churn)}`).join(" | ")}`);

const top = (p: Period) => [...p.log].sort((a, b) => b.churn - a.churn).slice(0, 3)
  .map((c) => `${c.h} "${c.s}" (${fmt(c.churn)})`).join("; ");

say(`\n## Busiest rings (by commits)`);
for (const p of [...P].sort((a, b) => b.commits - a.commits).slice(0, 6))
  say(`- ${p.label}: ${p.commits} commits, +${fmt(p.added)}/-${fmt(p.deleted)}, tags [${p.tags.slice(0, 4).join(", ")}] — ${top(p)}`);

say(`\n## Heaviest pruning (deleted > added)`);
for (const p of P.filter((p) => p.deleted > p.added && p.deleted > 100).sort((a, b) => b.deleted - a.deleted).slice(0, 5))
  say(`- ${p.label}: +${fmt(p.added)}/-${fmt(p.deleted)} — ${top(p)}`);

say(`\n## Quiet stretches (<=2 commits per ring, 2+ rings in a row)`);
let run: Period[] = [];
const flush = () => { if (run.length >= 2) say(`- ${run[0].label} .. ${run[run.length - 1].label}: ${run.length} rings, ${run.reduce((a, p) => a + p.commits, 0)} commits`); run = []; };
for (const p of P) { if (p.commits <= 2) run.push(p); else flush(); }
flush();

say(`\n## Version milestones (x.0.0 or 0.x.0 tags)`);
const major = /^v?(\d+)\.(\d+)\.0$/;
for (const p of P) for (const t of p.tags) {
  const m = t.match(major);
  if (m && (m[2] === "0" || m[1] === "0")) say(`- ${p.label}: tag ${t}`);
}

say(`\n## Contributors (top 12 by commits; rays in the figure)`);
for (const a of d.authors) say(`- ${a.name}: ${a.commits} commits, rings ${P[a.firstPeriod].label} .. ${P[a.lastPeriod].label}`);
