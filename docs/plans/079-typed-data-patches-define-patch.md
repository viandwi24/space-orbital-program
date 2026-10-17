---
id: 079
title: "Typed data patches: `definePatch` with provenance"
status: in-progress
owner: "Agent 3"
depends: []
phase: 4
created: 2026-10-17
updated: 2026-10-17
---

# 079 — Typed data patches: `definePatch` with provenance

## Goal

A mod can change another mod's registered data without replacing it: `definePatch` selects entries, applies typed operations in a stated order, re-validates, and the load report and mod manager show which plugin changed which field.

## Context

- ADRs: 0104 (the decision), 0013 (define-API and loader), 0057 (mod packages, load without a mod), 0170 (written in step 1: path and order semantics).
- Read: `packages/core/src/plugin.ts` (`loadPlugins`, steps 4 to 6), `packages/core/src/registry.ts` (`createRegistry`, `deepFreeze`), `packages/sdk/src/define.ts`, `apps/web/src/routes/mods/+page.svelte` and `apps/web/src/lib/mods/runtime.ts`, `examples/mod-sample/src/index.ts`, `docs/architecture/plugin-system.md`.

## Scope

**In:**
- `definePatch({ id, target, select, ops, after?, before?, priority? })`, registered through `ctx.patches.register(...)`. `target` is `'part' | 'resource' | 'body'`. `select` is `{ id }`, `{ ids }`, `{ tag }` (matches entries whose `tags` array holds it; no stock entry type has `tags` yet) or `{ where }` (a pure predicate over the frozen entry). `ops` are `set`, `merge`, `remove`, `append`, `insert`.
- Part module configs are reachable by path as `modules.<moduleId>.<field>` (the `[moduleId, config]` tuples are addressed by module id, not index).
- Application in `loadPlugins` after every plugin booted and before the part/module cross-check. Order: `after`/`before` constraints on plugin ids, then `priority` (higher later), then boot order of the patching plugin, then registration order. The patched entry is validated by the registry's schema (and part module configs by the module's config schema in the existing cross-check). A patch whose result is invalid, whose path does not exist for `remove`, or whose order constraints form a cycle is disabled with a reason in the load report; the entry keeps the value it had before that patch.
- Load report additions: `patches: Array<{ id, by, target, applied: string[], disabled?: string }>` and `provenance: Record<kind, Record<entryId, Record<path, string[]>>>` (the plugins that set the path, registering plugin first, in apply order). The existing `order`, `disabled` and `registered` fields keep their shape.
- `/mods` shows, per installed mod, the entries and fields its patches changed ("stock.engine-1 · modules.stock.engine.thrust · 215 kN → 230 kN, patched by sample").
- `examples/mod-sample` patches a stock engine's thrust; `docs/guides/writing-a-mod.md` gets a "Patching another mod's data" section.

**Out:** runtime patching after load; patches on `module` and `system` registries (they hold functions, not data); a hosted mod index; `tags` fields on stock definitions (a later plan adds them where a system needs them).

## Touches

- **Size:** M
- **Edits:** `packages/core/src/patch.ts` (new), `packages/core/src/plugin.ts`, `packages/core/src/registry.ts`, `packages/core/src/index.ts` (exports), `packages/core/test/patch.test.ts` (new), `packages/sdk/src/define.ts`, `packages/sdk/src/index.ts`, `apps/web/src/routes/mods`, `apps/web/src/lib/mods`, `examples/mod-sample`, `docs/guides/writing-a-mod.md`, `docs/architecture/plugin-system.md`
- **Shared contracts:** **SDK (`definePatch`, `ctx.patches`, `PatchDefinition`, load report shape: additive fields `patches` and `provenance`; `API_VERSION` patch bump)**

## Design notes

- Ops are pure functions over plain data: the patcher works on a structured clone of the frozen entry, validates the clone, and only then swaps it in with an internal `Registry.replace(def, by)` (not on the `Registrar` handed to plugins), which freezes the new value. A failed patch never touches the stored entry.
- Paths are dot-separated keys. Typing: `definePatch<'part'>` checks `set`/`merge` values only loosely at compile time (the path is a `string`); the runtime check is the zod schema. A template-literal path type is a stretch goal and must not slow `bun run typecheck` noticeably (record the before/after time in the journal).
- `merge` is a shallow object merge at the path; `append`/`insert` act on arrays (`insert` takes an `index`); `remove` deletes an optional key or an array element by index.
- The `/mods` page computes provenance by running `loadPlugins` headlessly on stock plus the turned-on mods (no sim, no world), the same list the game would boot.

