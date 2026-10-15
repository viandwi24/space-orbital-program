# CLAUDE.md

Read `AGENTS.md` first — it is the canonical agent guide for this repo. This file only adds Claude Code specifics.

## Session start

1. Read `AGENTS.md`, then `docs/STATUS.md`, then your plan in `docs/plans/`.
2. Create a task list from the plan's **Steps** and **Acceptance criteria** before writing code.
3. Before running any scaffold or CLI command, fetch the tool's official docs for the current syntax and version. Record the check in `docs/research/stack-versions.md`.

## While working

- Keep `docs/STATUS.md` and the plan file's `status:` field current; the human may check in mid-session.
- When a design question comes up that a plan does not answer, write the ADR (`docs/decisions/`) before implementing, and link it from the plan.
- Prefer `Read`/`Edit`/`Write` for files; use `Bash` for commands that must run (`bun ...`, `git ...`).
- Do not use the `gh` CLI. Use plain `git`. Commit at the end of each plan with the message format in `docs/conventions/code-style.md`.

## Session end

Run the docs update checklist in `docs/conventions/docs-maintenance.md`, then `bun run docs:check`, `bun test`, `bun run typecheck`, `bun run build`. Report which acceptance criteria passed, with the command output that proves it.
