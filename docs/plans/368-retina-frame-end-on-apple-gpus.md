---
id: 368
title: "The Retina frame end on Apple GPUs: MSAA resolve, canvas format and pass count"
status: draft
owner: ""
depends: [363]
phase: 8
created: 2026-10-22
updated: 2026-10-22
---

# 368 — The Retina frame end on Apple GPUs: MSAA resolve, canvas format and pass count

## Goal

A ranked item from plan 363's research (`docs/research/frame-budget-and-efficiency.md` §5). The owner asked for efficient rendering and a playable frame rate on 2026-10-22.

## Context

ADR 0248 and plan 362 measured the same thing on the M2 in orbit:
- `high` draws 3024 × 1890 at 33 ms frames while its GPU timestamps say 6–9 ms;
- `medium` draws 2268 × 1417 at 16.7 ms.

The time the timestamps do not see grows with the full-size pixels. It is the resolve, the post chain's copies and the present on a tile GPU. It is the largest cost on Apple machines at Retina and nothing measures it per part.

## Steps

- Profile one `high` frame with Safari's or Xcode's Metal frame capture (the only tools that see the tile resolves).
- Try, one at a time, with frame intervals measured by `measure-auto-quality.ts`:
  - MSAA 2 → 0 at pixel ratio 2, with an FXAA or SMAA pass;
  - an `rgba16float` → `rgba8unorm` post target where HDR is not needed;
  - fewer full-size passes (bloom at quarter size only, the output pass merged into the scene pass);
  - the canvas's `alphaMode: opaque`;
  - `desynchronized`.

## Acceptance criteria

- [ ] `high` at pixel ratio 2 on the M2 in the owner's scene draws at 60 fps, or the journal shows which step costs what.
- [ ] No visual regression in `capture-graphics.ts` screenshots.
- [ ] `bun run typecheck` and `bun run docs:check` pass.

## Docs checklist

- [ ] `docs/STATUS.md` board row; journal; ADR for any design choice.

## Log

- 2026-10-22 — Drafted by plan 363.
