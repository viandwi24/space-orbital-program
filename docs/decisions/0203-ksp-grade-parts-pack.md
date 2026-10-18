# 0203 — KSP-grade parts pack

**Status:** accepted
**Date:** 2026-10-18
**Plan:** plans/207-part-sizes-shrouds-adapters.md, plans/208-power-and-resources.md, plans/209-parachutes.md, plans/210-propulsion-and-structure-pack.md, plans/211-rcs-and-monopropellant.md, plans/213-tank-transfer-and-flow.md
**Builds on:** ADR 0174 (part action descriptors), ADR 0109 (control needs a command source), ADR 0101 (comms), ADR 0018 (rigid vessels)

## Context

We have 36 parts, all 1.25 m (`parts.ts:38-39`). KSP's first flight uses a pod, a parachute, a solid booster and fins; we have the pod and fins. There are no parachutes (`action-groups.ts:13` holds only the group id), no RCS or monopropellant, no batteries, no launch clamps and no docking ports (research docs 15a §4, §7, §9 and 15d). `stock.booster` (BST-1) is a liquid booster with its own tank (`parts.ts:358-406`) though the tech text calls it solid (`tech.ts:51`). The one solar panel gives a constant 0.5 EC/s with no sun angle, distance or shadow, also in the background (`solar.ts:4,25-28`). Antennas draw no EC when transmitting (`comms.ts:75-99`). The BST-1's top ring profile is wound the wrong way (`booster.ts:14-20`). Rancangan §4.1–4.3 and §8b.

## Decision

1. **Explicit node sizes** on every part: 0.625, 1.25 and 2.5 m. Each generator's joint rim equals the node radius within 1 mm, and every outer face points outward; a geometry test per generator asserts both. Engines and decouplers grow an **auto shroud** sized to the part below. **Adapters** 0.625↔1.25 and 1.25↔2.5, and nose and tail cones in every size. The Hangar marks a joint whose sizes do not match.
2. **Resources:** monopropellant (about 4 kg/unit, flow `vessel`), solid fuel (about 7.5 kg/unit, flow `none`: an SRB burns only its own), and **cold gas**, renamed from EVA propellant and also fed to cold-gas RCS.
3. **Power rules.**
   - Batteries small, medium and large at **5 kg per 100 EC** (KSP reference).
   - Solar output depends on the sun angle, the distance to the sun (inverse square) and shadow by bodies, in flight and in the background. Panels are fixed, folding, or large tracking. KSP's OX-10 class gives 8.25 EC/s as a reference.
   - **RTG** at **0.75 EC/s** (KSP reference), constant.
   - **Transmitting costs EC and time**, from the antenna's existing `power` field.
   - A probe core drains EC. At zero EC a probe-only vessel loses control (ADR 0109 point 1) and the bell says so.
   - Core computes a power budget (day and night) that the Hangar shows.
4. **Parachutes** (KSP1 since 1.2, verified): top, radial and drogue. States **armed, semi-deployed, deployed, cut, torn**. Staging arms a chute; it semi-deploys at its minimum pressure and fully deploys at its full-deploy altitude. Default mode **"deploy when safe"** waits until speed is safe. Status always shows as text: *Safe*, *Risky*, *Unsafe*. Starting points for balancing: main chute 0.04 atm and 1 000 m, drogue 0.02 atm and 2 500 m; sliders 0.01–0.5 atm and 50–5 000 m; risky from about 250 m/s for mains, about twice that for drogues. Manual controls: Deploy, Force open, Disarm, Cut. Chutes go in staging and the Parachutes group.
5. **No built-in chute in the pod.** The starter template carries one (default per owner review, rancangan §15 #3; may change). The pod gets a small monoprop reserve.
6. **SRBs:** no throttle, a thrust limiter set in the Hangar, several sizes. **BST-1 becomes a true SRB** and gains sizes (default per owner review, rancangan §15 #8; may change).
7. **Launch clamps** are radial parts: their height extends to the pad automatically, they hold the vessel, supply **EC only**, and are released by staging (default per owner review, rancangan §15 #16; may change; fuel from towers or umbilicals is P1).
8. **RCS:** a 4-way monoprop block at **1 kN** (KSP reference; Isp 240 vacuum / 100 sea level) and a small cold-gas thruster. One module serves rotation and translation. Toggle with R; per-part limiter and axis switches.
9. **Also in the pack:** a vacuum upper-stage engine; 2.5 m tanks, engine, decoupler and heat shield; engine thrust limiter and gimbal lock and limit; basic Goo and Materials Bay style experiments.
10. **Tanks:** player transfer (source → target, Stop) at a visible rate; a flow lock per resource; rate and time-to-empty in the snapshot. All controls are part action descriptors (ADR 0174), so the panel, the inspector, action groups and scripts reach them.

## Alternatives considered

- **Rename BST-1 and leave it liquid** — rejected: a KSP player's first rocket uses a solid booster.
- **Constant solar output** (today) — rejected: power is never a design constraint, and probes cannot ride out the night.
- **Pad hold instead of clamps** — ADR 0019 removed it; clamps are KSP's way and are a part the player places.
- **Copy KSP numbers exactly** — rejected: they are starting points; our masses and scales differ.

## Consequences

- Plans 207 (sizes, shrouds, adapters), 208 (resources and power), 209 (chutes), 210 (SRB, clamps, vacuum engine, 2.5 m, experiments), 211 (RCS and monoprop) and 213 (transfer and flow) deliver it. Plan 231 places the parts in the tech tree.
- Saves gain resource ids; a migration renames EVA propellant to cold gas.
- The booster ring fix (plan 200) lands before the geometry tests.
