---
id: 315
title: "Vessel programs: the player wins per channel, saved scripts that resume, the programs list, built-in mods on the Mods page"
status: done
owner: "vessel programs session (Claude)"
depends: [239, 042]
phase: 0
created: 2026-10-21
updated: 2026-10-21
---

# 315 — Vessel programs

## Goal

A script or a mod autopilot is a *program* attached to one vessel. It keeps flying that vessel when the player looks elsewhere, it is saved with the world and resumes when the world opens, and the player can always take any control channel back by touching it (the program resumes a second after the player lets go) or stop every program on the vessel with one key. The Flight status bar lists the running programs. The Mods page lists the built-in mods.

## Context

- Owner's requests (2026-10-21): scripts run per vessel even when it is not flown; foundation for mods that control ships; program state survives closing the world; a list of running programs in the status bar footer; research how KSP, KSP 2 and others decide who wins; MechJeb-style mods (plan 316); built-in mods in the Mods menu.
- Research: `research/vessel-programs.md`. ADRs: **0273** (this plan), 0271 (autopilots, plan 310), 0232, 0201 point 9, 0049 point 5, 0039 (warp hold), 0179 (signal refusal).
- Code: `packages/sim/src/commands.ts`, `delay.ts` (`CommandSource`), `state.ts`, `save.ts`; `packages/core/src/protocol.ts`, `save.ts`; `packages/scripting/src/runner.ts`, `prelude.ts`; `apps/web/src/lib/sim-host.ts`, `world-session`, `flight-loop.ts`, `hud/StatusStrip.svelte`, `hud/status-chips.ts`, `routes/(world)/mods/+page.svelte`.

## Scope

**In:**
- Part A: built-in mods on the Mods page.
- Part B: command sources and per-channel override in the sim (ADR 0273 points 2 to 5), snapshot `override`, events, `program-stop`, Delete key, Abort stops programs.
- Part C: saved scripts (`script-attach`/`-detach`/`-memory`, `memory`/`resumed` in the script API, resume on world open, one script per vessel), save version bump.
- Part D: the programs chip and list in the status strip, Manual badge in the HUD.

**Out:** the MechJeb-style autopilots (plan 316); porting the dev autopilot; e2e; quickjs-wasi snapshots.

## Steps

1. Plan, ADR 0273, research. Part A, commit.
2. Part B with sim tests, commit.
3. Part C with scripting, sim and web tests, commit.
4. Part D with web tests, commit.
5. Docs checklist, checks, commit.

## Acceptance criteria

- [x] web vitest `src/lib/mods/builtin-list.test.ts`: every `BUILTIN_PLUGINS` entry has a row; the Mods page shows a "Built in" section (browser check).
- [x] `bun test packages/sim` `test/programs.test.ts`: with a script program on a vessel, a player `attitude` with pitch 1 makes later script pitch writes drop while the script's yaw still applies; 1 s of sim time after the player sends pitch 0 the script's pitch applies again; a player throttle write blocks script throttle for 1 s; `program-override` and `program-resumed` events fire once each; `program-stop` detaches the script and clears overrides; no override is kept on a vessel without a program.
- [x] `bun test packages/sim`: `script-attach`, `script-memory` (rejected over 64 KiB or non-JSON) and `script-detach` change `vessel.script`; a save and resume keeps `script` with its memory.
- [x] `bun test packages/scripting`: `memory` and `resumed` are visible to the script; the runner reports a changed memory.
- [x] web vitest: the sim host starts a session per vessel and restarts saved scripts with `resumed: true`; `programs` model lists autopilot and script programs with their manual channels.
- [x] `bun run typecheck`, `bun test`, web vitest with `CI=true`, `bun run docs:check` pass.

## Docs checklist

- [x] `docs/STATUS.md` updated (board row).
- [x] `docs/journal/315-vessel-programs.md` written.
- [x] `docs/architecture/scripting.md` and `docs/guides/scripting.md` describe programs, sources, override, `memory`/`resumed`.
- [x] ADR 0273 linked above and in the ADR index.
- [x] `docs/research/vessel-programs.md` written.

## Log

- 2026-10-21 — Created and started by the vessel programs session after the research; split with the auto dock session (plan 310 owns the autopilot runner, this plan builds on it). Part A done first because it does not depend on 310.
- 2026-10-21 — Parts A to D done. One script per world kept (ADR 0273 point 7 says so; several at once is draft 317). Found and fixed: the replay recorder dropped the command source. Merged origin/main (plan 310 Part 2): held channels compared in the control part's axes. `stopAutopilot` waits for plan 310's `endAutopilot` (agreed with the auto dock session). Drafts 316 (Guidance Computer) and 317 (several scripts) written.
- 2026-10-21 — Verification:
  - `bun test packages/sim/test/programs.test.ts`: 8 pass; `packages/scripting/test/memory.test.ts`: 4 pass; web vitest `builtin-list`, `programs-model`, `sim-host-script`, `script-api`, `keybindings`: pass.
  - `bun run typecheck`: 0 errors (1 old warning). `bun run build`: done. `bun run docs:check`: OK.
  - `bun run test`: 2151 pass, 4 fail under load (two benchmarks, the 3 600-day career bot, the 1 000-staging reliability run); all four pass when run alone (benchmarks 2 + 2 pass, career bot and reliability 2 pass).
  - Web vitest with `CI=true`: 1420 pass, 3 fail before the help row fix (keybindings, now passing) and the two real-thread tests of `sim-host-script-worker.test.ts`, which fail on `main` too on this machine (Node 26 has no `--experimental-transform-types`).
  - Browser: Mods page "Built in"; a script resumed after reload (`resumed true runs 2`); Delete stopped it with a toast.

