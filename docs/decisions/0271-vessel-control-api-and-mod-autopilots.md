# 0271 — A public vessel-control API and autopilots that mods define

**Status:** accepted (owner's request, 2026-10-21)
**Date:** 2026-10-21
**Plan:** plans/310-vessel-menu-port-targets-control-api-and-auto-dock.md
**Amends:** ADR 0049 (SAS modes), ADR 0020/0031 (script ship API), ADR 0149 (panels read the snapshot)

## Context

The owner wants an Auto Dock mod with an autopilot, and an API through which mods and scripts fly a vessel "like kRPC and the KSP autopilot": SAS modes, a free direction or attitude, RCS translation, throttle, staging, the control part and the target, plus read-outs of the relative state and the port alignment. Today the controls exist as commands (`attitude` with `translate`, `sas`, `set-rcs`, `throttle`, `stage`, `set-control-part`, `target-set`) that keys and scripts send. Scripts run in the page's sandbox at the snapshot rate. Mods have no code that runs every step for a whole vessel: modules act on their own part. A docking autopilot must also be testable headlessly and deterministically.

## Decision

1. **One control path: commands.** The API never touches physics. Every control call becomes a `Command` that the sim validates through the same handler the keys and scripts use (`applyCommand`). There is no second control path.
2. **SAS gets a free direction and a free attitude.** `sas` takes `mode: 'direction'` with `direction` (a unit vector in the shared inertial axes): the control part's nose points along it. `mode: 'hold'` may carry `attitude` (a quaternion for the control part's orientation): the vessel turns to it and holds it. Both are vessel state and saved.
3. **`VesselControl` (in `@orbital/core`, exported by `@orbital/sdk`).** Built from a snapshot, a vessel id and a command sink. Read-outs: the vessel, its control part and that part's orientation, the target (with `target.position`/`velocity` measured port to port, ADR 0270), the target vessel and port, the relative state in the control part's axes, the port alignment (angle, lateral offset, distance along the target axis, closing speed) and resources. Controls: `sas`, `pointAt`, `holdAttitude`, `translate`, `rcs`, `throttle`, `stage`, `controlFrom`, `setTarget`, `targetPort`. The page, panels and tests can build one from any snapshot.
4. **Autopilots are a registry (`defineAutopilot`, `ctx.autopilots`).** An autopilot is `{ id, title, rate?, start(ctrl, params), step(ctrl, memory, dt) }`. Commands `autopilot-engage { vessel, autopilot, params? }` and `autopilot-disengage { vessel }` start and stop one per vessel. The sim runs an engaged autopilot inside the tick, before the step's commands are applied, at its `rate` (default 10 Hz) on sim time, so it is deterministic and works headless, under warp limits and while the page is closed. Its `VesselControl` is built from fresh snapshots of the vessel and its target vessel, and its commands go through `applyCommand` at once.
5. **What an autopilot reports.** `step` returns `{ phase, status?, readouts?, done?, abort? }`. The vessel snapshot carries `autopilot: { id, title, phase, status, readouts }`. Ending emits `autopilot:ended { vessel, autopilot, outcome: 'done' | 'aborted' | 'disengaged', reason }`. A docking ends the autopilot of both vessels with outcome `done` and reason `docked` (the vessel changed shape). A `step` or `start` that throws ends it as `aborted` with the error message: a broken mod never stops the game. On any end the sim clears the RCS translation it left.
6. **Memory is plain JSON, saved with the vessel.** `start` returns the memory object; `step` may change it. It is stored on `VesselState.autopilot` and survives save and load like other optional vessel fields.
7. **Scripts get the same controls.** The ship API adds `translate`, `rcs`, `controlFrom`, `pointAt`, port targets in `setTarget`, `engage`/`disengage` and the port alignment, each a command, so a script can do what a mod autopilot does.
8. **UI is a panel.** A mod shows its autopilot with `definePanel` (buttons that send `autopilot-engage`/`-disengage`, read-outs of `vessel.autopilot`). No new UI kind.

## Consequences

- Auto Dock (`mods/autodock`) is a plain mod: one autopilot, one panel, nothing outside the SDK.
- An autopilot runs in the sim Worker, not the script sandbox: it is trusted mod code like modules (ADR 0057), not stranger code.
- Snapshots for an engaged vessel are built ten times a second inside the sim; this is the cost of the feature and only paid while one is engaged.
