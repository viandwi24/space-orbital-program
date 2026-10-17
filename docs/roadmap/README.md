# Team roadmap — entry point for the three developer agents

This folder holds the plan for building the foundation roadmap (plans 063, 065 to 131) with **three developer agents on three separate computers**. Start here; everything an agent needs to find its next task is reachable from this page.

| File | What it is |
|---|---|
| [`team-development-roadmap.md`](team-development-roadmap.md) | the roadmap: machines, resource guards, git protocol, lanes and swimlanes, checkpoints, estimates, handover, risks |
| [`agent-brief.md`](agent-brief.md) | the short brief each agent rereads at every session start |
| [`checkpoints.md`](checkpoints.md) | the checkpoint register (which plans are merged, as tags `cp/*`) |
| [`claims.md`](claims.md) | how a task is claimed (tags `claim/*`) and the Lead's mirror of open claims |
| [`roadmap-graph.html`](roadmap-graph.html) | visual view for the owner (open in a browser): flow graph of who runs first and what runs in parallel, stages, swimlanes, critical path. Its data is copied from §4.3 and §4.5 of the roadmap; when the schedule changes, update both |

## The three agents

| Agent | Role | Machine | Branch prefix | Port range |
|---|---|---|---|---|
| **Agent 1** | Lead: base contracts, renderer and GPU work, M5 measurements, reviews, merges, checkpoints, `docs/STATUS.md` | MacBook Pro M5 | `lead/` | 5200–5209 |
| **Agent 2** | Dev B: `apps/web` screens and HUD, light renderer work, the M2 measurement row | MacBook Pro M2 13" | `devb/` | 5210–5219 |
| **Agent 3** | Dev C: headless `core`, `kepler`, `sim`, `sdk`, `mods/*` systems and tests | Linux Mint, 6 CPU, 8 GB | `devc/` | 5220–5229 |

The numbers never change. "Lead", "Dev B" and "Dev C" are the same agents as 1, 2 and 3.

## Start prompts (the owner pastes one line)

| Purpose | Bahasa Indonesia | English |
|---|---|---|
| First session, Agent 1 | `Baca docs/roadmap/README.md. Kamu adalah Agent 1 (Lead).` | `Read docs/roadmap/README.md. You are Agent 1 (Lead).` |
| First session, Agent 2 | `Baca docs/roadmap/README.md. Kamu adalah Agent 2 (Dev B).` | `Read docs/roadmap/README.md. You are Agent 2 (Dev B).` |
| First session, Agent 3 | `Baca docs/roadmap/README.md. Kamu adalah Agent 3 (Dev C).` | `Read docs/roadmap/README.md. You are Agent 3 (Dev C).` |
| Later session | `Lanjutkan pekerjaanmu sesuai docs/roadmap/README.md. Kamu adalah Agent 2.` (use 1, 2 or 3) | `Continue your work per docs/roadmap/README.md. You are Agent 2.` (use 1, 2 or 3) |
| Status report | `Laporkan status lane-mu dan checkpoint yang kamu tunggu.` | `Report the status of your lane and the checkpoints you are waiting for.` |

On a status prompt the agent answers, without changing anything: its agent number and machine, the current resource check, its claimed plan and step, its handovers waiting for merge (`ready/*` tags), the next tasks in its lane and, for each, the checkpoints it still waits for.

**If the prompt names no agent number, ask the owner which agent you are (1, 2 or 3) and do nothing else until answered.** Never guess from the machine: two Macs look alike.

## Self-routing procedure (follow it in order, every session)

You need no instruction beyond the start prompt. Repo rules still apply: `AGENTS.md`, `CLAUDE.md`, `docs/plans/README.md`, `docs/conventions/*`.