## Steps

1. ADR 0170: path addressing (module tuples by id), op semantics, order rule, cycle and failure handling. Patch types and `applyPatches` in `packages/core/src/patch.ts` with unit tests.
2. Loader integration: `ctx.patches`, `Registry.replace`, the apply phase in `loadPlugins`, load report `patches` and `provenance`; SDK `definePatch` and exports; `API_VERSION` patch bump.
3. Benchmark test: 1 000 patches over the stock registries.
4. `/mods` provenance view and its vitest component test.
5. `examples/mod-sample` patches a stock engine's thrust; guide and architecture sections.

## Acceptance criteria

- [ ] `bun test packages/core/test/patch.test.ts`: two plugins set the same path with `after` constraints in both declaration orders; the final value and `provenance` follow the constraints, not the load-list order. A cycle of `after` constraints disables both patches with a reason naming the cycle.
- [ ] Same file: a patch that sets a part's `mass` to `-1` is disabled with a reason in `report.patches`, and `registries.parts.get(id).mass` keeps its unpatched value; a patch that breaks a module config (`modules.stock.engine.thrust` = `"x"`) is disabled the same way.
- [ ] Same file: `select` by `id`, `ids`, `tag` (fixture entries with `tags`) and `where` each match exactly the expected entries; each op (`set`, `merge`, `remove`, `append`, `insert`) has a test.
- [ ] `bun test packages/core/test/patch.test.ts -t benchmark`: 1 000 patches over the stock registries apply in under 50 ms ¹ (M5, run by Agent 1 at merge; the number from Agent 3's machine is recorded as indicative).
- [ ] `bun test mods/stock examples/mod-sample`: stock boots with no patches and an unchanged `report.registered`; with the sample mod the patched engine's thrust is the patched value and `provenance` names `sample`.
- [ ] `bun run --filter @orbital/web test`: a vitest component test renders the `/mods` provenance view for the sample mod's patch and finds the entry id, the path and the plugin id.
- [ ] `bun run test`, `bun run typecheck`, `bun run build` and `bun run docs:check` pass.

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row, next plan, open issues).
- [ ] `docs/journal/079-typed-data-patches-define-patch.md` written.
- [ ] `docs/architecture/plugin-system.md`, `guides/writing-a-mod.md`.
- [ ] New ADRs for decisions made here; `docs/research/` for anything looked up.

## Log

- 2026-10-17 — Created as draft from the owner's Fondasi Orbital decisions (ADR 0104).
- 2026-10-17 — Refined and claimed by Agent 3 (Dev C, Linux). Refinement: concrete select/op shapes, module configs addressed as `modules.<moduleId>.<field>`, apply phase between boot and the part/module cross-check, additive load report fields `patches` and `provenance`, `Touches` lists the new `patch.ts` and test files and the `apps/web/src/lib/mods` helpers, criteria name their test files. `tags` selection is generic (no stock entry type has `tags`). Path and order semantics go in ADR 0170 (Agent 3 range). Benchmark ¹ is indicative here; Agent 1 runs it on the M5 at merge.
- 2026-10-17 — Kickoff baseline on this machine (fresh clone): `bun install` 19.3 s; `bun run test` 178 s, 1309 pass, peak 1.96 GB; `bun run typecheck` 59.6 s, failed in `@orbital/web check` until `build:sandbox` generated the git-ignored sandbox files (then 0 errors). Reported to Agent 1.
- 2026-10-17 — Deviation: the benchmark is in `mods/stock/test/patch-bench.test.ts`, not `packages/core/test/patch.test.ts`. `core` may not import stock, and `mods/stock` has no `@orbital/core` dependency, so it times a load with the patches minus one without, through the SDK. Indicative here: 36.8 ms for 1 000 patches (750 applied).
- 2026-10-17 — Deviation (additive): each `report.patches` item also has `changes` (`entry`, `path`, `from`, `to`) for the `/mods` old → new view. `Registry.replace` became the loader-only `replaceDefinition`, so that `ReadonlyRegistry` (modules, systems) gains no write method (ADR 0170).
- 2026-10-17 — Handed over as `ready/079`. The handover text is the tag message. The full web vitest has 2 suites that fail only on this machine (no Node; vitest runs under Bun; the files are untouched). The M5 benchmark and the web vitest are left for Agent 1.
