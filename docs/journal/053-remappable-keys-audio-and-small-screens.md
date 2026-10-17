# 053 — Remappable keys, audio and small screens

**Plan:** plans/053-remappable-keys-audio-and-small-screens.md · **Session(s):** audio session (Claude, 2026-10-17) · **Date:** 2026-10-17 · **ADRs:** [0061](../decisions/0061-remappable-keys-binding-table-and-settings-format-2.md), [0062](../decisions/0062-procedural-audio-web-audio-no-assets.md), [0063](../decisions/0063-tablets-supported-phones-not.md) · **Research:** [web-audio-and-touch.md](../research/web-audio-and-touch.md)

## What was done

| Where | What |
|---|---|
| `lib/keybindings.ts` | the action table (`ACTIONS`, 49 actions), key ids (`keyIdOf`), `createKeymap`, `rebind`/`swapBindings`/reset, `repairBindings` for stored values, help rows |
| `lib/settings/*` | format 2 (`bindings`, `audio`, `touch`), migration from 1, the store with `keymap` |
| `flight-loop.ts`, `vab/controller.svelte.ts`, `maneuver*.ts`, `hud/sas-model.ts` | handlers branch on action ids; `NODE_KEYS` and the SAS buttons key by action |
| `ui/ControlsEditor.svelte`, `SettingsDialog.svelte` | click a key, press the new one; clash shows Swap or Cancel; reset one or all; Audio tab (three volumes, mute, test); Game tab (touch controls) |
| help overlay, tooltips, tutorial | key caps come from the table; the tutorial text has `{key:action}` placeholders and a touch wording |
| `lib/audio/` | `params.ts` (pure mapping), `engine.ts` (graph, gesture gate, visibility), `director.ts`, `audio.ts` (page singleton) |
| `routes/+layout.svelte` | engine start, settings to engine, mute key (global) with a status line, UI click ticks |
| `lib/touch/touch-model.ts`, `hud/TouchControls.svelte` | stick, throttle slider, pinch, small-screen rule; the flight canvas tracks pointers (one finger orbits, two pinch); the VAB pinches |
| `ui/SmallScreenNotice.svelte` | notice below 900x500, Continue anyway for the session |
| `e2e/touch.e2e.ts` | touch tablet context and the notice, Chromium only |

## Verification of the manual criteria (built-in browser)

- **Rebind in flight** (production build, `scripts/serve.ts`): Settings, Controls, Stage set to `G`; Space did nothing, `G` fired "Stage 1 fired"; after a reload the binding was still `G`; "Reset all to defaults" gave Space and `bindings: {}` in `localStorage`.
- **Gesture gate:** `data-audio` read `locked` after a scripted `click()` (untrusted) and `running` after a real key press.
- **Audio levels** (dev build, analyser on the master through `__orbital.audio().level()`; RMS of a 1024 sample window, 30 samples over 1.5 s):

| Case | mean RMS | max |
|---|---|---|
| locked or muted, nothing playing | 0 | 0 |
| full throttle, stage 1 not fired (no engine burning) | 0 | 0 |
| engine at the pad, full throttle, in the real flight | 0.222 | 0.302 |
| sea-level full throttle (second engine, driven directly) | 0.151 | 0.260 |
| vacuum, full throttle (rumble only) | 0.054 | 0.067 |
| wind only, 250 m/s at sea level | 0.057 | 0.101 |
| wind only, 100 m/s | 0.007 | 0.012 |
| wind, 250 m/s, vacuum | 0 | 0 |
| muted, full throttle | 0 | 0 |

The first version of the rumble (gain 0.3) read 0.125 against 0.151 at sea level: a sine concentrates its energy, so a gain ratio of a third is not an RMS ratio of a third. `RUMBLE_MAX` is 0.12 now (0.35 of the sea-level RMS). The first wind (band-pass) read 0.006 at 250 m/s: brown noise is dark, so the wind is now a low-pass that opens with speed behind a gain of 3.
- **Audio cost:** `director.frame` (the only per-frame audio work on the main thread) took 6 ms in total over 1288 frames in the dev build, 0.005 ms per frame, against the criterion of 1 ms; the unit test bounds 2000 frames under 1 ms average as a regression guard. The sound itself is made on the audio thread.
- **Small screens:** `docs/journal/assets/053-phone-390x844-notice.jpg` (notice, the menu below it), `053-tablet-1024x768-flight-touch.jpg` (touch controls on at 1024x768: throttle slider mid-left, Stage, roll and pad at the right edge, nothing of the HUD covered; tapping the slider set 82 %, tapping Stage fired stage 1 and the guide moved on), `053-tablet-1024x768-vab.jpg`. The viewport was reset to desktop afterwards.
- **Playwright** (Chromium only, `E2E_HEADERS=1`, port 5215, `workers: 1`): 9 passed (the 7 existing smoke tests and the 2 new touch tests), 1 skipped (`@orbit`, needs `E2E_ORBIT=1`).

