# 0146 — Catalogue categories are a registry: `defineCategory`, stock re-registers its nine, short names stay aliases

**Status:** accepted
**Date:** 2026-10-18
**Plan:** [069](../plans/069-mod-defined-catalogue-categories.md)
**Builds on:** ADR 0082 (catalogue placement and order), ADR 0029 (categories from module ids), ADR 0026 (own icon set), ADR 0104 (stock is a mod), ADR 0107 (refs visual language), ADR 0079 / plan 079 (`definePatch`)

## Context

The editor's catalogue has a fixed list of nine categories in the web client (`lib/editor/categories.ts`); a part may name one in `catalog.category` and a module descriptor may imply one, both as a closed enum. A mod cannot add a group of its own, and the refs Hangar rail (plan 093) wants its categories from content, not from the UI. Open: the id scheme, how old part definitions keep working, where an icon comes from, the order, and what happens with a name that does not resolve.

## Decision

1. **A registry.** `CategoryDefinition { id, label, icon, order, description? }` in core, `registries.categories`, `ctx.categories.register`, `defineCategory` in the SDK, and a `category` section in `definePatch`. `id` is a definition id (`<plugin>.<name>`); `order` is a finite number, ascending, ties in registration order.
2. **Stock re-registers its nine** through the public API: `stock.command`, `stock.tanks`, `stock.propulsion`, `stock.structural`, `stock.aero`, `stock.control`, `stock.landing`, `stock.thermal` (orders 100 to 800 in the existing display order) and `stock.other` (order 10 000, last). The rail shows exactly these, in this order, for stock alone.
3. **Short names stay.** A part's `catalog.category` and a module's `ModuleInfo.category` accept a category id or one of the nine short names (`'command'` … `'other'`), which mean `stock.<name>`. Nothing that loads today stops loading.
4. **Icons.** `icon` is either the name of an icon in the game's own set, or `{ path }`: SVG path data drawn on the 24 × 24 grid with the set's stroke (1.7, round caps and joins, no fill), at most 1 024 characters of path commands and numbers. The UI applies the stroke, so a mod cannot draw outside the rules; a name the UI does not know shows the fallback part icon, and the mod still loads.
5. **Unresolved names fall back.** A part whose category id is not registered sits in `stock.other` (the category with the highest order if stock is absent). The catalogue hides a category with no parts, as before.

## Alternatives considered

- **Keep the nine as an enum and add a separate mod list** — rejected: two code paths for the rail, and stock would not use the API mods use (ADR 0104).
- **Mods ship an SVG file or an image** — rejected: icons must follow one stroke style (ADR 0107); path data drawn by the UI keeps the look and needs no asset pipeline.
- **Rename the short names to ids in every stock part** — rejected for this plan: the aliases cost one lookup and keep every existing mod's parts where they are.

## Consequences

- SDK addition (`defineCategory`, `CategoryDefinition`); API_VERSION bump.
- The editor reads categories from the loaded registries; `categoryOf` returns a category id.
- Plan 093 builds the refs rail on `registries.categories`.
