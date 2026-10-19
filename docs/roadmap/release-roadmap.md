# Release roadmap: from the foundation to a public KSP-grade release

**Status:** active since 2026-10-18. It replaces the three-agent [team roadmap](team-development-roadmap.md), which is complete: its 68 plans are done.

**Design:** [`refs/rancangan-terpadu.md`](../../refs/rancangan-terpadu.md) (owner review document, Indonesian), backed by the research in [`refs/reverse-engineering-ksp-ksp2/`](../../refs/reverse-engineering-ksp-ksp2/README.md). Release scope = every **P0** item there.

**Visual:** [`release-roadmap.html`](release-roadmap.html). Open it in a browser to see the dependency graph, the waves, the critical path and the plan details.

**Plans:** 200–236 (233–236 added 2026-10-19 from the owner's manual test, ADR 0222). **ADRs:** 0200 onward. The visual page is generated: `bun run roadmap:release`.

## Machines and queues (since 2026-10-19)

Five workers on three machines; the owner-approved split is in [`worker-brief.md`](worker-brief.md) ("Machines and workers"):

| Worker | Machine | Queue |
|---|---|---|
| A, B, C | Agent 1, MacBook Pro M5 | A: 218 → 220 → 223 · B: 233 → 235 → 236 · C: 226 → 234 |
| D | Agent 2, MacBook Pro M2 13" | 225 → 227 → 228 → 230 |
| E | Agent 3, Linux Mint (6 CPU, 8 GB) | 229 → 231 |

Claims are annotated tags (`claim/NNN` with the worker's name); the visual page shows who holds what. Everyone syncs with `git fetch origin --tags --prune --prune-tags` before each pick and merge.

## How to work

**Worker sessions follow [`worker-brief.md`](worker-brief.md)** (machine guard, picking, merging). The points below summarise it.

1. **One roadmap, one team.** Work is no longer split into fixed agent lanes. Any agent or session takes the **next plan** by this rule:
   - **next plan** = the lowest-numbered `draft` or `ready` plan whose `depends` are all `done` and that nobody has claimed.
   - Refine it to `ready` (Steps and Acceptance criteria checked against the code), then claim it.
2. **Parallel work.** Plans in the same **wave** below have no dependency on each other. They can run at the same time in separate git worktrees, as long as they do not share files (see "Do not run together").
   - The machine sets the number of streams:
     - **3** on the M5;
     - **2** when it runs hot (ADR 0126 guards);
     - **1** on a weak machine.
3. **Checks.** Run `bun run check:affected` locally. The full suite runs in CI on the `ready/NNN` tag (ADR 0126). Merge only with `refs/ci/pass/<sha>`.
4. **Testing helpers.** Plan **203** (debug panel and API: set orbit, set location, set resources, cheats) is in wave 1. Later plans use it to reach the state they test in seconds.
5. **Progress.** Tags and state files work as before (ADR 0112). `docs/STATUS.md` holds the board rows.

## Waves (what can run in parallel)

| Wave | Plans (size) |
|---|---|
| 1 | **200** quick fixes (M), **201** shadow flicker (S), **202** release operations (M), **203** debug panel and cheats (L), **204** world shell, one sim (L), **207** part sizes, shrouds, adapters (M), **212** flight model additions (M), **216** key profiles (M), **217** Hangar carry loop (L), **220** roomier Hangar (S), **227** audio pack (M) |
| 2 | **205** clock states and pause rules (M), **206** flexible time warp (M), **208** power and resources (L), **209** parachutes (L), **215** HUD layout spec (M), **219** procedural fairings (L), **221** vessel switching (L), **226** camera modes and capture (M) |
| 3 | **210** propulsion and structure pack (L), **211** RCS and monopropellant (M), **213** tank transfer and flow (S), **223** fleet management (M), **224** navigation tools (L), **225** EVA v2 (L), **228** tooltips and glossary (M), **230** rules and save safety (M) |
| 4 | **214** vessel panel v2 (L), **222** docking (L) |
| 5 | **218** Hangar inspector, groups, report (L), **229** lessons past the first orbit (L), **231** career content for new parts (M) |
| 6 | **232** release QA and launch (M) |

**Critical path** (the longest dependency chain):

**207 → 208 → 211 → 222 → 229 → 232** ≈ 12 h of agent time

The work starts with the parts split, then power, RCS, docking, the lessons that teach docking, and finally release QA. Keep this chain moving first. A parallel chain of about the same length is **204 → 221 → 222**.

## Estimate

Sizes: S ≈ 0.75 h, M ≈ 1.25 h, L ≈ 2.25 h, plus about 0.3 h of merge per plan. These are planning numbers, not promises.

| Parallel streams | Wall-clock |
|---|---|
| 1 | ≈ 64 h |
| 2 | ≈ 33 h |
| **3** (recommended on the M5) | **≈ 23 h** |
| 4 | ≈ 18 h; the critical path limits it to about 12 h with unlimited streams |

## Do not run together (shared files)

| Plans | Shared area | Rule |
|---|---|---|
| 200 and 204 | `apps/web/src/routes/flight/+page.svelte` | Merge 200 first. It is small. |
| 207 and every plan that adds parts | `mods/stock/src/parts/` | 207 first splits `parts.ts` into one file per family. After that, each part plan edits its own family file. |
| 214 and 215 | the flight HUD | Different waves, which keeps them apart. Rebase 214 onto 215. |
| 216 and 211, 225, 226 | `apps/web/src/lib/keybindings.ts` | 216 defines the key slots. The others only wire actions to them. |
| 217, 218, 219 | `apps/web/src/lib/vab/` | Kept in sequence by their dependencies. |

## Owner-open defaults

Every question in rancangan §15 is planned with its proposed default. The plans and ADRs mark these as "default per owner review". Changing one later means editing the ADR and the plan that delivers it. No other plan changes.

## Start prompt (Indonesian)

```text
Baca docs/roadmap/release-roadmap.md. Ambil plan berikutnya yang dependensinya sudah done, perhalus jadi ready, lalu kerjakan sesuai AGENTS.md.
```
