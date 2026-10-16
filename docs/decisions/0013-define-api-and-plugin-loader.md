# 0013 — The define-API and plugin loader shape

**Status:** accepted
**Date:** 2026-10-16
**Plan:** plans/005-sdk-define-api-plugin-loader.md

## Context

Plan 005 turns the design in `architecture/plugin-system.md` into the public contract (`API_VERSION` 0.1.0). Several points were open: how `definePart` maps module objects to core's data-form `PartDefinition`, how hooks stay assignable to the erased registry type without casts, what the loader does with each kind of failure, which semver syntax `meta.api` supports, and which module specifier mods augment.

## Decision

- **Split.** `@orbital/core` holds all runtime: `ModuleDefinition`/`ModuleContext`/`SystemDefinition`/`SystemContext` (`definitions.ts`), `Plugin`/`BasePluginContext`/`loadPlugins`/`PluginError` (`plugin.ts`), `satisfies` (`semver.ts`). `@orbital/sdk` holds only the six `define*` functions, their inference types (`PluginContext`, `MergeContributes`, `PartInput`) and a curated re-export list. Mods import only `@orbital/sdk` (which also re-exports `z`, one zod copy).
- **`definePlugin`.** `depends`/`optional` take plugin instances or id strings. `ctx` = registrars + `provide` typed by `contributes` + the merged `contributes` of *direct* dependencies; optional ones live at `ctx.optional` as `Partial<...>`. `contributes` is type-only (its runtime value is ignored); `ctx.provide(key, impl)` supplies the implementation, once per key across all plugins. Context names (`meta`, `events`, `parts`, `modules`, `resources`, `bodies`, `systems`, `optional`, `provide`) are reserved and cannot be provided. `setup` is synchronous.
- **`definePart`.** Entries are `[moduleObject, config]` (or `[moduleObject]` for config-less modules), checked against `z.input` of the module's schema through a `const` tuple type parameter; string-id entries `[id, config]` are accepted for ids in `ModuleMap`. The result is the data form `modules: [moduleId, config][]` with configs stored as written; defaults are applied by parsing with the module schema (`parseModuleConfig`) where the config is used. Hooks (`ModuleContext.config`) see `z.output`.
- **Hooks without casts.** `ModuleDefinition<In, Out, State>` types hooks with a parameter-bivariant function type (`Bivariant`), so every typed definition is assignable to the erased `ModuleDefinition` held by the registry, and a typed `setup` to `Plugin.setup`.
- **Loader (`loadPlugins`).** *Throws* (`PluginError`, or the original `RegistryError`) on: malformed or duplicate plugin id, dependency cycle (message names it: `a -> b -> a`), a setup exception (wrapped, with the plugin id), async setup, duplicate/reserved `provide` key, duplicate or invalid registry definitions, and part/module mismatches found by the post-boot cross-check (unknown module, config failing the module schema, module listed twice, unmet `requires`) — registrations cannot be rolled back, so these are not recoverable. *Disables with a reason in the report* (and, transitively, dependents): `api` range not satisfied by `API_VERSION` (or malformed), malformed `version`, missing or disabled hard dependency. Order is Kahn with ties broken by input position (deterministic). Optional dependencies add ordering edges when present.
- **Report:** `{ order, disabled: [{ id, reason }], registered: { part|module|resource|body|system: [{ id, by }] } }`.
- **Semver:** a ~60-line matcher in core, no dependency: `x.y.z` versions; `*`, bare/partial, `^` and `~` ranges with npm semantics; anything else (pre-release, comparators, `||`) throws `Unsupported version range`. Extending it is additive.
- **Augmentation.** `EventMap`, `ResourceMap`, `ModuleMap` are declared in core and re-exported by the SDK. Mods write `declare module '@orbital/sdk' { interface EventMap { ... } }`; verified with a compile-time test in `packages/sdk/test/define.test-d.ts` (and once from `mods/stock`) that TypeScript merges through the re-export into core's declaration, so `ctx.events` is typed. See `research/typescript.md`.
- **`SystemDefinition.update(world, dt, ctx)`** gains the third `SystemContext` argument `{ registries (read-only), events }`; the design's two-argument signature remains valid.

## Alternatives considered

- **`definePart(…, modules: [use(Engine, {...})])` helper entries** — simpler inference, but diverges from the design target; the tuple form was shown to infer fine, so kept.
- **`semver` from npm** — one more dependency for a single `^0.x` check; unneeded. Revisit if comparator ranges are ever required.
- **Disable (not throw) on bad part configs** — would hide data bugs and leave partially registered content; rejected for Phase 0. A mod-safety mode can come with external loading (Phase 2).
- **Async `setup`** — adds ordering nondeterminism; out of scope until external mod loading.
- **`any`-typed registry for modules** — rejected (no escape hatches); bivariance gives the same assignability.

## Consequences

- Plans 006/007 use `loadPlugins` from the SDK/core and read `registries` and `report`.
- `contributes` without a matching `provide` is not detectable at load time (the key list is type-only); a dependent would see `undefined`. Tests/hosts that need doubles provide the key from another plugin. A runtime key list can be added later without breaking the form.
- Any change to these shapes is an API break: bump `API_VERSION` minor (0.x) and write an ADR (`conventions/versioning.md`).
