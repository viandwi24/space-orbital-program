---
id: 369
title: "Cached shadow maps for the static site"
status: draft
owner: ""
depends: [363]
phase: 8
created: 2026-10-22
updated: 2026-10-22
---

# 369 — Cached shadow maps for the static site

## Goal

A ranked item from plan 363's research (`docs/research/frame-budget-and-efficiency.md` §5). The owner asked for efficient rendering and a playable frame rate on 2026-10-22.

## Context

The sun's shadow map re-renders every caster every frame (`environment.ts`), with 2048 or 4096 texels and every part casting.

At the pad the site's buildings, trees and rocks do not move. The sun moves by a fraction of a degree a minute.

## Steps

- Split the casters into static (the site) and dynamic (vessels, effects).
- Render the static map only when the sun or the view's shadow frustum moves past a threshold, and the dynamic casters each frame into a second, smaller map (or composite them).
- three r186's shadow nodes need checking for this on WebGPU: `castShadow` toggles rebuild shaders (plan 261).

## Acceptance criteria

- [ ] GPU time at the pad (`measure-graphics.ts` pad scene) falls with no visible shadow change; `capture-graphics.ts` before and after.
- [ ] `bun run typecheck` and `bun run docs:check` pass.

## Docs checklist

- [ ] `docs/STATUS.md` board row; journal; ADR for any design choice.

## Log

- 2026-10-22 — Drafted by plan 363.
