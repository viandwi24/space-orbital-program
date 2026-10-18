# 0200 — Debug panel, cheats, set-state tools and the debug API

**Status:** accepted
**Date:** 2026-10-18
**Plan:** plans/203-debug-panel-and-cheats.md
**Builds on:** ADR 0094 (worlds are saves, modes are presets over rules), ADR 0126 (checks for what changed), ADR 0061 (one binding table)

## Context

KSP1 has an `Alt+F12` debug toolbar with cheats, set orbit and a log console. Players use it to test a design without a 30-minute flight (research doc 12 §4 and §6.4). We have only a dev-only ascent autopilot (`autopilot.ts:1-7`, toggled under `import.meta.env.DEV` in `flight-loop.ts:479,645-669`). Release testing and agent e2e runs also need to reach a state (an orbit, a descent at a given speed, an empty tank) in seconds, not by flying there. Plan 202 adds an in-memory log buffer; nothing reads it yet. Rancangan §5b.

## Decision

1. **One Debug panel, seven tabs:** Cheats, Set orbit, Set location, Resources, Log, Overlay, Info. It opens with `Alt+F12` (a binding in the table of ADR 0061, remappable) and from the ☰ menu. Overlay is P1; its tab exists and says so.
2. **Cheats are switches in the sim's world state,** not UI flags: infinite fuel, infinite EC, infinite monoprop and EVA propellant, no crash damage, ignore part temperature limits, unbreakable joints, comms without signal, life support never runs out, add funds/science/reputation, instant construction, unlock all tech. Each one is a sim command, so it is saved and replayed like any other.
3. **Set orbit:** pick a body; enter Ap/Pe altitudes or the elements a, e, i, Ω, ω and the anomaly; presets "low orbit", "moon orbit", "transfer to …". It applies to the active vessel or spawns a new one from a design.
4. **Set location:** landed at a site, at coordinates, or at an altitude in the atmosphere with a given velocity (for chute and re-entry tests).
5. **Set resources and state:** fill, empty or set an exact amount per tank and per resource; set a part's temperature; set a crew member's level.
6. **Log:** sim events (stage, decouple, explosion with its cause, control-source change, refused warp with its reason), warnings and errors including uncaught JS errors from plan 202's buffer. Filter, copy and download as a file. The bug-report flow attaches it.
7. **Info:** FPS, sim time per step, vessel count, memory, version, and the quality governor's level and changes (plan 201).
8. **Access rule.** Sandbox: always available. Other modes: the player turns on **"Debug mode"** in Settings; the save is then marked **"used cheats"** for good, shown in Worlds and next to achievements, and no achievement unlocks in that world (default per owner review, rancangan §15 #14; may change). **Career Hardcore: locked** (default per owner review, rancangan §15 #14; may change).
9. **The same API for scripts and e2e:** `debug.setOrbit`, `debug.setLocation`, `debug.setResource`, `debug.setCheat`, `debug.setTemperature`, `debug.log`. It calls the same sim commands as the panel and is live only while debug mode is on for the world (always in Sandbox). Playwright tests reach it through `window.__orbitalDebug` in builds with debug mode on; scripts reach it as `debug.*`. Later plans use it in their acceptance criteria to set up a state.

## Alternatives considered

- **Dev-build-only tools** (today's autopilot) — rejected: players want the KSP test workflow, and e2e must run against the release build.
- **Cheats as a separate Sandbox-only panel** (rancangan §12.2, P1 line) — folded into this panel; the access rule in point 8 covers every mode.
- **No "used cheats" mark** — rejected: achievements and shared saves would mean nothing.

## Consequences

- Plan 203 delivers the panel, the commands, the save mark and the API.
- Every plan after 203 may set up its e2e state through the debug API instead of flying there.
- Saves gain a `usedCheats` flag (additive, no version bump).
- The Worlds screen and the achievements tracker read the flag.
