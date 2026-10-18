---
id: 205
title: "Clock states, pause rules, tab policy, leaving active flight"
status: draft
owner: ""
depends: [204]
phase: 7
created: 2026-10-18
updated: 2026-10-18
---

# 205 — Clock states, pause rules, tab policy, leaving active flight

## Goal

The world clock has explicit states (Running, Warp, Paused by player, Paused by place, Paused by tab, Background) shown as a chip in the time bar. A player pause always wins. The world rule "Pause allowed" locks pause in Career Hardcore. Places pause on their own by the player's Settings → Time choices, a tab-background setting decides what happens in a hidden tab, leaving an active flight asks first, and warp-stopping events land in the bell.

## Context

- rancangan §3.2–3.7, §2.2 (time chip), §12.2 ("Pause allowed"); owner questions §15 #1 and #6.
- Research: `refs/reverse-engineering-ksp-ksp2/01-time-scenes-and-persistence.md`.
- Builds on the world session store and time bar from plan 204 (`apps/web/src/lib/world-session.ts`, `apps/web/src/lib/layout/`).
- Today the pause menu is Escape in flight only (`apps/web/src/lib/keybindings.ts:176`); audio suspends while hidden (`apps/web/src/lib/audio/engine.ts`).
- Rules: `packages/core/src/rules.ts`, `mods/stock/src/rules.ts`; settings: `apps/web/src/lib/settings/settings.ts`.
- ADRs: 0201 (clock states and pause rules).
- Defaults per owner review; may change:
  - pause key `P` on every page, Space only outside Flight (rancangan §15 #6);
  - "Pause allowed" may change mid-game only toward easier, with a log entry (rancangan §15 #1; the editor UI is plan 230);
  - place pauses: Hangar, menus and Launch paused; Space Center, Mission Center, Map, other buildings and Flight running (rancangan §3.4);
  - "Keep running in a background tab" off (rancangan §3.5).

## Scope

**In:**
- Clock state machine in the world session, with the chip text (`PAUSED`, `PAUSED · HANGAR`, `LOCKED`, `BACKGROUND`).
- World rule `stock.pause-allowed` (Sandbox, Science, standard Career: yes; Hardcore: no). When no, the pause button is locked with a reason and the world runs in the background too; warp stays allowed.
- Settings → Time: per-place auto pause; a chip in the time bar to toggle the current place.
- Tab policy setting: off pauses on hide; on keeps running and catches up from wall time on return.
- Leave-flight warning when the active vessel is in the atmosphere, under thrust or in physics: "Stay here" / "Leave anyway", plus "Don't ask again" restorable in Settings. The vessel keeps full physics with SAS and scripts after leaving.
- Warp-stopping events into the bell: alarm, maneuver, SOI change, atmosphere entry, construction done, contract deadline, EC out, life support critical, transfer window (sources that exist today; later plans add theirs).

**Out:** catching up on real time after the game was closed (P2, rancangan §3.10); rule editor UI (plan 230).

## Touches

- **Size:** M
- **Edits:** `apps/web/src/lib/world-session.ts`, `apps/web/src/lib/clock-state.ts` (new), `apps/web/src/lib/layout/` (time chip, bell feed), `apps/web/src/lib/settings/settings.ts`, `apps/web/src/lib/ui/SettingsDialog.svelte` (Time tab), `apps/web/src/lib/keybindings.ts` (`P`), `mods/stock/src/rules.ts`, `packages/sim/src/commands.ts` (pause refused when the rule says no), `packages/sim/src/hooks.ts` (warp-stop events)
- **Shared contracts:** **rules** (`stock.pause-allowed`), **settings** (place pauses, tab policy, leave-flight prompt), **bell feed** (event kinds), **sim events** (`warp:stopped` with a reason).

## Design notes

- The state machine is pure (`clock-state.ts`): inputs are player pause, place, tab visibility, rule and warp; output is one state and whether the sim ticks. Player pause has the highest priority and is cleared only by the player.
- Catch-up after a hidden tab uses wall-clock delta with the same step cap as warp, so a long absence runs on rails.

## Steps

1. Pure clock state machine with tests.
2. Rule `stock.pause-allowed` and sim refusal; pause key `P` and Space outside Flight.
3. Place pauses in Settings → Time and the time-bar chip.
4. Tab policy and catch-up.
5. Leave-flight warning with "Don't ask again".
6. Warp-stop events into the bell; e2e.

## Acceptance criteria

- [ ] `apps/web` vitest `clock-state.test.ts`: player pause beats every other input; place pause resumes on leaving the place only when the player did not pause; Hardcore never reaches a paused state; tab hidden with the policy off gives "Paused by tab".
- [ ] `bun test packages/sim` passes, including `test/pause-rule.test.ts`: a pause command in a Hardcore world is refused with a reason; warp is accepted.
- [ ] Chromium e2e `e2e/clock.e2e.ts`: in Space Center the clock runs; in Hangar the chip reads `PAUSED · HANGAR`; back in Space Center it runs again; `P` pauses and leaving to Hangar and back keeps it paused.
- [ ] Chromium e2e `e2e/leave-flight.e2e.ts`: with `debugSetLocation` at 5 km in the atmosphere, leaving Flight shows the warning; "Leave anyway" goes to Space Center and the vessel's altitude keeps changing in the snapshot.
- [ ] `bun run check:affected --e2e e2e/clock.e2e.ts` passes.
- [ ] CI green on the `ready/205` tag (`refs/ci/pass/<sha>`, ADR 0126).

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row, next plan, open issues).
- [ ] `docs/journal/205-clock-states-and-pause-rules.md` written.
- [ ] `docs/architecture/overview.md` (clock states) and `docs/architecture/simulation.md` (pause rule, warp-stop events) updated.
- [ ] ADR 0201 linked; any deviation recorded.

## Log

- 2026-10-18 — Created from refs/rancangan-terpadu.md (release roadmap).
