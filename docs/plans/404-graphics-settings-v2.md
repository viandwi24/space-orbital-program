---
id: 404
title: "Graphics settings v2: a switch and quality per look, an Ultra preset, a resolution-scale slider, 120 fps, defaults from the device tier"
status: done
owner: "Worker C"
depends: [395, 399, 400, 401]
phase: 9
created: 2026-10-24
updated: 2026-10-24
---

# 404 — Graphics settings v2

## Goal

Settings → Graphics gives the player a switch and a quality level for each look (clouds, ocean, plumes, re-entry and aero, terrain detail and scatter, post), an *Ultra* preset, a resolution-scale slider and 120 in the frame-rate setting. The choices are saved per player. The governor works inside them and never overrides what the player set. The defaults come from the **device tier**, so a first start on a Windows laptop with integrated graphics picks a cheap level that holds a locked 60, and the M5 picks one that holds 120.

## Context

- Design: `refs/graphics-v2/README.md` (decisions 2 and 3; "each look has a quality setting and an on/off switch, and an *Ultra* preset uses what the savings free up"); ADR 0330 §1–3.
- The owner (2026-10-24): the targets are not only the M5. They include lower Macs (base M2) and **Windows PCs, where most players are**: integrated Intel Iris Xe / AMD 680M, GTX 1650 / RTX 3050 class, Chrome or Edge on D3D12. Each look needs a cheap Low/Medium version that holds a locked 60 on those machines, and Settings' defaults must come from the device tier.
- Research:
  - `refs/graphics-v2/03-renderer-and-mod-audit.md` A7 (`:157-172`): today's settings (Quality Automatic/Low/Medium/High, no Ultra; Brightness; Renderer; Frame rate Display/60/30; the governor switch, `apps/web/src/lib/ui/SettingsDialog.svelte:129-142, 217-295`); per-feature switches exist only in debug (`R/feature-switches.ts`). A5 (`:123-141`): the governor's ladder, trial bans, learned level per backend; a governed step keeps resource sizes (`R/presets.ts:245-253`).
  - `refs/graphics-v2/02-browser-120fps.md` (frame pacing at 120 Hz, Safari's ~60 cap).
  - `refs/graphics-v2/01-ksp-and-mods.md` summary table (`:236-246`): the `low` → `high` knobs per look.
- ADRs: 0053 (frame budget, amended by 0330), 0233 (governor paced fast down, measured up), 0310 (no shader builds at governor steps), 0330.
- Code: `apps/web/src/lib/graphics.ts` (preset storage, `presetChoice`, the WebGPU adapter probe), `apps/web/src/lib/settings/settings.ts`, `apps/web/src/lib/ui/SettingsDialog.svelte`, `packages/renderer/src/{presets,quality-governor,feature-switches}.ts`.
- Plans: 395 (governor for 120 Hz; it adds 120 to the frame-rate setting — this plan surfaces it and must not add it twice), 399, 400, 401 (their quality fields), 397, 398, 402, 403 (their quality fields when they land; this plan leaves a slot for each), 393 (TAAU input scale), 392 (baseline).

## Scope

**In:**
- **Per-look settings:** clouds, ocean, plumes, re-entry and aero, terrain detail and scatter, post (bloom, auto exposure). Each has Off (where that makes sense) / Low / Medium / High / Ultra, mapped to the preset fields the look plans define. A look whose plan has not landed shows its current single level.
- **Presets:** Low / Medium / High / **Ultra**, plus Custom when the player changes one look. Ultra raises the looks' levels and the TAAU scale where the savings allow.
- **Resolution scale** slider (the TAAU input scale of plan 393, for example 50–100 %), separate from the per-look levels.
- **Frame rate:** Display / 120 / 60 / 30, coordinated with plan 395 (one implementation).
- **Device tier:** a `deviceTier()` function from the WebGPU adapter info (vendor, architecture, limits), the WebGL renderer string where allowed, `devicePixelRatio`, screen size and the OS, mapped to tiers such as:
  - integrated low (Iris Xe, AMD 680M, base M1/M2): Low or Medium, lock 60, scale ≤ 0.6;
  - discrete entry (GTX 1650, RTX 3050): Medium, lock 60;
  - high (M3 Pro and up, M5, RTX 4060 and up): High, lock 120 where the display allows;
  - unknown: Medium, lock 60, governor on.
  First-start defaults come from the tier; a short benchmark under the loading screen may move it one step, never more.
- **Persistence:** per player in the settings profile (versioned, validated), with a migration from today's preset key.
- **Governor contract:** the player's choices are ceilings and floors: the governor may lower the resolution scale and levels the player left on Automatic, but never raises a look above the player's level, never turns on a look the player turned off, and never lowers a look the player pinned. A UI hint says when the governor is holding a look down.

**Out:**
- New looks or new quality fields (the look plans own them).
- Mod post profiles (plan 405).

## Design notes

- Every level of every look is warmed at load (ADR 0308/0310); a settings change that needs a new resource size (bake face, FFT on/off) rebakes in the background, never in a frame.
- The tier table lives in data with a test per known adapter string; unknown adapters fall to the safe default, never to High.
- Safari: lock 60 whatever the tier (ADR 0330 §1).

## Steps

1. ADR (next free number): the settings model (per-look levels, presets, Custom), the device tier table, and the governor contract.
2. `deviceTier()` and its table, with tests from recorded adapter strings.
3. Settings model, persistence and migration.
4. Wire the per-look levels to the preset fields of 399, 400 and 401 (and slots for 397, 398, 402, 403).
5. The governor contract in `quality-governor.ts`, with tests.
6. Settings dialog: presets, per-look rows, resolution slider, frame rate.
7. A quick look; frame-time check at each preset; journal.

## Acceptance criteria

- [ ] `bun test packages/renderer` passes, including `test/quality-governor.test.ts` (extended): with a look pinned by the player the governor never changes it; with a look off it never turns it on; it lowers only Automatic looks and the resolution scale; it settles on a fixed state.
- [ ] `test/device-tier.test.ts`: recorded adapter strings for Intel Iris Xe, AMD 680M, GTX 1650, RTX 3050, base M2, M5 and an unknown adapter map to their tiers; unknown never maps above Medium; Safari locks 60.
- [ ] web vitest `settings.test.ts`: the per-look settings round-trip; an old profile with only a preset key migrates to the same preset; invalid values fall back to the tier default.
- [ ] A test that every quality level of every look is in the warm list.
- [ ] `bun run typecheck` and `bun run docs:check` pass.
- [ ] e2e paused by the owner: none added.
- [ ] A quick look at the Settings dialog in a browser; screenshots in `docs/journal/assets/404-*.jpg`.
- [ ] No frame-time regression against plan 392's baseline at `high`; Ultra's cost on the M5 recorded.
- [ ] Low and Medium hold a locked 60 at the pad, 12 km and orbit on the lower targets: measured with Chrome's CPU and GPU throttling as a stand-in, and on a Windows integrated-GPU machine when the owner can run it ([manual] for the real machine); the journal states which.
- [ ] [manual] The owner checks the dialog and the first-start default on the M5.

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row, next plan, open issues).
- [ ] `docs/journal/404-graphics-settings-v2.md` written.
- [ ] `docs/architecture/overview.md` (quality and governor): per-look settings, device tier, governor contract.
- [ ] The new ADR linked above and in `docs/decisions/README.md`.
- [ ] Player-facing help for the Settings dialog, if it lists the options.
- [ ] `docs/research/stack-versions.md` updated for anything looked up (WebGPU adapter info fields).

## Log

- 2026-10-24 — Created by the coordinator from refs/graphics-v2 (ADR 0330).
- 2026-10-24 — Done for the looks that exist (Worker C, ADR 0339): the profile, Ultra and Custom, a row per look (re-entry, plumes, sea), the resolution slider, the governor contract. Left: rows for looks whose plans land later, the frame-time checks and the owner's look ([manual]).
