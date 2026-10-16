---
id: 005
title: SDK define-API + plugin loader
status: done
owner: "sdk session (Claude, 2026-10-16)"
depends: [003]
phase: 0
created: 2026-10-16
updated: 2026-10-16
---

# 005 — SDK define-API + plugin loader

## Goal

`@orbital/sdk` exposes `definePlugin`, `defineModule`, `definePart`, `defineResource`, `defineBody`, `defineSystem` with full type inference (typed `ctx` from `depends`/`contributes`, part configs checked against module zod schemas), and `@orbital/core` gains a loader that validates, orders (Kahn), boots plugins, and reports what was registered. This is the public contract; design it to last.

## Context

- Read: `docs/architecture/plugin-system.md` (the design — implement it, then update it to what shipped).
- ADRs: 0005; write a new ADR for any shape change to the define-API.
- Journal: `docs/journal/003-core-world-registries-events.md` (open questions for this plan).
- Prior art the design is based on: the `definePlugin` pattern with `depends: [PluginInstance]` → `MergeContributes<Deps>` via `UnionToIntersection`.

## Scope

**In:** the six define functions; `PluginContext`; loader with topo-sort, cycle detection, missing/optional deps, `api` semver range check; module augmentation points (`ResourceMap`, `EventMap`, `ModuleMap`); a test plugin pair proving typed contributions; JSON part loading via the same schemas.
**Out:** external (runtime) mod loading from URLs, patching (Phase 2), scripting.

## Design notes

Decisions made while refining (all recorded in ADR 0013 once shipped; verified facts in `docs/research/`):

- **Where things live.** `@orbital/core` owns everything runtime: extended `ModuleDefinition`/`SystemDefinition` (`definitions.ts`), the `Plugin` runtime shape, `PluginContext` and `loadPlugins` (`plugin.ts`), a minimal semver matcher (`semver.ts`). `@orbital/sdk` (`define.ts`) owns only the `define*` functions and their inference types, and re-exports everything a mod needs from core (so mods never import core).
- **Type inference target** (must compile in a test file):
  ```ts
  const A = definePlugin({ meta: { id: 'a', version: '1.0.0', api: '^0.1' }, contributes: {} as { a: { hi(): string } }, setup(ctx) { ctx.provide('a', { hi: () => 'hi' }); } });
  const B = definePlugin({ meta: { id: 'b', version: '1.0.0', api: '^0.1' }, depends: [A], setup(ctx) { ctx.a.hi(); /* typed */ } });
  ```
  and `ctx.a` inside a plugin that does not depend on `A` must be a type error. `depends` and `optional` accept plugin instances (typed) or id strings (untyped, ordering only). Only *direct* dependencies' contributions are in `ctx`; optional ones appear as `ctx.optional.<key>?`.
- **Part config typing.** `definePart({ modules: [[Engine, { thrust: 1 }], [Command]] })`: a `const` type parameter `M` over the module tuple with `{ [K in keyof M]: Entry<M[K]> }`; `Entry` is `readonly [M, z.input<schema>]`, or `readonly [M] | readonly [M, undefined]` for config-less modules. Configs are the schema's *input* type (what the author writes: defaults are optional); behaviour hooks receive the *parsed output*. `definePart` returns the core data form (`PartDefinition`), mapping each module object to `[module.id, config]`; the config is stored raw (as written). String-id entries (JSON form) are validated at load time by the loader against the module's schema. Verified feasible with a scratch compile before writing this plan.
- **Hooks without `any`.** `ModuleDefinition<In, Out, State>`: `config?: z.ZodType<Out, In>`, `state?: () => State`, hooks `onStage`, `update`, `updateOnRails`, `actions`, `snapshot`. Hook function types use the bivariance hack so a typed definition is assignable to the erased `ModuleDefinition` stored in the registry without casts. `ModuleContext` = `{ world, events, registries, physics, entity, config, state }`; plan 007 builds it. `SystemDefinition.update(world, dt, ctx)` gains a third `SystemContext` argument `{ registries (read-only), events }` (additive).
- **Loader.** `loadPlugins(plugins, options?)` -> `{ registries, events, report }`. `options`: `registries?`, `events?`, `apiVersion?` (default `API_VERSION`). Steps: duplicate plugin id -> throws `PluginError`; `api` range vs `apiVersion` (unsatisfied -> disabled with reason); missing hard dependency -> disabled with reason; dependents of disabled plugins are disabled transitively; Kahn topological sort over the remaining plugins (ties broken by input order, so the order is deterministic); cycle -> throws `PluginError` naming the cycle (`a -> b -> a`); then `setup(ctx)` in order. Setup exceptions are wrapped in `PluginError` naming the plugin and rethrown (registrations cannot be rolled back, so a half-booted state is never returned). `RegistryError` (duplicate ids, invalid definitions) propagates unchanged: its message already names both plugins. After all setups the loader cross-checks every registered part: each referenced module must exist, its config must parse with the module's zod schema, and the module's `requires` must be present on the same part; any violation throws one aggregated `PluginError` naming the part, plugin and zod issues.
- **Report.** `{ order: string[], disabled: Array<{ id, reason }>, registered: Record<'part'|'module'|'resource'|'body'|'system', Array<{ id, by }>> }` (keys are the registry `kind` strings).
- **Provided APIs.** `ctx.provide(key, impl)`: a key may be provided once across all plugins (second provider -> `PluginError` naming both). A dependent's `ctx` is assembled from its direct dependencies' provided keys.
- **Semver.** Minimal matcher in `packages/core/src/semver.ts`, no dependency: versions `x.y.z`; ranges `*`, `x.y.z`, `^x[.y[.z]]`, `~x[.y[.z]]` with standard npm semantics (`^0.1` = `>=0.1.0 <0.2.0`, `^0.0.3` = `=0.0.3`). Anything else is rejected with an error naming the range (no pre-release, no comparators; extend later by ADR). The docs only ever need `^0.x` ranges for `meta.api`, so a library is not worth a dependency (ADR 0013).
- **Module augmentation.** `ResourceMap`, `EventMap`, `ModuleMap` are open interfaces declared in core and re-exported by the SDK. Which specifier works for mods (`'@orbital/sdk'` vs `'@orbital/core'`) is settled by a compile-time test in `sdk/test` and documented in `plugin-system.md`. `ModuleMap` (module id -> config input type) types string-id entries in `definePart`; `ResourceMap` (resource id -> info) feeds the exported `ResourceKey` type.

