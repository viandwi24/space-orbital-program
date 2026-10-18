---
id: 221
title: Vessel switching and per-vessel designs
status: draft
owner: ""
depends: [204]
phase: 7
created: 2026-10-18
updated: 2026-10-18
---

# 221 — Vessel switching and per-vessel designs

## Goal

The player can fly any vessel they own. Every vessel, including debris and pieces that separate, keeps a design record, so the HUD, stage stack and vessel panel work for it. `[` and `]` switch to the previous or next vessel within about 2.5 km. The map offers "Switch to" on another vessel's marker, and the Mission Center's Fly works for every owned vessel without a reload. A pod, probe core or docking port can be chosen with "Control from here", which sets the vessel's reference direction.

## Context

- Rancangan §6.1 (switch and fly any vessel; needs per-vessel designs), §12.1 (`[`/`]` switch vessel; trim moves to Alt + WASDQE), §7.6b (pod / probe core: "Control from here").
- ADRs: 0208 (vessel switching, per-vessel designs, docking and fleet management; amends 0118 point 5), 0201 (one sim per world, from plan 204), 0206 (key profiles), 0118 (Mission Center fly).
- Research:
  - 15c §7: vessel switching missing; `vessel` is set once (`apps/web/src/lib/flight-loop.ts:259, 933, 951`); `[`/`]` are aircraft trim (`apps/web/src/lib/keybindings.ts:93-94`); a switcher needs per-vessel designs (STATUS.md:178).
  - 15c §6: Fly only works on the save's focus vessel; any other shows `NOT_FLYABLE` (`apps/web/src/lib/mission-center/model.ts:185-186, 237`).
  - `apps/web/src/lib/save/game-save.ts:50-60`: the save holds one `focus` and one `design`, "the design the flight was launched with".
  - 15c §1: map picking order is marker, own path, other orbit lines (`apps/web/src/lib/map-pick.ts:35-62`).
  - 15a §8: physics range 2.5 km (`packages/sim/src/constants.ts:14`).
  - 08 (KSP navigation and vessel management) for KSP's switch rules.
- Depends on 204 (one sim per world and client navigation; switching must not boot a new sim). Plan 216 gives `[`/`]` to switching in the KSP profile; until it lands, this plan binds them as `vesselPrev`/`vesselNext` with trim kept on its current keys in the classic profile.

## Scope

**In:**
- **Per-vessel designs**: the world save keeps a design record per vessel id (`designs: Record<id, { design, partIndex }>`). When a vessel splits (staging, decouple, breakup), each new vessel's record references the parent design and lists the part indices it kept. Debris records have the same shape.
- Game save envelope version bump with a migration: the old `design` becomes the record of `focus`; other vessels get a record rebuilt from the sim's `PartState.index` where possible, else a generic "unknown design" record that still flies (names from part definitions).
- `switch-vessel` in the flight client: set the active vessel, renderer `setActiveVessel`, HUD and panel rebind; no reload. The sim brings the target into physics if within range, else keeps it on rails until the player acts.
- `[`/`]`: cycle owned vessels (including debris) within 2.5 km, nearest first; a toast names the new vessel.
- Map: "Switch to" on another vessel's marker and object card.
- Mission Center: Fly enabled for every owned vessel with a record; it navigates to Flight in the same sim.
- "Control from here": a `set-control-part` command; the navball, SAS and attitude use that part's orientation; descriptors on command parts and (later) docking ports.
- The switch never refuses silently: refused cases (agency-owned, destroyed) give a reason.

**Out:**
- Docking and undocking (plan 222).
- Vessel list filters, recover anywhere, terminate, rename, persistent debris (plan 223).
- Switching to an EVA suit by key (plan 225 handles suit focus; suits appear in the cycle once that lands).

## Touches

- **Size:** L
- **Edits:**
  - `apps/web/src/lib/save/game-save.ts` and tests (per-vessel records, envelope version and migration)
  - `apps/web/src/lib/flight-loop.ts` (active vessel can change; HUD rebind)
  - `apps/web/src/lib/hud-controller.ts`, `apps/web/src/lib/vessel-panel/vessel-model.ts` (read the active vessel's record)
  - `apps/web/src/lib/keybindings.ts` (`vesselPrev`, `vesselNext`)
  - `apps/web/src/lib/map-pick.ts`, `apps/web/src/routes/flight/+page.svelte` (map "Switch to")
  - `apps/web/src/lib/mission-center/model.ts`, `apps/web/src/lib/mission-center/MissionCenterOverlay.svelte` (Fly for any record)
  - `packages/core/src/protocol.ts` (`set-control-part`; `VesselSnapshot.controlPart`), `packages/sim/src/commands.ts`, `packages/sim/src/sas.ts`
  - `packages/sim/src/vessel.ts` (split events carry the parent id and kept part indices; already partly there for debris names)
- **Shared contracts:** world save envelope (version bump, migration); per-vessel design record shape, which 222 (merge and undock) and 223 (fleet list) use; `set-control-part` command; `VesselSnapshot.controlPart`.

## Design notes

- Records live in the web save envelope, not in the sim, because designs are an editor concept and the sim already maps parts to indices. The sim emits a split event with parent id and kept indices; the host updates records.
- Cycling order: nearest first by distance from the current vessel, ties by id, so it is stable.
- KSP refuses switching during some situations; we refuse only when the target is not the player's or is gone, and say why.

## Steps

1. Record shape and save envelope migration with tests.
2. Sim split events carry parent and kept indices; the host updates records.
3. Flight client: active vessel switch without reload; HUD, panel and stage stack rebind.
4. `[`/`]` cycling within range with a toast.
5. Map "Switch to" and Mission Center Fly for any record.
6. `set-control-part` and "Control from here".
7. Vitest, sim tests and Chromium e2e.

## Acceptance criteria

- [ ] `apps/web` vitest `lib/save/game-save.test.ts` (new or in `saves.test.ts`): a version 2 save migrates with the focus design as the focus record; a staged save has a record per vessel and each lists only its kept parts.
- [ ] `bun test packages/sim/test/debris.test.ts` gains a case: a decouple event carries the parent id and the indices each side kept.
- [ ] `bun test packages/sim/test/sas.test.ts` gains a case: after `set-control-part` to a part rotated 90°, prograde hold aligns that part, not the root.
- [ ] Chromium e2e `e2e/vessel-switch.e2e.ts`: `window.__orbitalDebug.setOrbit` places the vessel in low orbit; stage to drop a spent stage; press `]`, the HUD names the spent stage and its stage stack shows its parts; press `[`, back to the first vessel; no page reload happens (a `window` marker set before survives).
- [ ] Chromium e2e `e2e/mission-center.e2e.ts` gains a case: Fly on a non-focus vessel opens Flight on it.
- [ ] `bun run check:affected` passes.
- [ ] CI is green on the plan's ready tag (full suite, ADR 0126).

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row, next plan, open issues; remove the STATUS.md:178 note).
- [ ] `docs/journal/221-vessel-switching.md` written.
- [ ] `docs/architecture/overview.md` updated (save envelope, per-vessel records).
- [ ] `docs/architecture/simulation.md` updated (split events, control part).
- [ ] New ADRs written for any decision made here, linked above.

## Log

- 2026-10-18 — Created from refs/rancangan-terpadu.md (release roadmap).
