---
id: 069
title: "Mod-defined catalogue categories"
status: in-progress
owner: "Agent 2"
depends: [034, 086]
phase: 3
created: 2026-10-17
updated: 2026-10-18
---

# 069 — Mod-defined catalogue categories

## Goal

A mod can add a catalogue category of its own (an id, a label, an icon) and put parts in it, instead of choosing one of the nine of ADR 0082.

## Context

- Pushed out of plan 034: ADR 0082 gave a part `catalog.category` / `catalog.order` over the fixed list. A new group needs a registry entry (`ctx.categories.register`), a place for the icon (the UI has its own icon set, ADR 0026; a mod could name an existing one or ship a glyph) and an order among the groups.
- Foundation (ADR 0107, 0104): the refs Hangar has a rail of 10 categories with dot indicators and stroke icons on a 24 grid. This plan is the base for that rail (plan 093 depends on it): `defineCategory` with id, label, stroke icon path (validated to the refs icon rules) and order; stock re-registers its categories through it so the stock rail uses the public API.

## Scope

**In (to be ordered at refinement):** a category definition in the SDK (API bump, ADR); the catalogue reading the registry; icon rule; a mod test; the guide.
**Out:** the nine existing categories (plan 034).

**Realignment (2026-10-17):** stock categories move to `defineCategory` (stock is a mod, ADR 0104); the icon rule is the refs stroke-icon grid (24 x 24, stroke 1.7 to 1.9, round joins) with a fallback icon; categories are patchable (plan 079). Acceptance gains: the stock rail shows exactly the stock categories in their order, and a mod category appears in order with its icon.

## Touches

- **Size:** S
- **Edits:** `packages/sdk`, `packages/core`, `mods/stock`, `apps/web/src/lib/vab`, `apps/web/src/lib/catalog.ts`
- **Shared contracts:** SDK (`defineCategory`; additive)

## Steps

1. ADR 0146 (done at claim).
2. Core: `CategoryDefinition` and its schema (`categories.ts`), `registries.categories`, `ctx.categories`, the `category` patch section; part `catalog.category` and `ModuleInfo.category` accept a category id or a short name; `resolveCategoryId`. API_VERSION bump.
3. SDK: `defineCategory`, re-exports. Stock: the nine categories registered through it.
4. Web: `lib/editor/categories.ts` reads the registries (`categoriesOf(registries)`, `categoryOf` returns an id); the catalogue rail draws a named icon or path data; the first-flight guide and the existing tests move to ids.
5. Tests, the mod guide, journal, handover.

## Acceptance criteria

- [x] Core schema test: a category with a named icon and one with path data parse; an id that is not `<plugin>.<name>`, an empty label, a non-finite order, path data with other characters or over 1 024 characters are refused; a part names a category id or a short name — `bun test packages/core`.
- [x] Stock test: the rail's categories for stock alone are exactly the nine, in the order command, tanks, propulsion, structural, aero, control, landing, thermal, other — `bun test mods/stock` and web vitest.
- [x] Mod test (web vitest, `mod-awareness.test.ts`): a mod's category with order 450 appears between structural and aero, its part sits in it, a part naming an unregistered category sits in Other, and a category with an unknown icon name loads and renders the fallback icon.
- [x] `definePatch` can relabel a stock category (core test).
- [x] Existing catalogue behaviour unchanged for stock parts (the category of every stock part is the same as before, as an id) — `state.test.ts`.
- [x] `bun test`, `bun run typecheck`, `bun run build`, `bun run docs:check`; smoke e2e.

## Docs checklist

- [x] STATUS row, journal `docs/journal/069-mod-defined-catalogue-categories.md`, ADR 0146, `docs/guides/writing-a-mod.md`.

## Log

- 2026-10-17 — Created as draft by plan 034 (found, not done).
- 2026-10-17 — Realigned with the owner's Fondasi Orbital decisions (ADR 0107, 0104: base for the refs Hangar category rail).
- 2026-10-18 — Claimed by Agent 2 (Dev B, M2); refined: Steps, measurable criteria, ADR 0146.
- 2026-10-18 — Done on the branch: core registry, SDK `defineCategory`, stock's nine through it, the web rail from the registry with path icons and an Other fallback; API_VERSION 0.1.41. The order example in the criteria corrected from 350 to 450 (Structural is 400). Journal: [069](../journal/069-mod-defined-catalogue-categories.md).
- 2026-10-18 — Merge check (Agent 1, M5): rebased on main after 103, 085, 076 and 114. Conflicts with the science and comms registries, SDK and mod guide kept both sides. API_VERSION 0.1.43 (0.1.40 to 0.1.42 went to 103, 085 and 114). `bun run test` 1518 pass · web vitest 935 pass (`sim-host-script-worker` passes on the M5) · typecheck · build · docs:check OK · Chromium smoke 6 pass. The science instruments (103) and the probe core and antennas (114) still sit in Other; giving them categories is a follow-up.
