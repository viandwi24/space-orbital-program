# Worker brief for the release roadmap (plans 200–253)

This is the brief that each worker session reads first. The coordinating session starts workers with `Baca docs/roadmap/worker-brief.md. Kamu adalah Worker <X>.` Workers report to the owner in Bahasa Indonesia.

## Machine guard (always on)

The machine is a 10-core MacBook Pro M5 with 16 GB RAM. It is also the owner's desktop. **It must never lag or freeze.**

### The pause flag (decided by the coordinator, not the owner)

The coordinating session runs a watchdog that writes a sample every 30 s to `/tmp/orbital-machine.log`. Each sample records:
- free memory %;
- swap used;
- load;
- the macOS CPU speed limit.

It creates **`/tmp/orbital-pause`** after 3 bad samples in a row and removes it after 6 good ones. A sample is bad when any of these holds:
- free memory < 15 %;
- swap > 8 GB **and** free memory < 30 % (macOS keeps swap used long after memory frees up, so swap alone means nothing);
- load > 10;
- CPU speed limit < 80.

**Before every step and before every heavy job**, wait while the flag exists: `while [ -e /tmp/orbital-pause ]; do sleep 60; done`. While paused, stop any running server or browser tab of yours. Never ask the owner whether the machine is busy: the watchdog and the coordinator decide.

### Heavy jobs and the lock

These count as **heavy jobs**:
- `vite build` / `bun run build`
- any Playwright e2e
- the web vitest run
- `bun run typecheck`
- the full `bun test`

Run a heavy job only while holding the machine-wide lock, so that only one runs at a time across all workers:

```sh
until mkdir /tmp/orbital-heavy.lock 2>/dev/null; do sleep 20; done
# heavy job here, always prefixed with: nice -n 10
rmdir /tmp/orbital-heavy.lock
```

- If the lock directory is older than 30 minutes, it is stale. Remove it, and say so in the plan's Log.
- **Always release the lock**, even when the job fails.

### Check the machine before every heavy job

Run these first, and **wait 2 minutes and check again** while any limit is exceeded:

| Check | Command | Limit |
|---|---|---|
| Free memory | `memory_pressure -Q` | "System-wide memory free percentage" must be ≥ 20 % |
| Load | `sysctl -n vm.loadavg` | 1-minute load ≤ 8 |

### Other rules

- **Light jobs** (targeted `bun test <pkg/file>`, one vitest file, `docs:check`, lint) need no lock, but still run under `nice -n 10`.
- **Playwright:** one engine (Chromium) and `E2E_WORKERS=1`. Use your own port range: Worker A 5230–5239, Worker B 5240–5249, Worker C 5250–5259.
- **Browser and servers:**
  - Only the built-in browser pane, at most one tab, and close it after use. Screenshots as JPG.
  - Never use the owner's Chrome, Brave or Claude in Chrome.
  - Stop every dev or preview server you started before ending a turn.
- **Subagents:** no background subagents, except at most one read-only research agent.
- **Where you work:** only in your own git worktree. **Never** touch, switch or stash the owner's checkout at `/Users/solpochi/Projects/oss/space-orbital`, which stays on `main`.

## Machines and workers (since 2026-10-19)

