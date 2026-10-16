# 005 — SDK define-API + plugin loader

**Plan:** plans/005-sdk-define-api-plugin-loader.md · **Session(s):** sdk session (Claude, 2026-10-16) · **Date:** 2026-10-16

## What was done

No scaffolding, no new dependencies. The draft was refined to `ready` at the human's request (design notes, steps, stricter acceptance criteria), then implemented.

| File | Contents |
|---|---|
| `core/src/semver.ts` | `parseVersion`, `satisfies`, `isValidRange` (`*`, `x.y.z`, partial, `^`, `~`) |
| `core/src/version.ts` | `CORE_VERSION`, `API_VERSION` moved out of `index.ts` (loader needs them without an import cycle) |
| `core/src/definitions.ts` | `ModuleDefinition<In, Out, State>` with hooks, `ModuleContext`, `SystemContext`, `SystemDefinition.update(world, dt, ctx)`, `ResourceMap`/`ModuleMap`/`ResourceKey`, `Bivariant`, `ReadonlyRegistry(ies)` |
| `core/src/plugin.ts` | `Plugin`, `PluginMeta`, `BasePluginContext`, `PluginError`, `loadPlugins`, `parseModuleConfig`, `LoadReport` |
| `sdk/src/define.ts` | the six `define*` functions, `PluginContext`, `MergeContributes`, `PartInput` |
| `sdk/src/index.ts` | curated re-exports (incl. `z`, `loadPlugins`, units, ids, types) |
| tests | `core/test/semver.test.ts`; `sdk/test/loader.test.ts` (+ `fixtures/part-json*.json`); `sdk/test/define.test-d.ts` |
| docs | ADR 0013, `architecture/plugin-system.md` rewritten, `research/{zod,typescript}.md`, glossary |

## What surprised me

- The tuple form `modules: [[Engine, {...}], [Command]]` infers cleanly with a `const` type parameter and a mapped tuple `{ [K in keyof M]: ModuleEntry<M[K]> }`; wrong types, missing keys, unknown keys and config on a config-less module are all compile errors. Verified with a scratch file before committing to it. Config-less modules need generic defaults `In = undefined`.
- Module hooks stay assignable to the erased registry type (and a typed `setup` to `Plugin.setup`) without any cast or `any` thanks to a parameter-bivariant function type. `src` adds no `any` and no type assertions except the structural `then` read used to detect async setup.
- Module augmentation through a *re-export* works: `declare module '@orbital/sdk'` merges into core's `EventMap` (TypeScript docs do not say; tested from `sdk/test` and once from `mods/stock`). This closes the question left open by the 003 journal.
- `async setup` cannot be rejected at compile time (a `void` return admits async functions); the loader checks for a thenable at runtime. The test says so.
- 22 negative `@ts-expect-error` cases in `define.test-d.ts`; removing every directive produced exactly 22 errors (the 23rd grep hit was the header comment), so each bites.
- ADR 0012 was taken by plan 008 during this session, so this plan's ADR is 0013 (plan text updated).
- `docs:check` at one point failed on "plan 011 missing from board", a plan another session added; not mine.

## Decisions made (link ADRs)

- ADR [0013](../decisions/0013-define-api-and-plugin-loader.md): the define-API shape, loader failure policy (throw vs disable), semver subset, augmentation specifier, `SystemContext`.

## Open questions / follow-ups

- `contributes` keys are type-only: a plugin that declares but never provides a key is invisible to the loader. Fine for now; a runtime key list (additive) if test doubles need it.
- Plan 006: `defineModule` configs for stock; the stock boot test lives in `mods/stock` and imports `loadPlugins` from `@orbital/sdk`.
- Plan 007: builds `ModuleContext` (world, events, registries, physics, entity, config, state), stores module state as a world component per ADR 0010 (suggest token name `<module-id>` or `module-state:<module-id>`), calls `SystemDefinition.update(world, dt, { registries, events })`, uses `parseModuleConfig` for parsed configs.
- Mod-safety mode (disable instead of throw on bad part data) belongs with external loading in Phase 2 (plan 010+ area), no draft plan written because nothing is scheduled.

## Verification output

```
$ bun test packages/sdk packages/core
 87 pass, 0 fail (8 files)
$ bun test                          168 pass, 0 fail (20 files)
$ bun run typecheck                 7 packages Exited with code 0; @orbital/web check 0 ERRORS
$ bun run --filter @orbital/mod-stock typecheck   Exited with code 0
$ bun run build                     @orbital/web build ✔ done
$ grep -rn "Bun\.\|process\.\|window\.\|document\." packages/core/src packages/sdk/src   (no output)
$ bunx prettier --check packages/core packages/sdk   All matched files use Prettier code style!
```
