# 0015 — Module capability API: `ModuleContext.vessel`, `store`, `controlSource`, `crossfeed`

**Status:** accepted
**Date:** 2026-10-16
**Plan:** plans/007-sim-loop-flight-onrails.md

## Context

Plan 006 shipped stock engines, tanks, decouplers and reaction wheels as declarative modules: config, state, pure arithmetic helpers (`engineOutput`, `propellantRates`, `withdraw`, `deposit`) and state-only hooks, because `ModuleContext` offered no body handle and no access to other parts' resources. Two ways to finish the job were recorded (journal 006): the sim reads the documented stock config and state and applies the effects, or the context is extended so the hooks do it. The first makes `sim` know stock module ids (or a stock-specific protocol), which `boundaries.md` and ADR 0005 forbid: stock is a mod like any other and the sim has no back doors.

## Decision

Extend the mod API additively (`API_VERSION` 0.1.1 → 0.1.2, patch while 0.x per `conventions/versioning.md`; every existing plugin keeps loading):

- **`ModuleContext.vessel: VesselApi`**, the capabilities of the vessel the part belongs to, from the part's point of view:
  - `time`, `control` (`throttle` 0..1; `pitch`/`roll`/`yaw` demand -1..1 about the vessel body axes +X/+Y/+Z), `ambient` (`pressure`, `density`, `altitude`; zeros in vacuum);
  - `applyForce(force, point?)` and `applyTorque(torque)` in the part's local frame, for the current step only, flight mode only (throws on rails; `updateOnRails` must not use them);
  - `resources.amount/withdraw/deposit(resource, …)`: routed by the sim through the vessel's stores according to each resource's `flowMode` (`none`: nothing, `vessel`: every store, `stack`: stores reachable from the part without passing through a part whose `crossfeed` is false, nearest first);
  - `detach(node, impulse?)`: sever the attachment at one of this part's nodes; the sim splits the vessel after the hook returns and pushes the halves apart with equal and opposite momentum.
- **`ModuleDefinition.store?: ResourceStore`** (`resources/amount/withdraw/deposit`): a module that holds resources. The sim sums container mass (`Σ amount × density`) and routes flow through it without naming any module.
- **`ModuleDefinition.controlSource?: boolean`**: a vessel with at least one such part accepts `throttle`/`attitude`/`stage` commands, keeps the vessel id when it splits, and is not destroyed as debris.
- **`PartDefinition.crossfeed?: boolean`** (default true): resources may flow through the part. Stock engines and decouplers set it to false, which is what makes a decoupler a stage barrier.
- Core's `EventMap` gains the sim events `vessel:mode-changed`, `vessel:created`, `vessel:destroyed`, `stage:activated`; stock augments it with `stock:engine-flameout`.

Stock implements `update` (engine, reaction wheel), `onStage`/`decouple` (decoupler → `detach`), `store` (container) and `controlSource` (command) with it; the sim contains no stock ids (`grep "stock\." packages/sim/src` is empty).

## Alternatives considered

- **Sim applies stock effects from documented config/state** — fastest, but couples the sim to stock (a second, privileged mod interface) and every third-party engine would need sim changes. Rejected.
- **Hand modules the physics backend plus a body handle** — leaks f32 local-frame handles and the frame re-anchoring into mods, and makes on-rails/flight differences the mod's problem. The capability API hides them.
- **Resource flow as a separate registered system** — the flow depends on the requesting part and happens inside the module's step (engines need the answer immediately to scale thrust), so a pull API fits better than a per-step system.
- **Per-node crossfeed flags instead of a part flag** — more precise (KSP has both), but nothing needs it yet; a part-level flag is the smaller schema change and a node-level one can be added later without breaking it.
- **Applying reaction-wheel torque as a force couple or spread over all bodies** — considered for joint softness; see ADR 0017 for what the sim actually does.

## Consequences

- `ModuleContext.vessel` is required, so code that constructs a `ModuleContext` by hand (mod unit tests) must supply one; `mods/stock/test/helpers.ts` has a recording `fakeVessel`.
- `docs/architecture/plugin-system.md` and `docs/guides/writing-a-mod.md` describe the new surface.
- Impulses are applied as a velocity change to each half's bodies, not via the physics backend (which only has one-step forces).
- Open: nothing in the context yet for modules that need the part's world position or the vessel's orientation (not needed by stock); additive when someone does.
