---
id: 069
title: "Mod-defined catalogue categories"
status: draft
owner: ""
depends: [034]
phase: 3
created: 2026-10-17
updated: 2026-10-17
---

# 069 — Mod-defined catalogue categories

## Goal

A mod can add a catalogue category of its own (an id, a label, an icon) and put parts in it, instead of choosing one of the nine of ADR 0082.

## Context

- Pushed out of plan 034: ADR 0082 gave a part `catalog.category` / `catalog.order` over the fixed list. A new group needs a registry entry (`ctx.categories.register`), a place for the icon (the UI has its own icon set, ADR 0026; a mod could name an existing one or ship a glyph) and an order among the groups.

## Scope

**In (to be ordered at refinement):** a category definition in the SDK (API bump, ADR); the catalogue reading the registry; icon rule; a mod test; the guide.
**Out:** the nine existing categories (plan 034).

## Acceptance criteria

- [ ] To be made measurable at refinement (schema test, catalogue tab list with a mod category in order, a mod with an unknown icon still loads).

## Docs checklist

- [ ] STATUS, journal, ADR, `docs/guides/writing-a-mod.md`.

## Log

- 2026-10-17 — Created as draft by plan 034 (found, not done).
