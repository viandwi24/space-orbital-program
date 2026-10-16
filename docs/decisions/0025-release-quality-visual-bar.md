# 0025 — Release-quality visual bar, procedural first

**Status:** accepted
**Date:** 2026-10-16
**Plan:** plans/019-flight-environment.md (first of 019–023)

## Context

Plans 008 and 009 deliberately shipped placeholder visuals (grey cylinders, a flat-shaded sphere, black sky, a text-table HUD) to prove the pipeline. On 2026-10-16 the human compared the result with Kerbal Space Program 2 and decided that this is not acceptable for a public release: the environment, HUD and UI must come close to that genre standard, even before real art assets exist. The simulation being correct is not enough; the game must look ready to ship.

## Decision

- `docs/product/visual-direction.md` defines the visual and UI bar; every plan that touches what the player sees is reviewed against it and proves it with screenshots, frame-time measurements and a written self-review.
- Close in feel to KSP2 (genre conventions: navball, stage stack, gauges, translucent panels, sky/planet/launch site), never a copy of its art, characters, fonts, logos or exact layouts.
- Procedural first: geometry, shaders, canvas textures, SVG/CSS UI built in code. External assets come in a later phase; code exposes mesh/material providers so assets can replace generators.
- Performance budget: 60 fps at 1080p on an M1/M2-class integrated GPU, graphics presets low/medium/high.
- Work is split into plans 019 (environment), 020 (part models and effects), 021 (design system and HUD), 022 (3D VAB), 023 (release readiness).

## Alternatives considered

- **Import free CC0 assets now** — faster realism, but adds licence review and bundle weight; the human chose code first, assets later.
- **Keep placeholders until a full art pass** — rejected: the first public impression would be the debug look.

## Consequences

- Visual plans carry `[manual]` criteria with screenshots in `docs/journal/assets/`.
- The renderer grows shader and generator modules; pure maths stays unit-tested in Bun.
- A public release still needs a licence decision by the human (STATUS known issue).
