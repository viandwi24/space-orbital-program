---
id: 005
title: SDK define-API + plugin loader
status: draft
owner: ""
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
- Prior art the design is based on: the `definePlugin` pattern with `depends: [PluginInstance]` → `MergeContributes<Deps>` via `UnionToIntersection`.

## Scope

**In:** the six define functions; `PluginContext`; loader with topo-sort, cycle detection, missing/optional deps, `api` semver range check; module augmentation points (`ResourceMap`, `EventMap`, `ModuleMap`); a test plugin pair proving typed contributions; JSON part loading via the same schemas.
**Out:** external (runtime) mod loading from URLs, patching (Phase 2), scripting.

## Design notes

- Type inference target (must compile in a test file):
  ```ts
  const A = definePlugin({ meta: { id: "a", version: "1.0.0", api: "^0.1" }, contributes: {} as { a: { hi(): string } }, setup(ctx) { ctx.provide("a", { hi: () => "hi" }); } });
  const B = definePlugin({ meta: { id: "b", version: "1.0.0", api: "^0.1" }, depends: [A], setup(ctx) { ctx.a.hi(); /* typed */ } });
  ```
  and `ctx.a` inside a plugin that does not depend on `A` must be a type error.
- `definePart` modules tuple: `[ModuleDef<Config>, Config]` — infer `Config` from the module's zod schema (`z.input<typeof schema>`).
- Loader output: `{ order: string[], disabled: Array<{ id, reason }>, registered: Record<kind, Array<{ id, by }>> }`.
- Semver range check: implement a minimal caret/tilde matcher in core (no dependency) or verify a tiny library online first; record the choice.

## Steps

1. `packages/core/src/plugin.ts` (types, loader), `packages/sdk/src/define.ts`, `packages/sdk/src/index.ts` (re-export schemas, types, helpers from core).
2. Tests in `sdk/test`: typed contributions compile; loader order; cycle error names the cycle; missing hard dep disables with reason; optional dep absent → `ctx.optional.x` undefined; `api` mismatch refused; duplicate id across plugins errors naming both.
3. JSON part fixture loads and validates with the same schema.
4. Update `docs/architecture/plugin-system.md` to match; journal; ADR if shape changed.

## Acceptance criteria

- [ ] `bun test packages/sdk packages/core` passes with the tests in step 2–3.
- [ ] A compile-time test proves the typed `ctx` behaviour (positive and negative cases).
- [ ] `mods/stock` still typechecks (it imports only `@orbital/sdk`).
- [ ] `bun run typecheck`, `bun run docs:check` pass.

## Docs checklist

- [ ] `docs/STATUS.md`, journal.
- [ ] `docs/architecture/plugin-system.md` rewritten to match shipped API (keep the "design target" examples current).
- [ ] ADR for the final define-API shape (0010 or next).

## Log

- 2026-10-16 — Created as draft.
