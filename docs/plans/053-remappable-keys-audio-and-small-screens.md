---
id: 053
title: "Remappable keys, audio and small screens"
status: done
owner: "audio session (Claude, 2026-10-17)"
depends: [023]
phase: 3
created: 2026-10-17
updated: 2026-10-17
---

# 053 — Remappable keys, audio and small screens

## Goal

What plan 023 stated honestly instead of faking in 1.0: players can choose their own keys, hear the game (synthesised in code, no audio files) and play on a tablet (touch controls, landscape 1024x768 and up); phones get an honest notice.

## Context

- Plan 023, ADR 0060 (read-only key list, "no sound" row), ADR 0040 and `product/browser-support.md` (no phones or tablets), ADR 0026 (design system), ADR 0048 (v1 scope), journals 021 and 023.
- New decisions of this plan: ADR 0061 (binding table, settings format 2), ADR 0062 (procedural Web Audio), ADR 0063 (tablets yes, phones no). Research: `research/web-audio-and-touch.md` (2026-10-17).
- Code: `apps/web/src/lib/{keybindings,flight-loop}.ts`, `lib/vab/controller.svelte.ts`, `lib/maneuver*.ts`, `lib/hud/sas-model.ts`, `lib/settings/*`, `lib/ui/SettingsDialog.svelte`, `lib/hud/HelpOverlay.svelte`, `lib/onboarding/tutorial.ts`.

## Scope

**In:**

1. **Remappable keys** (ADR 0061): one action table, resolver, rebind with clash handling (swap), reset, settings format 2 with migration; flight, map and VAB handlers, SAS buttons, help overlay, settings Controls tab and the tutorial read the table.
2. **Audio** (ADR 0062): engine roar and cockpit rumble by throttle and ambient pressure, wind by speed and density, stage thunk, SAS and UI clicks, warning tones; master, effects and interface volumes and a mute key in the settings (no music); locked until the first gesture, suspended on a hidden tab.
3. **Small screens** (ADR 0063): touch controls in flight (throttle, steering pad, roll, stage, SAS, map), camera drag and pinch, VAB pinch, a setting (auto, on, off), a notice below 900x500, coarse-pointer target sizes, `browser-support.md`.

**Out:** gamepad support, music, phone layout and real-device tests (new draft plan), an accessibility audit by a person (needs a human), recorded sounds.

## Design notes

- Key ids, resolver and table: ADR 0061. Audio layers (`params.ts` pure, `engine.ts` graph, `director.ts` glue) and cost target: ADR 0062. Touch model (`lib/touch/touch-model.ts`, pure): ADR 0063.
- The flight loop gets `setKeymap`, `setTouchInput` and `setThrottle`; the settings store feeds them. The renderer already takes `orbitCamera({ dYaw, dPitch, zoomFactor })`; no renderer change is planned.

## Steps

