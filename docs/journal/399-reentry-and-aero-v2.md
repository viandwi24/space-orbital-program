# 399 — Re-entry and aero v2

**Plan:** [plans/399-reentry-and-aero-v2.md](../plans/399-reentry-and-aero-v2.md) · **Session:** Worker C, 2026-10-24 · **ADR:** [0330](../decisions/0330-graphics-v2-120hz-built-in-looks-mod-data.md) point 3

## What was done

| Where | What |
|---|---|
| `renderer/effects/plasma-palette.ts` | `PlasmaPalette` (glow, hot glow, three trail colours, streak, wrap, shock, each `rgb × 2^intensity`, plus a four-stop gradient and the multipliers); stock palettes for air (Home), CO₂ (Vesper, Ochre), nitrogen and hydrogen (Tempest); `paletteFor(bodyId, atmosphere)` by id, else by the gas constant; `heatingOf(flux)` (square-rooted, so an ordinary orbital return stays red-orange to pink); `plasmaColour(layer, heating, speed, palette, quality, along)` with the skin lagging, the shock leading and the trail cooling along its length; `condensationOpacity(mach, density)` |
| `effects/shaders.ts`, `tsl/twins.ts` | the shell takes three colours (skin inside, shock at the leading rim, trail toward the tail); High adds streaks along the flow and a bow-shock layer on the stand-off surface (not a copy of the geometry); condensation is the same shell, white and cold, fading in as the plasma fades out. GLSL and TSL twin carry the same maths; the wake takes the trail colour |
| `effects/plasma-mesh.ts`, `system.ts` | `PlasmaFrame` carries the layer colours, the condensation and the detail level; the system reads the body's palette and the air (`ambientAt`: density, speed of sound) |
| `presets.ts` | `plasma: 'low' | 'medium' | 'high'` (Low a two-stop gradient and no condensation; Medium the full gradient and condensation; High adds streaks and the bow shock); plan 404 puts the switch and level in Settings |

## Decisions and notes

- **One pipeline for every level.** The level is a uniform (`uDetail`), not a shader variant, so there is nothing extra to warm at load; the shell's single pipeline is already in the warm list. The plan's "variants for every level are in the warm list" holds trivially.
- **Condensation is the shell's cold end**, not a new draw: one material, a blend uniform; off at Low it costs nothing.
- **TAAU (plan 393) is not in yet**, so the shell's behaviour under the temporal resolve is not checked; plan 393 should record whether the additive shell smears and mark it reactive or draw it after the resolve.
- Palettes are renderer data here; plan 405 adds the mod data field that fills the same type.

## Seen in the browser (WebGPU, Chrome, `high`)

A two-stage starter put in the air with `__orbitalDebug.setLocation`: [low heating](assets/399-gradient-low-heating.jpg) (red and pink at the rim, violet trail, streaks), [mid heating](assets/399-gradient-mid.jpg) (the shell around the vessel) and [peak](assets/399-gradient-peak.jpg) (blue-white shell, violet wake). At Mach 1.1 to 1.2 at 1.5 km the shell's condensation uniform read 1 and the shell was visible (checked in the scene, not by eye: the white shell is faint against bright ground).

## Not done

- No "before" captures were taken before the change, no frame-time comparison against plan 392's baseline, and no run on Low and Medium against throttled or integrated GPUs (manual criteria).
- The owner's look at Home, another air body and a Mach 1 pass against reference images 01 and 02 ([manual]).
- A CO₂ body entry was not captured; the palette is covered by unit tests only.
