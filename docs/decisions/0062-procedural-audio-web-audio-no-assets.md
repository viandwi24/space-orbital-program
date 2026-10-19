# 0062 — Audio is synthesised in code with Web Audio nodes; no audio files

**Status:** accepted; amended by [ADR 0210](0210-audio-additions-and-music.md) (proposed: the cue table and the music bus, plan 227)
**Date:** 2026-10-17
**Plan:** plans/053-remappable-keys-audio-and-small-screens.md
**Amends:** ADR 0060 (point 4: "1.0 has no sound").

## Context

The game has no sound. A recorded set needs a licence decision per file, adds download weight and ties the sound to what someone else recorded. A rocket's sound is broadband noise shaped by a filter plus low tones, which Web Audio builds from its own nodes. Facts: `research/web-audio-and-touch.md`.

## Decision

1. **No audio assets, no AudioWorklet.** Every sound is made from `OscillatorNode`, a looped noise `AudioBufferSourceNode` (the buffer is generated once from a seeded generator: 2 s of brown-ish noise, about 350 KB in memory, no download), `BiquadFilterNode`, `GainNode` and a `DynamicsCompressorNode` on the master. All of it runs on the browser's audio thread; the main thread only sets parameters. A worklet would add a script file, a CSP entry and no capability we need. There is no music in 1.x (a generated score is a different project): the settings have master, effects and interface volumes.
2. **Layers** (`lib/audio/`): `params.ts` is pure: flight state to targets (engine roar gain and cutoff from throttle and ambient pressure, a muffled in-cockpit rumble that stays in vacuum, wind gain and cutoff from speed and air density, a warning flag). `engine.ts` owns the graph and applies targets with `setTargetAtTime` at 20 Hz. One-shots (stage thunk, SAS and UI clicks, warning tones) are separate short graphs that disconnect themselves at the end. `director.ts` turns what the flight loop already has (the HUD model at 10 Hz, stage and sim events) into those calls.
3. **Physics of the mix.** Engine volume follows thrust, and the air carries it: roar gain is `throttle * (0.25 + 0.75 * pressureRatio)` with a cutoff rising with throttle and pressure; in vacuum only the structure-borne rumble (a 38 Hz to 70 Hz tone plus very low-passed noise; the gain is at most 0.12 of the roar's, and measured at the master output in vacuum it is 0.35 of the sea-level RMS, journal 053) remains. Wind is silent below 30 m/s and follows `density * (speed - 30)` (a dynamic-pressure proxy) through a low-pass that opens with it. Time warp above 1x ducks the engine and wind (they would be nonsense at 100000x).
4. **Autoplay.** No `AudioContext` exists until the first `pointerup` or `keydown` on the page; that handler creates it and calls `resume()`. Until then the engine state is `locked` and every call is a no-op. `visibilitychange` to hidden calls `suspend()`, back to visible `resume()`. The state is mirrored on `document.documentElement.dataset.audio` (`locked`, `running`, `suspended`, `muted`) so the end-to-end suite can assert it without a test hook.
5. **Settings and mute.** Master, effects and interface volumes (0 to 1, stored in `orbital.settings`) and a `muted` flag; the `mute` action (default `N`, remappable) toggles it from any page and says so with a toast or the settings row. Muting ramps the master to 0 and does not tear the graph down.
6. **Cost.** The per-frame work on the main thread is one function (`director.frame`) that returns early except every 50 ms; the target is under 1 ms per frame measured in the page (journal).
7. **What cannot be verified by an agent is the sound itself.** The plan's criteria assert parameter mapping, graph state and analyser levels; the human's listening checklist is in the journal.

## Alternatives considered

- **Recorded samples (CC0/CC-BY packs):** per-file licence work, size, and no mapping to pressure and throttle without crossfades. Rejected; revisit if the human prefers a recorded set (it would sit behind the same director).
- **AudioWorklet synthesis:** more control over the noise shape, costs a script module and CSP work. Rejected; built-in nodes are enough.
- **Starting audio on page load with a "click to enable sound" banner:** the first menu click already unlocks it, a banner is one more thing to dismiss.

## Consequences

- `docs/product` has no sound requirement to change; the roadmap page drops the audio line once this ships.
- Browsers with `AudioContext` blocked or missing: the engine stays `locked` forever and the game runs silently (no error).
