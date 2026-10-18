# Three-agent development roadmap

**Written:** 2026-10-17 · **Covers:** every plan not `done`: the foundation roadmap F1 to F6 (plans 074 to 131, ADRs 0094 to 0108) and the realigned drafts 063, 065 to 073 · **Entry point:** [`README.md`](README.md) (start prompts and the self-routing procedure)

Three developer agents work on **three separate computers**, each in its own clone, on its own branches, through one shared git remote. Agent 1 (Lead) integrates. Inside one computer an agent may run a few parallel sub-workers, within that machine's resource guard (§2). This is different from the old single-machine parallel workers, which shared one checkout and one CPU and caused swept commits, a truncated `docs/STATUS.md`, lost `.claude/launch.json` entries and dev-server reloads (journals 048, 050, 054). Separate clones and branches remove those failure modes. The guards below stop the remaining ones: memory, heat, and GPU numbers taken on a busy machine.

## 1. Team and machines

| | Agent 1 — Lead | Agent 2 — Dev B | Agent 3 — Dev C |
|---|---|---|---|
| Machine | MacBook Pro M5 (strongest CPU and GPU) | MacBook Pro M2 13" (throttles under sustained load; WebGL fine but slower) | Linux Mint, 6 CPU cores, 8 GB RAM, no Apple GPU (WebGL may be software) |
| Role | base contracts, renderer and GPU plans, reviews, merges, checkpoints, `docs/STATUS.md` | `apps/web` screens and HUD, light renderer work, sim plans with a screen | headless `core`, `kepler`, `sim`, `sdk`, `mods/*`: tick, data, economy, science, crew, contracts, comms model |
| Should do | frame-budget measurements (journal 054 method, ADR 0053 budget: `medium` ≤ 13.3 ms, `high` ≤ 16.7 ms sync), every criterion that names the M5, screenshots for the refs self-review, WebKit and Chromium e2e, final 3-engine runs at phase gates | vitest component work, Chromium and WebKit e2e (one engine at a time), screenshots for its own screens, the **M2 row of plan 066** (an ADR 0025 budget machine) | `bun test` suites, benchmarks marked "indicative", career-bot runs, migration fixtures, Firefox and Chromium e2e headless (one at a time) |
| Should not do | long own plans while the merge queue waits | frame-budget numbers for any acceptance criterion except 066's M2 row; two browsers at once | own any renderer look or performance criterion; run a dev server and a build together; parallel builds |
| Own-plan load | ≈ 30 % of its time (merges take the rest) | full | full |

## 2. Resource guards per machine

Every agent runs its **resource check** at session start, before starting a build or a browser, and every 30 minutes while working. Sub-workers are extra agents or processes on the same machine. Each one works in its **own git worktree** (`git worktree add ../so-<branch>-w2 -b <branch>--w2`), on its own port from the agent's range, and never in the main checkout.

