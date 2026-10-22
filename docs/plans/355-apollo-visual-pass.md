---
id: 355
title: "Apollo visual pass: a Paint setting, Saturn liveries, foil-wrapped F-1s, the SLA, the CSM and the LM"
status: done
owner: "part visuals session (Claude)"
depends: [291, 303, 345]
phase: 0
created: 2026-10-22
updated: 2026-10-22
---

# 355 — Apollo visual pass

## Goal

The owner (2026-10-22, with a KSP Apollo video and stills in `refs/apollo-ksp-reference/`): make Kronos V + Selene look much closer to the Saturn V and Apollo, using the generator detail kit and liveries. Fictional markings only: no national flags or country names.

## Steps

1. **Paint** (`stock.paint`):
   - a Hangar build setting on stack tanks, pods and engine plates, read by the renderer as the visual parameter `paint` (`visual.paramsFrom`);
   - new liveries: `roll` (first stage: black panels round the foot, the roll pattern under the top, stringers), `top-band`, `aft-band`, `service` (bare metal with white radiator panels), `foil-engines` (silver blankets over the bells, engine fairings);
   - a `blanket` material.

   Kronos V sets its stages' paint.
2. The SLA petals: two-sided, a tan inner skin, hinge strips and markings.
3. The LM: an angular ascent stage with windows.

## Acceptance criteria

- [x] Paint: the stock and renderer tests (liveries stay within their barrel, triangle budgets) pass. Kronos V in the Hangar shows the roll pattern, the black bands, a silver CM on a striped SM, and foil-wrapped engines under fairings.
- [x] Petals and LM.
- [x] Before/after screenshots in the journal.

## Docs checklist

- [x] `docs/STATUS.md`, journal `355-apollo-visual-pass.md`.

## Log

- 2026-10-22 — Step 1 done (paint); petals and LM next.
- 2026-10-22 — Done.
