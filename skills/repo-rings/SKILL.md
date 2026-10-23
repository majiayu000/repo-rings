---
name: repo-rings
description: Turn any git repository's history into a tree-ring cross-section, a one-page interactive HTML poster that grows from the pith (first commit) to the bark (HEAD), plus SVG, PNG and an optional growth GIF, where each ring is a week, month, quarter or year of commits, the trunk grows lopsided towards the folders that grew, dark latewood marks pruning, scars mark big deletions, resin beads mark tags and pale rays mark contributors. The agent writes only short, evidence-checked field notes; scripts draw everything. Use when someone wants to visualise a repo's history or age, make a shareable poster or README image for a project, celebrate an anniversary or release, compare how projects grew, or asks for "tree rings", "dendrochronology" or a "cross-section" of a codebase.
license: MIT
compatibility: Needs git and Bun 1.1+. No network, no API keys, no npm install. Chrome or Chromium is optional (PNG from the command line); ffmpeg is optional (growth GIF or MP4).
---

# repo-rings

A repository grows like a tree. This skill cuts it open. The pith is the first commit, the bark is HEAD, and every ring between is one period of work. Readers understand the picture before they read a word, and every mark on it comes from `git log`.

You (the agent) do three things: run the extractor, read a short summary, write a small `annotations.json`. The scripts do the drawing. Do not hand-write SVG or HTML for this skill.

## Workflow

Set `SKILL_DIR` to this skill's folder and `OUT` to where the user wants the result (default: `./repo-rings-out/` in the current project). Never write into the repository being measured unless the user asks.

### 1. Extract

```sh
bun "$SKILL_DIR/scripts/extract.ts" <repo-dir> -o "$OUT/rings.json"
```

- `--unit auto|week|month|quarter|year`. Auto picks weeks under 2 years of history, months up to 7 years, then quarters, then years, so the trunk has roughly 25 to 90 rings.
- `--sectors 3..12` (default 8): how many folders get a direction around the trunk. When one top-level folder holds most of the change (for example `src/` or `packages/`), it is split one level deeper automatically.
- `--since YYYY-MM-DD` to cut a younger trunk. `--keep-generated` to count lockfiles and build output (skipped by default).
- `--exclude min/,site/` leaves out literal path prefixes, for build output a project commits under its own name. Mention it in the epilogue.
- Folder labels preserve Unicode. Non-UTF-8 folder components use uppercase `%HH` byte escapes; literal `%` is shown as `%25` so labels cannot collide. `--exclude` still matches the original path, not its escaped label.
- It refuses shallow clones, because a truncated history draws a false pith. Tell the user to run `git fetch --unshallow`, or ask before you do it.
- To measure a repository the user has not cloned, a blobless clone is enough: `git clone --filter=blob:none --no-checkout <url>`, then `git -C <dir> backfill` (git 2.49+) so the line counts do not fetch blobs one commit at a time.

If the user only wants a quick look, render now without notes: `bun "$SKILL_DIR/scripts/render.ts" "$OUT/rings.json" -o "$OUT/<repo>-rings.html"` draws the bare tree with a plain title. Then offer the annotated version.

### 2. Read the summary

```sh
bun "$SKILL_DIR/scripts/summarize.ts" "$OUT/rings.json"
```

It prints the busiest rings with their largest commits, the heaviest pruning, quiet stretches, version milestones and the top contributors. If a ring looks interesting but the summary is thin, read more with `git -C <repo> log --since ... --until ... --oneline`. Read the repository's README and CHANGELOG if they exist, to name things the way the project names them.

### 3. Write `annotations.json`

```json
{
  "title": "Bubble Tea, read like a tree",
  "specimen": {
    "binomial": "Bulla thea charmbraceletensis",
    "common": "Bubble Tea, the Go TUI framework, cut at HEAD",
    "note": "Two to four sentences: the shape of the trunk and what it says."
  },
  "events": [
    { "period": "2020-05", "kind": "rewrite", "title": "Boba, then Bubble Tea",
      "note": "renamed twice; components move to bubbles",
      "evidence": ["commit:4bf40fb", "commit:3b8b011"] }
  ],
  "epilogue": "Optional closing paragraph under the figure."
}
```

Rules, all enforced by the renderer (it stops with a list of problems):

- `period` must be a ring label exactly as in `rings.json` (`2020-05`, `2025-06-16`, `2021 Q3`, `2019`).
- `kind` is one of `birth`, `release`, `surge`, `rewrite`, `pruning`, `quiet`, `arrival`, `milestone`.
- Every event except `quiet` needs `evidence`: `tag:<name>` or `commit:<hash, 7+ chars>` that exists **in that ring**. A `quiet` event is only accepted on a ring with 2 commits or fewer.
- `title` at most 28 characters, `note` at most 46. They are callouts on a poster, not paragraphs.

