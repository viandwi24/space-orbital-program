---
id: 203
title: "Debug panel, cheats, set orbit/location/resources, log"
status: done
owner: "Worker B"
depends: []
phase: 7
created: 2026-10-18
updated: 2026-10-19
---

# 203 — Debug panel, cheats, set orbit/location/resources, log

## Goal

A Debug panel (`Alt+F12` and the ☰ menu) lets a player or a test jump straight to the state it needs: cheats, set orbit, set location, set resources and temperatures, a log with filter/copy/download, an overlay tab stub and an Info tab. The same operations are a debug API for scripts and e2e (`debug.setOrbit`, `debug.setLocation`, `debug.setResource`, …), active only when debug mode is on. Every later plan in this roadmap uses this API to set up its tests.

## Context

- rancangan §5b (5b.1–5b.10); owner question §15 #14.
- Research: `refs/reverse-engineering-ksp-ksp2/12-settings-difficulty-keys-meta.md` §4 and §6.4 (KSP's Alt+F12 menu); `15c-navigation-audit-raw.md` §8 (only a dev-only ascent autopilot exists: `apps/web/src/lib/autopilot.ts:1-7`, toggled under `import.meta.env.DEV` in `apps/web/src/lib/flight-loop.ts:479,645-669`).
- Script API to extend: `apps/web/src/lib/script-api.ts` (addNode, removeNode, warpTo, nodes at `:66-72`).
- Sim command entry: `packages/sim/src/commands.ts`; rules: `packages/core/src/rules.ts`, `mods/stock/src/rules.ts`.
- Log source: the in-memory log buffer from plan 202 (`apps/web/src/lib/log-buffer.ts`). If 202 has not merged, this plan adds the buffer with the same API and 202 rebases onto it.
- ADRs: 0200 (debug panel, cheats, set-state tools and the debug API), 0213 (access as the world rule `stock.debug-tools`, debug state in `WorldInfo.debug`).
- Access rule: Sandbox always; other modes need "Debug mode" in Settings, which marks the save "used cheats" and blocks achievements; Career Hardcore locked. Default per owner review (rancangan §15 #14); may change.

## Scope

**In:**
- Panel with tabs Cheats, Set orbit, Set location, Resources, Log, Overlay (empty stub with "P1" note), Info.
- Cheats: infinite fuel, EC, monoprop and EVA propellant; no crash damage; ignore max temperature; unbreakable joints (no-op flag until joints break, kept for parity); comms without signal; life support never runs out; add funds, science and reputation; instant construction; unlock all tech.
- Set orbit: body, Ap/Pe or a, e, i, Ω, ω, mean anomaly; presets "low orbit", "moon orbit", "transfer to …"; apply to the active vessel or spawn a saved design.
- Set location: landed at a site, at lat/lon, or in the atmosphere at an altitude with a velocity.
- Set resources (fill, empty, exact value per tank and resource), part temperature and crew level.
- Log: sim events (stage, decouple, explosion with reason, control changes, warp refused with reason), warnings and JS errors from the buffer; filter, copy, download as `.txt`.
- Info: FPS, sim time per step, vessel count, memory (where the browser exposes it), version, quality governor level (plan 201).
- `world.usedCheats` save flag shown on Worlds and on the achievements panel; achievements blocked while any cheat is on.
- Debug API: the same operations on the script API and on `window.__orbitalDebug` (only when debug mode is on), plus e2e helpers in `apps/web/e2e/support.ts`.

**Out:** Overlay contents (aero arrows, thermal gradient, CoM/CoL/CoT, colliders, physics range): P1.

## Touches

- **Size:** L
- **Edits:** `packages/core/src/protocol.ts` (debug commands), `packages/core/src/protocol-schemas.ts`, `packages/core/src/save.ts` (`usedCheats`), `packages/sim/src/commands.ts`, `packages/sim/src/debug.ts` (new), `apps/web/src/lib/debug/` (new: panel, model, API), `apps/web/src/lib/script-api.ts`, `apps/web/src/lib/keybindings.ts` (`Alt+F12`), `apps/web/src/lib/settings/settings.ts` (Debug mode), `apps/web/src/lib/achievements/`, `apps/web/src/lib/worlds/`, `apps/web/e2e/support.ts`
- **Shared contracts:** **protocol** (`debug-*` commands), **save** (`WorldInfo.debug` with `usedCheats`; additive, no version bump, ADR 0200 and 0213), **script API** (`debug.*`), **e2e support** (`debugSetOrbit`, `debugSetLocation`, `debugSetResource`, `debugCheat` helpers used by plans 205–231).

## Design notes

- Every debug operation is a sim command, so it is recorded like any other and replays deterministically.
- The sim rejects `debug-*` commands unless the world allows them (Sandbox, or Debug mode on and not Hardcore), with a reason the log shows.
- Set orbit places the vessel on rails at the given elements and lets the normal unpack path bring it back to physics.
- Set location in the atmosphere spawns in physics with the given velocity in the surface frame, for parachute and re-entry tests.
- The e2e helpers call `window.__orbitalDebug` and wait for the next snapshot that reflects the change.

## Steps

1. Protocol and sim: `debug-*` commands, access rule, `usedCheats`, save migration; sim tests.
2. Cheats in the sim (fuel, EC, damage, temperature, comms, life support, economy, construction, tech).
3. Set orbit and set location; sim tests from elements and lat/lon.
4. Set resources, temperature and crew level.
5. Panel UI with all tabs, `Alt+F12` and ☰ entry; Log tab on the log buffer; Info tab.
6. Script API `debug.*`, `window.__orbitalDebug`, e2e helpers.
7. Worlds and achievements: "used cheats" mark and blocking.

## Acceptance criteria

- [x] `bun test packages/sim` passes, including `test/debug.test.ts`: set-orbit to Ap 100 km / Pe 100 km around the home body gives those apsides within 1 m; set-location in the atmosphere at 5 km and 200 m/s gives that altitude and surface speed after one step; a debug command in a Career world without Debug mode is rejected with a reason; in Hardcore it is always rejected.
- [x] `bun test packages/core` passes, including the save test that a format-8 save without `debug` reads as never used, and one with it round-trips.
- [x] `apps/web` vitest `debug/model.test.ts`: the Log tab filters by level, copy returns the visible lines, download names the file with the world and date.
- [x] `apps/web` vitest `script-api.test.ts` (extended): `debug.setResource` is absent when Debug mode is off.
- [x] Chromium e2e `e2e/debug.e2e.ts`: in a Sandbox world, `debugSetOrbit` puts the vessel in a 100 km orbit and the HUD shows it; turning on infinite fuel keeps the tank full during a burn; in a Career world with Debug mode on, the world card on Worlds shows "Used cheats".
- [x] `bun run check:affected --e2e e2e/debug.e2e.ts` passes.
- [x] CI green on the `ready/203` tag (`refs/ci/pass/<sha>`, ADR 0126).

## Docs checklist

- [x] `docs/STATUS.md` updated (board row, next plan, open issues).
- [x] `docs/journal/203-debug-panel-and-cheats.md` written.
- [x] `docs/architecture/simulation.md` (debug commands) and `docs/architecture/scripting.md` (`debug.*`) updated.
- [x] `docs/conventions/testing.md` gains a short section on setting up e2e states with the debug helpers.
- [x] ADR 0200 linked; any deviation recorded as a new ADR.

## Log

- 2026-10-18 — Created from refs/rancangan-terpadu.md (release roadmap).
- 2026-10-19 — Refined to ready and claimed by Worker B (`claim/203`). Checked against the code: commands go through `commandSchema` (core) and `dispatch` (sim `commands.ts`); world rules resolve in `createSim`; resource draws all pass `withdrawResource`; damage is `damagePart`/`burnPart`; control without signal is `controlFor`/`signalRefusal`. Decisions (ADR 0213, default per owner review): access is the stock rule `stock.debug-tools` (`always`/`opt-in`/`locked`); debug state is `WorldInfo.debug` (additive, so no save version bump: the plan's "bump with migration" follows ADR 0200's "additive, no version bump" instead); "unlock all tech" is a one-shot grant, not a switch; plan 202's log buffer is not merged, so this plan adds `log-buffer.ts` with 202's API.
- 2026-10-19 — Done (Worker B). Evidence: `bun test packages/sim` 509 pass, including `test/debug.test.ts` (12: apsides within 1 m, 5 km / 200 m/s after one step, Career refusal with reason, Hardcore always refused); `bun test packages/core` 320 pass (save round trip of `WorldInfo.debug`); vitest `debug/model.test.ts` 7, `script-api.test.ts` 4 (`debug` absent with Debug mode off); Chromium `e2e/debug.e2e.ts` 3/3; `bun run check:affected --build --e2e e2e/debug.e2e.ts` all passed in 432 s after the rebase onto plan 207; CI on `ready/203` (see journal). The first `ready/203` (50275b1) failed CI's `bun run lint` on the web package's Prettier config; fixed and tagged again. ADR renumbered 0212 → 0213 (0212 went to plan 207).
