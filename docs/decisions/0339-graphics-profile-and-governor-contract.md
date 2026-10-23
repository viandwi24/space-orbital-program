# 0339 — The graphics profile: presets, per-look levels, a pinned scale, and what the governor may change

**Status:** accepted
**Date:** 2026-10-24
**Plan:** plans/404-graphics-settings-v2.md
**Builds on:** ADR 0330 (graphics v2: each look has a level and a switch), ADR 0233 (the governor), ADR 0310 (no shader builds at governor steps), ADR 0338 (the governor for 120 Hz)

## Decision

1. **A profile.** The player's graphics choices are one value, `GraphicsProfile`: a preset (`auto`, `low`, `medium`, `high`, `ultra`), a choice per look (`auto`, `low`, `medium`, `high`) and an optional pinned resolution scale (0.5 to 1). It is saved as versioned, validated JSON (`orbital.graphics.profile`); the old preset key is still written beside it, and a player with only that key gets the same preset with every look on Automatic. An invalid field falls back to its default.
2. **The looks.** Re-entry and aero (`plasma`), engine plumes (`plume`) and the sea (`ocean`) have a level each; a preset sets them (`PresetSettings`), a pin overrides the preset (`setLookChoices`, `lookLevel` in the renderer). Looks whose plans land later join `LOOKS`.
3. **Ultra** is the High preset with every look pinned at High and the full resolution; it is a profile, not a fourth renderer preset, so the governor's ladder and the warm lists are unchanged. **Custom** is what the dialog shows once a look or the scale was set by hand; picking a named preset clears those.
4. **The governor contract.** The governor changes the preset and the resolution scale. It never changes a pinned look (a pin reads the same at every preset) and never changes a pinned scale (`applyLevel` uses the pin). Ultra pins everything, so the governor has nothing to lower; a player who wants the adjustment leaves a look or the scale on Automatic.
5. **Device tier.** The first-start preset and lock still come from `device-tier.ts` (plan 392, 395); this plan adds no table.

## Consequences

- A look's pin that moves a shader variant (the sea's detail) rebuilds that variant in the background on the next `setPreset`, as a preset change does; the planet pass tracks the sea's built level itself.
- A hint in the dialog for a look the governor is holding down is not part of this: nothing the governor does can lower a look the player pinned, so the hint would only apply to Automatic ones.