Writing guidance:

- 5 to 8 events. Always include the birth ring and the outermost ring; then pick the rings that change the shape of the trunk (the widest ring, a scar, a long thin stretch, a big release, a rename or monorepo move).
- The binomial is a playful Latin-style name built from the project's real name or owner. Keep it kind; never mock a person.
- Say only what the data or the repository's own text supports. Do not guess motives ("burnout", "funding ran out"). "Four thin weeks" is a fact; "the team lost interest" is not.
- If the clone is stale, say so in the epilogue.

### 4. Render

```sh
bun "$SKILL_DIR/scripts/render.ts" "$OUT/rings.json" "$OUT/annotations.json" \
  -o "$OUT/<repo>-rings.html" --svg "$OUT/<repo>-rings.svg"
```

The page opens by growing the tree from the pith to the bark (about 6 to 12 seconds), with a pause button and a slider to scrub through the rings. Callouts appear as their ring is reached. With `prefers-reduced-motion` it starts as the finished tree and only moves when the reader asks.

Optional PNG for a README or a post (1600x1100, the figure only):

```sh
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --hide-scrollbars \
  --window-size=1600,1100 --screenshot="$OUT/<repo>-rings.png" "file://$OUT/<repo>-rings.svg"
```

(On Linux use `chromium --headless=new ...`.) The HTML page also has "download SVG" and "download PNG" buttons.

Optional growth GIF or MP4, for a post or a README. Add `--frames "$OUT/frames"` to the render command to write 61 SVG frames, then:

```sh
for f in "$OUT"/frames/*.svg; do
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --hide-scrollbars \
    --window-size=1600,1100 --screenshot="${f%.svg}.png" "file://$f"
done
ffmpeg -loop 1 -t 1.5 -framerate 12 -i "$OUT/frames/frame-060.png" -framerate 12 -i "$OUT/frames/frame-%03d.png" \
  -filter_complex "[0:v][1:v]concat=n=2:v=1[c];[c]tpad=stop_mode=clone:stop_duration=2.5,scale=800:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4" \
  "$OUT/<repo>-rings.gif"
```

The GIF opens on the finished tree for 1.5 s (that first frame is what previews show), then grows from the pith. It is about 800 KB at 800 px wide. For a smaller file use MP4: `ffmpeg -framerate 12 -i "$OUT/frames/frame-%03d.png" -vf "tpad=stop_mode=clone:stop_duration=2.5,scale=1200:-2" -pix_fmt yuv420p "$OUT/<repo>-rings.mp4"`. Delete the frames folder afterwards.

### 5. Check your work

Look at the PNG (or open the HTML) before you report back:

- Callout text is not clipped at the left or right edge and callouts do not overlap. If they do, shorten titles or drop an event.
- Hover a few rings: the ring reader shows that period's commits, folders, tags and largest commits.
- Let the growth play once: callouts should appear in ring order and the bark should close the trunk at the end.
- The trunk is not a perfect circle; if it is, the repository is flat (one folder). Say so rather than inventing structure.

Report the file paths, the ring count and unit, and one sentence on what the shape shows.

## How the picture encodes the data

| Mark | Meaning |
| --- | --- |
| Ring | One period. Width grows with the square root of that period's commits (merges excluded). |
| Earlywood / latewood | The dark outer band of each ring is the share of lines deleted. Pruning periods look dense and dark. |
| Lopsided growth | Each direction around the trunk belongs to one folder (labelled outside the bark, clockwise from the top). A ring bulges towards the folders that changed most that period. |
| Thin dark line | A period with no commits. |
| Scar | A period that deleted far more than it added (top 15% of deletions, at least 1.4x the additions). |
| Resin bead | A tag. Large beads are `x.0.0` or `0.x.0` versions. |
| Ray | One of the top 8 human contributors, from the ring of their first commit to the ring of their last. Bots are left out. |

## Examples

The gallery in this skill's repository (`gallery/`) holds jq, XZ Utils, Express, Moment.js, Vue 2, Bubble Tea and ccusage. Each folder has the `rings.json`, the `annotations.json` that was written for it and the rendered page. Read one `annotations.json` before writing your first.

## Keeping a README image fresh

`examples/github-action/` in the skill's repository has a workflow that re-renders a README image every month. It reuses a committed `annotations.json`, so the field notes stay the ones a person or agent wrote and checked; new rings simply grow outside them. Pin `--unit` in that workflow so the ring labels do not change as the project ages.

## Limits

- Lines changed is a rough measure of work; a vendored import or a formatter run can make one ring huge. The ring reader shows the largest commits so the reader can see why.
- Author names come from git and are not merged across spellings (`Carlos A Becker` and `Carlos Alexandro Becker` count as two).
- Renames are counted as delete plus add, so a big move shows up as pruning in one folder and growth in another. That is usually the honest picture of a move.