1. Refine and write ADRs 0061 to 0063 and the research note (this plan, at the human's request, 2026-10-17).
2. Binding table, resolver, key ids, clash and reset logic, tests (`keybindings.ts`, `keybindings.test.ts`).
3. Settings format 2 with `bindings`, `audio`, `touch`, migration from 1, store and tests.
4. Handlers read the table: `flight-loop.ts`, the maneuver planner (`NODE_KEYS` to actions), SAS model, the VAB controller; first-flight guide placeholders; help overlay.
5. Settings dialog: Controls tab edits keys (capture, clash swap, reset); Audio tab with the three volumes and mute; Game tab with touch controls.
6. Audio: `params.ts` and tests, `engine.ts` (graph, gesture gate, visibility), `director.ts`, wiring in flight, VAB and menu clicks, mute key; measure the main-thread cost.
7. Touch: `touch-model.ts` and tests, overlay component, pointer rework of the flight canvas (touch camera and pinch), VAB pinch, coarse-pointer sizes, small-screen notice.
8. Docs: `browser-support.md`, roadmap page entry, STATUS, journal with the human listening checklist and screenshots; draft plan for phones.
9. Full checks, one e2e smoke run in one engine, one short touch-emulation run.

## Acceptance criteria

- [x] **Binding table:** `bun run --filter @orbital/web test -- keybindings` passes tests that cover: defaults have no clash per scope; `rebind` reports a clash and `swap` exchanges; reserved keys are refused; reset (one and all) restores defaults; every action has a unique id and a label; the stored table validator drops unknown, reserved and clashing entries to defaults; `keyIdOf` maps layouts (`code` for letters, character for punctuation, Right Shift to Left Shift). Evidence: `keybindings.test.ts` (19 tests).
- [x] **Settings migration:** `settings.test.ts` pins v1 to v2 (units and tutorial kept), garbage to defaults, a future version to defaults, repair of invalid fields, round trip of bindings and audio. Evidence: `settings/settings.test.ts`.
- [x] **Handlers use the table:** a test drives the keymap resolver with a rebound table for flight (stage, throttle, SAS, map, warp), the maneuver keys and the VAB actions; `rg "case 'Key" apps/web/src/lib/flight-loop.ts` returns nothing. Evidence: keymap test with a rebound table, `maneuver-controller.test.ts` (actions), `sas-model.test.ts`; `grep -c "case 'Key" flight-loop.ts` is 0.
- [x] **[manual, built-in browser, production build]** in `/flight` rebind Stage to another key in the settings dialog, press it in flight, see Stage fire; reload and the binding persists; "Reset all" restores Space. Recorded in the journal. Evidence: journal 053 (G staged, Space did not, persisted over reload, reset all restored Space).
- [x] **Audio parameter mapping:** `audio/params.test.ts` pins: engine gain 0 at throttle 0; monotonic in throttle; in vacuum the roar gain is 0 and the rumble gain is at most one third of the sea-level roar at full throttle but above 0; wind 0 below 30 m/s and zero in vacuum, monotonic in density times speed; ducking at warp above 1; all outputs finite and clamped for NaN, negative and huge input. Evidence: `audio/params.test.ts` (12 tests).
- [x] **Audio graph and gesture gate:** `audio/engine.test.ts` with a fake context: nothing is created before the first gesture; the first `pointerup`/`keydown` creates and resumes the context once; hidden tab suspends and visible resumes (only if unlocked); mute ramps the master to 0; volumes scale the buses; one-shots disconnect at their end; with no `AudioContext` the engine stays locked without throwing. Evidence: `audio/engine.test.ts` (18 tests, fake context).
- [x] **[manual, page] analyser levels:** in the built-in browser (dev hook, journal) the master analyser reads silent when muted or locked and above a stated RMS threshold with the engine at full throttle at the pad, lower in vacuum with only the rumble. Evidence: journal 053 table (pad 0.222 mean RMS, vacuum rumble 0.054 against 0.151 at sea level, wind 0.057, muted or locked 0).
- [x] **Audio cost:** measured in the page, `director.frame` plus parameter updates average under 1 ms per frame on the main thread (value in the journal). Evidence: 0.005 ms per frame (6 ms over 1288 frames, dev build), journal 053.
- [x] **Touch mapping:** `touch/touch-model.test.ts` pins: stick to pitch and yaw with dead zone and clamp, roll buttons, throttle slider fraction, full and cut, camera pinch factor, pointer-type auto detection. Evidence: `touch/touch-model.test.ts` (10 tests).
- [x] **Small-screen notice:** a vitest for the width and height rule. Evidence: `isSmallScreen` cases in `touch-model.test.ts`, and the e2e notice test.
- [x] **[manual, built-in browser]** screenshots at 390x844 (notice shown, game not claimed) and at 1024x768 with the touch controls on (flight, VAB), `docs/journal/assets/053-*.jpg`; viewport reset to desktop afterwards. Evidence: `docs/journal/assets/053-*.jpg`, viewport reset.
- [x] **One touch-emulation e2e run** (`workers: 1`, one engine): touch controls appear on a coarse pointer, tapping Stage fires stage one, the throttle slider changes the throttle; plus the existing smoke suite green on that engine. Evidence: `E2E_PORT=5215 E2E_HEADERS=1 playwright test --project=chromium --workers=1`: 9 passed, 1 skipped (@orbit).
- [x] **Repo checks:** `bun run test`, web vitest, `bun run typecheck` (svelte-check 0 errors), `bun run build`, `bun run docs:check`, prettier clean on the touched files.

## Docs checklist

- [x] `STATUS.md`, plan Log, journal `053-remappable-keys-audio-and-small-screens.md` with the **human listening checklist**, ADRs 0061 to 0063 and the index, `research/web-audio-and-touch.md`, `product/browser-support.md`, roadmap page (`lib/public/roadmap.ts`) and README if their content changes, a draft plan for phones and real devices with a board row.

## Log

- 2026-10-17 — Created as draft by plan 023 (release session): the public roadmap page lists it.
- 2026-10-17 — Refined draft → ready at the human's request (session: audio session). Decisions: audio is code-only Web Audio (ADR 0062), keys per ADR 0061, tablets yes and phones no per ADR 0063.
- 2026-10-17 — Started (in-progress), owner audio session.
- 2026-10-17 — Done. Deviations from the refined text: the Stage, roll and pad column is 112 px wide and SAS and Map stay the HUD buttons (ADR 0063 amended in place before the plan closed); the rumble gain is 0.12 (ADR 0062), found by measuring the master level; the tutorial gained placeholders (ADR 0061 point 6). Not done, as planned: phones and real devices (draft plan 055). Repo checks: see journal 053.
