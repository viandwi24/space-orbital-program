# 0104 — Every new system ships its `define*` point and stock uses it; typed data patches with `definePatch`

**Status:** accepted
**Date:** 2026-10-17
**Plan:** none (owner decision "mod-surface", 2026-10-17); delivered by plan 079 and by every system plan
**Builds on:** ADR 0005 (stock is a mod), 0013 (define-API and loader), 0057 (mod packages, trust, load without a mod).
**Research:** `refs/reverse-engineering-ksp2/12-modding.md`.

## Context

Orbital's strongest difference from KSP2 is that the stock game is a mod on the public SDK (`defineBody`, `definePart`, `defineModule`, `defineResource`, `defineSystem`, `definePlugin`, `defineComponent`). The foundation adds a dozen systems. If stock content needs private hooks, the SDK is incomplete. KSP1 lived on data patches (ModuleManager); Orbital has no way for one mod to change another's data except replacing it.

## Decision

1. **Every new system ships its define point in the same plan**, and the stock content of that system is written with it in `mods/stock` (or another in-repo mod such as the Sol pack): `defineRule`, `definePreset`, `defineBuilding`, `defineSiteTemplate`, `defineExperiment`, `defineSituation`, `defineTechNode`, `defineContract`, `defineMission`, `defineObjective`, `defineStrategy`, `defineAchievement`, `defineCommodity`, `defineRecipe`, `defineCrewTrait`, `defineAntenna`, `defineBand`, `defineGroundStation`, `defineCommRule`, `defineActionGroup`, `definePanel`, `defineDataKind`, `defineAgency`, `defineSystemVariant`. A plan that ships a system without its define point, or whose stock content uses an import other than `@orbital/sdk`, fails review.
2. **`definePatch`**: typed patches over registered data, applied at load time after every plugin registered and before anything runs. A patch selects entries (by id, by tag, or by a pure predicate over the entry), applies operations (`set`, `merge`, `remove`, `append`, `insert`) to typed paths, and states its order (`after` / `before` a plugin, then priority, then plugin boot order). The patched entry is validated again by its schema; an invalid result disables the patch with a reason in the load report, not the game.
3. **Provenance.** The load report records, per entry and field, which plugin set or patched it; the mod manager shows it ("thrust: 215 kN, patched by sol-balance").
4. **Semver and deprecation.** Each new define point is an additive minor bump of `API_VERSION` (0.1.x today); removing or changing a field needs an ADR, a deprecation that warns for at least one minor version, and a migration note in `guides/writing-a-mod.md`.
5. **Load without a mod** keeps working (ADR 0057): a world records its mods and a missing one is named, never silently dropped.

## Alternatives considered

- **Stock systems in core with mod hooks added later** — rejected: the SDK would lag forever, as KSP2's never-shipped modding showed.
- **Patches as runtime code (monkey-patching registries)** — rejected: untyped, order-dependent and invisible in the load report.
- **A hosted mod index with dependency resolution** — deferred: there is no backend (ADR 0094 point 5); the package format already carries dependencies.

## Consequences

- **Mod API:** `definePatch` (plan 079) plus the list above as each system lands; `docs/architecture/plugin-system.md` and `guides/writing-a-mod.md` grow per plan.
- **Performance:** patches run once at load; the plan measures the load-time cost with 1 000 patches (target under 50 ms on the M5).
- **Saves:** patched values are not saved (they are data, re-applied at load); a save lists its mods as today.
- Plan template: every system plan states its define point in **Touches** as an SDK contract change.
