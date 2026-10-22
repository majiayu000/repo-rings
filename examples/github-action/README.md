# Monthly README rings (optional)

A tree-ring image that only shows the day you made it goes stale. This workflow re-draws it on the first of every month, so the bark keeps up with HEAD and the new rings appear in your README on their own.

It is an example. Nothing here runs until you copy it into your own repository.

## Set it up

1. Optional but recommended: run the repo-rings skill once on your repository and keep the `annotations.json` it wrote. Without it the workflow draws the bare tree, with no field notes. Use month labels (`2024-08`) for every `period`, because the workflow pins `--unit month` so ring labels never change underneath your notes. If your skill run picked weeks or quarters, re-extract with `--unit month` and adjust the periods.
2. If you have notes, commit them as `.github/repo-rings/annotations.json`.
3. Copy [`repo-rings.yml`](repo-rings.yml) to `.github/workflows/repo-rings.yml`.
4. Put the image in your README:

   ```html
   <img src="docs/repo-rings.svg" alt="Tree-ring cross-section of this repository's history" width="800">
   ```

5. Run it once from the Actions tab (**Run workflow**) to create `docs/repo-rings.svg`.

## What it does each month

- Checks out the full history (`fetch-depth: 0`), because repo-rings refuses shallow clones.
- Fetches repo-rings at the tag in `REPO_RINGS_REF`. Pin a tag or a commit, not a branch.
- Extracts the rings and renders the SVG with your committed annotations. The evidence check still runs: if someone edits the annotations to cite a tag or commit that is not in that ring, the job fails instead of publishing a wrong note.
- Commits the SVG only if it changed, with `--signoff` so repositories that enforce DCO accept it.

Your field notes stay the ones you wrote and checked. New rings grow outside them; add a note for a new release by editing the JSON whenever you like.

## Costs and limits

- No secrets or API keys. It needs `contents: write` to push the image.
- The extract step reads `git log --numstat` over the whole history. That takes seconds for a few thousand commits and longer for very large repositories; add `--since YYYY-MM-DD` to the extract line if it gets slow.
- If your default branch is protected against direct pushes, change the last step to open a pull request instead.
