---
id: 003
title: "Core: world, registries, events"
status: ready
owner: ""
depends: [001]
phase: 0
created: 2026-10-16
updated: 2026-10-16
---

# 003 — Core: world, registries, events

## Goal

`@orbital/core` has the environment-neutral runtime that everything else builds on: identifier types and unit helpers, an entity/component **world** with serializable state, typed **registries** for parts/modules/resources/bodies/systems, a typed **event bus**, a **snapshot/command** type set, and the `PhysicsBackend` interface. No plugin loader yet (plan 005), no physics implementation (plan 004).

## Context

- Read: `docs/architecture/overview.md`, `boundaries.md`, `units-and-frames.md`, `plugin-system.md` (registries section), `simulation.md` (snapshot/command protocol).
- ADRs: 0003, 0004, 0007.

## Scope

**In:** ids & branded types; unit helpers; world (entities, components, queries, serialize/deserialize); registries with duplicate detection; event bus with typed `EventMap` (open interface for augmentation); `PhysicsBackend` interface; `Snapshot`/`Command` types; seeded PRNG.
**Out:** `definePlugin`/loader (005), any stock content, physics implementation, sim loop.

## Design notes

- **World:** keep it simple and data-oriented. `createWorld()` returns an object holding `entities: Set<EntityId>` and `components: Map<ComponentKey, Map<EntityId, unknown>>`. Provide `add/get/remove/has/query(keys[])`. Components are plain objects. No archetype optimisation now; the API must allow it later (never expose Map internals).
- **Registries:** `createRegistry<T extends { id: string }>(kind)` with `register(def, byPlugin)`, `get(id)`, `list()`, `has(id)`. Registering a duplicate id throws an error naming both plugins. Freeze definitions on register.
- **Events:** `createEventBus<EventMap>()` with `on/off/emit/once`. `EventMap` is an exported empty `interface` in `core` that plugins augment. Core emits a small set of its own (`world:entity-added`, `world:entity-removed`).
- **PhysicsBackend** (interface only):
  ```ts
  interface PhysicsBackend {
    createBody(desc: BodyDesc): BodyHandle; removeBody(h): void;
    createFixedJoint(a, b, frameA, frameB): JointHandle; removeJoint(h): void;
    applyForce(h, force: Vec3, point?: Vec3): void; applyTorque(h, torque: Vec3): void;
    setMass(h, mass, inertia?): void;
    step(dt): void;
    getTransform(h): { position: Vec3; rotation: Quat }; setTransform(...)
    getVelocity(h): { linear: Vec3; angular: Vec3 }; setVelocity(...)
    dispose(): void;
  }
  ```
  Positions are in the local physics frame (float32-safe range).
- **PRNG:** mulberry32 or xoshiro128**; `createRng(seed)` → `next()`, `range(a,b)`.
- Validation uses `zod` (catalog version) where definitions are checked; keep schemas in `src/schemas.ts` so the SDK can re-export them.

## Steps

1. `src/ids.ts`, `src/units.ts` (helpers return plain numbers: `km`, `tonnes`, `kN`, `deg`).
2. `src/world.ts` + tests.
3. `src/registry.ts` + tests (duplicate detection, freeze).
4. `src/events.ts` + tests (typing test via `expectTypeOf` or a compile-time test file).
5. `src/physics-backend.ts` (interface + `BodyDesc`, handles).
6. `src/protocol.ts` (`Snapshot`, `Command`).
7. `src/rng.ts` + test (seed determinism).
8. `src/index.ts` exports; `API_VERSION` stays `0.1.0`.
9. Journal; update `architecture/*` with any API that differs from the design docs.

## Acceptance criteria

- [ ] `bun test packages/core` passes with tests covering: world add/get/remove/query; serialize → deserialize round-trip equals (deep) the original; registry duplicate throws with both plugin ids in the message; event `once` fires once; rng with the same seed yields identical 1 000-number sequences.
- [ ] A compile-time test (`test/types.test-d.ts` or equivalent checked by `tsc`) proves `events.on("world:entity-added", e => e.id)` is typed and `events.on("nope", …)` is a type error.
- [ ] `bun run typecheck` passes; `packages/core/tsconfig.json` still has no DOM lib.
- [ ] `grep -rn "Bun\.\|process\.\|window\.\|document\." packages/core/src` returns nothing.
- [ ] `bun run docs:check` passes.

## Docs checklist

- [ ] `docs/STATUS.md`
- [ ] `docs/journal/003-core-world-registries-events.md`
- [ ] `docs/architecture/plugin-system.md` and `simulation.md` updated to match shipped types.
- [ ] ADR for any deviation (e.g. if the world API changed shape).

## Log

- 2026-10-16 — Created.
