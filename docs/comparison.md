# repo-rings compared with other git history visualizers

repo-rings is not the first tool that draws a repository's history. This page sets it next to the best-known ones, so you can pick the right tool for the job.

Star counts, licenses and archive status come from the GitHub API on 2026-10-22. Feature notes come from each project's README on that day. "—" means the README does not mention it.

| | **repo-rings** | [Gource](https://github.com/acaudwell/Gource) | [Git History](https://github.com/pomber/git-history) | [git-of-theseus](https://github.com/erikbern/git-of-theseus) | [repo-visualizer](https://github.com/githubocto/repo-visualizer) | [Git Truck](https://github.com/git-truck/git-truck) | [Archify](https://github.com/tt-a1i/archify) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Stars | new | 13,178 | 13,676 | 2,972 | 1,311 | 780 | 87,399 |
| What it shows | The whole history as one tree-ring cross-section | Animated file tree with committers flying around | One file's history, version by version | Code cohorts and survival curves over time | Current file tree as a bubble diagram | File tree, churn and authorship metrics | Interactive diagram of an idea, plan or codebase |
| Scope | Whole repository, first commit to HEAD | Whole repository over time | A single file | Whole repository over time | Current snapshot | Whole repository | Whatever the agent is asked to explain; not git-history-specific |
| Output | One offline HTML page, SVG, PNG, optional GIF/MP4 | OpenGL window; video via `--output-ppm-stream` and ffmpeg | Web page (githistory.xyz, CLI, VS Code extension) | matplotlib plots (PNG) | SVG | Local web app in the browser | Interactive HTML |
| Animation | Growth from pith to bark, with pause and slider | Yes, real-time | Step through versions | — | — | — | — |
| Story annotations | Field notes written by an agent; every note must cite a real tag or commit in its ring | Captions file (`--caption-file`) | — | — | — | — | Agent-written diagram text, no evidence check |
| Fits in a README | Yes (SVG/PNG/GIF) | Via recorded video | — | Yes (PNG) | Yes (SVG) | — | — |
| Auto-update in CI | Example GitHub Action, monthly | — | — | — | Is a GitHub Action | — | — |
| Install | `npx skills add majiayu000/repo-rings` (agent skill; needs git and Bun) | Native binary (OpenGL) | None for the website | `pip install git-of-theseus` | GitHub Action | `npm install -g git-truck` | `npx skills add tt-a1i/archify` |
| Works offline, no account | Yes | Yes | Website: no; CLI: yes | Yes | Runs in Actions | Yes | — |
| License | MIT | GPL-3.0 | MIT | Apache-2.0 | MIT | MIT | MIT |
| Status | Active | Active (last push 2026-03) | Last push 2024-10 | Last push 2023-11 | Archived | Active | Active |

## When to use which

- **You want a video of people working on files:** Gource. Nothing beats it for a live, moving picture of who touched what.
- **You want to see how one file changed:** Git History.
- **You want a quantitative chart of code age or survival:** git-of-theseus.
- **You want to explore churn and ownership interactively:** Git Truck.
- **You want an architecture diagram:** Archify (or repo-visualizer for a simple file map, though it is archived).
- **You want one image that tells the story of a whole project, for a README, an anniversary or a release post:** repo-rings. Ring widths, scars, tags and contributor rays are all computed from `git log`, and the short notes on the poster are checked against the history before the page is drawn.

## What repo-rings does not do

- It does not show individual files; folders are the finest grain (one direction around the trunk per top folder).
- It measures commits and changed lines, not code quality or survival.
- It does not merge author name spellings unless the repository ships a `.mailmap`.
