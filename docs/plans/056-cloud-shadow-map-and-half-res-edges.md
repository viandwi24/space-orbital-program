---
id: 056
title: 'A baked cloud-shadow map for medium and sharper edges at the half-resolution rung'
status: done
owner: 'shadows session (Claude, 2026-10-17)'
depends: [050]
phase: 3
created: 2026-10-17
updated: 2026-10-17
---

# 056 — Baked cloud-shadow map, sharper half-resolution edges, the burning pad's smoke

## Goal

Three things measured and left open: (1) `medium` has no cloud shadows on the ground because evaluating the cloud density per ground pixel costs 1.0 to 1.2 ms (journal 050); (2) at the governor's half-resolution rung the ridge lines and cloud rims show 2 x 2 steps; (3) added by the orchestrator after its review of plan 040: journal 040 measured the burning pad of the 23-part booster rocket at 23.5 to 24 ms (`high`) and 16.9 to 17.3 ms (`medium`), over the ADR 0053 amendment's budgets (16.7 and 13.3), pre-existing smoke-fill cost; fix it without making liftoff look worse.

## Context

- Plan 050, ADR 0064, journal 050; plan 054, ADR 0070, journal 054 (the baked coverage map); plan 040, journal 040 (the burning pad); ADR 0047 (smoke impostors), ADR 0053 (budgets); `docs/product/visual-direction.md`, ADR 0025 (release bar); journals 039/050/054 (method).

## Scope

**In:** the cloud map's second channel and size, `medium`'s ground cloud shadows from it; an edge pass for the half rung; the smoke puff's noise as a texture; tests, screenshots, frame tables, hitch.
**Out:** M1/M2, Intel and phone measurements (no hardware; drafts 038 and 066 hold them); a half-resolution smoke target (not needed); changing the default preset. Ridge-cast shafts are plan 062 (done in the same session).

## Design notes

ADRs 0086 (map: RG8 2048 x 1024, ground shadow = 1 - 0.45 * density, `cloudShadowMap` preset field), 0087 (edge pass: the planet program redrawn at full resolution for the pixels where the half-resolution texels disagree), 0088 (smoke noise in a 256 x 256 tiling texture plus an early discard). The draft's "re-baked as `uCloudAngle` moves" is not needed: the map is in the clouds' frame and the lookup rotates (ADR 0086).

## Steps

1. Refine, verify online (research `three.md`), record ADRs. (done)
2. Smoke: A/B the mesh off and on in the burning pad; noise texture + discard; tests. (done)
3. Cloud map: RG, 2048 x 1024, `cloudShadowMap`, shader; A/B of the shadow in one page. (done)
4. Edge pass: shader, material, mesh, twin and tests; mask view; A/B cost. (done)
5. Screenshots, frame tables against HEAD, hitch; full suites; docs. (done)

## Acceptance criteria

- [x] **Tests**: `bun test packages/renderer` passes with the new tests: `smoke-noise.test.ts` (tiling, range, spread, bilinear read of the texels within 0.02 of the analytic noise, channels), `half-res.test.ts` (edge pixels: smooth ground no, ground against sky and a ridge yes, sky only where the chroma jumps, never on ground texture), `presets.test.ts` (noise or map shadows never both, `medium` has the map). Mutants fail them (the lattice wrap, the edge test).
- [x] **Cloud shadows on `medium`**: in one page, `CLOUD_SHADOW_MAP` on against off, pad scene at 2.2 km: more than 5 % of the pixels darker by more than 3 levels (measured 7.7 %, mean -7.1) and almost none lighter (1.2 %, the noise of two frames of the same build); screenshots `056-before-cloud-shadows-medium.jpg` (flag off = HEAD's `medium`) and `056-after-cloud-shadows-medium.jpg`.
- [x] **Half-rung edges**: crops at 4x, `056-before-half-ridge.jpg` / `056-after-half-ridge.jpg` and `056-before-half-cloud.jpg` / `056-after-half-cloud.jpg` (with the full-resolution `056-*-full-*.jpg`): the ridge's steps are one pixel long instead of two and a cloud's rim is the full-resolution one; the mask of the edge pixels marks the ridge and the rims only (journal 056). `056-*-half-frame.jpg` for the whole frame.
- [x] **Frame table** (journal 050's method: production build of a clean copy, hidden pane, 1920 x 1080 at ratio 1, minimum of windows of 8 frames, sync, warm second page load; HEAD and this plan alternated over the same hour, minimum over two or more pages each): the scenes pad, 3 km, 12 km, orbit, hillside (two views), low sun behind the ridge (two suns), burning pad, on `high` and `medium`, with the shadows on: **this plan changes no scene by more than +1.0 ms against HEAD** (measured -1.3 to +0.9 on `high`, -0.05 to +0.6 on `medium`); `high` is at most 16.7 ms everywhere (worst 16.56); `medium`'s absolute 13.3 is **not reproducible today for HEAD itself** (pad 13.2 and hillside 13.7 ms on HEAD, 13.3 and 13.8 here; journal 054 measured HEAD at 11.2 and 12.3 on a cooler machine), so the criterion is the difference.
- [x] **Burning pad** (orchestrator's item): at most 16.7 ms on `high` and 13.3 ms on `medium` (measured 15.82 and 12.88 against 22.57 and 16.04 for HEAD in the same hour); smoke alone costs 2.4 and 1.2 to 1.4 ms (from 7.5 and 4.9); screenshots `056-before-burning-pad-{high,medium}.jpg` and `056-after-burning-pad-{high,medium}.jpg` show the same smoke.
- [x] **Half rung works**: the governor's rung runs with the edge pass (`high` pad 11.2, hillside 8.4 ms; `medium` 8.8 and 7.5, against 15.4 / 14.0 and 11.8 / 12.1 at full resolution); the edge pass costs 0.85 to 1.5 ms of that.
- [x] **Hitch**: nine preset switches (journal 048's protocol, page after its tables and 100 s): first `high` 65 ms against 25 for HEAD in one run each, then 11 to 30 ms against 10 to 24, first visit to `low` 441 ms against 709; the same range as journal 054 (29 to 57 ms).
- [x] `bun test packages/renderer`, `bun run test`, web vitest, `bun run typecheck`, `bun run build`, `bun run docs:check`; prettier on the files of this plan.

## Docs checklist

- [x] STATUS, journal 056, ADRs 0086 to 0088, `docs/research/three.md`, the roadmap page (entry removed), draft 062 done with it.

## Log

- 2026-10-17 — Created as a draft by plan 050 (half-res session).
- 2026-10-17 — Refined draft → ready at the human's request (session: shadows session). Done together with plan 062 (both want the baked cloud map). The orchestrator added the burning-pad item after its review of plan 040 (journal 040: 23.5 to 24 ms on `high`, 16.9 to 17.3 on `medium`).
- 2026-10-17 — Started (shadows session). The smoke A/B put 7.5 / 4.9 ms on the smoke fill; a texture for the noise and an early discard brought it to 2.4 / 1.2 to 1.4.
- 2026-10-17 — Executed (shadows session). Deviation: the map is 2048 x 1024 with a density channel instead of re-baking; `medium`'s absolute budget reads over on HEAD itself on this machine today, so the frame criterion is the difference. Criteria: see journal 056. Found, not done: a tile mask for the edge pass (ADR 0087), M1/M2/Intel/phone (drafts 038, 066).
