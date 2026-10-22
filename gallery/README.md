# Gallery specimens

Each folder holds the `rings.json` extracted from a fresh clone, the `annotations.json` written for it, the rendered page, a thumbnail and a preview image. `bun tools/build-gallery.ts` re-renders all of them and rewrites the site's `index.html`, `sitemap.xml` and `robots.txt`; any note that fails the evidence check stops the build.

| Folder | Repository | HEAD | Last commit | Rings | Extract flags |
| --- | --- | --- | --- | --- | --- |
| `bubbletea/` | charmbracelet/bubbletea | f9df43c | 2026-10-08 | 82 months | |
| `ccusage/` | ryoppippi/ccusage | aa7c6757 | 2026-10-21 | 74 weeks | |
| `express/` | expressjs/express | 0dee2c52 | 2026-10-17 | 71 quarters | |
| `jq/` | jqlang/jq | 94b00aa | 2026-10-21 | 58 quarters | |
| `moment/` | moment/moment | c2a703a4 | 2026-10-08 | 64 quarters | `--exclude min/` |
| `vue/` | vuejs/vue | 9e887079 | 2024-10-10 | 35 quarters | |
| `xz/` | tukaani-project/xz | 299eb5c3 | 2026-10-15 | 77 quarters | |

How a specimen was made (jq as the example):

```bash
git clone --filter=blob:none --no-checkout https://github.com/jqlang/jq clones/jq
git -C clones/jq backfill
bun skills/repo-rings/scripts/extract.ts clones/jq -o gallery/jq/rings.json
bun skills/repo-rings/scripts/summarize.ts gallery/jq/rings.json
```

The blobless clone keeps the full commit history, which repo-rings needs; `git backfill` (git 2.49+) then fetches file contents in batches so the line counts do not fetch them one commit at a time.