## Repo checks (end of the plan)

`bun run test`: 933 pass, 0 fail (106 files); `apps/web` vitest: 564 pass; `bun run typecheck`: all packages exit 0, svelte-check 1456 files 0 errors 0 warnings; `bun run build`: done; `bun run docs:check`: OK (54 plans, 62 ADRs); `prettier --check` on `apps/web`, the plan, the ADRs, the journal, research and product docs: clean. Processes started (a static server on 5214, a Vite dev server on 5214, Playwright's server on 5215) were stopped and checked by process list; my browser tab was closed.

## What surprised me

- The first-flight guide named keys in its text ("Press Z"), so ADR 0061 first claimed the tutorial already followed the table; it did not. It now has placeholders and a touch wording.
- `Space` is both Stage and, in the VAB, Place; scopes keep them apart. `mute` is the one action that clashes in every scope because the key works on every page.
- A scripted `element.click()` does not unlock audio (untrusted); a real key press does. The e2e test relies on the launch click being a real gesture.
- Brown noise is dark: filters that look right on paper (a band-pass at 400 Hz) pass almost nothing of it. Measure the master level, do not trust the gain numbers.
- `movementX` is not reliable for touch pointers, so the flight camera now works from client coordinates.

## Human listening checklist (an agent cannot hear)

Open the game in a desktop browser, click once (sound starts after the first click or key press), then:

- [ ] In the menu, a button press makes a short soft tick; Settings, Audio, "Play" makes a low thump.
- [ ] On the pad, full throttle with stage 1 fired: a roaring engine, deeper rumble underneath; cutting the throttle fades it within about a third of a second, with no click.
- [ ] Staging (Space) gives a thump with a short crack; the SAS key gives a rising tick on, a falling tick off.
- [ ] Climbing: the roar thins as the air thins and is gone above the atmosphere, leaving only a low, muffled rumble while the engine burns; it must not sound like the pad.
- [ ] Fast in thick air (a few hundred m/s at low altitude): a rushing wind that rises with speed and is silent in space and when slow.
- [ ] Time warp above 1x silences the engine and the wind; back to 1x brings them back; the pause menu silences everything.
- [ ] Heat above 80 % of a part's limit repeats two short beeps; a flameout or a damaged part gives the same beeps once.
- [ ] `N` (or Mute in Settings) silences everything and a line says "Sound muted"; pressing it again restores; the volumes (master, effects, interface) each do what they say.
- [ ] Switch to another tab and back: the sound stops while hidden and resumes.
- [ ] Nothing hisses, pops or clicks when the throttle moves quickly; the loop of the noise has no audible seam; the master never distorts at full volume.
- [ ] Rebinding: change Stage to another key, fly, reload, check it stuck; Reset all.
- [ ] On a real tablet (nobody tested one): the controls feel right, the pad does not drift, two thumbs work together.

## Decisions made

ADR 0061 (binding table, settings format 2), ADR 0062 (code-only audio), ADR 0063 (tablets yes, phones no).

## Open questions / follow-ups

- Draft plan 055: phone layout and real-device passes (iPad Safari, Android, GPU frame times, mobile audio interruptions).
- The Orbit strip at the bottom left is partly under the instrument deck at 1024x768 (seen in the screenshots; the deck centre is wider than the space between the two side panels there). It predates this plan; the data in the cut-off part is the Apoapsis/Periapsis values. Not changed here.
- No music (ADR 0062): a generated score is a separate plan if the human wants one.
- The `Backspace` second Delete in the VAB and the node removal are fixed keys, listed in the dialog under "Fixed".
