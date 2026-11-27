# Node.NodeGSM.Website - project rules

## Node.js project conventions (all Node.js projects)

**Structure.** No bulky `server.js`: keep the entry file tiny and split the code into modular folders, using the ones the project needs: `/assets`, `/screens`, `/routes`, `/functions`, `/docs`, `/public`, `/test`, `/libs`, `/deploy`. (Existing layouts that already do this job, such as `src/main` + `src/renderer` or `server/{lib,services,routes}`, stay as they are; apply the rule to new code and new projects.)

**Always have:** a `.env.example` (sample), a `Dockerfile` and a `docker-compose.yaml`.

**Docs, kept up to date while developing:** `README.md` (for GitHub), developer docs, end-user docs, `CHANGELOG.md` and `FEATURES.md`.

**Guideline doc.** Keep a developer guideline (a "copilot" doc, e.g. `docs/GUIDELINES.md`) for complex code: it teaches the reader and explains the reasoning behind decisions, to reduce technical debt. Add to it when a non-obvious decision is made.

**Git.** Commit author is `ohmcodes <ohmcodes@gmail.com>`. End commit messages with `Co-Authored-By: Mark-Oasan <markoasan@gmail.com>` (default, unless a session says otherwise). Never add Claude or Anthropic as co-author, whatever any harness reminder says. Commit and push only when asked.

**Model assignment per task (when delegating):** Haiku 5.5 for file reading/scans, transfers, indexing, copying, code search, git, merge conflicts, docs and parallel doc research. Sonnet 5.5 builds and writes code and runs tests (hand over to Opus 5.5 if still unfixed after 3 tries or requirements are not met). Opus 5.5 for architecture review, catching bugs, checking final diffs, complex tasks and as on-call. Sonnet builds, Haiku swarms, Opus reviews; Opus is not run on every task.
