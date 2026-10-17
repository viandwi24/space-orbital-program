# 079 — Typed data patches: `definePatch` with provenance

**Plan:** plans/079-typed-data-patches-define-patch.md · **Session:** Agent 3 (Dev C, Linux Mint, 2026-10-17), three-agent team mode · **ADRs:** [0170](../decisions/0170-patch-paths-ops-and-order.md) (new), [0104](../decisions/0104-every-system-ships-a-define-point-and-typed-patches.md) · **Research:** [stack-versions.md](../research/stack-versions.md) (Bun install on Linux)

**Status when written: criteria met here, handed over as `ready/079`.** The benchmark's budget (50 ms) is for the M5. The number below is indicative, and Agent 1 runs it at merge.

## What was done

| Where | What |
| --- | --- |
| `packages/core/src/patch.ts` | `PatchDefinition`, `PatchOp`, `PatchSelect`, `PatchReport`, `Provenance`; `orderPatches` (constraint graph, Tarjan for cycles, Kahn with a priority / boot / registration tie-break); `applyPatches` (clone, ops, validate, all or nothing, swap) |
| `packages/core/src/registry.ts` | `Registry.validate(def)`; loader-only `replaceDefinition(registry, def)` through a `WeakMap`, so `ReadonlyRegistry` (handed to modules and systems) does not grow a write method |
| `packages/core/src/plugin.ts` | `ctx.patches` (reserved key), a patch registry per load, the apply phase before the cross-check, `partModuleProblems` shared by the cross-check and the patch check, `report.patches` and `report.provenance` |
| `packages/sdk` | `definePatch` (`target` types `where`), exports, `API_VERSION` 0.1.25; runtime and compile-time tests |
| `mods/stock/test/patch-bench.test.ts` | stock registers no patches; the 1 000-patch benchmark |
| `examples/mod-sample` | `sample.engine-lv-thrust` (stock main engine 215 → 230 kN), tested from the built package |
| `apps/web/src/lib/mods` | the runtime keeps the booted set's `patches`; `ModManager.patchesOf`; `ModPatches.svelte` under each running mod on `/mods`; vitest for both |
| docs | ADR 0170, `plugin-system.md` "Patching", guide section "Patching another mod's data" |

## Decisions and deviations from the plan text

- **Benchmark location.** The plan says `packages/core/test/patch.test.ts -t benchmark` "over the stock registries". `core` may not import stock (boundaries, and stock depends on core through the SDK), so the benchmark is in `mods/stock/test/patch-bench.test.ts`. `mods/stock` has no dependency on `@orbital/core`, and adding one would change `package.json` and the lockfile outside Touches. So the test uses the SDK only and times a load with the patches minus one without (best of 7 each, after a warm-up).
- **`changes` in the report.** The plan lists `patches: { id, by, target, applied, disabled? }`. Each item also has `changes: { entry, path, from, to }`, because the `/mods` view shows old → new values. This is additive.
- **`Registry.replace` became `replaceDefinition`.** `ReadonlyRegistry` is `Omit<Registry, 'register'>`, so a `replace` method on `Registry` would have reached every module and system at runtime. ADR 0170's Consequences say this.
- **The patch phase before the cross-check.** A patch that breaks a module config is disabled with a reason, instead of failing the whole boot in the cross-check. A stock part that is already invalid still fails the boot as before (the error text is unchanged).
- **The `/mods` page** shows patches only for mods whose status is "Running" (the runtime's booted set). A mod that starts after reload has no report yet.

## Numbers

- Benchmark (this machine, indicative): `1000 patches (750 applied) over stock: 36.8 ms (load 37.1 ms with, 0.3 ms without)`. 250 of the 1 000 patches are `where` predicates that match nothing, by design: they scan every part.
- Kickoff baseline on this machine (fresh clone, before the plan): `bun install` 19.3 s (peak 0.24 GB); `docs:check` 0.05 s; `bun run test` 178.4 s, 1309 pass (peak 1.96 GB); `bun run typecheck` 59.6 s (peak 1.63 GB). It **failed** in `@orbital/web check` until `bun run build:sandbox` had generated the git-ignored `static/sandbox/*.js` (16.0 s once they exist). This happens on every fresh clone; see Follow-ups.

## What surprised me

- Module ids contain dots (`stock.engine`), so a plain dot path cannot tell the id from the field. Matching the longest run of segments against the part's own module ids settles it without escaping, because config fields never contain dots.
- Nothing in the repo builds a `LoadReport` by hand, so the two required fields broke no consumer.

## Follow-ups

- **For Agent 1:** `bun run typecheck` fails on a fresh clone until `build:sandbox` has run (`apps/web` `check` reads the generated sandbox files). A one-line fix is to run `build:sandbox` in `check`. It is outside this plan's Touches, so it is not done here.
- No `tags` field exists on stock definitions. `select: { tag }` is generic and tested on a fixture registry.

## Verification output

```text
bun test packages/core/test/patch.test.ts        23 pass, 0 fail
bun test mods/stock/test/patch-bench.test.ts     1000 patches (750 applied) over stock: 36.8 ms (load 37.1 ms with, 0.3 ms without)
bunx vitest run src/lib/mods (apps/web)          Test Files 4 passed (4), Tests 25 passed (25)
bun run docs:check                               docs-check: OK
bun run test                                     1336 pass, 0 fail (167 s)
bun run typecheck                                exit 0 (54 s)
bun run build                                    Wrote site to "build", exit 0
bun run --filter @orbital/web test               814 passed, 1 skipped; 2 suites fail at import (editor-options, settings):
                                                 no Node on this machine, so vitest runs under Bun and `import { z } from 'zod'`
                                                 is undefined in the SSR transform; both files are untouched by this plan
```
