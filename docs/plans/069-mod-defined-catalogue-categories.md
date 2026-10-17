---
id: 069
title: "Mod-defined catalogue categories"
status: draft
owner: ""
depends: [034, 086]
phase: 3
created: 2026-10-17
updated: 2026-10-17
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

## Acceptance criteria

- [ ] To be made measurable at refinement (schema test, catalogue tab list with a mod category in order, a mod with an unknown icon still loads).

## Docs checklist

- [ ] STATUS, journal, ADR, `docs/guides/writing-a-mod.md`.

## Log

- 2026-10-17 — Created as draft by plan 034 (found, not done).
- 2026-10-17 — Realigned with the owner's Fondasi Orbital decisions (ADR 0107, 0104: base for the refs Hangar category rail).
