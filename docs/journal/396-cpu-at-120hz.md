# 396 — CPU at 120 Hz

**Plan:** [plans/396-cpu-at-120hz.md](../plans/396-cpu-at-120hz.md) · **Session:** Worker C, 2026-10-24 · **ADR:** [0330](../decisions/0330-graphics-v2-120hz-built-in-looks-mod-data.md) point 1

## What was done

| Where | What |
|---|---|
| `web/lib/hud/hud-rate.ts`, `flight-loop.ts` | `HUD_FRAME_HZ = 60`: the navball, map markers, target marks, heat bars and node layer repaint through a `FramePacer` at that rate (every other frame at 120 Hz, every frame at 60 Hz and below); the 3D render still draws every frame. The 10 Hz telemetry (`HUD_PERIOD_MS`) was already separate |
| flight page | the network, body-label and ghost comparisons serialise each frame once (a cached key) instead of twice |
| `renderer/site-meshes.ts`, `renderer-webgpu.ts` | `LaunchSite.bundleStatic`: the merged tower, mast, tank and building meshes sit in a three `BundleGroup` (recorded once as a WebGPU render bundle); re-recorded only when the structures appear or vanish with the camera's distance (`setDetail`). Lights, swing arms, steam, people and the list buildings stay outside. WebGL and the WebGL2 fallback draw it as a normal group |
| `web/lib/debug/long-frames.ts`, `DebugPanel.svelte` | Debug → Info lists the last 8 Long Animation Frames (over 50 ms) with the three longest scripts each; empty where the browser lacks the entry type |

## Not done / to measure

- **No allocation profile was taken**: that needs Chrome's allocation timeline on the M5 (manual). The changes here are the ones the code showed: half the HUD repaints at 120 Hz and half the serialisation. The HUD's per-paint objects (`hudCtl.frame()`, the marker lists) are still allocated per paint; pooling them is the next step if the M5 run shows GC in the long frames.
- **The M5 run** (main-thread ms at the pad and in flight, share of long frames, against plan 392's baseline) is the plan's manual criterion and is still to do. So is checking by eye that the bundled site draws and shadows as before (`capture-graphics.ts`): the bundle was unit-tested for what it holds and when it is re-recorded, not rendered here.
- The unit test for "no new arrays per call" is not written: the pacer allocates nothing, but the paint path does.
