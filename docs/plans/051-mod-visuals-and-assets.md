---
id: 051
title: "Mod-supplied part visuals and assets"
status: done
owner: "mod-assets session (Claude, 2026-10-17)"
depends: [046]
phase: 3
created: 2026-10-17
updated: 2026-10-17
---

# 051 — Mod-supplied part visuals and assets

## Goal

A mod can give its parts geometry the game does not already have: a glTF model shipped inside the package, so a mod part is not limited to the stock generators with another palette.

## Context

- Split out of plan 046 (ADR 0057 point 5): the sample mod's parts use `visual.kind: 'tank'` with their own palette and params. `registerPartGenerator` (`packages/renderer/src/parts/registry.ts`) is renderer code, and a package carries only code that runs in the sim Worker and the page's catalogue, not in the renderer; ADR 0047 loads glTF from URLs (`GltfPartProvider`).
- Read: ADRs 0028, 0033, 0038, 0045, 0047, 0057; `architecture/hosting.md` (production CSP); `research/mod-assets.md`; journals 020, 033, 046, 023.
- Decision: ADR 0076 (single-file package with base64 `.glb` assets, hashed, capped; `visual.asset`; plume and gimbal for models; fit warnings).

## Scope

**In:** package format 2 with `assets`; validation (hash, size, count, container, extensions, triangle and draw-call budget) in core; `visual.asset` and `resolveMods` checks (API 0.1.20); the renderer's provider takes bytes, gives models plume, `moving` pivot, glow, shadows and fit warnings; build tool packs `assets/` and `assets.ts`; web storage, trust prompt and wiring into flight and VAB; sample mod with a generated model; docs.
**Out:** a hosted repository, executable renderer hooks (a mod running code in the render loop), declarative geometry (rejected, ADR 0076), `deploy` animations and KTX2 (draft 065).

## Acceptance criteria

- [x] Core tests: a bad hash (asset byte flipped, and asset hash forged against the package fingerprint), oversize, wrong size, wrong type, wrong path, a non-glb file, an external URI, a compressed extension, a triangle budget, a newer format, a part naming a missing asset. `bun test` in `packages/core`: 177 pass (`mod-assets.test.ts` 12 tests).
- [x] Renderer tests for the provider: a real tiny glTF written by `tools/mod-build/glb.ts` parses from bytes; bounds and triangles; fit to the shape and attach nodes (within 5 cm or a tenth of the length, else a named warning); fallback to the generator named by `kind`; plume on the pivot and articulation; glow; embedded PNG path. `packages/renderer/test/mod-asset-provider.test.ts` (13 tests).
- [x] The sample mod gains an asset-backed part (`sample.spike-engine`, model generated in `examples/mod-sample/assets.ts`, no licence) that loads through the browser's path: `packages/renderer/test/mod-sample-asset.test.ts` builds the package, parses it, resolves it, hands the bytes to the provider and finds bounds ±0.5 m, no warning, a plume, a pivot and a texture; `examples/mod-sample/test/sample.test.ts` checks the package, `partAssets` and the part.
- [x] `[manual]` in the built-in browser under the production CSP (`scripts/serve.ts`, port 5228): the sample installed from its address, the prompt lists the model (24.7 KB, 832 triangles), the VAB lists "Sample Spike Engine" with its own icon, a pod, a wide tank and the engine stacked (2,235 m/s, TWR 1.82), launched, staged, throttle up: the plume at 1.01 km; console empty (no CSP violation, no fit warning). Screenshots `docs/journal/assets/051-*.jpg`.
- [x] Frame and bundle impact stated (journal 051): 832 triangles and 3 draw calls per engine; the renderer chunk +52 KB raw (`GLTFLoader` now reachable), core +5 KB; all JS 6.72 to 6.81 MB raw, 2.32 to 2.35 MB gzip, loaded on the flight and VAB pages only when a mod ships a model.
- [x] All repo checks: `bun run test` 1129 pass; web vitest 649 pass; `bun run typecheck` 0 errors; `bun run build`; `bun run docs:check`; prettier on the files; one Chromium e2e (mod install under the production headers).

## Docs checklist

- [x] STATUS, journal 051, ADR 0076, `writing-a-mod.md`, `architecture/plugin-system.md`, `research/mod-assets.md`, roadmap page.

## Log

- 2026-10-17 — Created as draft by plan 046 (found, not done).
- 2026-10-17 — Refined draft → ready at the human's request (session: mod-assets session). The draft's two options (assets in the package, or a declarative geometry schema) were decided: assets, as base64 `.glb` in the single JSON file (ADR 0076).
- 2026-10-17 — ready → in-progress (owner: mod-assets session). Core, renderer, build tool, sample, web, docs; manual browser run.
- 2026-10-17 — done. Draft 065 holds what was left out.
