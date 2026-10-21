---
id: 311
title: "Vessel programs: the player wins per channel, saved scripts that resume, the programs list, built-in mods on the Mods page"
status: in-progress
owner: "vessel programs session (Claude)"
depends: [232, 042]
phase: 0
created: 2026-10-21
updated: 2026-10-21
---

# 311 — Vessel programs

## Goal

A script or a mod autopilot is a *program* attached to one vessel. It keeps flying that vessel when the player looks elsewhere, it is saved with the world and resumes when the world opens, and the player can always take any control channel back by touching it (the program resumes a second after the player lets go) or stop every program on the vessel with one key. The Flight status bar lists the running programs. The Mods page lists the built-in mods.

## Context

- Owner's requests (2026-10-21): scripts run per vessel even when it is not flown; foundation for mods that control ships; program state survives closing the world; a list of running programs in the status bar footer; research how KSP, KSP 2 and others decide who wins; MechJeb-style mods (plan 312); built-in mods in the Mods menu.
- Research: `research/vessel-programs.md`. ADRs: **0272** (this plan), 0271 (autopilots, plan 310), 0232, 0201 point 9, 0049 point 5, 0039 (warp hold), 0179 (signal refusal).
- Code: `packages/sim/src/commands.ts`, `delay.ts` (`CommandSource`), `state.ts`, `save.ts`; `packages/core/src/protocol.ts`, `save.ts`; `packages/scripting/src/runner.ts`, `prelude.ts`; `apps/web/src/lib/sim-host.ts`, `world-session`, `flight-loop.ts`, `hud/StatusStrip.svelte`, `hud/status-chips.ts`, `routes/(world)/mods/+page.svelte`.

## Scope

**In:**
- Part A: built-in mods on the Mods page.
- Part B: command sources and per-channel override in the sim (ADR 0272 points 2 to 5), snapshot `override`, events, `program-stop`, Delete key, Abort stops programs.
- Part C: saved scripts (`script-attach`/`-detach`/`-memory`, `memory`/`resumed` in the script API, resume on world open, one script per vessel), save version bump.
- Part D: the programs chip and list in the status strip, Manual badge in the HUD.

**Out:** the MechJeb-style autopilots (plan 312); porting the dev autopilot; e2e; quickjs-wasi snapshots.

## Steps

1. Plan, ADR 0272, research. Part A, commit.
2. Part B with sim tests, commit.
3. Part C with scripting, sim and web tests, commit.
4. Part D with web tests, commit.
5. Docs checklist, checks, commit.

## Acceptance criteria

- [ ] web vitest `src/lib/mods/builtin-list.test.ts`: every `BUILTIN_PLUGINS` entry has a row; the Mods page shows a "Built in" section (browser check).
- [ ] `bun test packages/sim` `test/programs.test.ts`: with a script program on a vessel, a player `attitude` with pitch 1 makes later script pitch writes drop while the script's yaw still applies; 1 s of sim time after the player sends pitch 0 the script's pitch applies again; a player throttle write blocks script throttle for 1 s; `program-override` and `program-resumed` events fire once each; `program-stop` detaches the script and clears overrides; no override is kept on a vessel without a program.
- [ ] `bun test packages/sim`: `script-attach`, `script-memory` (rejected over 64 KiB or non-JSON) and `script-detach` change `vessel.script`; a save and resume keeps `script` with its memory.
- [ ] `bun test packages/scripting`: `memory` and `resumed` are visible to the script; the runner reports a changed memory.
- [ ] web vitest: the sim host starts a session per vessel and restarts saved scripts with `resumed: true`; `programs` model lists autopilot and script programs with their manual channels.
- [ ] `bun run typecheck`, `bun test`, web vitest with `CI=true`, `bun run docs:check` pass.

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row).
- [ ] `docs/journal/311-vessel-programs.md` written.
- [ ] `docs/architecture/scripting.md` and `docs/guides/scripting.md` describe programs, sources, override, `memory`/`resumed`.
- [ ] ADR 0272 linked above and in the ADR index.
- [ ] `docs/research/vessel-programs.md` written.

## Log

- 2026-10-21 — Created and started by the vessel programs session after the research; split with the auto dock session (plan 310 owns the autopilot runner, this plan builds on it). Part A done first because it does not depend on 310.
