---
id: 330
title: "Docking ports on the docking blueprints; Auto Dock flies around to the port axis, keeps a log and gets options and an alignment display"
status: done
owner: "auto dock session (Claude)"
depends: [310]
phase: 0
created: 2026-10-22
updated: 2026-10-22
---

# 330 — Docking blueprints, Auto Dock fly-around, logs, options and the alignment display

## Goal

The blueprints meant to dock have the ports to do it. Auto Dock docks from beside or behind the target port as well as from in front. It says what it is doing and why it stopped, has options, and draws an alignment display like KSP's Docking Port Alignment Indicator.

## Context

- Owner's report (2026-10-22, with screenshots):
  - Horizon Station and the ship below it are joined only by a decoupler.
  - With a port added by hand, Auto Dock did nothing; it was engaged beside the port: alignment 86°, 43 m off axis.
  - He asks for logs in the panel, and for mod panels with "custom iframe or UI": options, a visual, actions.
- ADRs 0149 (panels), 0271 (autopilots), new **0285**.

## Scope

**In:**
- Kronos V capsule port and Horizon Station's lower port.
- Auto Dock: fly-around phase, aborts only for real failures, a log, options (speed, start distance).
- The `select` panel node, `autopilot-settings`, `autopilot.log`, `autopilotLast`.
- Auto Dock panel: options, the alignment canvas, the log, the last result.

**Also in:** a mod panel's own UI in a sandboxed frame (ADR 0285 point 1); the ports snap face to face on capture (owner: crooked ports with a gap); the blueprint audit (owner: "make every blueprint really work").
**Out:** e2e.

## Steps

1. Blueprints.
2. Sim and core: settings, logs, last result.
3. Core and web: the `select` node.
4. Auto Dock: fly-around, options, log, panel and canvas.
5. Tests, docs, commit, push.

## Acceptance criteria

- [x] `missions.test.ts`: every blueprint still builds and resolves. Kronos V has a port on the capsule and on the lander of one size. Horizon Station has a free port under its core after staging.
- [x] `bun test mods/autodock`: from 40 m beside the target port (as in the owner's screenshot), and from behind it, Auto Dock docks within 15 minutes of sim time, and its log lists the phases.
- [x] `bun test packages/sim/test/autopilot.test.ts`: settings reach `start`; a refused engage and an ended run leave `autopilotLast` with the reason; the log keeps 30 lines at most.
- [x] Web vitest: a `select` node evaluates and returns its command.
- [x] `bun run typecheck`, web vitest (CI=true), `bun run docs:check` pass.

## Docs checklist

- [x] `docs/STATUS.md` row; `docs/journal/330-…` written; `docs/guides/vessel-pilot-api.md` and `docs/architecture/plugin-system.md` mention settings, logs and `select`.

## Log

- 2026-10-22 — Created and started (owner's request; defaults chosen without waiting).
- 2026-10-22 — Done. typecheck exit 0; bun test 2191 pass; web vitest all pass but the two script-worker cases (Node 26 dropped --experimental-transform-types, failing on main too); build exit 0; docs:check OK. Journal 330.
