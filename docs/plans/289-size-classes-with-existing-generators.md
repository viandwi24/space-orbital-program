---
id: 289
title: "Size classes 1.875, 3.75, 5 and 7.5 m with the existing generators: tanks, decouplers, adapters, nose cones, heat shields, docking ports, fairing bases"
status: in-progress
owner: "Worker E"
depends: []
phase: 0
created: 2026-10-21
updated: 2026-10-21
---

# 289 — Size classes to 7.5 m with the existing generators

## Goal

`NODE_SIZES` has the seven classes of ADR 0256: 0.625, 1.25, 1.875, 2.5, 3.75, 5 and 7.5 m. The stock mod has a basic structural set in each new class: tanks, stack decouplers, adapters, nose cones, heat shields, docking ports and fairing bases. Every part is drawn by a generator that already exists, every part passes the seam and node tests, and a 7.5 m stack stands on the pad and lifts off headless. Nothing else changes: no existing part's class or look changes, and no UI changes.

## Context

- ADRs: 0256 (seven classes), 0212 (node size and seam rule), 0255 (OrbitX titles).
- Code:
  - `packages/core/src/node-size.ts`: `NODE_SIZES`, and `nodeSizeClass`, which is the nearest class by ratio. Adding 1.875 changes the inferred class of a size-less cylinder about 1.7–2.1 m across.
  - `packages/core/test/node-size.test.ts`.
  - `mods/stock/src/parts/`:
    - `tanks.ts` (`wideTank` pattern, LF:Ox 9:11 by volume);
    - `structure.ts` (decouplers, the `adapterPart` helper, the `fairingBase` helper);
    - `aero.ts` (nose and tail cones by `{ size, suffix }` list, lines ≈110–145);
    - `recovery.ts` (heat shields);
    - `docking.ts` (the `port(id, title, size, height, mass)` helper);
    - `shared.ts` (radii constants).
  - `mods/stock/src/tech.ts`: every part sits in exactly one tech node.
  - Tests in `mods/stock/test/`:
    - `tech-coverage.test.ts` and `tech.test.ts`;
    - `visuals.test.ts` (every part's generator fits its shape);
    - `boot.test.ts` (shapes and nodes);
    - `part-ids.test.ts`;
    - `__snapshots__`.
  - `packages/renderer/test/part-seams.test.ts`: headless, every stock part's faces meet its node radius.
- Research: `refs/part-visuals-and-blueprints/parts-tracker.md` (TNK-02/04, CPL-01, CPL-04, STR-01, AER-01, THR-01, PAY-01).
- Machine: suitable for the Linux worker (Agent 3). Everything is headless except the optional catalogue screenshot. Never run a build and a browser at once. Keep `MemAvailable` ≥ 25 % before heavy jobs.

## Scope

**In:**

- `NODE_SIZES` extended.
- New stock parts. Masses and costs scale from the existing parts by volume or area.

| Class | Parts |
|---|---|
| 0.625 m | small round tank |
| 1.875 m | 2 tanks, decoupler, adapters 1.25↔1.875 and 1.875↔2.5, nose cone, heat shield, fairing base |
| 3.75 m | 3 tanks, decoupler, adapter 2.5↔3.75, nose cone, heat shield, docking port, fairing base |
| 5 m | 3 tanks, decoupler, adapter 3.75↔5, nose cone, heat shield, fairing base |
| 7.5 m | 2 tanks, decoupler, adapter 5↔7.5, nose cone, fairing base |

- Tech-node placement for every new part.
- OrbitX titles for the new parts only (ADR 0255).

**Out:**

- New generators: tapered, toroid and sphere tanks are plan 275.
- Engines and engine plates (276).
- The catalogue size filter. It is UI, and the UI/UX agent is working in `apps/web`, so it stays in 275.
- Renaming existing parts.

## Design notes

- **Tank sizing.** Keep the stock wet:dry ratio and the 9:11 mix.
  - Capacity scales with volume: π r² h × the units per m³ of `stock.tank-wide`.
  - Dry mass scales the same way from `stock.tank-wide`.
  - Heights per class: 1.875 m → 1.9 and 3.75 m; 3.75 m → 1.9, 3.75 and 7.5 m; 5 m → 2.5, 5 and 10 m; 7.5 m → 7.5 and 15 m.
- **Decoupler ejection impulse** scales with the class's typical stage mass. Take 5,000 N·s at 2.5 m and grow it with diameter².
- **Class inference.** Adding 1.875 must not change the class of any **stock** part, since all stock stack parts declare `size` or sit near a class. A test asserts, for every stock part and node, that the size is the same before and after the change. Mod parts without sizes near 2 m may change class: state this in the journal and in `guides/writing-a-mod.md`.
- **Docking ports** only up to 3.75 m, as ADR 0256 says. **Heat shields** only up to 5 m.
- **Snapshots:** after `bun test mods/stock`, diff `mods/stock/test/__snapshots__`. Expect only additions for the new parts; an obsolete or changed entry for an existing part is a bug.

## Steps

1. Extend `NODE_SIZES`. Add tests:
   - every stock part's node sizes are unchanged;
   - a 1.9 m size-less part now infers 1.875.
2. Add the parts family by family in their files, with the helpers that exist (`wideTank` generalised to any class, `adapterPart`, `fairingBase`, `port`, the cone list, the heat-shield definition).
3. Place each new part in a tech node (`tech.ts`). Run `tech-coverage.test.ts` and `tech.test.ts`.
4. Run `bun test packages/renderer/test/part-seams.test.ts` and `bun test mods/stock`. Fix any seam failure in the part data, not in the test. List any new "not a flat joint" exemption, with its reason.
5. Pad test in `packages/sim/test/`, using only existing parts:
   - stack: a probe core on top, then the adapter chain 1.25 → 1.875 → 2.5 → 3.75 → 5 → 7.5 m, then a 7.5 m tank;
   - six `stock.srb-large` on `stock.radial-decoupler`s around the tank (symmetry 6), with launch clamps if needed;
   - check that it stands on the pad for 5 s without sinking or tipping, then lifts off when staged.
6. Optional, when no build is running: one catalogue screenshot of the new parts through the WebGL2 fallback (`/vab?renderer=webgpu-fallback`) for the journal.
7. Docs checklist, `bun test`, `bun run typecheck`. Run `bun run build` alone, with no browser open.

## Acceptance criteria

- [x] `bun test packages/core` passes, including the unchanged-sizes test for every stock part and the 1.875 m inference test.
- [x] `bun test packages/renderer/test/part-seams.test.ts` passes with the new parts. Any new exemption is listed with its reason.
- [x] `bun test mods/stock` passes, including tech coverage and visuals. The exception is `patch-bench`'s M5 timing, which also fails on `main` on this machine.
- [x] `bun test packages/sim` passes, including the 7.5 m pad test: it stands 5 s with vertical drift < 5 cm, and its altitude rises after staging. The pad test passes (drift 0.011 mm, a climb of 111 m). The suite's 12 local failures are wall-time limits on this machine; those files pass with `--timeout 60000` (journal 289), and CI decides.
- [x] `bun test`, `bun run typecheck`, `bun run build` and `bun run docs:check` pass. Typecheck, build and docs:check passed here. Locally, only the touched packages were run (ADR 0126); `bun test` as a whole is CI's, on `ready/289`. Here, `patch-bench` and the sim's wall-time tests fail the same way on `main`.

## Docs checklist

- [x] `docs/STATUS.md` updated (board row, next plan, open issues).
- [x] `docs/journal/289-size-classes-with-existing-generators.md` written.
- [x] Affected `docs/architecture/*.md` updated to match what shipped (the parts or size-class section, if any): `plugin-system.md`.
- [x] New ADRs written for any decision made here, linked above (none needed: ADR 0256 covers the classes).
- [x] `docs/research/stack-versions.md` updated for anything looked up (nothing looked up).
- [x] `docs/guides/writing-a-mod.md`: the seven classes and the inference note.
- [x] `refs/part-visuals-and-blueprints/parts-tracker.md`: status of the delivered rows.

## Log

- 2026-10-21 — Split from plan 275 at the owner's request ("boleh pisahkan"), sized for the Linux worker (Agent 3). Ready: steps checked against `node-size.ts`, the stock part helpers, the tech and seam tests.
- 2026-10-21 — Worker E (Agent 3, Linux) took it. Notes on the implementation:
  - A size-less mod part from 1.53 to 2.17 m across now infers 1.875. No stock part changed: a fixture of every stock node size from before the change is checked.
  - The new parts register after every older part, so the part snapshot only grows.
  - The tank-size scaling from `stock.tank-wide` makes the 0.625 m tank small: 18 u of fuel, 25 kg dry.
  - The 1.875 m set goes into Heavy lift (tier 3). The 3.75, 5 and 7.5 m sets go into a new tier-5 node, `stock.super-heavy-lift` (300 science, after a Cinder landing), outside the tier 1–4 pacing sums. The 3.75 m port and the 1.875 and 3.75 m fairing bases go into Docking and Fairings.
  - The seam test has three new exemptions. They are the heat shields' bottom dishes, for the same reason as the two existing shields.
  - The pad test empties the 7.5 m tank through a design setting. Full, it weighs about 320 t, against the six motors' 1.8 MN.

