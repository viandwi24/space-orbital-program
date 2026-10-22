# 0304 — Automatic quality steps presets on WebGPU, starts where it settled, and draws at the display's rate

**Status:** accepted
**Date:** 2026-10-22
**Plan:** plans/362-auto-quality-fix.md
**Amends:** ADR 0248 point 3 and plan 261's resolution-only governor on WebGPU; ADR 0233's pacing to 60 (now a player setting)

## Context

The owner's report, MacBook Pro M5 14", on battery, Kronos V + Selene in a 100 km orbit:

- Quality fixed at Medium, "Adjust quality while playing" off: 100 fps.
- Quality Automatic, adjust on: the frame rate falls to 25 fps, even after the governor lowers the resolution to 55 %.

What the code did:

1. **Resolution only on WebGPU.** `Renderer.governorPresetSteps` was false on WebGPU (plan 261, ADR 0248: on the M2 at the pad the frame followed its pixels, and a preset change rebuilt shaders for seconds). Automatic on an M5 resolves to `high`, so the governor could only shrink `high`. What `high` costs beyond pixels stays at any scale: the 4096 (2048 at Retina) shadow map over a 30-part vessel, part detail (32 segments, extras), the march steps, MSAA. At the floor the governor then locks the target to 30 fps, which the owner read as 25.
2. **The work-time evidence under-reads on Apple GPUs.** On the M2 in the owner's scene `high` at full size drew at 33 ms while the timestamps said 9 ms. After a drop the governor saw "measured headroom" and raised the level back into the stall after 30 s, a trial that fails again in every new scene.
3. **Automatic picked by the GPU's name** (`selectPreset`), not by what the machine holds.
4. **The governor paced the drawing to 60** on a 120 Hz display while a fixed preset drew at the display's rate, so even a perfect Automatic read 60 where Medium read 100.
5. Each Flight visit took the shared renderer's current preset as the ceiling: a level an earlier governor dropped to stayed the ceiling for the session.

The precompile of plan 340 already compiled the other presets' part materials, but `compileAsync` into other targets does not carry over on three r186's WebGPU renderer, and the planet pass built a variant only for the player's preset.

## Decision

1. **The governor steps presets on WebGPU too.** At world load, behind the loading screen, the preset the governor would move to first (`RendererConfig.warmPresets`: the one below the start, or above it at the bottom; none while it may not adjust) is drawn once at full and at half planet scale with that preset's part models in view (`withParts`). A switch to it then finds its planet variant, its post chain and the parts' pipelines for its targets built: on the M2, medium to low went from 1517 ms to 83 ms. Each warmed preset costs 3 to 4.5 s of load there, so only that one is warmed; a further move builds once (about 1.5 s on the M2), inside the governor's settle time. `info().presetWarmMs` records what the warm-up took.
2. **The ladder keeps a resolution floor per preset** (`PRESET_FLOOR_SCALE` = 0.85): above the last preset the rungs are full size, 0.85 and the half planet pass; the next preset comes before 0.7. Only `low` goes to 0.7 and 0.55, and only after `low` is the target locked to 30.
3. **The work time is calibrated by the frames that caused a drop**: the drawn interval over the measured work, at least 1, multiplies the work time in the step-up test. When the calibrated work time gives no room, the one trial per scene change still applies. The WebGPU meter now divides the timestamp pool by the frames it holds, not by the frames drawn while it resolved.
4. **A steady judder drops a rung too**: 10 % of frames over budget across 5 s (one missed vsync in ten, 54 fps on a 60 Hz screen), where the 1 s rule needs half. If that drop was a resolution step and the share did not fall by a quarter, the next preset follows at once (resolution does not touch a preset's other costs); if a preset step did not help either, the stutter is not the graphics' (another process, the browser) and the governor holds until the scene changes. Without that guard a background load sank the M2 to `low` at 55 % and a 30 fps lock in one run.
5. **Automatic is measured, not guessed.** With adjust on, its ceiling is `high` and it starts at the level the governor last settled at on this backend (`orbital.graphics.learned`, saved at every governor move while the preset is Automatic), else at the device default. With adjust off, Automatic is the learned preset, else the device default. A player's preset is unchanged: the ceiling, started at full size. Every Flight visit starts the governor from this plan, not from the renderer's current preset.
6. **A frame-rate limit setting** (Settings → Graphics: Display, 60, 30; default Display) paces the drawing with the governor on or off. The governor's quality target stays 60 (30 under a 30 limit, or when locked); at Display rate on a 120 Hz screen frames that take 8 to 16 ms are drawn as they come, as a fixed preset always was.

## Alternatives

- **Render a sub-rectangle of a reserved full-size target** instead of resizing at each rung. Measured not needed: on the M2 the longest frame in the second after a scale change was no longer than the steady frames (18 ms at medium, 33 ms at high), since three r186 keys pipelines by the target object, not its size. The ladder's scales are already four fixed values.
- **A benchmark at load to choose the start.** It measures without the frame's end (the timestamps' blind spot) and costs load time; the learned level is the measurement that already happened under real play.
- **Keep pacing to 60 by default.** It keeps the battery cooler but makes Automatic read slower than a fixed preset on 120 Hz screens, which is the owner's complaint; 60 and 30 stay one click away.

## Consequences

- With adjust on, load takes 3 to 4.5 s longer on the M2 for the one warmed preset (`presetWarmMs` in Debug and the measure script); with it off, nothing changes.
- An Automatic player on a machine that cannot hold `high` reaches `medium` within a few seconds and starts there next time.
- `scripts/measure-auto-quality.ts` measures the owner's scene under several configurations; plan 362's journal has the numbers.
