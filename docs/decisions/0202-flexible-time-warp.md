# 0202 — Flexible time warp

**Status:** accepted
**Date:** 2026-10-18
**Plan:** plans/206-flexible-time-warp.md, plans/224-navigation-tools.md
**Builds on:** ADR 0201 (one sim per world, clock states), ADR 0021 (debris and time warp), ADR 0171 (world tick)

## Context

Rails warp goes up to 1e6× (`constants.ts:9`) but is refused while any vessel is in flight (`commands.ts:420-450`, `modes.ts:67`). A vessel goes on rails only after 2 s idle in a stable orbit or at rest (`modes.ts:106-200`). There is no physics warp. Players get "set warp to 1 first" with no hint of what to do. KSP1 (verified, research doc 16): physics warp ×2–×4 anywhere; rails warp ×5 to ×100 000 needs no orbit, only no thrust and an altitude above a per-body table (Kerbin: ×5–×50 above 70 km, ×100 above 120 km, ×1 000 above 240 km, ×10 000 above 480 km, ×100 000 above 600 km), or being at rest on the surface. KSP deletes unloaded vessels in air above about 0.1 atm (about 23 km on Kerbin). Rancangan §5.13 W1–W6 and §2.6.

## Decision

1. **Eight segments** on the time bar: 1×, 2×, 4×, 10× (physics) and 50×, 100×, 1k×, 10k× (rails). Sol worlds add 100k× (default per owner review, rancangan §15 #5; may change). KSP's 100 000× is the reference for the top.
2. **Physics warp ×2, ×4, ×10 works anywhere:** in atmosphere, with engines burning, landed. It multiplies physics steps per frame. When frames fall behind, the sim lowers the level and says so.
3. **Rails warp needs no orbit.** It is allowed when the engines are off, the active vessel and every vessel in physics range are out of the atmosphere, and the altitude is above the body's limit for that level, or when the vessel is landed or floating. Limits come from an **altitude table per body**, computed from the atmosphere top and the highest terrain, with steps like KSP's Kerbin table as the starting point for balancing.
4. **Clamp with a reason, never refuse silently.** A request above the limit warps as high as allowed and the time bar shows why: "Max 4× — engine burning", "Max 1k× — below 120 km". The `warp` command returns the granted level and the reason.
5. **Automatic transitions.** Thrust during rails warp drops to physics warp. Dropping rails warp to 1× returns the vessel to physics safely (as today).
6. **Warp-to** an alarm, node, Ap, Pe, SOI change or transfer window picks its own levels and stops before the event with a safety margin (a node stops 30 s before half the burn, as today).
7. **Other vessels.** Vessels outside physics range are always on rails and never limit warp. A vessel in atmosphere that nobody is watching is simulated per ADR 0201 point 9. At high warp such a vessel is **frozen, not deleted** as KSP does, until warp drops, with a warning in the bell (default per owner review, rancangan §15 #15; may change).
8. **The limit is the world's, not the page's.** The sim computes it from world state; every page's time bar reads the same value (KSP2 bug, research doc 01 §8).

## Alternatives considered

- **Keep "orbit only" rails warp** — rejected: it is the main source of the "set warp to 1" frustration.
- **Delete unseen atmospheric vessels like KSP** — rejected: losing a vessel to a warp rule feels arbitrary; freezing keeps it.
- **A fixed altitude list per stock body** — rejected: mods and Sol bodies need limits derived from their own atmosphere and terrain.

## Consequences

- Plan 206 delivers the physics warp, the per-body table, the clamp reason, the transitions and the sim command; plan 224 adds warp-to markers and user alarms.
- The `warp` command result gains `{ granted, reason }`; scripts and the debug log read it.
- Frozen vessels need a saved `frozen` flag and a bell entry.