| Worker | Machine | Ports | Machine guard |
|---|---|---|---|
| A, B, C | Agent 1: MacBook Pro M5 (owner's desk, coordinator session) | A 5230–5239, B 5240–5249, C 5250–5259 | watchdog + `/tmp/orbital-pause` as above |
| D | Agent 2: MacBook Pro M2 13" | 5260–5269 | no watchdog: before a heavy job check `memory_pressure -Q` free ≥ 20 %, 1-min load ≤ 6, `pmset -g therm` CPU_Speed_Limit ≥ 80; keep it plugged in |
| E | Agent 3: Linux Mint, 6 CPU, 8 GB | 5270–5279 | no watchdog: before a heavy job check `MemAvailable` in `/proc/meminfo` ≥ 25 % of `MemTotal`, 1-min load in `/proc/loadavg` ≤ 4; never a build and a browser at once |

Every machine uses its **own** `/tmp/orbital-heavy.lock` (one heavy job at a time per machine). The queues below are the owner-approved split; the coordinator changes them, nobody else.

| Worker | Queue (in order) |
|---|---|
| A | 219 → 218 → 220 |
| B | 214 → **233** → 235 → 236 |
| C | 224 → 226 → 234 → moon-shot TWR fix → 223 → 230 |
| D | 225 → 227 → 228 |
| E | 231 → 229 |
| A | **238** (audit bug fixes) → **251** → **252** (graphics, in v1.0.0) → 244 → 243 |
| C | **237** → **239** (audit bug fixes) → **253** (graphics governor, in v1.0.0) → 247 → 248 → 250 |
| D | 240 → 241 → 242 (v1.1 wave; taken by Worker C while D is not running, see below) |
| E | 245 → 246 → 249 (v1.1 wave; taken by Worker B while E is not running, see below) |
| B | 232 release QA, last (after 237–239 and the graphics plans 251–253); then the shared list |

## Picking work

1. **Sync before every pick and every merge:** `git fetch origin --tags --prune --prune-tags`, then `git switch main && git pull --ff-only` in your main clone (or `git rebase origin/main` on your branch). Read `docs/roadmap/release-roadmap.md` and open `docs/roadmap/release-roadmap.html` if you want the graph.
2. **Your queue first:** take the first plan in your queue that is not `done` and has no claim by someone else.
3. **Then the shared list:** when your queue is empty, take the lowest-numbered plan that is `draft`/`ready`, has all `depends` done on `origin/main`, has no `claim/NNN` tag, and is **not in another worker's queue** (unless that worker's queue is finished). If none, help with nothing and report (step 5).
4. **Claim it with your name:** `git tag -a claim/NNN -m "Worker X (machine)" origin/main && git push origin claim/NNN`. A refused push means someone else has it: pick again. The annotated message is how the roadmap page and the other workers see who works on what.
5. **Waiting for another worker:** if your next plan depends on a plan another worker holds, run a background loop that does `git fetch origin --tags` every 10 minutes and continues when the dependency's `docs(plan-NNN): complete` commit is on `origin/main`. Meanwhile take any other free plan; if there is none, end your turn with one Indonesian line saying what you wait for.
6. **Ready and CI tags** (`ready/NNN`, `refs/ci/pass|fail/<sha>`) work as before; delete your `claim/NNN` and `ready/NNN` after the merge so the state stays true.

## Batch mode for the last release plans (owner's order, 2026-10-20)

The owner wants 237, 238, 239 and the release finished as fast as possible, with less waiting on the laptop's single heavy lock. Until `v1.0.0` is tagged, these rules replace "Check" and "Hand over" below:

1. **Code first, all in parallel.** Each worker finishes its plan's code and its own unit tests on its `rel/NNN-*` branch. Locally run only light checks:
   - targeted `bun test <files>` / one vitest file;
   - `docs:check`;
   - the typecheck of the package you changed.

   No local e2e and no `check:affected --full`. Push the branch and the `ready/NNN` tag: CI (on GitHub, not this laptop) runs lint, typecheck, unit tests and build. Worker C writes 239 now, without waiting for 237 to merge.
2. **One integration run.** Worker B builds `rel/integration-v1` from `origin/main` and merges, in order:
   - `rel/237-*`, `rel/238-*`, `rel/239-*`;
   - the QA fixes from `rel/232-release-qa`.

   B then runs the heavy checks **once** on it, under the lock:
   - `check:affected --full --build`;
   - the full e2e on Chromium, then Firefox, then WebKit (`E2E_WORKERS=1`, one engine per lock job).

   B starts as soon as all three branches have `refs/ci/pass`. A conflict or a red test goes back to the plan's owner with the file and the failing test. The owner fixes it on their branch, and B re-merges and reruns **only the failing files**.
3. **Merge in one go.** When the integration run is green, each owner rebases on `origin/main` and fast-forwards their plan with its `docs(plan-NNN): complete` commit, in the order 237 → 238 → 239. No further e2e is needed: the integration run covered the merged code. If a rebase changes code, rerun only that plan's unit tests. B then finishes 232.
4. **No e2e runs on stale code.** Do not run the full e2e on `main` before the integration branch exists; its result would have to be redone.

