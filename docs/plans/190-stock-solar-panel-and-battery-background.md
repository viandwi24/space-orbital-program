---
id: 190
title: "Stock solar panel: electric charge produced on rails through background operations"
status: done
owner: "Agent 1 (Lead)"
depends: [082]
phase: 4
created: 2026-10-17
updated: 2026-10-18
---

# 190 — Stock solar panel: electric charge produced on rails through background operations

## Goal

Stock gains a producer of electric charge (a deployable solar panel). It charges its vessel's batteries in flight, and on rails through the `background` closed form of plan 082. So the stock game shows a vessel that keeps working while unloaded.

## Context

- ADRs: 0096 (background operations), 0171 (plan 082's tick and background rules).
- Plan 082 built `background(ctx, dt)` and tested it with a fixture module only: stock has `stock.electric-charge` and a consumer (the reaction wheel), but no producer.

## Scope

**In:**
- `stock.solar-panel` module (rate by sun exposure, a constant at first) and a part with a visual from the existing generators.
- `background` on the panel: charge = rate × elapsed time, capped by store capacity.
- Catalogue category and guide example.

**Out:** sun occlusion by bodies (needs the Sun as root, 122); deploy animations (065).

## Touches

- **Size:** S
- **Edits:** `mods/stock`, `docs/guides/writing-a-mod.md`
- **Shared contracts:** none (stock content only)

## Design notes

The panel's flight `update` and its `background` must agree. A test compares a vessel kept in flight with one on rails over the same time.

## Steps

1. Module and part.
2. `background` and the flight/rails agreement test.
3. Guide.

## Acceptance criteria

- [x] `mods/stock` test: over one game day, a vessel on rails and one in flight charge the same amount to within 1 %.
- [x] `bun test`, `bun run typecheck`, `bun run build` and `bun run docs:check` pass.

## Docs checklist

- [x] `docs/STATUS.md` updated.
- [x] `docs/journal/190-stock-solar-panel-and-battery-background.md` written.
- [x] `guides/writing-a-mod.md`.

## Log

- 2026-10-17 — Created as a draft by Agent 3 while refining plan 082: scope that 082 left out.
- 2026-10-18 — Done by Agent 1 (Lead) on lead/followups: `ModuleSolarPanel` (`mods/stock/src/solar.ts`) and `PartSolarPanel` (Probes node). Sim test `solar.test.ts`: one game day on rails gives 10 825.4 EC and in flight 10 825.5 EC (criterion 1 %). The test lives in `packages/sim/test`, because `mods/stock` tests run without a sim. A fixture keeps the flight vessel awake with a 1e-9 N·m torque.
