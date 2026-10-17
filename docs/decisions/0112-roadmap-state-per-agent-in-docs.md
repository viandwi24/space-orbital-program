# 0112 — Roadmap state lives in docs, one file per agent

**Status:** accepted
**Date:** 2026-10-17
**Plan:** none (owner request in chat, 2026-10-17); process change to `docs/roadmap/`
**Amends:** `docs/roadmap/team-development-roadmap.md` §3.1 ("devs never push `main`") with one exception.

## Context

The owner wants to see each agent's progress on every push, in the repository rather than in an artifact, and asked that "every agent edits only the roadmap part it works on; Agent 1 (Lead) may also edit for design". Until now progress was visible only through the coordination tags and `checkpoints.md`, which only the Lead writes at merge time. A dev's state between claim and merge (what it is doing, what it waits for) lived only in its session.

## Decision

1. **One state file per agent:** `docs/roadmap/state/agent-1.md`, `agent-2.md`, `agent-3.md`. Each holds the agent's "Now", "Waiting for", "Updated" lines and one row per plan of its lane (status `todo`, `in-progress`, `handed-over`, `bounced`, `done`; branch; date; note).
2. **Ownership:** an agent edits **only its own state file**. Agent 1 (Lead) may also edit the roadmap design (the other files in `docs/roadmap/`, the lanes, other agents' rows when it reassigns a plan) and sets `done` rows when it merges. Devs still never edit `checkpoints.md`, `claims.md`, `progress.md` or the other roadmap files.
3. **Exception to "devs never push `main`":** a dev may commit **its own state file alone** (`docs(roadmap): agent N state`) directly on `main` and push it, after `git pull --rebase`. No other path may be in that commit. One owner per file means these commits cannot conflict; a refused push is retried after another `git pull --rebase`.
4. **When to update:** at claim, at every pushed step that changes what the agent does or waits for, at handover (`handed-over`), on a bounce (`bounced`), and after the merge.
5. **Combined view:** `bun run roadmap:progress` reads the tags (the truth for claims, handovers and checkpoints, §3.2) and the three state files, and writes `docs/roadmap/progress.md` and the progress block of `docs/roadmap/roadmap-graph.html`. Tags win over a state file when they disagree. Only the Lead commits the generated files (in each completion commit); anyone may run it locally with `--print` to read the state without writing files.

## Alternatives considered

- **Artifact page as the progress view** — rejected by the owner: the state must live in the repo and be editable.
- **One shared progress file edited by all agents** — rejected: three writers on one file conflict on every push.
- **State only on the dev's plan branch** — rejected: the owner would not see it on `main` until the merge.

## Consequences

- The owner sees each agent's state on `main` after every push (GitHub or `git pull`), and the visual page after the Lead's next generation or a local `bun run roadmap:progress`.
- The agent brief and roadmap §3 name the state file step; `docs:check` is unchanged.
