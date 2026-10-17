---
id: 079
title: "Typed data patches: `definePatch` with provenance"
status: draft
owner: ""
depends: []
phase: 4
created: 2026-10-17
updated: 2026-10-17
---

# 079 — Typed data patches: `definePatch` with provenance

## Goal

A mod can change another mod's registered data without replacing it: `definePatch` selects entries, applies typed operations in a stated order, re-validates, and the load report and mod manager show which plugin changed which field.

## Context

- ADRs: 0104
- Read: ADR 0104, ADR 0013, ADR 0057, `packages/core/src/plugin.ts` and `registry.ts`, the mod manager route.

## Scope

**In:**
- `definePatch({ id, target: registry, select: { id | tag | where }, ops: [set | merge | remove | append | insert], after, before, priority })`.
- Application at load after all registrations, ordered by after/before, priority, boot order; re-validation by the entry's schema; a failing patch is disabled with a reason.
- Provenance map per entry and field in the load report; shown in `/mods` per mod and per part.
- Registries covered first: parts, modules' configs on parts, resources, bodies; later registries opt in by declaring a schema.

**Out:** runtime patching after load; a hosted mod index.

## Touches

- **Size:** M
- **Edits:** `packages/core/src/plugin.ts`, `packages/core/src/registry.ts`, `packages/sdk`, `apps/web/src/routes/mods`, `examples/mod-sample`, `docs/guides/writing-a-mod.md`
- **Shared contracts:** **SDK (`definePatch`, load report shape)**

## Design notes

Paths are typed through the registry's entry type (TypeScript template literal paths or a builder); the runtime check is the zod schema. Ops are pure functions over plain data.

## Steps

1. Design the patch type and the order rule (ADR if order semantics need more than ADR 0104).
2. Loader integration and provenance.
3. Mod manager view.
4. Sample mod patches a stock engine's thrust; guide section.

## Acceptance criteria

- [ ] `packages/core` test: two mods patch the same field with `after` constraints; the result and the provenance match the stated order; a patch that makes a part invalid is disabled and reported, the part keeps its unpatched value.
- [ ] `packages/core` benchmark test: 1 000 patches over the stock registries apply in under 50 ms (M5; the journal records the number).
- [ ] `examples/mod-sample` builds and its patch shows in the `/mods` provenance view (vitest component test).
- [ ] `bun test`, `bun run typecheck`, `bun run build` and `bun run docs:check` pass.

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row, next plan, open issues).
- [ ] `docs/journal/079-typed-data-patches-define-patch.md` written.
- [ ] `docs/architecture/plugin-system.md`, `guides/writing-a-mod.md`.
- [ ] New ADRs for decisions made here; `docs/research/` for anything looked up.

## Log

- 2026-10-17 — Created as draft from the owner's Fondasi Orbital decisions (ADR 0104).
