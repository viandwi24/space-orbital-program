# 003 — Core: world, registries, events

**Plan:** plans/003-core-world-registries-events.md · **Session:** core session (Claude, 2026-10-16) · **Date:** 2026-10-16

## What was done

No scaffolding. `packages/core/package.json` gained `"@orbital/kepler": "workspace:*"` (then `bun install` to link). zod docs checked → `research/zod.md`.

| File | Contents |
|---|---|
| `src/math.ts` | `Vec3` (type re-export from kepler), `Quat`, `Transform` |
| `src/ids.ts` | branded `EntityId/PluginId/PartId/ModuleId/ResourceId/BodyId/SystemId`, validating constructors, id regexes |
| `src/units.ts` | `m, km, kg, tonnes, newtons, kN, seconds, minutes, hours, days, deg, toDegrees` |
| `src/events.ts` | `EventMap` (open interface, holds the two `world:*` events), `createEventBus<M>()` |
| `src/world.ts` | `createWorld`, `deserializeWorld`, `defineComponent`, `cloneData`, `World`, `WorldData` |
| `src/schemas.ts` | zod: ids, `worldDataSchema`, resource/body/part definition schemas |
| `src/definitions.ts` | `ResourceDefinition`, `BodyDefinition`, `PartDefinition` (inferred), minimal `ModuleDefinition`, `SystemDefinition` |
| `src/registry.ts` | `createRegistry`, `createRegistries`, `RegistryError`, `deepFreeze` |
| `src/physics-backend.ts` | `PhysicsBackend`, `BodyDesc`, `BodyShape`, `BodyHandle`, `JointHandle`, `Velocity` |
| `src/protocol.ts` | `Snapshot`, `VesselSnapshot`, `PartSnapshot`, `BodySnapshot`, `Command`, `VesselDesign` (provisional) |
| `src/rng.ts` | mulberry32 `createRng(seed)` → `next/range/int/state` |

Tests: `test/{world,registry,events,rng,units-ids}.test.ts` (33 + smoke) and compile-time `test/types.test-d.ts`.

## What surprised me

- `.test-d.ts` does not match bun's discovery patterns, so it is only checked by `tsc` (included through the package tsconfig `test/**/*.ts`). I verified it bites: deleting the `@ts-expect-error` above `events.on('nope', …)` produces `TS2345: '"nope"' is not assignable to parameter of type 'keyof EventMap'`.
- A heterogeneous handler map in the event bus and a name-keyed component store each need one type assertion (`payload as never` in `emit`; `as T | undefined` in `world.get`); both are commented. Branded id constructors cast after validating. No other assertions in `src`.
- zod schema instances must not be frozen: `deepFreeze` only freezes plain objects/arrays.
- Registry validation stores the original definition, not the zod-parsed copy (parse would strip unknown keys and drop functions).
- Physics forces: Rapier's `addForce` is persistent; the interface therefore states that forces last one step, so plan 004's adapter has to reset them after `step`.
- Module-augmenting `EventMap` was tested through the declaring file (`../src/events.ts`). Whether `declare module '@orbital/core'` or `'@orbital/sdk'` merges with a re-exported interface is untested and left to plan 005.

## Decisions made (link ADRs)

- ADR [0010](../decisions/0010-world-typed-component-tokens.md): typed component tokens.
- ADR [0011](../decisions/0011-core-reuses-kepler-types.md): core re-uses kepler `Vec3`/`OrbitalElements` via `import type`; `Quat` is core's own.
- No ADR (details): ids are validated at constructors; definition ids need >= 2 kebab segments while plugin ids need >= 1; `PartDefinition.modules` is `[moduleId, config][]` (data form).

## Open questions / follow-ups

- Plan 005: define how `definePart` sugar (module objects) maps to `PartDefinition`; extend `ModuleDefinition`/`SystemDefinition`; settle the augmentation specifier; loader consumes `Registry.entries()` / `owner()` for the manifest report.
- Plan 004: implement `PhysicsBackend` incl. one-step force lifetime; angular velocity is about local-frame axes; the `MockPhysicsBackend` named in plan 004 is not in core.
- Plan 007: validate `Command`s at the sim boundary (core has no command schema); `VesselDesign` is provisional (plans 006/007 own it). `Snapshot` vessels carry `soi`.
- Not added (not in the plan): component-value schemas on `deserializeWorld`, command zod schemas.

## Verification output

```
$ bun test packages/core
 34 pass
 0 fail
 3089 expect() calls
Ran 34 tests across 6 files.

$ bun test        81 pass, 0 fail (13 files)
$ bun run typecheck   all 7 packages "Exited with code 0"; @orbital/web check 0 ERRORS
$ bun run build       @orbital/web build ✔ done
$ grep -rn "Bun\.\|process\.\|window\.\|document\." packages/core/src   (no output)
$ grep -n '"lib"' packages/core/tsconfig.json   "lib": ["ESNext"]
$ bun run docs:check  docs-check: OK
```
