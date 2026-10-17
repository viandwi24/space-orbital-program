# 0082 — A part states its own catalogue placement: `catalog.category` and `catalog.order`

**Status:** accepted
**Date:** 2026-10-17
**Plan:** plans/034-vab-extras-mod-categories-trip-planner.md

## Context

Plan 023 (ADR 0033) let a module's descriptor name a catalogue category (`ModuleInfo.category`) and a lifting plate (`lift`), so a mod's parts already group by what their modules say, and the stability read-out already counts a mod's wing. What a mod could not do: place a part that has no module, or whose modules imply the wrong group (a cosmetic plate, a sensor bay); or order parts inside a group (the catalogue lists registration order, so a mod's parts always come last). Draft 034 also asked for mod-defined categories with their own label and icon.

## Decision

1. `PartDefinition.catalog?: { category?, order? }` (API 0.1.21 to 0.1.22, additive). `category` is one of the existing nine ids (`command`, `propulsion`, `tanks`, `structural`, `aero`, `control`, `landing`, `thermal`, `other`) and **wins over everything the modules imply**. `order` is a finite number, ascending, default 0, ties in registration order; it sorts the catalogue (the all-parts view and each category).
2. Stock keeps the grouping its modules imply: no stock file changes, and a test pins that no stock part carries a `catalog` entry and that stock order is registration order. The "move stock to it" of the draft is dropped because it would change nothing a player sees.
3. **Not decided here:** mod-defined categories (a new id with a label and an icon) need a registry entry and a place for an icon; draft plan 069.

## Consequences

- `categoryOf` reads `catalog.category` first (cached per definition as before); `sortParts` orders by `catalog.order`. A broken `catalog` fails at load, like any part field (zod).
- A mod that wants a group of its own today picks the closest of the nine.