**Graphics in v1.0.0 (251–253, owner's order 2026-10-20):** phases 0 and 1 of `refs/graphics-performance/`. Measurements are heavy jobs on a quiet M5 (load ≤ 3, plugged in, no e2e running): take the lock and wait for quiet. They form the second integration batch after 237–239.

**v1.1 wave (240–250, owner's order 2026-10-20):** they do not block `v1.0.0`. Each owner refines its draft against current main before claiming. Workers D (M2) and E (Linux) run their own Chromium e2e on their own machine; Workers A and C on the M5 follow batch mode (light checks, CI, then one integration e2e run per batch).

## E2E paused (owner's order, 2026-10-20, until the owner says otherwise)

The owner paused all local Playwright e2e ("sementara skip dulu aja sampai saya bilang kita aktifkan lagi"). Until the owner turns them back on, these rules apply:
- **No e2e on any machine:** Chromium, Firefox and WebKit, plan e2e and integration runs alike. Each plan's e2e acceptance line stays unticked, with "(e2e paused by the owner, 2026-10-20)".
- **What a merge needs:**
  - the plan's unit tests;
  - `docs:check`;
  - `refs/ci/pass` on `ready/NNN`. CI on GitHub runs lint, typecheck, unit tests and build; its informational smoke e2e runs off this laptop and may stay.
- **Merge order:** no integration e2e batch. Each plan fast-forwards to main as soon as its CI passes, one at a time, after a rebase.
- **Plan 232:** the full e2e and the Firefox/WebKit gates are deferred. Record them as a known issue of v1.0.0 ("full e2e not run on Firefox and WebKit, nor after 251–253"), not as a pass.
- **Graphics measurements are not e2e:** plans 251–253 still take their measurements under the lock.

## Work everything, push, no e2e (owner's order, 2026-10-20, evening)

The owner's words: "kerjakan semua terus push, e2e nya sementara diskip dulu, unit test biasa aja sesuai fitur yang terdampak".
- **Tests:** locally run only the unit tests of the packages and files a plan touches (`bun test <files>`, one vitest file, or `check:affected` without `--full` and without `--e2e`). CI runs everything else. E2E stays paused (section above).
- **Keep going:** each worker works its queue to the end and merges each plan as soon as its CI passes. No waiting for batches.
- **Queues while Workers D and E are not running:**
  - Worker B takes E's queue (245 → 246 → 249) once its 232 handover to the owner is done.
  - Worker C takes D's queue (240 → 241 → 242) after 253, 247, 248 and 250.
  - If D or E come online, they take whatever is still unclaimed. A claim tag always wins.

## Doing a plan

**UI fixes come first (owner's rule, ADR 0222):** when the coordinator reports that a screen you built is off the design package (`refs/space-orbital-program-ui-v2/`), finish and merge your current plan, then fix that screen (plan 233 and the like) before taking any other plan. Always compare UI work with the matching `.dc.html` source and `docs/BASE_LAYOUT.md`.

**One plan at a time (owner's rule):** finish a plan, merge it into main, then start the next. Never keep two of your own plans open at once, and never leave a finished plan unmerged.

1. **Branch and refine.** Create the branch `rel/NNN-<slug>` from `origin/main` in your worktree. Refine the draft to `ready`: check Steps and Acceptance criteria against the code. Then set it to `in-progress` with `owner: "Worker X"`.
2. **Implement.** Follow `AGENTS.md`, `CLAUDE.md` and `docs/plans/README.md`. Commit with explicit `git add <paths>`, in the style of `docs/conventions/code-style.md`. Push the branch after every step.
3. **Check.** Run targeted tests while iterating. Before handover, run `bun run check:affected` under the lock, plus the plan's own e2e file on Chromium (ADR 0126).
4. **Hand over.** Push the annotated tag `ready/NNN`. CI then runs the full suite. Wait for `refs/ci/pass/<sha>` with `git ls-remote origin 'refs/ci/*/<sha>'`, polling at most every 3 minutes with a background loop.
   - **`fail`:** read the Actions run, fix it, and tag again.
   - **No result after 40 minutes:** run `bun run check:affected --full` under the lock as the fallback.
5. **Merge to main yourself.**
   - Rebase on `origin/main`. If the rebase touched code, run `check:affected` again.
   - Add the completion commit `docs(plan-NNN): complete`:
     - plan `status: done`;
     - STATUS row set to `done`;
     - journal `docs/journal/NNN-<slug>.md`;
     - the `docs:check` pass.
   - Run `bun run roadmap:release` and include `docs/roadmap/release-roadmap.html` in the completion commit, so the visual roadmap shows the new state. Push to main as a fast-forward: `git push origin HEAD:main`. If it is refused, rebase and repeat.
   - Delete the `claim/NNN` and `ready/NNN` tags and the plan's `refs/ci/*` refs.
6. **Report.** Write one Indonesian line to the owner, then take the next plan. **Do not stop while work remains.** End a turn only when nothing is free (Picking work, step 5) or when you are blocked.

## Owner decisions

- Defaults follow `refs/rancangan-terpadu.md` §15 and the ADRs 0200–0210 ("default per owner review").
- Do not ask the owner about a default. Note it in the Log instead.
- Only ask when a plan cannot proceed without a human, such as a `[manual]` check. In that case, set the plan to `blocked` with the checklist and move on.
