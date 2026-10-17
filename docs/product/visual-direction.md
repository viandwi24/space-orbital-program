# Visual direction

> Target for every plan that touches what the player sees (plans 019–023). Written 2026-10-16 at the human's request after comparing the MVP with Kerbal Space Program 2 screenshots: "I don't need it identical, but at least close. Assets can come later, but environment, HUD, etc. must match that level. Don't think 'the program runs'; think 'it runs and is ready to ship to the public'."

## Bar

The game is judged by strangers on first sight. A screen that looks like a debug view (flat green plane, black sky, grey cylinders, a text table) is a release blocker, regardless of how correct the simulation is. Every visual plan is reviewed against this question: **would a player who knows KSP/KSP2 take this screenshot seriously?**

- **Close in feel to KSP2, not a copy.** Same genre conventions (navball, stage stack, gauges, dark translucent panels, map view with orbit lines) because players expect them. Our own identity: own colours, typography, iconography, names. Never copy KSP/KSP2 art, logos, characters (Kerbals), fonts, or exact layouts; never use their trademarks.
- **Code first, assets later.** Everything in plans 019–023 is procedural (geometry, shaders, canvas-generated textures, CSS/SVG UI). Assets (models, textures, audio) are a later phase; the code must make swapping them in easy (mesh/material providers behind an interface).
- **Readable at a glance.** Numbers the player needs (altitude, speed, Ap/Pe, throttle, stage Δv) are big, labelled, unit-formatted, and stable (no jitter, tabular numerals).

## Flight environment (what the KSP2 references show)

- Sky with an atmosphere: blue gradient by day, warm horizon at low sun, fading to black with altitude; sun disc with glare/bloom; stars visible in space and at night.
- Planet that reads as a planet: varied ground colour (grass, dirt, rock, sand, water/ocean), detail that holds up near the pad, curvature and an atmospheric rim seen from orbit, day/night terminator.
- A launch site: pad, tower/gantry, flat apron, a few buildings and props so scale is obvious at liftoff.
- Lighting: one sun with shadows near the vessel, physically based materials, tone mapping, bloom on bright things (sun, plume).
- Clouds (at least a layer) and haze/aerial perspective so distance reads.

## Vessels

- Parts look like what they are: capsule with a cone and window, tanks with bands/rivets/seams, engine with a bell and turbopump detail, decoupler ring, legs with struts and feet, heat shield.
- PBR materials (painted metal, bare metal, foil, ablator), subtle wear via procedural noise.
- Effects: engine plume that responds to throttle and ambient pressure (tight at sea level, wide in vacuum), liftoff smoke/dust, staging separation, re-entry glow from part temperature, explosions/debris on destruction.

## HUD and UI

> **Adopted UI language (ADR 0107, 2026-10-17):** every screen moves, stage by stage, to the visual language of the UI concept in `refs/space-orbital-program-ui/` ("Tesla for rockets"): calm and dark, floating glass panels (`rgba(22,23,26,0.60)` with blur, 1 px `rgba(255,255,255,0.08)` border, radius 16, 999 for capsules), **one blue accent `#3E6AE1` only for what is active or controlled**, white "selected" for tabs and primary buttons, status colours ok `#7BD88F`, warn `#FFB86B`, danger `#FF8A8E`, offline `#FF5A5F` (never alone: always with text or an icon), Manrope with tabular figures (numbers first, small capital labels with wide tracking), flat active state (white icon plus a 4 px dot), stroke icons on a 24 grid, honest placeholders `[—]`. Layout: world capsule and time control top left, toolbar top right, dock rail left, vessel panel right, navball module bottom centre, staging bottom left, crew bottom right; Map uses the same HUD; the Mission Center is one screen. Our deviations from the concept: no text under 10 CSS px at the default UI scale, a UI scale setting and a high-contrast option, 44 px touch targets on touch screens, a solid fallback for glass on slow GPUs, self-hosted fonts, and no KSP names from the concept's sample data. The Space Center is 3D (ADR 0097) with the concept's overlay. Values that differ from the refs (ADR 0140, plan 086): the glass filter adds `brightness(0.4)` to the backdrop so text stays readable over a white cloud, and accent-coloured text and focus rings use `#8FA9F0` (the accent `#3E6AE1` is a fill only). The flight HUD follows the refs `Main` layout since plan 088 (ADR 0144), with these differences: a column beside the SAS pod for maneuver, target and anti-target; 9 warp segments up to 100 000x with slower and faster buttons; Script and Controls in the toolbar; resources, orbit and target cards in the right column until the vessel panel and the dock exist; the target pair on the navball in the danger colour; disabled placeholders (RCS, Camera, Dock, Vessel, Crew) instead of invented data. The bullets below are the pre-0107 bar; where they name colours or fonts, ADR 0107 wins.


- Dark, translucent panels with thin borders, a restrained accent palette (one primary accent, one positive, one warning, one danger), a technical monospace for numbers and a clean sans for labels.
- Flight HUD layout (genre convention): navball with heading/pitch and pro/retro/radial/normal markers bottom-centre or bottom-left, altitude/speed/vertical speed gauges beside it, throttle gauge, time/warp control, stage stack with per-stage Δv and fuel on the right, resources panel, situation/vessel name top, toasts for events (staging, flameout, part destroyed, overheating).
- Speed modes: surface/orbit (auto by altitude, toggleable) — a vessel on the pad shows ~0 m/s surface speed.
- VAB: 3D hangar, part catalogue with rendered icons grouped by category, attach by clicking nodes in 3D, stage editor, Δv/TWR per stage, warnings (no control source, no stages, TWR < 1).
- Menus: main menu, pause menu, settings (graphics quality, units, keybindings list), loading screen. No raw "Untitled vessel"/"0 / 0 fired" states; empty states explain what to do.
- Accessibility: keyboard navigable, visible focus, contrast AA for text, `prefers-reduced-motion` respected.

## Performance and quality budget

- 60 fps target at 1920×1080 on an Apple M1/M2-class laptop with integrated GPU in Chromium; ≥ 30 fps on the "low" preset on weaker hardware.
- Graphics presets (low/medium/high) switch shadows, post-processing, cloud and terrain detail; default chosen by a quick capability check.
- Bundle: keep the initial page load reasonable (state budgets per plan and measure them).

## How plans prove it

Visual criteria are verified, not asserted: fixed camera presets captured as screenshots in `docs/journal/assets/NNN-*.png`, measured frame times, pure-function unit tests for the maths (sun position, colour ramps, gauge scales, plume shape), and an explicit side-by-side self-review against this document recorded in the journal ("what still looks like a debug view").
