# 069 — Mod-defined catalogue categories

**Plan:** [plans/069-mod-defined-catalogue-categories.md](../plans/069-mod-defined-catalogue-categories.md) · **Session:** Agent 2 (Dev B, MacBook Pro M2 13"), 2026-10-18 · **ADRs:** [0146](../decisions/0146-catalogue-categories-are-a-registry.md) (new), [0082](../decisions/0082-part-catalogue-placement.md), [0104](../decisions/0104-every-system-ships-a-define-point-and-typed-patches.md), [0107](../decisions/0107-ui-adopts-the-refs-visual-language-in-stages.md) · **Research:** none

**Status when written: criteria met.**

## What was done

| Where | What |
|---|---|
| `packages/core/src/categories.ts` | `CategoryDefinition` (id, label, icon, order, description), `categoryDefinitionSchema` (icon: a kebab-case name or `{ path }` path data, commands and numbers only, ≤ 1 024 characters), `categoryRefSchema`, `categoryIdOf` (short name → `stock.<name>`), `sortCategories`, `FALLBACK_CATEGORY` |
| core `registry.ts`, `plugin.ts`, `definitions.ts`, `patch.ts`, `schemas.ts` | `registries.categories`, `ctx.categories`, report kind `category`, patch target `category`; a part's `catalog.category` and a module's `category` take a short name or a category id; API_VERSION 0.1.43 (0.1.40 to 0.1.42 went to 103, 085 and 114) |
| `packages/sdk` | `defineCategory`, `CategoryDefinition`, `CategoryIcon`, `categoryIdOf`, `sortCategories`, `STOCK_CATEGORY_NAMES` |
| `mods/stock/src/categories.ts` | the nine stock categories through `defineCategory`, orders 100 to 800 and Other 10 000 |
| web `editor/categories.ts`, `catalog.ts`, `vab/controller.svelte.ts`, `vab/Catalogue.svelte`, `ui/Icon.svelte`, `routes/vab` | the rail from the registry; `categoryOf` returns an id and, given the rail, sends an unregistered id to Other; `Icon` takes path data; the first-flight guide reads ids |
| `ui/icons.ts` | `isIconName` uses `Object.hasOwn`: a category icon named `constructor` would otherwise have drawn a function |
| tests | core `categories.test.ts` (8: schema, short names, order, registry, patch), stock `categories.test.ts` (2), web `vab/Catalogue.test.ts` (4: order, fallback, path icon and unknown icon in the rendered rail, stock rail); `state.test.ts` and `mod-awareness.test.ts` now expect ids (`'stock.command'` for `'command'`), the same category per part |
| docs | mod guide section, plugin-system patch targets, ADR 0146 |

## What surprised me

- **Stock already shows Other.** The data drive (plan 083) has a module with no category and no store, so it has sat in Other since 083; the "stock rail" criterion lists Other.
- **My own order example was wrong twice.** The refined plan said order 350 sits between Structural and Aerodynamics; Structural is 400. The criterion and the test use 450.
- **The patch provenance and the load report are exhaustive records**, so the core patch test, the SDK loader test and the stock patch bench each gained `category: {}` / `category: []`, as with every registry added before.
- **Schema cycle.** `schemas.ts` needs the category reference for parts, and `categories.ts` would have imported the id schema from `schemas.ts`; it builds its own from `ids.ts` instead.
- **Stroke 1.7, not 1.8.** The game's icon component draws at 1.7; ADR 0146 states the stroke the UI actually applies.