## Steps

1. `packages/core/src/semver.ts` (+ `test/semver.test.ts`); extend `definitions.ts` (`ModuleDefinition`, `ModuleContext`, `SystemDefinition`/`SystemContext`, `ReadonlyRegistry`); add `ResourceMap`/`ModuleMap` interfaces.
2. `packages/core/src/plugin.ts`: `PluginMeta`, `Plugin`, `PluginContext`, `PluginError`, `loadPlugins`, `LoadReport`; export from `index.ts`.
3. `packages/sdk/src/define.ts`: `definePlugin`, `defineModule`, `definePart`, `defineResource`, `defineBody`, `defineSystem` with the inference types; `packages/sdk/src/index.ts` re-exports (schemas, public types, `loadPlugins`, `z`).
4. Tests in `packages/core/test` (semver, loader behaviour) and `packages/sdk/test`: typed contributions compile (`define.test-d.ts`, positive and negative); loader order; cycle error names the cycle; missing hard dep disables with reason (and cascades); optional dep absent -> `ctx.optional.x` undefined; `api` mismatch refused; duplicate id across plugins errors naming both; part config validated against the module schema; module `requires` checked.
5. JSON part fixture (`sdk/test/fixtures/part.json`) loads through a plugin, validates with the same schema, and a bad config is rejected.
6. Update `docs/architecture/plugin-system.md` to match; glossary; research notes; journal; ADR 0013.

## Acceptance criteria

- [x] `bun test packages/sdk packages/core` passes with the tests in steps 4-5 (listed above, including: loader order, cycle error names the cycle, missing hard dep disables with reason, optional dep absent, `api` mismatch refused, duplicate id errors naming both plugins, JSON part fixture validates with the same schema).
- [x] A compile-time test (`packages/sdk/test/define.test-d.ts`, checked by `bun run typecheck`) proves the typed `ctx` behaviour with positive and negative (`@ts-expect-error`) cases: `ctx.a.hi()` typed in a dependent; `ctx.a` an error in a non-dependent; part module configs checked against the module schema; module augmentation (`EventMap`) works through the documented specifier. Each negative case was shown to bite by temporarily removing its directive.
- [x] `mods/stock` still typechecks (it imports only `@orbital/sdk`): `bun run --filter @orbital/mod-stock typecheck`.
- [x] `bun test`, `bun run typecheck`, `bun run build`, `bun run docs:check` pass.
- [x] `grep -rn "Bun\.\|process\.\|window\.\|document\." packages/core/src packages/sdk/src` returns nothing, and `packages/sdk/src` imports only `@orbital/core` and `zod`.

## Docs checklist

- [x] `docs/STATUS.md`, journal.
- [x] `docs/architecture/plugin-system.md` rewritten to match shipped API (keep the "design target" examples current).
- [x] ADR 0013 for the final define-API shape, indexed and linked from the plan Log.
- [x] `docs/research/zod.md` (z.input) and `docs/research/typescript.md` (module augmentation), README index.
- [x] Glossary terms.

## Log

- 2026-10-16 — Created as draft.
- 2026-10-16 — Refined draft -> ready at the human's request (session: sdk session).
- 2026-10-16 — Status ready -> in-progress (sdk session). ADR number is 0013 (0012 was taken by plan 008's ADR); references above updated.
- 2026-10-16 — Done. Evidence: `bun test packages/sdk packages/core` 87 pass / 0 fail; `define.test-d.ts` has 22 `@ts-expect-error` cases, removing all produced 22 errors; `declare module '@orbital/sdk'` augmentation verified from `sdk/test` and `mods/stock`; `bun test` 168 pass; `bun run typecheck` all packages exit 0 (mod-stock included); `bun run build` ok; grep for DOM/Bun/process APIs in core+sdk src empty. ADR [0013](../decisions/0013-define-api-and-plugin-loader.md); journal `journal/005-sdk-define-api-plugin-loader.md`. Deviation from the draft: loader tests live mostly in `sdk/test/loader.test.ts` (they use `definePlugin`), semver tests in `core/test`.
