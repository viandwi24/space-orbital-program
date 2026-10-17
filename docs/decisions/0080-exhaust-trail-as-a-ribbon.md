# 0080 — The persistent exhaust trail is a ribbon of sampled points

**Status:** accepted
**Date:** 2026-10-17
**Plan:** plans/040-effects-and-assets-3.md

## Context

The exhaust trail of plan 020 is thin smoke particles that live 3 to 6 s, so a rocket leaves nothing behind it in the air. Draft 040 feared a volumetric trail with the budget questions of the clouds (plan 037).

## Decision

A **ribbon**, drawn as one dynamic indexed mesh (one draw call, normal blending, no depth write), not a volume:

- **Sampling.** Each firing engine in air thick enough to hold a trail (ambient pressure over about half a percent of the surface's, fully dense over 12 percent: `trailDensity`, so about 14 km and below fully, none above about 30 km) and higher than two plume lengths above the ground puts a point behind its flame (70 percent of the plume length) into the vessel's `TrailBuffer`: the engines of one vessel are merged into one trail (the mean of their flame tips, as wide as the engines are spread plus 2 exit radii, the densest of them), so a rocket with four boosters leaves one fat trail, not five thin ones. A point is kept when 30 m from the last or 0.5 s have passed (a fast rocket makes about ten a second, a hovering one two). Points are in the body-fixed frame (the air turns with the ground), at most 256 per trail (25 s of a rocket at 300 m/s, the whole life at 100 m/s), 4 trails at once (the least recently fed makes room); a vessel silent for 0.5 s starts a new trail, so there is no ribbon across a coast. A cluster engine counts as one engine, wider by the square root of its bell count.
- **Life.** 45 s of simulated time. Each point drifts with the wind of `windAt` (ADR 0047) at 0.9 of its speed, so a trail through a wind that stiffens with height shears; its width grows from `2 x exit radius` plus the spread of the engines to 5 times that, its opacity rises over 0.6 s and falls with `(1 - age/life)^1.6`, divided by the square root of the widening (the same smoke over a wider band is thinner).
- **Drawing.** The CPU writes a centre, a tangent, a side sign (-1/+1), width, opacity and the position along the trail for two vertices per point; the vertex shader turns each pair to face the camera (`cross(tangent, toCamera)`), the fragment shader makes a lumpy band with two noise octaves, lit by the same diffuse light as the smoke (`EffectsFrame.light`) and warm at the young end. The old smoke particles of the trail stay at 35 percent of their rate for body.

Real condensation trails need air colder than a critical temperature and moist enough (the Schmidt-Appleman criterion, `research/effects-3.md`); the game models neither temperature nor humidity, so the density of the trail is a function of pressure only.

## Alternatives considered

- **Longer-lived particles**: 45 s at the old rate needs several thousand particles; the pool is 56 to 320.
- **A volumetric trail in the cloud march**: the planet pass is the frame budget (ADR 0053); a ribbon costs one draw call and 2 048 vertices at most.
- **Trail as a screen-space effect**: view dependent, no wind shear.

## Consequences

- A ribbon seen end-on (the camera behind a vertical ascent) is a thin line, as the strip turns to the camera only across the trail; the particles fill it.
- Time warp past 1x ages and drops the trail at the same simulated rate; on rails nothing is emitted.
