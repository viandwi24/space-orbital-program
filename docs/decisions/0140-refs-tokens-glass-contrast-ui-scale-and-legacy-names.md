# 0140 — Refs tokens: glass that keeps text readable, UI scale through rem, legacy names as aliases

**Status:** accepted
**Date:** 2026-10-17
**Plan:** [086](../plans/086-ui-stage-1-tokens-fonts-accessibility.md)
**Builds on:** ADR 0107 (refs visual language, its point 5 deviations), ADR 0026 (design system architecture), ADR 0053 (quality governor), ADR 0109 (10 px text floor)

## Context

Plan 086 copies the refs tokens (`refs/space-orbital-program-ui/tokens/tokens.css`) into `apps/web/src/lib/ui/tokens.css`. Four choices were left open by ADR 0107 and the plan:

1. **Contrast on glass.** The refs glass is `rgba(22,23,26,0.60)` with `blur(28px) saturate(160%)`. Over a white backdrop (sunlit cloud, snow; the worst case the token test has used since plan 021) that composites to grey 115: only pure white text reaches 4.5:1 (4.75), and the refs' muted grey `#A1A1AA` reaches 1.9:1. Raising the glass alpha until muted text passes needs 0.85, which removes the glass look.
2. **How the UI scale works.** Sizes in the old tokens are mixed `px` (space, radii) and `rem` (type).
3. **Names.** About 1 400 `var(--…)` uses across `apps/web` read the ADR 0026 names (`--panel`, `--text-dim`, `--c-accent`, `--s-2`, …). Stages 2 to 5 restyle screens one at a time.
4. **Monospace font**: JetBrains Mono (refs) or IBM Plex Mono (already shipped) for version numbers and code.

## Decision

1. **The glass darkens what is behind it.** `--glass-filter` is `blur(28px) saturate(160%) brightness(0.4)`: the refs' blur and saturation plus a backdrop dimming. Over black space the surface looks as in the refs; over a white cloud the panel composites to grey 54, where the body, secondary and muted text pass 4.5:1 and the subtle grey and the offline red (icons, status marks and large text only) pass 3:1. The token test models exactly this. The accent `#3E6AE1` is a **fill** colour (white text on it passes 4.8:1); text and focus rings that must read in accent colour use `--accent-text` (`#8FA9F0`, the accent lightened, 5.2:1 on the dimmed glass). `--surface-solid` replaces the glass when blur is off (point 4 of ADR 0107's fallback, and high contrast).
2. **UI scale is the root font size.** Every size token is in `rem` (16 px = 1 rem at 100 %), and the setting sets `html { font-size: <scale × 100>% }` through the `--ui-scale` custom property. Literal `px` in components does not scale; stages 2 to 5 remove those literals as they restyle each screen. The 3D canvas is not touched (no CSS `zoom`, whose effect on the renderer's size reads differs across engines). The 10 px floor holds at 100 %: no text token is below `0.625rem`.
3. **New semantic names, the old names stay as aliases.** The refs names lose their `--sop-` prefix (`--surface-glass`, `--text-muted`, `--accent`, `--radius-panel`, `--capsule`, …). The ADR 0026 names stay, in their own block of `tokens.css`, defined as `var()` of the new tokens, so every screen takes the new palette and font at once and stages 2 to 5 move each screen to the new names. A stage that leaves no use of an old name deletes it.
4. **IBM Plex Mono stays** as `--font-mono` (code in the script editor, version numbers): it is already shipped, and JetBrains Mono would add a second monospace download for one string. `--font-num`, the old numbers font, becomes an alias of `--font-mono` until stage 2 moves HUD numbers to Manrope with tabular figures (refs: "numbers first in Manrope").
5. **High contrast** (`html[data-contrast='more']`) and the **solid fallback** (`html[data-glass='solid']`) are attribute switches on the root that only override tokens: high contrast makes surfaces solid, lifts the muted and subtle greys and the borders; the solid fallback swaps the glass for `--surface-solid` and sets `--glass-filter: none`. The flight view sets `data-glass='solid'` whenever the active preset is `low`, which includes the governor's lowest rungs.

## Alternatives considered

- **Glass alpha 0.85 or higher** — rejected: the refs look is gone over every scene to fix the bright case.
- **Test contrast only over a dark scene** — rejected: the HUD sits over white clouds in daylight; the test would pass while text is unreadable.
- **CSS `zoom` for the UI scale** — rejected for now: it would scale `px` literals too, but its interaction with the canvas size and `getBoundingClientRect` differed between engines until recently, and the canvas must not be scaled.
- **Rename every use at once** — rejected: it would touch every screen in stage 1, which ADR 0107 point 3 forbids.

## Consequences

- `product/visual-direction.md` notes the glass filter's `brightness(0.4)` and the `--accent-text` colour as our deviations from the refs.
- Over bright scenes the glass panels read darker than in the refs mock-ups; over dark ones there is no visible change.
- Stages 2 to 5 must use only the new names, and delete aliases as their last users go.
- `backdrop-filter` with `brightness()` is supported in every engine we target (Chromium, Firefox 103+, Safari 18 unprefixed, `-webkit-` before).
