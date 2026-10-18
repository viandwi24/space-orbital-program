---
id: 216
title: "Key profiles: KSP-compatible default and Orbital classic"
status: in-progress
owner: "Worker A"
depends: []
phase: 7
created: 2026-10-18
updated: 2026-10-19
---

# 216 — Key profiles: KSP-compatible default and Orbital classic

## Goal

A KSP player's hands work on day one. The default key profile follows KSP: B brakes, `[`/`]` switch vessel, V camera, N RCS back, 1–0 action groups, Alt+1..0 SAS modes, Alt+WASDQE trim, G gear, U lights, Backspace abort, F2 hide UI, a screenshot key, `/` stop warp, Caps Lock precision, H N I J K L translation. Node keys act only in the map with a node selected. An "Orbital classic" profile keeps today's keys for existing players. Settings has a profile selector, and a player's custom binds survive the change.

## Context

- Rancangan §12.1 (clash table, missing keys, profile question), §15 #6 (pause on `P`; Space only outside Flight) and #7 (KSP default plus "Orbital classic": default per owner review, rancangan §15 #7; may change).
- ADRs: 0206 (key profile: KSP-compatible default plus "Orbital classic"), 0061 (remappable keys, one binding table, settings format 2).
- Research:
  - 15 §5.3: every remappable binding is in `apps/web/src/lib/keybindings.ts:57-133`; flight and map share one clash scope; reserved keys include Backspace (`:157-168`); KSP bindings with no action listed there.
  - 05 §3.1: today's flight keys (C brakes, `[`/`]` trim, V speed reference, N mute, 1–0 SAS, Numpad groups) and what is not bound.
  - 12 (KSP settings and keys) and 16 (verified: Backspace runs Abort, backtick resets the camera).
  - `apps/web/src/lib/onboarding/tutorial.ts:41-58`: tutorial steps show the player's own keys, so they follow the profile with no copy change.

## Scope

**In:**
- **Chords** in the key model: a key id may carry modifiers (`Alt+Digit1`, `Alt+KeyW`, `Ctrl+KeyM`). Clash checks compare the full chord.
- **Profiles** as data: `ksp` (default) and `classic`. A profile is a full default table; the player's overrides apply on top.
- New actions (declared here so later plans only wire them): `rcsToggle` R, translation H/N forward/back, J/L left/right, I/K down/up, `precision` Caps Lock, `gear` G, `lights` U, `abort` Backspace, `hideUi` F2, `screenshot` F12 (see Design notes), `stopWarp` `/`, `vesselNext` `]`, `vesselPrev` `[`, `cameraMode` V, `cameraReset` backtick, `trimPitchUp/Down`, `trimYawLeft/Right`, `trimRollLeft/Right` Alt+W/S/A/D/Q/E, `trimReset` Alt+X, `muteToggle` Ctrl+M, `pause` P.
- KSP profile remaps: brakes B; groups 1–0 on Digit keys (Numpad stays a second key); SAS modes on Alt+1..0; speed reference moves to a click on the speed readout (no key); map node keys become map-only and need a selected node.
- Backspace leaves `RESERVED_KEYS`; it keeps "delete node" only in the map with a node selected.
- Settings: profile selector in the Controls section; switching keeps overrides that do not clash, and lists the ones that do with "keep mine" or "use profile".
- Migration: a saved settings value with overrides and no profile becomes `classic` plus those overrides, so nobody's hands change without asking; new players get `ksp`. A one-time notice offers the switch.
- Help overlay and settings list read the active profile.

**Out:**
- Wiring the new actions to features: RCS (211), vessel switching (221), camera modes, hide UI and screenshot (226), EVA keys (225), stop warp (206), pause (205). Each of those plans binds the handler; unwired actions are hidden from the list until their plan lands.
- Gamepad (P2).

## Touches

- **Size:** M
- **Edits:**
  - `apps/web/src/lib/keybindings.ts` and `apps/web/src/lib/keybindings.test.ts` (chords, profiles, new actions, reserved list)
  - new `apps/web/src/lib/key-profiles.ts`
  - `apps/web/src/lib/settings/settings.ts` (format 4: `keyProfile`; migration from 3)
  - `apps/web/src/lib/ui/ControlsEditor.svelte`, `apps/web/src/lib/ui/SettingsDialog.svelte`
  - `apps/web/src/lib/hud/HelpOverlay.svelte`
  - `apps/web/src/lib/flight-loop.ts` (brakes, groups, SAS on Alt, trim on Alt, node keys gated, mute on Ctrl+M)
  - `apps/web/src/lib/vab/controller.svelte.ts` (only to read chords)
  - `apps/web/src/lib/hud/InstrumentDeck.svelte` (speed readout click cycles the reference)
- **Shared contracts:** the `ActionId` list and the chord key-id format are the contract plans 205, 206, 211, 221, 225 and 226 bind to. Settings format 4 (additive, migrates from 3).

## Design notes

- Screenshot key: KSP uses F1, which we use for help. Proposal: F12 for screenshot, F1 and `?` stay help. Recorded in ADR 0206; may change.
- Caps Lock is a toggle key in browsers; read `getModifierState('CapsLock')` instead of key events.
- Alt+digit in browsers on macOS types a symbol; we match on `event.code`, so it works, and we `preventDefault` only for bound chords.
- Space stays Stage in Flight; `P` is pause on every page (rancangan §15 #6; default per owner review; may change).

## Steps

1. Chord ids in the key model with parsing, display and clash rules. Tests.
2. Profiles as data; resolve profile + overrides; new action ids.
3. Settings format 4 and migration with the one-time notice.
4. Controls editor: profile selector and the clash list on switch.
5. Flight loop rebinds that need no new feature: brakes, groups on digits, SAS on Alt, trim on Alt, mute, map-only node keys, speed readout click.
6. Help overlay reads the active profile.

## Acceptance criteria

- [ ] `apps/web` vitest `lib/keybindings.test.ts`: in `ksp`, B is brakes, Digit1 is custom group 1, Alt+Digit2 is SAS prograde, Alt+KeyW is trim pitch, Backspace is abort; in `classic`, C is brakes and `[` is trim down; `Alt+Digit1` and `Digit1` do not clash.
- [ ] `apps/web` vitest `lib/settings/settings.test.ts` (new or extended): a format 3 value with overrides migrates to `classic` with the same overrides; an empty format 3 value migrates to `ksp`.
- [ ] Chromium e2e `e2e/key-profiles.e2e.ts`: in a new world, pressing B in flight turns the Brakes group on (vessel panel Overview reads "Brakes on"); switching to Orbital classic in Settings makes C do it; Alt+2 sets SAS to prograde; in the map with no node selected, I does nothing.
- [ ] `e2e/smoke.e2e.ts` and `e2e/editor.e2e.ts` still pass on Chromium.
- [ ] `bun run check:affected` passes.
- [ ] CI is green on the plan's ready tag (full suite, ADR 0126).

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row, next plan, open issues).
- [ ] `docs/journal/216-key-profiles.md` written, with both profile tables.
- [ ] `docs/architecture/overview.md` updated (key profiles and chords).
- [ ] ADR 0206 updated if the screenshot key changes.

## Log

- 2026-10-18 — Created from refs/rancangan-terpadu.md (release roadmap).
