# 404 — Graphics settings v2

**Plan:** [plans/404-graphics-settings-v2.md](../plans/404-graphics-settings-v2.md) · **Session:** Worker C, 2026-10-24 · **ADR:** [0339](../decisions/0339-graphics-profile-and-governor-contract.md)

## What was done

| Where | What |
|---|---|
| `renderer/presets.ts` | `LOOKS` (re-entry and aero, plumes, sea), `LookChoice`, `setLookChoices` (the player's pins), `lookLevel` (the pin, else the preset's); the effects, the scene and the planet pass read levels through it. The planet pass tracks the sea's built level itself, so a pin alone rebuilds that variant |
| `web/lib/graphics-profile.ts` | `GraphicsProfile` (preset incl. Ultra, a choice per look, a pinned scale), versioned and validated, stored as `orbital.graphics.profile` with the old preset key written beside it; migration from the old key; Custom; `governorLimits` |
| `world-renderer`, `flight-loop`, `graphics.ts` | the pins are in place before the scene is built and follow `looks` and `scale` changes from the dialog; `applyLevel` keeps a pinned scale |
| `SettingsDialog.svelte` | the preset row gains Ultra and Custom; a row per look (Preset, Low, Medium, High); a Resolution slider (50 to 100 %) with an Automatic reset; [the dialog](assets/404-settings.jpg) and [with a look pinned](assets/404-settings-custom.jpg) |

## Notes

- Ultra is a profile (High, every look pinned at High, full resolution), not a renderer preset: the governor's ladder and the warm lists stay as they are. With everything pinned it has nothing to lower.
- The device tier, the 120 setting and the battery default were already in (plans 392 and 395); nothing was added twice.

## Not done

- No governor hint in the dialog ("held down by the adjustment"): nothing the governor does can lower a pinned look, so it would only apply to Automatic ones.
- The pinned scale is applied at the governor's first level and on a change, not when the automatic adjustment is switched off at load.
- Looks from plans 397, 398, 402 and 403 are not in `LOOKS` yet (their plans have not landed); terrain detail, scatter and post have no row.
- No frame-time check per preset, no Ultra cost on the M5, and no run on low-end hardware ([manual]); the "every level is in the warm list" test is not written (the levels are uniforms, except the sea's detail, which is a variant of the planet pass that the preset change already builds).
