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
