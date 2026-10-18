# 0155 — Range safety: the safe fan from the water map, the drop predicted at staging, penalties once

**Status:** accepted
**Date:** 2026-10-18
**Plan:** [127](../plans/127-range-safety.md)
**Builds on:** ADR 0097 point 8 (range safety is a world rule: `cost`, `hard`, `off`), ADR 0021 (debris on drag-free rails), ADR 0182 (the water map of plan 067), ADR 0177 point 4 (downrange from the site), ADR 0113 (the ledger), ADR 0150 (the Launch screen)

## Context

ADR 0097 asks for a safe launch fan computed from the geography around each site and for spent stages predicted onto land or another site to be penalised (`cost`) or refused (`hard`). Three facts shape how:

- The sim has no Δv model: stage Δv lives in the web app (`lib/delta-v.ts`), so the sim cannot predict a design's drop zones before it flies.
- The player chooses no launch azimuth: `load-vessel` places the vessel on the pad and the flight decides the heading.
- Debris already has one model in the sim: a drag-free conic on rails (ADR 0021). The terrain field knows where water is (`waterAt`, ADR 0182).

## Decision

1. **The safe fan** (`safeFan` in `packages/core/src/range-safety.ts`). From the site's centre, every azimuth on a 5° step is safe when its ground track from 20 km to 200 km downrange (where spent stages fall) is water at 75 % or more of its 10 km samples and passes no closer than 50 km to another site. Contiguous safe azimuths form arcs (degrees clockwise from north). A coastal site gets the arcs over its sea; an inland site gets few or none. A body with no water map (no `waterAt`) has no fan, and range safety does not apply on it.
2. **The drop point** (`conicImpact`). A state (position and velocity, body-centred inertial) falls along its conic to the body's reference radius: the descending crossing, the flight time from Kepler's equation, then the body-fixed point at that time (the body turns meanwhile). No crossing (periapsis above the surface, or an escape) means no drop. This is the same drag-free path debris follows on rails, so the sim's warning and its penalty agree.
3. **The drop is judged at staging.** When a `stage` command fires a stage that separates parts (a decoupler) from a controlled vessel in flight on a body with a fan, the sim takes the vessel's state at that moment as the spent stage's state and judges its drop: on land, or within 50 km of a site, is a violation. With `hard` the command is refused with the reason (`the spent stage would fall on site "…"; stage over the sea or change the ascent`); with `cost` it fires and the penalty is booked once, then; with `off` nothing is checked. A stage that would reach a stable orbit, or that drops in the water clear of sites, is fine.
4. **The azimuth** is measured, not chosen: when a vessel loaded at a site first climbs through 2 km above the surface, the heading of its surface-relative velocity is compared with that site's fan. Outside the fan books the azimuth penalty once under `cost` and under `hard` (a flight cannot be refused after liftoff). Vessels waiting for the check are saved (`SimSave.range?`, optional in format 5).
5. **Penalties** go through the ledger, cause `range-safety`, only when the world's economy is on: a drop on a site 10 000 funds and 10 reputation, on land 2 000 and 3, an azimuth outside the fan 1 000 and 1. Funds follow the cost multiplier. The `range:violation` event carries the kind, the vessel and the place.
6. **What the player sees.** `Snapshot.range` carries the rule, the fan of the site the active vessel left (or of the primary site) and, for each controlled flight vessel, the drop of its next separating stage if fired now when that drop is a violation: the HUD shows it as a warning. The Launch screen shows the site's fan and a nominal estimate of each stage's drop from the design's stage Δv (`nominalDrops`: a fixed ascent profile toward the east, labelled as an estimate); the sim never uses that estimate.

## Alternatives considered

- **Predict drops before launch in the sim** — needs the Δv model in core or the sim; moving `lib/delta-v.ts` is a contract-wide refactor outside this plan, and a nominal ascent never matches the flight actually flown. Judging at staging uses the real state.
- **Judge the real impact point** — debris below the atmosphere top is flown with drag in physics and debris on rails is reaped at the atmosphere top (ADR 0021): there is no single impact event to judge, and the penalty would come minutes after the decision that caused it.
- **Refuse launches outside the fan under `hard`** — the player picks no azimuth before launch, so this would forbid every launch from an inland site.
- **A launch azimuth field on `load-vessel`** — a protocol change the plan's Touches do not grant; the measured azimuth gives the same check.

## Consequences

- A drag-free conic overshoots a real stage dropped low in the atmosphere: the prediction is conservative downrange. Documented in the HUD warning as "predicted".
- A stage fired while the vessel stands on the pad (ignition, clamps) separates nothing in flight and is not judged.
- `hard` stops the player at the staging key with the reason; they can coast further downrange, or turn.
- API: `Snapshot.range?`, event `range:violation`, `SimSave.range?`; core exports `safeFan`, `conicImpact`, `nominalDrops`, `RANGE_PENALTIES`, `RANGE_RULE`.
