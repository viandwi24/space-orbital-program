# 0063 — Small screens: tablets in landscape yes, phones no

**Status:** accepted
**Date:** 2026-10-17
**Plan:** plans/053-remappable-keys-audio-and-small-screens.md
**Amends:** ADR 0040 (point 2: "phones and tablets are not supported"); `product/browser-support.md`.

## Context

ADR 0040 said no phones or tablets because there was no touch input and no device. The flight screen (HUD, navball, stage stack, resources, maneuver strip, script panel) and the VAB (catalogue, stage editor, stats) were laid out and checked down to 1024x768 (plan 029); a phone in landscape is about 390 to 430 px tall and in portrait 390 px wide. The HUD is a dense instrument cluster; packing it into 390 px would be a second interface, not a layout. No tablet or phone is available to this session: only Playwright's device emulation (touch events and viewport on the desktop engine) and the built-in browser's viewport resize.

## Decision

1. **Supported:** tablets in landscape at 1024x768 or larger CSS pixels (an iPad-class screen; Chrome, Safari and Firefox on them as far as the desktop matrix covers the same engines). **Not supported:** phones, and tablets in portrait. Stated, tested in emulation only, and the support page says "not tested on a real device".
2. **Touch input exists** (`lib/touch/`): on a coarse primary pointer (`(pointer: coarse)`), or when the player sets Touch controls to On, the flight screen shows a throttle slider with Full and Cut buttons, a steering pad (pitch and yaw, analog with a dead zone), roll buttons and a Stage button (SAS and Map stay the HUD buttons, at 44 px); one finger drags the camera and two fingers pinch to zoom; the VAB gets pinch zoom (one-finger orbit and tap-to-select already worked through pointer events). Off hides them for a laptop with a touchscreen and a keyboard. The mapping from touch to commands is pure (`touch-model.ts`) and unit-tested.
3. **Phones get a notice, not a block.** Below 900 CSS px of viewport width (or 500 of height) a dismissible notice on every page except the roadmap and credits says the game is made for tablets and larger screens, names the minimum, and offers "Continue anyway" (remembered for the session). The capability gate of ADR 0040 is unchanged.
4. **Layout:** no new breakpoints below 1024 wide. Between 1024x768 and 1280x720 the existing layout stands (checked at 1024x768 with touch controls on, journal 053: the throttle sits mid-left, Stage, roll and the pad in a 112 px column at the right edge beside the instrument deck; nothing of the HUD is covered).
5. **Touch target size:** controls in the touch overlay are at least 48 px (Stage 60); the rest of the HUD buttons keep their size (32 px minimum, as the plan 021 design system); under `(pointer: coarse)` the shared button and icon-button minimum height becomes 44 px.

## Alternatives considered

- **Full phone support:** a separate compact HUD, portrait VAB; large, and unverifiable without devices and a GPU budget for phones (the planet pass is the cost, the governor has never run on a phone). Roadmap, not 1.x.
- **Tablets without touch controls:** a tablet has no Shift, Ctrl or Space; the keyboard-only game would be unplayable on the one class we claim.
- **Block phones with the notice:** a capable phone might manage the menu or script panel; blocking is not our call, a warning is.

## Consequences

- `browser-support.md` gains a tablet row stated as emulation-tested; ADR 0040's second point is superseded for tablets.
- A `touch` setting is part of settings format 2 (ADR 0061).
- Draft plan: phone layout and real-device passes (a new draft with a board row).
