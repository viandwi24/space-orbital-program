# 0107 — The interface adopts the refs visual language in full, screen by screen

**Status:** accepted
**Date:** 2026-10-17
**Plan:** none (owner decisions "ui-style-adopt", "sc-presentation", 2026-10-17); delivered by plans 086, 087, 088, 089, 091, 093, 108, 111, 112, 113
**Amends:** ADR 0026 (its visual language: tokens, palette, fonts, panel look; its architecture stands), `product/visual-direction.md` ("HUD and UI").
**Research:** `refs/space-orbital-program-ui/` (README, `docs/CONCEPT.md`, `docs/SCREENS.md`, `docs/STYLE.md`, `tokens/tokens.css`, `tokens/tokens.json`), `refs/reverse-engineering-ksp2/13-ui-ux-patterns.md`.

## Context

The flight HUD, VAB, menus and settings follow ADR 0026: dark translucent panels, a cyan accent plus mint, amber and red, Barlow Semi Condensed and IBM Plex Mono. The refs concept ("Tesla for rockets") defines every screen of the new foundation (Worlds, Space Center, Hangar, Launch, Astronaut Complex, R&D, Administration, Flight, Map, Mission Center): calm and dark, floating glass panels, **one blue accent `#3E6AE1` only for what is active or controlled**, numbers first in Manrope with tabular figures, compact and flat (active = white icon plus a 4 px dot, not a filled background), status always visible, honest placeholders `[—]`. The owner chose full adoption in stages, starting with the new screens, so that one visual language covers everything.

## Decision

1. **The refs tokens become the design tokens**: background, glass surfaces (`rgba(22,23,26,0.60)` with blur), borders, text greys, the single accent, `selected` white, status colours (ok, warn, danger, offline), maneuver axis colours, radii (999 pill, 16 panel), spacing (24 px HUD margin, 12 px panel gap, 44 px capsule), components (capsule, panel, segmented, switch with mixed state, chip, stat cell, list row, signal bars, primary and secondary buttons, back button, world capsule) and stroke icons on a 24 grid. They replace ADR 0026's palette and fonts in `apps/web/src/lib/ui/tokens.css`; the token test is updated.
2. **Fonts**: Manrope (OFL) for everything, self-hosted through `@fontsource` like today (no Google Fonts import: the production CSP and offline play forbid it); JetBrains Mono only for version numbers, or IBM Plex Mono kept there if JetBrains Mono adds weight for one string (decided in plan 086).
3. **Stages**: (1) tokens, fonts and the accessibility floor; (2) the flight HUD (world capsule and time control, toolbar, navball module, staging, crew placeholder); (3) menus, Home, settings, pause, mods, credits and roadmap pages; the Worlds screen is born in the style; (4) the Hangar layout; (5) the Space Center, Mission Center, Launch, Astronaut Complex, R&D and Administration are born in the style. Each stage leaves the game shippable; mixed screens during the transition are accepted, mixed styles within one screen are not.
4. **Kept from ADR 0026**: the 10 Hz `HudModel` cadence, the Canvas2D navball and its pinned frame (restyled monochrome per refs), speed modes, the stage Δv replay, sim events to toasts, pause, the display decisions. The Space Center is **3D** (ADR 0097), not the refs' isometric drawing; the refs' labels, detail panel, "Needs attention" list and building dock are kept as its overlay.
5. **Deviations from the refs, for accessibility and our platforms**: no text below 10 CSS px at the default UI scale (refs labels are 7 to 9 px; they become 10 px with the same tracking); a UI scale setting (80 to 150 %); a high-contrast option; status never by colour alone (as the refs already require); touch targets at least 44 px on touch screens (ADR 0063; the refs' 26 to 36 px buttons are for mouse); `prefers-reduced-motion` respected; the refs' KSP sample names and the KSP body names in its map are never used. Glass blur (`backdrop-filter: blur(28px)`) has a measured cost: the quality governor (ADR 0053) or the `low` preset switches panels to the solid surface colour, and plan 086 measures the blur's cost over the flight view.
6. **Phones**: still unsupported (ADR 0091); the refs screens are designed at 1920x1080 and every stage must keep 1024x768 tablets in landscape working.

## Alternatives considered

- **Refs style only for new screens** — rejected by the owner: two visual languages.
- **Big-bang restyle** — rejected: one plan would touch every screen and stall the foundation.
- **Keep ADR 0026's look** — rejected by the owner.

## Consequences

- **Design tokens are a shared contract**: plan 086 lands first; other UI plans use tokens only, never literals (as ADR 0026 required).
- `product/visual-direction.md` points at this ADR for the HUD and UI language; the bar (ADR 0025) is unchanged.
- **Performance (ADR 0053)**: blur and many layered panels are measured per stage at 1920x1080 and 1024x768 on the M5; the flight view's `high` and `medium` budgets stay as they are.
- `research/stack-versions.md` gets the `@fontsource/manrope` entry when plan 086 installs it.
