# 0175 — Objectives: trees, primitives, scheduling, vessel binding and the save

**Status:** accepted
**Date:** 2026-10-17
**Plan:** 098
**Builds on:** ADR 0098 point 4 (one evaluator of deterministic primitives), 0104 (every system ships its define point), 0113 (ledger), 0171 (world tick), 0110 (state the sim core holds beside the ECS world).

## Context

Contracts (099), missions (100) and scripts need one evaluator. ADR 0098 names the primitives and says they are evaluated on events and on the world tick. Still open: the shape of a primitive, how trees combine, when evaluation runs (a "reach orbit" must complete on the step the orbit becomes stable, and that is not an event), which vessel an objective is about, and where active objectives are saved.

## Decision

1. **Primitive.** `defineObjective({ id, label, params, on?, constraint?, evaluate })`. `params` is a zod schema. `evaluate(params, view, prior)` returns `{ status: 'active' | 'done' | 'failed', progress, data? }` and is pure. `view` is a read-only `ObjectiveView` (sim time, the home body id, and vessels with `id`, `body`, `mode`, `landed`, `altitude`, `periapsis`, `apoapsis`), and `prior` is the leaf's last result, with `data` for memory such as "entered the sphere". `on` lists `'step'`, `'tick'` or event names (default `['step']`).
2. **Leaves are sticky** once `done` (a later step cannot undo "reached orbit"), except `constraint` leaves such as `stock.before`, which are evaluated every time and fail their tree when they fail.
3. **Trees.** A node is `{ objective, params }`, `{ all }`, `{ any }` or `{ sequence }`. `all` is done when every child is done and failed when one fails. `any` is done when one is done and failed when all fail. `sequence` evaluates only its first unfinished child: it is done when the last one is, and failed when the current one fails. Children after the current one are not evaluated, so finishing them early counts for nothing.
4. **Vessel binding.** An active objective may name a `vessel`. Then the view holds only that vessel (and its pieces after staging, through its id). Without one, the view holds every vessel and a leaf is satisfied when any vessel satisfies it. Plan 099 decides which form a contract uses.
5. **Scheduling.** The sim evaluates active objectives after each flight step and each rails chunk, and only those whose current leaves listen to `'step'` or were marked by an event they listen to. Events mark instances during the step, and evaluation runs at its end, so the order is fixed. On each world tick it evaluates the instances that listen to `'tick'`. The cost is O(active objectives) per evaluation.
6. **Contracts and missions** are data: `defineContract({ id, title, objectives, reward?, penalty?, deadline?, prerequisites? })` and `defineMission({ id, title, objectives, reward?, prerequisites? })`. `reward` and `penalty` are `{ currency, amount }` lists, written to the ledger with the contract or mission id as `cause` when the economy rule is on. `deadline` is in seconds after the start. `prerequisites` are contract or mission ids that must have completed.
7. **Start and report.** The command `objective-start { source: { kind, id }, vessel? }` validates the source and its prerequisites. The events are `objective:completed` and `objective:failed` (`{ id, source, time }`). `Snapshot.objectives` lists active and finished instances with per-leaf status and progress.
8. **Save.** An optional `SimSave.objectives = { next, active, finished }` in format 5, like `economy` and `worldTick`: no entity, so vessel entity ids do not shift, and no format bump. A save without it has none.
9. **Later primitives:** return a sample (plan 103), hold a comms link (114) and deliver a payload (128) are added by those plans with the same interface; no placeholder code exists before then.

## Alternatives considered

- **Objectives as ECS entities** — rejected: they would shift the entity ids of later vessels, and a world component gains nothing over the core-held state that economy already uses.
- **Evaluate on events only** — rejected: orbit, altitude and periapsis change continuously, with no event at the threshold.
- **Evaluate every objective every step** — rejected: it would cost the same as subscriptions for flight primitives, but ticks and events would then have no meaning.

## Consequences

- **Mod API:** `defineObjective`, `defineContract`, `defineMission`, `ctx.objectives`, `ctx.contracts`, `ctx.missions`, the tree and view types; additive, `API_VERSION` patch bump. Load report kinds `objective`, `contract`, `mission`.
- **Protocol:** `objective-start`, events, `Snapshot.objectives`. **Save:** optional field.
