# 0319 — The Flight navball module is compact by default

**Status:** accepted
**Date:** 2026-10-23
**Plan:** plans/383-compact-navball.md
**Builds on:** ADR 0253 point 6 (the v3 navball module, 552 × 232 at ball 180)

## Context

The owner found the navball module too large: wide gaps, and big SAS and mode buttons.

## Decision

1. **Compact by default.** The ball is 144 px on tall screens and 128 px on short ones (normal: 180 and 144). The module is drawn in design units of the ball size, so the bezel, the arcs, the gaps, the SAS and RCS pills and the mode buttons all shrink with it, by about 20 %.
2. **Touch and pointer targets stay usable.** Each SAS mode button has an invisible hit area of at least 24 px around it.
3. **Text stays at its size.** The readouts' labels and chips are in rem and do not shrink with the module. The readouts wing is widened up to the vertical-speed arc so they keep fitting.
4. **A switch.** Settings → Interface → Compact navball (`interface.navball`: absent or `compact`, or `normal`) brings back the full size. The UI scale setting applies on top of either.
