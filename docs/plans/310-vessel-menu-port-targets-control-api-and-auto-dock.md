---
id: 310
title: "Vessel menu in Flight, docking-port targets, a vessel-control API and the Auto Dock mod"
status: done
owner: "auto dock session (Claude)"
depends: [222, 221, 035, 057]
phase: 0
created: 2026-10-21
updated: 2026-10-21
---

# 310 — Vessel menu in Flight, docking-port targets, a vessel-control API and the Auto Dock mod

## Goal

From the Flight view the player clicks a nearby vessel to fly it, target it or target one of its docking ports. A port target is measured at the port, and the controls follow the chosen control part, as in KSP. Mods and scripts fly a vessel through one public control API. The new Auto Dock mod uses only that API to dock with the targeted port.

## Context

- Owner's requests (2026-10-21): click nearby vessels in Flight with a menu; target another vessel's docking port, KSP-style, so it applies to maneuvers too; an "Auto Dock" mod with an autopilot that docks once Control From and the target port are set, with an API for mods; control through SAS and RCS like KSP/KSP2.
- ADRs: 0065 (targets), 0084 (target markers), 0208 (switching, control from here), 0218 (docking), 0049 (SAS), 0149 (panels), new **0270** and **0271**.
- Code: `packages/sim/src/target.ts`, `docking.ts`, `sas.ts`, `commands.ts`; `apps/web/src/lib/flight-loop.ts` (`switchVessel`); `packages/scripting/src/prelude.ts`.

## Scope

**In:**
- Part 1: flight vessel menu and hover tooltip (`Renderer.vesselAt`, marker fallback, focus on another vessel).
- Part 2: target positions and velocities measured at the target port and own control port; controls in the control part's axes.
- Part 3: SAS `direction` and `hold` with `attitude`; `VesselControl` in core and SDK; `defineAutopilot`; `autopilot-engage`/`-disengage`; snapshot `autopilot`; ship API additions; docs in `docs/guides/`.
- Part 4: `mods/autodock` (`@orbital/mod-autodock`), built in: the `autodock.dock` autopilot and its panel; headless sim tests (success from 200 m, abort paths).

**Out:** e2e (owner's instruction). Roll alignment of ports (the capture needs none). Map closest approach at the port (ADR 0270 point 3).

## Steps

1. Plan and ADRs 0270, 0271.
2. Part 1, commit.
3. Part 2 with sim tests, commit.
4. Part 3 with core/sim/scripting tests and the guide, commit.
5. Part 4 with the mod's sim tests, commit.
6. Docs checklist, checks, push.

## Acceptance criteria

- [x] Flight: clicking another vessel's mesh or marker opens the menu with Control, Set as target, Target a docking port, Focus camera and Rename; hovering shows name, distance and relative speed (web vitest for the menu model).
- [x] `bun test packages/sim`: with a port targeted, `target.position` is the port face minus the own control port face; `attitude` translate with a sideways control part pushes along that part's axes.
- [x] `bun test packages/sim`: SAS `direction` points the control nose within 1 degree of the asked direction; `autopilot-engage` runs a test autopilot at 10 Hz and its commands are applied; a throwing autopilot ends as `aborted`.
- [x] `bun test mods/autodock`: two vessels 200 m apart in orbit dock with Auto Dock within 15 minutes of sim time; engaging without Control From on a port, or from behind the target port, aborts with a reason.
- [x] `bun run typecheck`, `bun run test` (or `bun test`), web vitest with `CI=true`, `bun run docs:check` pass. Exceptions: the two script-worker vitest cases need Node's `--experimental-transform-types`, which Node 26 removed, so they fail on main too. Three wall-clock benchmarks fail only while another session's tests share the CPU.
- [x] Owner reports, same day:
  - The vessel menu no longer throws `reading 'menu'` after Control or a decouple (vitest).
  - SAS turns are torque-limited (`packages/sim/test/torque-turn.test.ts`: probe 6 s, long stack 166 s; no torque, no turn; RCS spends monopropellant).
  - LOW TORQUE / NO TORQUE chip.

## Docs checklist

- [x] `docs/STATUS.md` updated (board row).
- [x] `docs/journal/310-vessel-menu-port-targets-control-api-and-auto-dock.md` written.
- [x] `docs/guides/vessel-pilot-api.md` written; scripting guide lists the new ship calls.
- [x] ADRs 0270 and 0271 linked above.

## Log

- 2026-10-21 — Created and started by the auto dock session; defaults chosen without waiting (owner's instruction).
- 2026-10-21 — Done. Also fixed the vessel-menu crash and made SAS turns torque-limited (owner reports). The public API is named `VesselPilot` (`VesselControl` was taken). Auto Dock docks from 200 m in about 3 minutes of sim time. Journal 310.
