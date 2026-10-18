---
id: 227
title: Audio pack and minimal music
status: draft
owner: ""
depends: []
phase: 7
created: 2026-10-18
updated: 2026-10-18
---

# 227 — Audio pack and minimal music

## Goal

The game sounds like a launch campaign. Explosions, decoupling, parachutes, touchdown, RCS, EVA and the jetpack have their own procedural sounds, and map and warp changes have UI cues. A minimal ambient music set plays quietly behind its own volume slider. Every sound cue also has a visual sign, so nothing depends on hearing.

## Context

- rancangan §11.4 (sounds: explosion, decouple, chute, touchdown, RCS, EVA, jetpack, map and warp UI cues), §11.5 (minimal music, quiet by default, music volume), §11.8 (each cue mirrored visually; reduced motion for shake and flashes).
- Research 15b §1c: three continuous layers and five one-shots (`click`, `sasOn`, `sasOff`, `stage`, `warning`) in `apps/web/src/lib/audio/` (`director.ts:21,39-60`, `params.ts:80-96`, `engine.ts:118-215`). Missing: music, explosion or crash, decouple, chute, landing, docking, RCS, EVA, ambience, UI cues for map and warp. The engine-roar gain in code (`throttle × √pressure`, `params.ts:80-81`) disagrees with ADR 0062 (`throttle*(0.25+0.75*p)`). Doc 13 §6 lists the same gaps.
- Settings: audio buses master 0.7, effects 0.8, interface 0.6 and mute (`apps/web/src/lib/settings/settings.ts:28-36`); no music channel.
- ADRs: 0210 (audio additions and music, **proposed**; amends 0062), 0062 (procedural Web Audio, no asset files).
- Owner question: "minimal ambient music set, quiet by default; the source is the owner's decision". Default per owner review (rancangan §15 #9); may change. This plan builds the music bus and a procedural ambient set. If the owner picks CC-licensed tracks instead, only the source module changes.

## Scope

**In:**
- One-shots, procedural in the ADR 0062 style: explosion (scaled by mass), decouple, parachute deploy and full open, touchdown (scaled by speed), RCS puff, EVA step, jetpack hiss, docking clunk, map open/close, warp up/down.
- A cue table: event id → sound → visual sign. Visual signs reuse existing toasts, chips or effects, and add a short screen-edge flash only where nothing else shows the event (respecting reduced motion).
- Events come from the snapshot event stream. Cues for parts that do not exist yet (chutes, RCS, docking) are wired to their event ids and stay silent until those plans emit them.
- Music bus with a Music slider (default 0.25) and mute. Four procedural ambient beds: menu, Space Center, Hangar, space. Crossfade on scene change. Music ducks under warnings.
- Fix the engine-roar formula to match ADR 0062, or record the change in ADR 0210.

**Out:** spatial and doppler audio, voice, adaptive music (P2). Licensed music files (owner decision).

## Touches

- **Size:** M
- **Edits:**
  - `apps/web/src/lib/audio/director.ts`, `apps/web/src/lib/audio/engine.ts`, `apps/web/src/lib/audio/params.ts`, plus new files in `apps/web/src/lib/audio/` (cues and music)
  - `apps/web/src/lib/settings/settings.ts`, `apps/web/src/lib/ui/SettingsDialog.svelte` (Music slider; settings format bump with a default)
  - `apps/web/src/lib/flight-loop.ts` (event hookup)
- **Shared contracts:** settings format version (additive field with a migration default). No sim change.

## Design notes

- Every one-shot is a short graph of oscillators, noise and envelopes built on demand, like the existing `stage` and `warning` cues. No asset files.
- The cue table is data, so a test can assert that every audible cue has a visual sign.

## Steps

1. Cue table and the visual-sign check.
2. Explosion, decouple, touchdown, map and warp cues (events exist today).
3. Chute, RCS, EVA, jetpack and docking cues bound to their event ids.
4. Music bus, slider and the four ambient beds with crossfade and ducking.
5. Engine-roar formula alignment.
6. Chromium and Firefox e2e for settings and a cue.

## Acceptance criteria

E2E setup uses the plan 203 debug API (ADR 0200). This plan does not depend on 203; if 203 is not done yet, set up with `launchTwoStage` and `runScript` from `apps/web/e2e/support.ts` and record that in the Log.

- [ ] `apps/web` vitest: `audio/cues.test.ts` asserts every cue id in the table has a visual sign and a gain under the bus limit; settings migration gives Music 0.25 to an old profile.
- [ ] `apps/web` vitest: the director plays `explosion` once per destroyed part event and never more than 4 at once.
- [ ] Chromium e2e `apps/web/e2e/audio.e2e.ts`: the Music slider persists after reload; after a stage event with `debug.setLocation` (plan 203) at 500 m and a hard landing, the page reports the `touchdown` and `explosion` cues through the director's debug counter and shows their visual signs.
- [ ] The same e2e passes on Firefox (`--project=firefox`).
- [ ] `bun run check:affected --build --e2e e2e/audio.e2e.ts` passes.
- [ ] CI is green on the `ready/*` tag for this plan.

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row, next plan, open issues).
- [ ] `docs/journal/227-audio-pack.md` written.
- [ ] ADR 0210 moved from proposed to accepted only after the owner decides the music source; ADR 0062 status line notes the amendment.
- [ ] Credits page unchanged unless licensed audio is added.

## Log

- 2026-10-18 — Created from refs/rancangan-terpadu.md (release roadmap).
