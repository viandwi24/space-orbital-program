# 0170 — `definePatch`: targets, paths, operations, order and failure

**Status:** accepted
**Date:** 2026-10-17
**Plan:** 079
**Builds on:** ADR 0104 point 2 and 3 (typed patches, provenance), ADR 0013 (loader, boot order).

## Context

ADR 0104 fixes what a patch is (select entries, apply operations to typed paths, state an order, re-validate, report). It leaves open how a path reaches a part module's config (parts store modules as `[moduleId, config]` tuples, and module ids contain dots), what each operation does at the edges, how `after`/`before` combine with priority, what happens on a cycle, and whether a patch that fails on one entry still changes the others.

## Decision

1. **Targets.** Patches apply to the data registries that have a schema: `part`, `resource`, `body`. `module` and `system` hold functions and are not patchable. A registry added later becomes patchable by declaring a schema.
2. **Registration.** A plugin registers patches with `ctx.patches.register(definePatch({...}))` during `setup`. Patch ids follow the definition id rule and are unique across the load (a duplicate is a load error naming both plugins, like a duplicate definition).
3. **Paths** are dot-separated keys (`mass`, `visual.palette.primary`, `attach.top.pos.1`). A numeric segment indexes an array. Under a part's `modules`, the segment after `modules` is a **module id**, matched against the part's module ids by the longest run of segments that forms one (`modules.stock.engine.thrust` → module `stock.engine`, field `thrust`). `modules.<moduleId>` is the whole config. Provenance and the load report use the same string.
4. **Operations** work on a structured clone of the frozen entry:
   - `set { path, value }`: creates missing parent objects; a missing module under `modules` is an error (use `append`).
   - `merge { path, value }`: shallow object merge at the path (missing → created). Provenance records each merged key as its own path.
   - `remove { path }`: deletes an object key, an array element by index, or a part module (`modules.<moduleId>`). A path that does not exist is an error.
   - `append { path, value }` / `insert { path, index, value }`: on an array (missing → created for `append`). `append` on `modules` takes a `[moduleId, config]` tuple.
5. **Selection.** `{ id }`, `{ ids }`, `{ tag }` (entries whose `tags` array contains it), `{ where }` (a pure predicate over the frozen entry; a throw disables the patch). A patch that selects nothing is applied to nothing and reported with an empty `applied` list, not an error.
6. **Order.** Patches form a graph: `after: [pluginId]` puts a patch after every patch of those plugins, `before: [pluginId]` before every patch of those plugins. Ids of plugins that are not loaded are ignored (like optional dependencies). Ties break by `priority` (default 0, lower first), then the boot index of the patching plugin, then registration order. Every load gives the same order.
7. **Cycles.** Patches whose order constraints form a cycle are disabled with a reason naming the cycle; the others apply.
8. **All or nothing per patch.** A patch computes the new value for every selected entry, validates each one (the registry schema; for parts also the module configs and module `requires` of the patched part), and only then replaces them. If any entry fails, the patch changes nothing and is disabled with a reason naming the entry and the error. Later patches see the value without it.
9. **Report.** `LoadReport.patches` lists every patch in apply order with `id`, `by`, `target`, `applied` (entry ids), `changes` (`{ entry, path, from, to }`) and `disabled` (reason) when it did not apply. `LoadReport.provenance[kind][entryId][path]` is the list of plugins that set the path: the registering plugin first, then each patching plugin in apply order. Entries no patch touched do not appear. Both fields are additive; `order`, `disabled` and `registered` keep their shape.
10. **When.** Patches apply once in `loadPlugins`, after every plugin booted and before the part/module cross-check. There is no runtime patching.

## Alternatives considered

- **Paths as arrays of segments only** — rejected as the main form: authors write and read strings, and the report needs one string per field. The longest-match rule settles the dotted module ids without escaping.
- **Address module tuples by index** (`modules.0.thrust`) — rejected: the index depends on the other mod's list order and breaks silently when it changes.
- **Per-entry application** (a patch applies where it can) — rejected: a partly applied balance patch is harder to see and to reason about than one that is plainly off with a reason.
- **Priority before `after`/`before`** — rejected: explicit constraints are the author's intent; priority only orders what they leave open.

## Consequences

- **Mod API:** `definePatch`, `ctx.patches`, `PatchDefinition` and the two report fields; an additive `API_VERSION` patch bump.
- **Core:** `Registry` gains `validate(def)`; entries are swapped by the loader-only `replaceDefinition(registry, def)`, which is not on `Registry` (so the read-only registries handed to modules and systems cannot reach it) and is not exported by the SDK. Plugins still get a `Registrar`.
- **Performance:** one clone and one schema parse per patched entry per patch; plan 079 measures 1 000 patches.