| Guard | Agent 1 (M5) | Agent 2 (M2 13") | Agent 3 (Linux 6c/8 GB) |
|---|---|---|---|
| Max concurrent sub-workers (incl. the main agent) | 3 | 2 | 2, only one of them running a build, vitest of `apps/web` or a browser |
| Dev/preview servers | 2 (one per worktree), never during a measurement | 1 | 1, only while an e2e or a check needs it |
| Browser tabs with WebGL | 2; exactly 1 (fronted, visible pane) during a frame measurement | 1 | 1 (headless) |
| Builds (`vite build`) at once | 2 | 1 | 1; never with a browser open |
| Playwright engines at once | 1 (`E2E_WORKERS=1`) | 1 | 1 |
| E2E engines it runs | Chromium (merge smoke), WebKit; all three at phase gates | Chromium, WebKit | Firefox, Chromium |
| Test cadence (ADR 0126) | targeted (`bun test packages/<pkg>`, one vitest file) while iterating; `bun run check:affected` before handover and at every merge; the full suite runs in CI, locally only at phase gates or as the fallback | same, never the full suite | same, never the full suite |
| Frame measurements | yes: production build (`NODE_ENV=development bun run build`), served by `apps/web/scripts/serve.ts` on its own port, no other sub-worker, no other tab, second page load, minimum over windows (journals 039, 050, 054) | only for plan 066 (plugged in, after 10 min idle, lid open) | never |

**Check commands**

```sh
# macOS (Agents 1 and 2)
memory_pressure | tail -1          # "System-wide memory free percentage: NN%"
sysctl vm.swapusage                # used = ...M
pmset -g therm                     # CPU_Speed_Limit (100 = not throttled)
uptime                             # load averages
vm_stat | head -5
ps -axo pid,rss,comm | sort -k2 -nr | head -8

# Linux (Agent 3)
free -h; uptime; nproc
sensors 2>/dev/null | grep -iE 'package|tctl|core 0'
ps -eo pid,rss,comm --sort=-rss | head -8
```

**Stop conditions** (pause new work, close browsers, stop servers and extra sub-workers, recheck after 5 minutes):

| | Agent 1 | Agent 2 | Agent 3 |
|---|---|---|---|
| Memory | free < 15 % or swap used > 4 GB | free < 15 % or swap used > 2 GB | available < 1 GB or swap used > 1 GB |
| Load | 1-min load > 12 for 5 min | 1-min load > 8 for 5 min | 1-min load > 6 (= `nproc`) for 5 min |
| Heat | `CPU_Speed_Limit` < 100 during a measurement (discard it, wait) | `CPU_Speed_Limit` < 80: drop to 1 worker until 100 | a core > 90 °C for 5 min: drop to 1 worker |
| Repeated (3 times in a session) | drop one sub-worker for the rest of the session | work single-threaded for the session | work single-threaded, and say so in the handover |

**Cleanup duties** (before a handover, before the session ends, and after any stop condition): stop every server you started (`lsof -nP -iTCP -sTCP:LISTEN | grep -E ':52[0-2][0-9]'`, then kill your own PIDs only); close Playwright and browser tabs; delete scratch build copies and `git archive` trees in the scratchpad; `git worktree remove` finished worktrees; leave no `vite dev` running on a machine that is about to measure.

## 3. Git and integration protocol

### 3.1 Remote and branches

- One shared remote `origin` (set up by the owner; README "No shared remote yet" has the bundle fallback). Plain `git`, never `gh`.
- `main` is written only by Agent 1. Devs never push to `main`, never create `cp/*` or `bounce/*` tags. **One exception (ADR 0112):** each agent commits its own state file `docs/roadmap/state/agent-N.md` alone on `main` and pushes it, so the owner sees its progress on every push. Only Agent 1 edits the other roadmap files (design) and commits the generated `progress.md`.
- One branch per plan, cut from the latest `origin/main`: `lead/<NNN>-<slug>`, `devb/<NNN>-<slug>`, `devc/<NNN>-<slug>`. Sub-worker branches add `--w2`, `--w3` and are merged by the agent into its plan branch before handover.
- Agents keep their branch linear. They rebase onto `origin/main` and never merge `main` into the branch. They rebase **(1)** before starting each plan (a new branch), **(2)** when a checkpoint lands that touches a package they edit, and **(3)** right before handover. They push after every step, so a crash or an offline machine loses nothing.
- Commits use the repo style (`docs/conventions/code-style.md`). Always use explicit `git add <paths>`, never `git add -A`.

### 3.2 Tags as the coordination channel (no server needed)

| Tag | Created by | Means |
|---|---|---|
| `claim/<NNN>` | the claiming agent | plan NNN is taken; points at the claim commit. The push is refused if the tag exists, so the claim is atomic. |
| `ready/<NNN>` (annotated) | the plan owner | the branch is ready to merge; the tag message **is** the handover (§7.1) |
| `bounce/<NNN>` (annotated) | Agent 1 | merge refused; the message says why. The owner fixes it and re-tags `ready/<NNN>`. |
| `cp/f<phase>-<NNN>-<slug>` (annotated) | Agent 1 | **checkpoint**: plan NNN is merged and verified on `main` |
| `cp/f<phase>-done`, `cp/f0-kickoff` | Agent 1 | phase gate; project kickoff |
| `cp/f<phase>-contract-<slug>` | Agent 1 | a mid-phase contract change landed (§3.6) |

**How a checkpoint is published:** the Lead first merges the branch into `main`. Then it adds one completion commit `docs(plan-NNN): complete`: the plan's `status: done`, its STATUS row, and a line in `checkpoints.md` with status `done`, the merge commit and the date. On that commit it runs `git tag -a cp/... -m "plan NNN merged"` and `git push origin main cp/...`. Last, it deletes `claim/<NNN>` and `ready/<NNN>` on the remote.

**How waiting agents learn of it:** `git fetch origin --tags` and `git rev-parse -q --verify refs/tags/<cp>` (README step b), polled at most every 10 minutes while waiting. The owner may also relay "cp/... landed" in the continue prompt. The tag is the truth; `checkpoints.md` is its readable register.

### 3.3 Plan lifecycle on branches

`draft` → (refined by the claiming agent on its branch) `ready` → `in-progress` with `owner: "Agent N"` in the claim commit → handover with status still `in-progress` → **`done` only in the Lead's completion commit on `main`**, after merge and verification. `docs:check` rejects `ready` and `in-progress` while a `depends` is not `done`. So an agent may set those statuses only after every dependency is merged, which the WAIT rule already guarantees. Pre-refining a later draft while waiting changes its body only, and its status stays `draft`. A second plan in progress on the same machine (a sub-worker) is owned by `"Agent N/w2"`.

### 3.4 `docs/STATUS.md` ownership

Only Agent 1 edits `docs/STATUS.md`: header, board notes, known issues, recent journal entries, "Next" sections. There is one exception that `docs:check` forces. A dev changes the **status cell of its own plan's row** in the claim commit, and adds a board row for a new draft plan it creates. On a conflict in STATUS during a merge, the Lead takes `main`'s file (`git checkout main -- docs/STATUS.md`) and re-applies only that plan's row. This is the "index blob from HEAD" lesson of the shared-checkout days. Devs keep everything else in their plan file (`## Log`) and their journal entry.

### 3.5 Package ownership per window (conflict avoidance)

Two agents never edit the same package area in the same window unless the table says it is append-only.

| Window | Agent 1 | Agent 2 | Agent 3 | Append-only shared areas |
|---|---|---|---|---|
| 1 (F1) | `core` save/schemas/world, rules (077, 078), economy (095), buildings (090) | `apps/web/src/lib/ui` tokens, `core/terrain`, `sim/terrain`, renderer site and shaders, navball (086, 084, 085), worlds route (087), HUD (088) | `core` plugin/registry, `sdk` patch, `sim` tick, data items, `kepler` provider (079, 082, 083, 080), part actions (110) | `sdk` index exports, `mods/stock` registration list, sim command union, `writing-a-mod.md` |
| 2 | renderer site/space center (091), planet pass (068), map system scope (113) | worlds, menus, hangar, dock, launch routes (089, 069, 093, 112, 094) | site templates (092), objectives, crew, science, comms model (098, 106, 103, 114) | same + `apps/web/src/lib/hud` (one component file per plan) |
| 3 | buildings levels, markets, EVA (096, 097, 109), Sun (122) | astronauts, missions, vessel panel, R&D, comms UI (108, 100, 111, 105, 115) | regions, crew sim, contracts, strategies, comms 2 (104, 107, 099, 101, 116) | same + `routes/administration` (A3 only: 099 then 101) |
| 4 | planet pass on other bodies (071), n-body (125), bases (128) | comms tools, range safety, reliability, replays, drafts (118, 127, 130, 131, 065, 063) | comms 3–6, agencies, Sol, discovery (117, 119, 120, 121, 126, 124, 129) | same |

### 3.6 Contract-change rule

Shared contracts: **core types and schemas, the save format (`formatVersion`, migrations, fixtures), the sim protocol (commands, events, snapshot), the SDK public API and `API_VERSION`, design tokens, the vessel design format, the mod manifest.**

- A plan changes only the contracts its own `## Touches` names. Only Agent 1, or the owner of the base plan that introduced a contract, changes it otherwise.
- Anyone else files a **contract request**: a `Contract request:` line in its plan Log and in the handover, or a message to the Lead through the owner if it blocks. The Lead accepts it as a small commit on `main`, tagged `cp/f<phase>-contract-<slug>`, or defers it. An accepted change is additive mid-phase. A breaking change needs an ADR and waits until open branches that touch the contract have merged.
- **Save format numbers** are reserved through the Lead: a plan that bumps `SimSave.formatVersion` (077 to 5; later 117, 119, 122 and any other that needs one) gets its number in `checkpoints.md` "Reserved numbers" before it writes the migration. When two bumps meet, the later merge renumbers.
- **`API_VERSION`**: an additive SDK change bumps the patch. At merge the Lead resolves a clash to `main`'s value plus one.

### 3.7 Number ranges (no collisions across clones)

| | Agent 1 | Agent 2 | Agent 3 |
|---|---|---|---|
| New ADRs | 0109–0139 | 0140–0169 | 0170–0199 |
| New draft plans (scope pushed out) | 132–159 | 160–189 | 190–219 |

The ADR index (`docs/decisions/README.md`) and the STATUS board are append-only for these rows. The Lead resolves their merge conflicts by keeping both sides.

## 4. Schedule

### 4.1 Kickoff (before any lane starts)

1. **Owner:** creates the shared remote and gives all three machines push access.
2. **Agent 1:** pushes `main` with this folder and tags `cp/f0-kickoff`.
3. **Agents 2 and 3:** clone, `bun install`, and run a baseline (`bun test`, `bun run typecheck`, `bun run docs:check`; Agent 2 also `bun run build`). They note the durations and peak memory for their first handover. Then they start their lane. Their first plans (086, 074; 079, 075) have no `depends` and wait only for `cp/f0-kickoff`.

The first base, 077 (world container, save format 5), is done by Agent 1 alone. Every world plan of F1 waits for `cp/f1-077-world`; the other two agents fill that time with the independent plans 086, 074, 079 and 075.

### 4.2 Lanes (lane order is the pick order of README step c)

**Agent 1 (Lead):** 077 world → 078 rules → 095 economy → 090 buildings → 068 terrain-aa → 091 space-center → 113 mission-center → 122 sun → 096 building-levels → 109 eva → 097 markets → 071 second-planet → 125 n-body → 128 bases → 070 comms-index

**Agent 2 (Dev B):** 086 tokens → 074 rename → 081 calendar → 084 sites → 087 worlds-screen → 088 hud → 085 orientation → 076 roadmap-page → 069 categories → 089 menus → 093 hangar → 112 dock → 094 launch → 102 milestones → 108 astronauts → 100 missions → 111 vessel-panel → 105 tech-tree → 115 comms-1-ui → 127 range-safety → 130 reliability → 118 comms-tools → 066 devices → 131 replays → 065 mod-models → 063 aeroplane → 072 script-panel → 073 phone

**Agent 3 (Dev C):** 079 patch → 075 licence → 082 tick → 083 data → 080 trajectory → 110 part-actions → 092 site-choice → 098 objectives → 106 crew → 103 science → 114 comms-1 → 104 regions → 107 crew-sim → 067 buoyancy → 123 elements → 099 contracts → 101 strategies → 116 comms-2 → 117 comms-3 → 119 comms-4 → 126 agencies → 120 comms-5 → 124 sol → 121 comms-6 → 129 discovery

### 4.3 Swimlanes

Times are agent-hours from kickoff, simulated with the estimates of §6. `≈a→b`: the plan starts at about `a`, and its checkpoint lands at about `b` (after the Lead's merge). `WAIT`: checkpoints from **other** agents that must exist first. A plan also waits for its own lane's earlier plans, which are merged by then. Phases overlap on purpose: a plan starts as soon as its `depends` are merged, not when its phase starts (Notes for the Lead, item 3).

#### Window 1 — F1 contracts (t 0 to ≈9 h)

| Step | Agent 1 — Lead (M5) | Agent 2 — Dev B (M2) | Agent 3 — Dev C (Linux) |
|---|---|---|---|
| 0 | kickoff: push `main`, tag `cp/f0-kickoff` | WAIT cp/f0-kickoff; clone, baseline | WAIT cp/f0-kickoff; clone, baseline |
| 1 | **077** world (M) ≈0.5→2.5 | **086** tokens (S) ≈0.5→1.9 | **079** patch (M) ≈0.5→2.2 |
| 2 | **078** rules (M) ≈2.5→5.0 | **074** rename (S) ≈1.6→3.0 | **075** licence (S) ≈2.0→3.2 |
| 3 | **095** economy (M) ≈5.0→7.0 WAIT cp/f1-082-tick | **081** calendar (S) ≈2.7→4.0 WAIT cp/f1-077-world | **082** tick (M) ≈3.0→4.8 WAIT cp/f1-077-world |
| 4 | **090** buildings (S) ≈7.0→8.5 WAIT cp/f1-084-sites, cp/f1-079-patch | **084** sites (M) ≈3.8→5.7 WAIT cp/f1-077-world | **083** data (M) ≈4.5→6.2 WAIT cp/f1-077-world |
| 5 |  | **087** worlds-screen (M) ≈5.5→7.3 WAIT cp/f1-077-world, cp/f1-078-rules | **080** trajectory (M) ≈6.0→7.8 WAIT cp/f1-077-world |
| 6 |  | **088** hud (M) ≈7.1→9.0 | **110** part-actions (S) ≈7.5→8.8 |
| 7 |  | **085** orientation (M) ≈8.8→10.7 | **092** site-choice (M) ≈8.5→10.2 WAIT cp/f1-084-sites, cp/f2-087-worlds-screen, cp/f2-090-buildings |

#### Window 2 — F2 worlds and Space Center, F3 bases start (t ≈9 to ≈18 h)

| Step | Agent 1 — Lead (M5) | Agent 2 — Dev B (M2) | Agent 3 — Dev C (Linux) |
|---|---|---|---|
| 1 | **068** terrain-aa (M) ≈9.0→11.0 WAIT cp/f1-084-sites | **076** roadmap-page (S) ≈10.4→11.8 | **098** objectives (S) ≈10.0→11.2 WAIT cp/f1-078-rules |
| 2 | **091** space-center (L) ≈11.2→14.8 WAIT cp/f1-086-tokens, cp/f2-087-worlds-screen | **069** categories (S) ≈11.5→13.0 | **106** crew (M) ≈11.0→12.8 WAIT cp/f1-078-rules |
| 3 | **113** mission-center (M) ≈14.8→17.5 WAIT cp/f1-080-trajectory, cp/f1-081-calendar, cp/f1-086-tokens | **089** menus (S) ≈12.6→13.9 WAIT cp/f1-075-licence | **103** science (L) ≈12.5→15.5 WAIT cp/f1-078-rules |
| 4 | **122** sun (L) ≈17.5→21.2 WAIT cp/f1-085-orientation, cp/f1-081-calendar | **093** hangar (M) ≈13.7→15.8 | **114** comms-1 (M) ≈15.0→16.8 WAIT cp/f1-084-sites |
| 5 |  | **112** dock (M) ≈15.3→17.2 | **104** regions (M) ≈16.5→18.2 |
| 6 |  | **094** launch (S) ≈17.0→18.5 WAIT cp/f2-091-space-center |  |

#### Window 3 — F3 career and F4 control (t ≈18 to ≈30 h)

| Step | Agent 1 — Lead (M5) | Agent 2 — Dev B (M2) | Agent 3 — Dev C (Linux) |
|---|---|---|---|
| 1 | **096** building-levels (M) ≈21.2→23.5 WAIT cp/f2-094-launch | **102** milestones (M) ≈18.1→20.0 WAIT cp/f1-082-tick | **107** crew-sim (L) ≈18.0→21.0 |
| 2 | **109** eva (L) ≈23.8→27.2 WAIT cp/f3-106-crew, cp/f3-103-science | **108** astronauts (M) ≈19.8→21.6 WAIT cp/f3-106-crew, cp/f2-091-space-center | **067** buoyancy (M) ≈20.5→22.2 WAIT cp/f3-095-economy |
| 3 | **097** markets (L) ≈27.2→30.5 | **100** missions (M) ≈21.4→23.3 WAIT cp/f3-098-objectives | **123** elements (M) ≈22.0→23.8 WAIT cp/f5-122-sun |
| 4 |  | **111** vessel-panel (M) ≈23.1→24.9 WAIT cp/f4-110-part-actions | **099** contracts (M) ≈23.5→25.2 WAIT cp/f3-095-economy, cp/f3-096-building-levels |
| 5 |  | **105** tech-tree (M) ≈24.7→26.6 WAIT cp/f3-103-science, cp/f3-095-economy, cp/f2-091-space-center | **101** strategies (M) ≈25.0→26.9 WAIT cp/f3-095-economy, cp/f3-096-building-levels |
| 6 |  | **115** comms-1-ui (M) ≈26.4→28.2 WAIT cp/f4-114-comms-1, cp/f4-113-mission-center | **116** comms-2 (M) ≈28.2→30.1 WAIT cp/f4-115-comms-1-ui |
| 7 |  | **127** range-safety (M) ≈28.0→29.9 WAIT cp/f2-092-site-choice, cp/f3-095-economy, cp/f1-078-rules, cp/f3-067-buoyancy |  |
| 8 |  | **130** reliability (L) ≈29.6→32.9 WAIT cp/f1-078-rules, cp/f3-095-economy, cp/f3-109-eva, cp/f2-090-buildings |  |

#### Window 4 — F4 comms and F5 real sky (t ≈30 to ≈41 h)

| Step | Agent 1 — Lead (M5) | Agent 2 — Dev B (M2) | Agent 3 — Dev C (Linux) |
|---|---|---|---|
| 1 | **071** second-planet (L) ≈30.5→34.0 | **118** comms-tools (M) ≈32.4→34.3 WAIT cp/f4-117-comms-3 | **117** comms-3 (M) ≈30.1→31.9 WAIT cp/f1-078-rules |
| 2 | **125** n-body (XL) ≈34.0→40.5 WAIT cp/f1-080-trajectory, cp/f5-123-elements | **066** devices (M) ≈34.0→36.0 WAIT cp/f2-091-space-center | **119** comms-4 (M) ≈31.9→33.6 |
| 3 | **128** bases (L) ≈40.5→44.5 WAIT cp/f2-092-site-choice, cp/f1-082-tick | **131** replays (M) ≈35.7→37.6 WAIT cp/f1-077-world | **126** agencies (L) ≈33.4→36.5 WAIT cp/f3-097-markets |
| 4 |  | **065** mod-models (M) ≈37.4→39.2 WAIT cp/f1-079-patch, cp/f2-090-buildings, cp/f4-110-part-actions, cp/f2-091-space-center | **120** comms-5 (M) ≈35.9→37.9 |
| 5 |  | **063** aeroplane (L) ≈39.0→42.2 WAIT cp/f2-091-space-center, cp/f4-110-part-actions | **124** sol (L) ≈37.4→40.4 WAIT cp/f5-071-second-planet |
| 6 |  |  | **121** comms-6 (S) ≈39.9→41.1 WAIT cp/f3-109-eva, cp/f3-108-astronauts, cp/f3-102-milestones |
| 7 |  |  | **129** discovery (L) ≈40.9→43.9 |

#### Window 5 — F6 frontier and human-gated drafts (t ≈41 to ≈46 h)

| Step | Agent 1 — Lead (M5) | Agent 2 — Dev B (M2) | Agent 3 — Dev C (Linux) |
|---|---|---|---|
| 1 | **070** comms-index (S) ≈44.5→44.8 WAIT cp/f4-114-comms-1, cp/f4-115-comms-1-ui, cp/f4-116-comms-2, cp/f4-117-comms-3, cp/f4-118-comms-tools, cp/f4-119-comms-4, cp/f4-120-comms-5, cp/f4-121-comms-6 | **072** script-panel (S) ≈41.8→43.1 |  |
| 2 |  | **073** phone (L) ≈42.9→46.1 |  |

### 4.4 While-waiting work

These tasks need no claim tag and change no contract. They run on a docs-only branch `<prefix>/prep-<topic>` and are handed over like a plan (`ready/prep-<topic>`).

| Agent | While waiting |
|---|---|
| 1 | review open `ready/*` handovers first; refine the next base drafts in its lane (097, 109, 122, 125); reserve save-format numbers; prepare the measurement scene list for 091 and 122 |
| 2 | refine its next drafts (bodies only); screenshots of the current screens as "before" images for the refs self-reviews (088, 089, 093); research for fonts and icons (`docs/research/`); vitest fixtures for screens that only read existing snapshot fields |
| 3 | refine its next drafts; the career-bot harness design note for 095 and its band (in the plan's Log); frozen save fixtures for coming migrations (taken from `main`); research for 116 (link budget sources), 123 (JPL Level A, lunar series) and 124 (Sol data) with dates |

### 4.5 All plans by phase

Columns: **Agent** (A1, A2, A3) · **Window** (start → checkpoint, hours) · **WAIT for** (all `depends`, as checkpoint tags) · **Sub-workers**: `solo` means one worker. `2 (model + UI)` means the plan may split into two worktrees along those package lines. One merges into the other before handover, and only one of them builds or opens a browser. `solo (GPU measure)` means no other worker may run on the machine while it measures. ¹ means an acceptance criterion names the M5 (a benchmark or a frame time): Agent 1 runs it at merge, and the dev's own number is "indicative". ² means the plan needs a person or a device no agent has (screen reader, IME, phone, Intel GPU). It is scheduled last, and the agent stops at the human step and reports.

#### F1

| Plan | Size | Agent | Window (h) | WAIT for | Sub-workers | Checkpoint |
|---|---|---|---|---|---|---|
| 074 Rename the product to Space Orbital Program | S | A2 | 1.6–3.0 | — | solo | `cp/f1-074-rename` |
| 075 Apache-2.0: package metadata, credits and the mod manifest licence field | S | A3 | 2.0–3.2 | — | solo | `cp/f1-075-licence` |
| 076 Public roadmap page: the foundation roadmap by phase, without dates | S | A2 | 10.4–11.8 | — | solo | `cp/f1-076-roadmap-page` |
| 077 World container: worlds own saves, save format 5 | M | A1 | 0.5–2.5 | — | 2 (model + UI) | `cp/f1-077-world` |
| 078 World rules, presets and the rule changelog | M | A1 | 2.5–5.0 | `cp/f1-077-world` | solo | `cp/f1-078-rules` |
| 079 Typed data patches: `definePatch` with provenance ¹ | M | A3 | 0.5–2.2 | — | 2 (model + UI) | `cp/f1-079-patch` |
| 080 Trajectory provider interface: patched conics behind one API, no behaviour change ¹ | M | A3 | 6.0–7.8 | `cp/f1-077-world` | 2 (model + UI) | `cp/f1-080-trajectory` |
| 081 Calendar and world epoch: dates in the game | S | A2 | 2.7–4.0 | `cp/f1-077-world` | solo | `cp/f1-081-calendar` |
| 082 World tick and background operations ¹ | M | A3 | 3.0–4.8 | `cp/f1-077-world` | solo | `cp/f1-082-tick` |
| 083 Data items: sized data stored on vessels | M | A3 | 4.5–6.2 | `cp/f1-077-world` | solo | `cp/f1-083-data` |
| 084 Sites in the world: a terrain seed per world and a list of flat zones | M | A2 | 3.8–5.7 | `cp/f1-077-world` | 2 (model + UI + renderer) | `cp/f1-084-sites` |
| 085 Body orientation as pole times spin (no behaviour change) | M | A2 | 8.8–10.7 | — | 2 (model + UI + renderer) | `cp/f1-085-orientation` |
| 086 UI stage 1: refs tokens, Manrope and the accessibility floor ¹ | S | A2 | 0.5–1.9 | — | solo | `cp/f1-086-tokens` |

#### F2

| Plan | Size | Agent | Window (h) | WAIT for | Sub-workers | Checkpoint |
|---|---|---|---|---|---|---|
| 068 Analytic terrain gradients for the bake and anti-aliased silhouettes of the planet pass ¹ | M | A1 | 9.0–11.0 | `cp/f1-084-sites` | solo (GPU measure) | `cp/f2-068-terrain-aa` |
| 069 Mod-defined catalogue categories | S | A2 | 11.5–13.0 | `cp/f1-086-tokens` | solo | `cp/f2-069-categories` |
| 087 Worlds screen and Create World | M | A2 | 5.5–7.3 | `cp/f1-077-world`, `cp/f1-078-rules`, `cp/f1-081-calendar`, `cp/f1-086-tokens` | solo | `cp/f2-087-worlds-screen` |
| 088 UI stage 2: the flight HUD in the refs style ¹ | M | A2 | 7.1–9.0 | `cp/f1-086-tokens`, `cp/f1-081-calendar` | solo | `cp/f2-088-hud` |
| 089 UI stage 3: Home, menus, settings and public pages in the refs style | S | A2 | 12.6–13.9 | `cp/f1-086-tokens`, `cp/f1-074-rename`, `cp/f1-075-licence`, `cp/f1-076-roadmap-page` | solo | `cp/f2-089-menus` |
| 090 Buildings as data: `defineBuilding` and the placement rules | S | A1 | 7.0–8.5 | `cp/f1-084-sites`, `cp/f1-079-patch` | solo | `cp/f2-090-buildings` |
| 091 Space Center in 3D with free grid placement ¹ | L | A1 | 11.2–14.8 | `cp/f2-090-buildings`, `cp/f1-086-tokens`, `cp/f2-087-worlds-screen` | solo (GPU measure) | `cp/f2-091-space-center` |
| 092 Site choice at world creation and location templates | M | A3 | 8.5–10.2 | `cp/f1-084-sites`, `cp/f2-087-worlds-screen`, `cp/f2-090-buildings` | 2 (model + UI) | `cp/f2-092-site-choice` |
| 093 UI stage 4: the Hangar in the refs layout ¹ | M | A2 | 13.7–15.8 | `cp/f1-086-tokens`, `cp/f2-069-categories` | 2 (UI + renderer) | `cp/f2-093-hangar` |
| 094 Launch screen: site, pad or runway, design, crew | S | A2 | 17.0–18.5 | `cp/f2-091-space-center`, `cp/f2-093-hangar` | solo | `cp/f2-094-launch` |

#### F3

| Plan | Size | Agent | Window (h) | WAIT for | Sub-workers | Checkpoint |
|---|---|---|---|---|---|---|
| 067 Floating, sinking and boats: buoyancy on the sea and on lakes | M | A3 | 20.5–22.2 | `cp/f3-095-economy`, `cp/f3-103-science` | 2 (model + renderer) | `cp/f3-067-buoyancy` |
| 095 Economy core: currencies, ledger, part costs and recovery | M | A1 | 5.0–7.0 | `cp/f1-078-rules`, `cp/f1-082-tick` | 2 (model + UI) | `cp/f3-095-economy` |
| 096 Buildings with costs, construction time, upkeep and capacity limits | M | A1 | 21.2–23.5 | `cp/f2-091-space-center`, `cp/f3-095-economy`, `cp/f2-094-launch` | 2 (model + UI) | `cp/f3-096-building-levels` |
| 097 Markets and production: one commodity chain first | L | A1 | 27.2–30.5 | `cp/f3-095-economy`, `cp/f3-096-building-levels` | 2 (model + UI) | `cp/f3-097-markets` |
| 098 Objectives: the evaluator behind contracts and missions | S | A3 | 10.0–11.2 | `cp/f1-078-rules`, `cp/f1-082-tick` | solo | `cp/f3-098-objectives` |
| 099 Procedural contracts | M | A3 | 23.5–25.2 | `cp/f3-098-objectives`, `cp/f3-095-economy`, `cp/f3-096-building-levels` | 2 (model + UI) | `cp/f3-099-contracts` |
| 100 Authored missions, the story line and mission packs | M | A2 | 21.4–23.3 | `cp/f3-098-objectives`, `cp/f2-087-worlds-screen` | 2 (model + UI) | `cp/f3-100-missions` |
| 101 Strategies: bounded policies in Administration | M | A3 | 25.0–26.9 | `cp/f3-095-economy`, `cp/f3-096-building-levels` | 2 (model + UI) | `cp/f3-101-strategies` |
| 102 Milestones, world history and local achievements | M | A2 | 18.1–20.0 | `cp/f1-082-tick`, `cp/f2-087-worlds-screen` | 2 (model + UI) | `cp/f3-102-milestones` |
| 103 Science core: experiments, situations, subjects, data and samples ¹ | L | A3 | 12.5–15.5 | `cp/f1-083-data`, `cp/f1-078-rules` | 2 (model + UI) | `cp/f3-103-science` |
| 104 Regions on bodies and body dossiers | M | A3 | 16.5–18.2 | `cp/f3-103-science` | 2 (model + UI + renderer) | `cp/f3-104-regions` |
| 105 Tech tree and R&D | M | A2 | 24.7–26.6 | `cp/f3-103-science`, `cp/f3-095-economy`, `cp/f3-102-milestones`, `cp/f2-091-space-center`, `cp/f2-094-launch` | 2 (model + UI) | `cp/f3-105-tech-tree` |
| 106 Crew core: roster, professions, traits, XP, seats | M | A3 | 11.0–12.8 | `cp/f1-078-rules`, `cp/f1-082-tick` | solo | `cp/f3-106-crew` |
| 107 Crew simulation: life support, morale, rest, g-load | L | A3 | 18.0–21.0 | `cp/f3-106-crew` | 2 (model + UI) | `cp/f3-107-crew-sim` |
| 108 Astronaut Complex and the crew panel | M | A2 | 19.8–21.6 | `cp/f3-106-crew`, `cp/f2-088-hud`, `cp/f2-091-space-center`, `cp/f2-094-launch` | solo | `cp/f3-108-astronauts` |
| 109 EVA: crew as actors outside the vessel | L | A1 | 23.8–27.2 | `cp/f3-106-crew`, `cp/f3-103-science` | 2 (model + UI + renderer) | `cp/f3-109-eva` |

#### F4

| Plan | Size | Agent | Window (h) | WAIT for | Sub-workers | Checkpoint |
|---|---|---|---|---|---|---|
| 070 Communications: index of the comms tier plans 114 to 121 | S (index) | A1 | 44.5–44.8 | `cp/f4-114-comms-1`, `cp/f4-115-comms-1-ui`, `cp/f4-116-comms-2`, `cp/f4-117-comms-3`, `cp/f4-118-comms-tools`, `cp/f4-119-comms-4`, `cp/f4-120-comms-5`, `cp/f4-121-comms-6` | solo | `cp/f4-070-comms-index` |
| 110 Part action descriptors and action groups | S | A3 | 7.5–8.8 | — | solo | `cp/f4-110-part-actions` |
| 111 Vessel panel: Overview with group control, Parts with per-part actions | M | A2 | 23.1–24.9 | `cp/f4-110-part-actions`, `cp/f2-088-hud` | 2 (UI + renderer) | `cp/f4-111-vessel-panel` |
| 112 Dock panels, the Panel library and `definePanel` ¹ | M | A2 | 15.3–17.2 | `cp/f2-088-hud` | 2 (model + UI) | `cp/f4-112-dock` |
| 113 Mission Center: one place for the whole system ¹ | M | A1 | 14.8–17.5 | `cp/f1-080-trajectory`, `cp/f1-081-calendar`, `cp/f1-086-tokens` | 2 (UI + renderer) | `cp/f4-113-mission-center` |
| 114 Comms tier 1: antennas, line of sight, ground stations, control states | M | A3 | 15.0–16.8 | `cp/f1-084-sites`, `cp/f1-082-tick` | solo | `cp/f4-114-comms-1` |
| 115 Comms tier 1 in the interface: link state, Comms tab, Network layer | M | A2 | 26.4–28.2 | `cp/f4-114-comms-1`, `cp/f4-111-vessel-panel`, `cp/f4-113-mission-center` | 2 (UI + renderer) | `cp/f4-115-comms-1-ui` |
| 116 Comms tier 2: link budget, bands, data rates, comms scale | M | A3 | 28.2–30.1 | `cp/f4-114-comms-1`, `cp/f4-115-comms-1-ui` | 2 (model + UI) | `cp/f4-116-comms-2` |
| 117 Comms tier 3: pointing, routing, latency and the signal-delay rule | M | A3 | 30.1–31.9 | `cp/f4-116-comms-2`, `cp/f1-078-rules` | 2 (model + UI) | `cp/f4-117-comms-3` |
| 118 Comms planning tools: contact timeline, coverage map, constellation planner | M | A2 | 32.4–34.3 | `cp/f4-117-comms-3` | 2 (model + UI) | `cp/f4-118-comms-tools` |
| 119 Comms tier 4: transmission queues, store-and-forward, contact windows | M | A3 | 31.9–33.6 | `cp/f4-117-comms-3`, `cp/f1-083-data` | 2 (model + UI) | `cp/f4-119-comms-4` |
| 120 Comms tier 5: channels, frequency licences, interference, encryption | M | A3 | 35.9–37.9 | `cp/f4-119-comms-4` | 2 (model + UI) | `cp/f4-120-comms-5` |
| 121 Comms tier 6: suit radios, voice and live broadcasts | S | A3 | 39.9–41.1 | `cp/f4-120-comms-5`, `cp/f3-109-eva`, `cp/f3-108-astronauts`, `cp/f3-102-milestones` | solo | `cp/f4-121-comms-6` |

#### F5

| Plan | Size | Agent | Window (h) | WAIT for | Sub-workers | Checkpoint |
|---|---|---|---|---|---|---|
| 071 Atmosphere, sea and variety on a second hills planet ¹ | L | A1 | 30.5–34.0 | `cp/f5-122-sun` | solo (GPU measure) | `cp/f5-071-second-planet` |
| 122 The Sun as root, axial tilt and seasons in the stock system ¹ | L | A1 | 17.5–21.2 | `cp/f1-085-orientation`, `cp/f1-081-calendar` | solo (GPU measure) | `cp/f5-122-sun` |
| 123 Body orbits from elements with secular rates and a lunar model | M | A3 | 22.0–23.8 | `cp/f1-080-trajectory`, `cp/f5-122-sun` | 2 (model + UI) | `cp/f5-123-elements` |
| 124 The real solar system pack ("Sol"): 1:1 and rescaled, balanced per scale | L | A3 | 37.4–40.4 | `cp/f5-123-elements`, `cp/f2-092-site-choice`, `cp/f5-071-second-planet` | 2 (model + UI) | `cp/f5-124-sol` |
| 125 N-body gravity model (future; DE440) | XL | A1 | 34.0–40.5 | `cp/f1-080-trajectory`, `cp/f5-123-elements` | 2 (model + UI) | `cp/f5-125-n-body` |

#### F6

| Plan | Size | Agent | Window (h) | WAIT for | Sub-workers | Checkpoint |
|---|---|---|---|---|---|---|
| 063 Aeroplane gameplay: landing gear, runway, trim, flaps, flight read-outs | L | A2 | 39.0–42.2 | `cp/f2-091-space-center`, `cp/f2-094-launch`, `cp/f4-110-part-actions` | 2 (model + UI + renderer) | `cp/f6-063-aeroplane` |
| 065 Richer mod models: deploy animations, KTX2, per-model LOD | M | A2 | 37.4–39.2 | `cp/f1-079-patch`, `cp/f2-090-buildings`, `cp/f4-110-part-actions`, `cp/f2-091-space-center` | 2 (model + UI + renderer) | `cp/f6-065-mod-models` |
| 066 Environment on real devices: M1/M2, integrated Intel, phones ¹ ² | M | A2 | 34.0–36.0 | `cp/f2-088-hud` (soft), `cp/f2-091-space-center` (soft) | solo (GPU measure) | `cp/f6-066-devices` |
| 072 Script editor: the human pass and the panel on small screens ² | S | A2 | 41.8–43.1 | `cp/f4-112-dock` | solo | `cp/f6-072-script-panel` |
| 073 A compact flight HUD and VAB for phones, built with a device ² | L | A2 | 42.9–46.1 | `cp/f2-088-hud`, `cp/f2-093-hangar`, `cp/f6-066-devices` (soft) | 2 (UI + renderer) | `cp/f6-073-phone` |
| 126 AI agencies and a living world | L | A3 | 33.4–36.5 | `cp/f1-082-tick`, `cp/f3-099-contracts`, `cp/f4-114-comms-1`, `cp/f3-097-markets`, `cp/f4-117-comms-3` | 2 (model + UI) | `cp/f6-126-agencies` |
| 127 Range safety: safe azimuth fans and stage impact zones | M | A2 | 28.0–29.9 | `cp/f2-092-site-choice`, `cp/f3-095-economy`, `cp/f1-078-rules`, `cp/f2-094-launch`, `cp/f3-067-buoyancy` | 2 (model + UI) | `cp/f6-127-range-safety` |
| 128 Off-world bases: base kits and parts left on the surface | L | A1 | 40.5–44.5 | `cp/f3-096-building-levels`, `cp/f2-092-site-choice`, `cp/f1-082-tick` | 2 (model + UI + renderer) | `cp/f6-128-bases` |
| 129 Discovery science (optional world rule) | L | A3 | 40.9–43.9 | `cp/f3-104-regions`, `cp/f4-119-comms-4` | 2 (model + UI) | `cp/f6-129-discovery` |
| 130 Part reliability (world rule, off by default) | L | A2 | 29.6–32.9 | `cp/f1-078-rules`, `cp/f3-095-economy`, `cp/f3-109-eva`, `cp/f2-090-buildings` | 2 (model + UI) | `cp/f6-130-reliability` |
| 131 Replays and challenges as files | M | A2 | 35.7–37.6 | `cp/f1-077-world` | 2 (model + UI + renderer) | `cp/f6-131-replays` |

## 5. Checkpoints

Every merged plan publishes one checkpoint tag `cp/f<phase>-<NNN>-<slug>`. The phase is that of the foundation phase, or the window phase for the realigned drafts: 068 and 069 F2, 067 F3, 070 F4, 071 F5, and 063, 065, 066, 072, 073 F6. A phase gate `cp/f<phase>-done` follows when all plans of the phase are merged. At each gate Agent 1 runs the 3-engine e2e (Firefox on Agent 3) and the ADR 0108 roadmap review. The full register is [`checkpoints.md`](checkpoints.md): 68 plan checkpoints, `cp/f0-kickoff` and six phase gates, with producer and waiters.

The checkpoints that unblock the most work, so produce them first and never let them slip:

| Checkpoint | By | Unblocks |
|---|---|---|
| `cp/f1-077-world` | A1 | 078, 080, 081, 082, 083, 084, 087, 131 (all three agents) |
| `cp/f1-078-rules` | A1 | 087, 095, 098, 103, 106, 117, 127, 130 |
| `cp/f1-082-tick` | A3 | 095, 098, 102, 106, 114, 126, 128 |
| `cp/f1-086-tokens` | A2 | 069, 087, 088, 089, 091, 093, 113 |
| `cp/f2-091-space-center` | A1 | 063, 065, 094, 096, 105, 108 (+066 soft) |
| `cp/f3-095-economy` | A1 | 067, 096, 097, 099, 101, 105, 127, 130 |
| `cp/f4-117-comms-3` | A3 | 118, 119, 126 |

## 6. Critical path and estimate

**Assumptions** (agent time, from the project's history): S ≈ 0.75 h (0.5–1), M ≈ 1.25 h (1–1.5), L ≈ 2.25 h (1.5–3), XL ≈ 4 h (3+); plus 0.25 h to refine each draft; Lead merge ≈ 0.25 h (S, M) or 0.5 h (L, XL); Agent 2 runs 10 % slower (thermal). The comms index 070 is 0.25 h. These are planning numbers, not promises.

- **Total work:** 68 plans ≈ **111 agent-hours** (94 h of implementation and 17 h of refinement). On **one machine** that is ≈ 111 h of wall-clock.
- **Three machines** (the simulated schedule of §4): **≈ 46 h** of wall-clock, about **2.4× faster**. That includes about 17 h of merges on Agent 1. Without the human-gated 072 and 073 it is about 44 h. Idle time: Agent 1 ≈ 1 h, Agent 2 ≈ 0 h, Agent 3 ≈ 5 h at the end.
- **Dependency critical path** (unlimited machines, with refinement and merge): 077 → 081 → 088 → 111 → 115 → 116 → 117 → 119 → 120 → 121 → 070 ≈ **17 h**. A close second is the career chain 077 → 078 → 087 → 091 → 094 → 096 → 097 → 126 ≈ 16.5 h. The work is wide, so the schedule is **throughput-bound**: the binding resource is Agent 2's lane, which is never idle. Agent 1's own plans also stretch about 1.5× because merges pre-empt them.
- **What shortens it:** keep Agent 2's lane moving. If it slips, move 131 (replays) and then 065 (mod models) to Agent 3, which has spare time at the end. Also keep the merge queue short, because every hour a `ready/*` tag waits delays all dependents. Use the sub-worker splits marked in §4.5 on Agents 1 and 2.

## 7. Handover and merge

### 7.1 Handover (the message of the annotated tag `ready/<NNN>`; also appended to the plan's Log)

```text
Handover: plan NNN — <title>
Agent: Agent N (<role>, <machine>)   Branch: <prefix>/NNN-<slug>
Base: origin/main @ <short hash> (rebased <date time>)
Commits: <git log --oneline origin/main..HEAD>
Acceptance:
  [x] <criterion> — `<command>` — <one trimmed output line>
  [ ] <criterion> — needs Agent 1 (M5 / 3-engine e2e / visible pane) — why
Checks run here: bun run check:affected (steps, duration) · e2e <file> <engine> if the plan names one · full suite: CI on this tag (ADR 0126)
Contracts changed (from Touches): <list> · Contract requests: <none | list>
Save format / API_VERSION: <unchanged | reserved number N | patch bump>
Docs: journal docs/journal/NNN-<slug>.md · ADRs <numbers> · research <files> · STATUS row only
Resource notes: peak swap <x>, thermal <ok/throttled>, sub-workers used <n>, anything left running: none
Follow-ups: new drafts <numbers> | none
```

### 7.2 Agent 1's merge checklist

1. `git fetch origin --tags --prune`; take the oldest `ready/*` tag; read its message.
2. `git switch -c merge/NNN origin/<branch>`; `git rebase origin/main` (stop and `bounce` if it does not apply cleanly outside STATUS, `checkpoints.md`, the ADR index and the board).
3. Review the diff against the plan's **Touches** (paths and contracts) and `docs/architecture/boundaries.md`. Any contract change that the plan does not list is a bounce.
4. **CI result (ADR 0126):** `git ls-remote origin 'refs/ci/*/<sha>'` for the commit of `ready/NNN`. `refs/ci/fail/<sha>` is a bounce (name the Actions run). With no result yet, take the next handover and come back. With no result after 30 minutes, use the fallback of step 5.
5. `bun install` if the lockfile changed, then `bun run check:affected` on the rebased branch. Add `--e2e e2e/smoke.e2e.ts` when the plan touches `apps/web` or `packages/renderer`, because CI's e2e is informational only (no GPU), and `--e2e <file>` for the plan's own e2e file. Fallback when CI is unavailable: `bun run check:affected --full --e2e e2e/smoke.e2e.ts`. The full suite runs in CI on the push to `main`; a red `main` is fixed before the next merge.
6. If the plan touches `packages/renderer` or the flight or Space Center views, or carries ¹: run the frame budget or the benchmark on the M5 by the journal 054 method (production build, own port, no other worker or tab). Record the numbers in the plan's Log and the journal (a `docs(plan-NNN)` commit on the merge branch).
7. `git switch main && git merge --no-ff merge/NNN -m "chore(plan-NNN): merge <branch> (Agent N)"`.
8. Completion commit `docs(plan-NNN): complete`: plan `status: done`, `updated:`; STATUS row, "Current/Next plan", "Recent journal entries"; `checkpoints.md` row (done, merge commit, date); `claims.md` row removed. Then `bun run docs:check`.
9. `git tag -a cp/f<phase>-<NNN>-<slug> -m "plan NNN merged"`; `git push origin main cp/...`; `git push origin :refs/tags/claim/NNN :refs/tags/ready/NNN` and the plan's `refs/ci/*/<sha>` refs.
10. Clean up: delete `merge/NNN`, stop servers, close tabs.

On failure: `git tag -a bounce/NNN -m "<what failed, command, output>" origin/<branch>` and `git push origin bounce/NNN`; delete `ready/NNN`. A criterion that only the M5 can run and that fails is a bounce with the numbers.

## 8. Risk and fallback

| Event | Rule |
|---|---|
| A machine is offline or slow | A claim with no pushed commit for twice its plan's estimate gets a question from Agent 1 through the owner. After one more estimate with no answer, Agent 1 writes a line in `checkpoints.md` "Reassignments", deletes the `claim/` tag, and the new owner continues from the pushed branch. Fit rules for reassignment: GPU-measure plans (068, 071, 091, 122, and the measurement part of 066) only to Agent 1; renderer look criteria never to Agent 3; headless plans to anyone. |
| Agent 1 offline | Devs keep going in their lanes on top of unmerged work only when the dependency is their own handed-over branch (stack the branch and say so in the handover). No one else merges, unless the owner names Agent 2 stand-in integrator in a prompt. M5 criteria wait for Agent 1. |
| Agent 3 short of memory | Single-threaded (one worker, no browser during tests); `apps/web` vitest and e2e only at handover; if a build fails for memory, hand over with "build not run here" and Agent 1 builds at merge. |
| A checkpoint slips | Waiting agents do §4.4 work, then the next ready task in their lane (lookahead is part of the pick rule). If a base plan slips by more than its own estimate, its owner lands the **contract part first** (types, schemas, stubs, tests), and Agent 1 tags it as the plan's checkpoint with suffix `-contract`. Dependents start on it; the rest of the plan follows. |
| A contract must change mid-phase | §3.6: a request; Agent 1 lands an additive change as `cp/f<phase>-contract-<slug>`, and every agent whose branch touches that contract rebases at its next step. A breaking change needs an ADR and waits for open branches on that contract to merge. |
| A measurement is noisy | Discard it if `pmset -g therm` shows throttling, another tab or worker ran, or the pane was hidden (journals 039, 050). Rerun on a quiet machine after a second page load. A plan is not `done` until its M5 criteria pass. Agent 1 may merge the code to unblock dependents and keep the plan `in-progress` with owner `"Agent 1 (measure)"` until the numbers are in. |
| Flaky e2e | One retry, reported as flaky (ADR 0040); the merge needs the Chromium smoke green twice in a row (a CI re-run counts). |
| CI unavailable or slow | No result 30 minutes after a handover tag, or Actions is down: Agent 1 merges with the local fallback (§7.2 step 5). A red `main` is fixed before the next merge (ADR 0126). |
| Human-gated plans (066 partly, 072, 073) | The agent does every automatable step, stops at the human step, sets the plan `blocked` with the checklist for the owner, and moves on in its lane. |

## 9. Notes for the Lead

1. **`depends` fixed on 2026-10-17** (each logged in the plan's `## Log`; `docs:check` stays green). These are missing edges that each plan's own text states:
   - 065 +110, 091
   - 067 +095, 103
   - 070 +114 to 121
   - 089 +075, 076
   - 091 +087
   - 096 +094
   - 099 +096
   - 100 +087
   - 101 +096
   - 102 +087
   - 105 +094
   - 108 +094
   - 109 +103
   - 116 +115
   - 121 +108, 102
   - 126 +117
   - 127 +094, 067
   - 130 +109, 090

   No cycles; no plan depends on a plan scheduled after it. The longest new effect is 091 waiting for 087 (Worlds screen), which is why Agent 2 does 087 early.
2. **Soft orderings, not in `depends`:**
   - 066 measures the refs HUD (088) and the Space Center (091) "when they exist", so it is scheduled after them.
   - 073 uses 066's phone row.
   - 099 and 101 share `routes/administration`, so both stay on Agent 3, in that order.
   - 087 and 088 both edit `WarpControl.svelte`, so both stay on Agent 2, 087 first.
   - 074, 075 and 076 all touch `README.md`.
   - 075 and 079 both touch `routes/mods`, so both stay on Agent 3.
3. **Phases overlap.** STATUS says the phases "run in order". This roadmap starts a plan as soon as its `depends` are merged, so headless F3 work (095, 098, 106, 103) and F4/F5 bases (110, 113, 114, 122) run while F2 screens are built. That is where most of the 2.4× comes from. The ADR 0108 phase reviews still happen at each `cp/fN-done`, but a phase review can no longer stop work that already started in later phases. **The owner should confirm this reading.** If phases must be strict, add a WAIT on the previous `cp/fN-done` to every plan's first step. The estimate then grows to about 60 h.
4. **Draft `phase:` fields.** The realigned drafts 063, 065 to 069 and 071 to 073 still say `phase: 3`. This roadmap places them by window (§5). Change the field when each draft is refined, not now: it is not a dependency error.
5. **070 is an index.** It has no work of its own: Agent 1 closes it after `cp/f4-121-comms-6`, with the short journal entry its criterion asks for.
6. **125 (n-body) and 129 (discovery) are "exploring"** (ADR 0108). Their criteria are not written yet, so their estimates are the least reliable. Refine both early, as while-waiting work.
7. **Command names.** AGENTS.md says `bun test`, and the root script is `bun run test` (= `bun test ./packages ./mods ./examples`). Both are the same suite. Web vitest is `bun run --filter @orbital/web test`.