**(a) Machine guard.** Find your machine in [roadmap §2](team-development-roadmap.md#2-resource-guards-per-machine) and run its resource check. If a stop condition holds, clean up (close browsers, stop servers you started) and recheck before any work. Use no more sub-workers, servers or browsers than your guard allows.

**(b) Sync.** In your own clone:

```sh
git fetch origin --tags --prune
git switch main && git pull --ff-only
git tag -l 'cp/*'                                   # checkpoints that landed
git ls-remote --tags origin 'refs/tags/claim/*'     # who claimed what
git ls-remote --tags origin 'refs/tags/ready/*' 'refs/tags/bounce/*'
```

Read [`checkpoints.md`](checkpoints.md) (status and the "Reassignments" section) and your lane in [roadmap §4](team-development-roadmap.md#4-schedule).

**(c) Pick.** If you have an open claim that is not handed over, or a `bounce/<NNN>` tag on one of your plans, continue that first. Otherwise take the **first task in your lane** (in lane order) such that every checkpoint in its "WAIT for" column exists as a tag (`git rev-parse -q --verify refs/tags/<cp>`) and no `claim/<NNN>` tag exists for it. A task reassigned to you in `checkpoints.md` "Reassignments" counts as in your lane at the position given there. Never take a task from another lane without such a line.

**(d) Claim.** Atomic across the three clones through the shared remote (a tag push is refused if the tag exists):

```sh
git switch -c <prefix>/<NNN>-<slug> origin/main          # e.g. devb/087-worlds-screen
# refine the draft if needed (Steps, measurable criteria), then in the plan file:
#   status: in-progress   owner: "Agent N"   updated: <today>
# and the same status in that plan's row of docs/STATUS.md (the only STATUS edit a dev makes)
bun run docs:check
git add docs/plans/<NNN>-*.md docs/STATUS.md
git commit -m "docs(plan-NNN): claim (Agent N)"
git push -u origin <prefix>/<NNN>-<slug>
git tag claim/<NNN> && git push origin claim/<NNN>         # refused = someone else has it: delete your branch, go back to (c)
```

**(e) Blocked?** If no task in your lane is ready, do the "while waiting" work of your lane ([roadmap §4.4](team-development-roadmap.md#44-while-waiting-work)): refine upcoming drafts (body only, status stays `draft`), research, test harnesses that change no contract. If none is useful, stop and report which checkpoints you wait for (the status-report answer). Re-check (b) every 10 minutes at most while waiting, or when the owner relays that a checkpoint landed.

**(f) Execute** the plan by the repo rules: the plan's Steps and Acceptance criteria, official scaffolding, research recorded, ADR before any undecided design choice (ADR numbers from your range, roadmap §3.7), commits `type(scope): summary` with explicit `git add <paths>`. Change only the shared contracts your plan's **Touches** lists; anything else is a contract request (roadmap §3.6). Push your branch after each step. Targeted tests while iterating; the full suite once before handing over.

**(g) Hand over** with the template of [roadmap §7](team-development-roadmap.md#7-handover-and-merge): rebase on `origin/main`, run the full checks, write the journal entry, then push an annotated tag `ready/<NNN>` whose message is the handover. Leave the plan `in-progress`; the Lead sets `done`.

**(h) After the merge** the Lead publishes `cp/f<phase>-<NNN>-<slug>`, deletes `claim/<NNN>` and `ready/<NNN>`, and updates `checkpoints.md` and `claims.md`; you change nothing there. Delete your merged branch (`git push origin --delete <branch>`), clean up (servers, browsers, scratch builds, extra worktrees) and go back to (a). If the Lead pushes `bounce/<NNN>` instead, read its message, fix on the same branch, push, and re-tag `ready/<NNN>` (`git tag -f -a ready/<NNN>` then `git push -f origin ready/<NNN>`).

### What Agent 1 (Lead) does differently

- Before its own lane, every session: process the merge queue (`ready/*` tags, oldest first) with the merge checklist (roadmap §7.2), publish each checkpoint tag, update `checkpoints.md`, `claims.md` and `docs/STATUS.md`, and push `main`. Merges take priority over its own plan; check the queue at every natural break (at most every 30 minutes).
- Owns `main`: the only agent that pushes to `main` and creates `cp/*` and `bounce/*` tags.
- Runs every acceptance criterion that names the M5 (footnote ¹ in the schedule) during the merge.
- Watches claims: a claim older than twice its plan's estimate with no pushed progress is followed up through the owner (roadmap §8).
- Publishes `cp/f0-kickoff` first (roadmap §4.1), and the phase gates `cp/fN-done`.

### No shared remote yet

The workflow needs one shared git remote (`origin`) that all three machines can push to: a private GitHub repository, or any host reachable by ssh (for example a bare repository on the Lead's Mac: `git init --bare ~/space-orbital.git`, then `git remote add origin ssh://<lead-host>/~/space-orbital.git` on the other two). **The owner sets it up once**; plain `git` only, no `gh`. Until it exists, fall back to bundles: a dev sends `git bundle create agent2-087.bundle main..devb/087-worlds-screen` (with `main` updated from the Lead's last bundle) plus the handover text as a file; the Lead fetches it with `git fetch agent2-087.bundle devb/087-worlds-screen:devb/087-worlds-screen` and returns `main` as `git bundle create main.bundle main --tags`. Without a remote there are no claim tags: agents take only the tasks of their own lane, in lane order.
