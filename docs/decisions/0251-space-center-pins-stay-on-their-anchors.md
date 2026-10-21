# 0251 — Space Center pins stay on their anchors; they are not spread apart

**Status:** accepted
**Date:** 2026-10-21
**Plan:** plans/267-space-center-pins-follow-zoom.md
**Builds on:** ADR 0244 (pins instead of permanent labels), ADR 0117 (the site view)

## Context

The owner zoomed the Space Center camera out and in, and the blue pins stayed where they were instead of following their buildings; they came back only after the camera was turned left or right. The projection was not stale: the loop projects every anchor every frame, after the frame is drawn (`renderer.projectSite`, on both renderers). The pins went through `spreadLabels`, written for the old permanent labels (plan 091): a label whose 132 × 40 px box overlapped a lower one was moved 40 px up, and up again for each further overlap. Zooming out brings the buildings within 132 px of each other, so all but the lowest pin were lifted 40, 80, 120 px over the scene and kept there; turning the camera spread the buildings sideways past 132 px and the pins dropped back. Measured on WebGL after a zoom out: the launch pad's pin on its anchor, the other three at 40, 80 and 120 px above theirs.

## Decision

1. **A pin sits on its anchor's screen point** (`pinPositions` in `apps/web/src/lib/space-center/model.ts`): the projected anchor, whole pixels, kept still while it moves less than a pixel (`steadyLabels`). Nothing moves a pin to make room for another.
2. **Crowded tags are accepted.** With the Names switch on "always" and the camera far away the tags overlap; the switch is the player's choice, and on "hover" only one tag shows. `spreadLabels` stays for the Mission Center's labels, which are still permanent boxes.

## Alternatives considered

- **Keep the dot on the anchor and spread only the tags** (a longer stem): left until the owner asks for it; it needs the overlay to place the tag apart from the pin.
- **Spread with a pin-sized box** (about 16 px): dots that touch would still be pushed off their buildings, which is the bug.

## Consequences

- The pins follow every camera change, zoom included, and a zoom out no longer leaves them hanging over the site.
- A unit test drives an eased zoom out and back in through a projection and checks each pin against its building.
