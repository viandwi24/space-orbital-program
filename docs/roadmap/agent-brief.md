# Agent brief (read at every session start)

You are one of three developer agents. Each runs on its own computer, in its own clone, and they share one git remote. Your number comes from the owner's prompt. **If the prompt gives no number, ask which agent you are and do nothing else.**

| Agent | Role | Machine | Branch prefix | Ports |
|---|---|---|---|---|
| 1 | Lead | MacBook Pro M5 | `lead/` | 5200–5209 |
| 2 | Dev B | MacBook Pro M2 13" | `devb/` | 5210–5219 |
| 3 | Dev C | Linux Mint, 6 CPU, 8 GB | `devc/` | 5220–5229 |

## Every session

1. **Guard:** run your machine's resource check (roadmap §2). If a stop condition holds, clean up first.
2. **Sync:** `git fetch origin --tags --prune`; `git switch main && git pull --ff-only`. Read `docs/roadmap/checkpoints.md`, your state file `docs/roadmap/state/agent-<N>.md` and your lane (roadmap §4.2).
3. **Pick:** your open claim or `bounce/` first. Otherwise take the first task in your lane whose WAIT checkpoints all exist as tags and that has no `claim/<NNN>` tag.
4. **Claim:** branch `<prefix>/<NNN>-<slug>` from `origin/main`. The claim commit sets the plan `in-progress`, owner `"Agent N"`, and the same status in its STATUS row. Push the branch, then push the tag `claim/<NNN>`. If the push is refused, pick again. Then update your state file (step 9).
5. **Blocked:** do your while-waiting work (roadmap §4.4), or stop and report what you wait for.
6. **Work** by `AGENTS.md`, `CLAUDE.md` and `docs/plans/README.md`:
   - Change only the contracts in your plan's Touches.
   - Use ADR numbers from your range (§3.7).
   - Stage files with explicit `git add <paths>`, and push after every step.
   - Run targeted tests while iterating, and `bun run check:affected` at the end. Never the full suite: CI runs it on your handover tag (ADR 0126).
7. **Hand over:** rebase on `origin/main`, run `bun run check:affected` (plus your plan's own e2e file on one engine, if it names one), write the journal entry, then push the annotated tag `ready/<NNN>` with the template of roadmap §7.1. Leave the plan `in-progress`. CI then runs the full suite on that commit; move on to your next task. A `refs/ci/fail/<sha>` for it means Agent 1 will bounce it: look at the Actions run and fix it first.
8. **After the merge** (a new `cp/*` tag): delete your branch, clean up, and go back to step 1.
9. **State file (ADR 0112):** keep `docs/roadmap/state/agent-<N>.md` current: **Now**, **Waiting for**, **Updated** and your plan's row (`in-progress` at claim, `handed-over` at handover, `bounced` on a bounce). Update it at claim, at every pushed step that changes what you do or wait for, at handover and after the merge. Commit it **alone** on `main`: `git switch main && git pull --rebase`, edit, `git add docs/roadmap/state/agent-<N>.md`, commit `docs(roadmap): agent <N> state`, `git push origin main` (on a refusal: `git pull --rebase` and push again), then switch back to your branch. Never put another path in that commit.

Never push `main`, except a commit that changes only your own state file (step 9). Never edit another agent's state file. Never create `cp/*` or `bounce/*` tags. Never edit `checkpoints.md`, `claims.md`, `progress.md`, the other roadmap files or STATUS beyond your plan's row. Never use `gh`.

## If you are Agent 1 (Lead, M5)

- **Merge queue first.** Every session, and at every natural break (at most every 30 minutes), merge the oldest `ready/*` handover with the checklist in roadmap §7.2. Merge only with `refs/ci/pass/<sha>` for the handed-over commit (roadmap §7.2 step 4). Publish its `cp/*` tag and update `checkpoints.md`, `claims.md` and `docs/STATUS.md`; set the plan's row in the dev's state file to `done`, run `bun run roadmap:progress` and commit `progress.md` and `roadmap-graph.html` in the same completion commit. You may also edit the roadmap design files (ADR 0112). Then continue your own lane: 077, 078, 095, 090, 068, 091, 113, 122, 096, 109, 097, 071, 125, 128, 070.
- **Kickoff, once:** push `main` with `docs/roadmap/` and tag `cp/f0-kickoff`. 077 is yours alone: make `cp/f1-077-world` land fast, because all three lanes wait for it.
- **M5 criteria:** run every criterion marked ¹ and every renderer frame budget at merge, on a quiet machine, by the journal 054 method.
- **Coordination:**
  - Hand out save-format numbers.
  - Accept or defer contract requests.
  - Reassign stalled claims (roadmap §8).
  - Tag the phase gates `cp/fN-done` after the 3-engine e2e (ask Agent 3 for the Firefox run) and the ADR 0108 review.
- **Guard:** up to 3 workers. During a measurement run nothing else: no other tab, no other worker, no server except the one being measured.

## If you are Agent 2 (Dev B, M2 13")

- **Lane:** `apps/web` screens and HUD, plus 081, 084, 085 and the sim side of 102, 100, 105, 127, 130, 131, 063. The full order is in roadmap §4.2. Your first tasks need only `cp/f0-kickoff`: 086 tokens, then 074 rename.
- **Your plans are on the critical path.** Every other lane waits on your lane, so do not stall: hand over early, and split M plans into model and UI worktrees where §4.5 allows.
- **Guard:**
  - At most 2 workers, 1 server, 1 WebGL tab and 1 build at a time.
  - Check `pmset -g therm`: if `CPU_Speed_Limit` is below 80, drop to one worker.
- **E2E:** Chromium or WebKit, one engine at a time.
- **No frame-budget numbers for acceptance**, except the M2 row of plan 066. Measure it plugged in, after 10 minutes idle.

## If you are Agent 3 (Dev C, Linux 6 CPU / 8 GB)

- **Lane:** headless `core`, `kepler`, `sim`, `sdk` and `mods/*`: 079, 075, 082, 083, 080, 110, 092, 098, 106, 103, 114, 104, 107, 067, 123, 099, 101, then comms 116, 117, 119, 120, 121, then 126, 124, 129. The full order is in roadmap §4.2. Your first task needs only `cp/f0-kickoff`: 079 `definePatch`.
- **You own many contract plans** (tick, data items, objectives, crew, science, comms). Change exactly what each plan's Touches lists. Reserve a save-format number with Agent 1 before you write a migration.
- **Guard:**
  - At most 2 workers, and only one of them building, running `apps/web` vitest or a browser.
  - Never run a build and a browser together.
  - Stop if available memory is under 1 GB, swap use is over 1 GB, or load stays over 6 for 5 minutes.
- **E2E:** Firefox or Chromium headless, one at a time, only before a handover.
- **Never own a renderer look or performance criterion.** Write such numbers as "indicative" and leave the real check to Agent 1.
