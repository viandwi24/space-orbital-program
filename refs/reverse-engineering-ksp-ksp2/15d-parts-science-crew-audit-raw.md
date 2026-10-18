# 15d — Parts, resources, science, EVA and crew audit (raw, read-only)

This is the raw output of a read-only audit run on 2026-10-18. It covers sections 3 and 4 of [15-orbital-today-inventory-2.md](15-orbital-today-inventory-2.md). Paths are relative to the repository root. Short paths:

| Short path | Full path |
|---|---|
| `parts.ts`, `modules.ts` | `mods/stock/src/` |
| `science.ts`, `comms.ts`, `solar.ts`, `bases.ts`, `eva.ts` | `mods/stock/src/` (when no package is named) |
| `sim/…` | `packages/sim/src/` |
| `core/…` | `packages/core/src/` |

**Summary.** There are **36 stock parts** and 19 module types. Every career system exists in the sim: science, tech tree, crew, life support, EVA and bases. All of them are thinner than KSP's, and several have no UI or have stats that do nothing.

## A1. Stock parts (`mods/stock/src/parts.ts` unless noted)

| Line | id | Role | Mass kg | Modules |
|---|---|---|---|---|
| 61 | command-pod | command, 1 seat | 840 | Command; EC 50 |
| 82 | reaction-wheel | command | 100 | ReactionWheel 5000 N·m, 0.6 EC/s |
| 100 | data-drive | storage | 20 | DataStorage 64 Mbit |
| 117 | tank-small | tank | 250 | LF 400 / Ox 490 |
| 145 | tank-medium | tank | 500 | LF 800 / Ox 980 |
| 173 | engine-lv (LV-T30) | engine | 1250 | 215 kN, Isp 300/280, gimbal 3° |
| 221 | engine-cluster (KR-4) | engine | 1850 | 340 kN, Isp 295/272, gimbal 2° |
| 268 | decoupler | structure | 50 | Decoupler top, 2000 N·s |
| 291 | landing-legs | gear | 150 | LandingLeg |
| 314 | heat-shield | gear | 80 | HeatShield, 120 kg ablator |
| 337 | radial-decoupler | structure | 40 | Decoupler radial, 4000 N·s |
| 363 | booster (BST-1) | engine | 450 | 150 kN **LF/Ox** + its own tank (tech.ts:51 calls it "solid") |
| 409 | nose-cone | structure | 25 | drag 0.12 |
| 428 | fin | structure | 30 | Fin 1.5 m² |
| 448 | control-surface | structure | 45 | ±25° |
| 486 | wing | structure | 90 | 3 m², aspect ratio 6, flaps |
| 524 | strut | connector | 20 | gives no stiffness |
| 542 | fuel-line | connector | 10 | feeds |
| 586–618 | thermometer, barometer, seismometer, surface-sampler, atmosphere-sampler | science | 10–30 | Experiment |
| 638 | probe-core | command | 50 | Command, whip antenna, EC 20 |
| 679 | whip-antenna | comms | 5 | Antenna |
| 686 | dish-antenna | comms | 60 | Antenna |
| 697 | solar-panel | power | 30 | 0.5 EC/s, constant |
| 722 | life-support-pack | tank | 60 | Supplies, O2, water and food, 6 each |
| 752 | scrubber | command | 40 | 3 crew, 10 EC per person per day |
| 775 | flotation-collar | gear | 40 | floats by its volume |
| 815–816 | wheel, wheel-steer | gear | 40 | Wheel, steering 0 or 20° |
| eva.ts:33 | eva-suit | 1 seat | 85 | Command, EC 20, EVA propellant 5, LS 0.5, engine 50 N/Isp 60, wheel 20, sampler, suit radio |
| eva.ts:86 | flag | structure | 10 | Flag (kept) |
| bases.ts:38 | base-kit | command | 1200 | BaseKit |
| bases.ts:55 | drill | engine | 250 | Drill, 50 ice/day |

All parts are the 1.25 m class (`parts.ts:38-39`).

**Missing:**
- batteries, RCS and monoprop, true SRBs, parachutes, docking ports;
- ladders, lights, fairings, cargo bays;
- multi-seat pods, crew cabins, a lab, ore tanks and an ISRU converter part;
- any other size class.

The roadmap text promises EVA "climb" (`apps/web/src/lib/public/roadmap.ts:205`), but climbing is not implemented.

## A2. Modules

**In `modules.ts`:**
- command (44)
- resource-container (106; withdraw and deposit at 122-133)
- engine (193)
- decoupler (334)
- reaction-wheel (378; no EC means no authority, 396-420)
- landing-leg (472)
- heat-shield (538)
- fin (642)
- control-surface (703)
- wing (859)
- scrubber (925)
- wheel (959)

**Elsewhere:**
- experiment (`science.ts:225`)
- antenna (`comms.ts:122`)
- data-storage (`data.ts:45`)
- solar-panel (`solar.ts:30`)
- flag (`eva.ts:84`)
- base-kit and drill (`bases.ts:18, 21`)

## A3. Resources (`mods/stock/src/resources.ts`, plus `eva.ts:20`)

| Resource | Density (kg/u) | Flow mode |
|---|---|---|
| liquid fuel | 5 | stack |
| oxidizer | 5 | stack |
| electric charge | 1e-6 | vessel |
| ablator | 1 | none |
| supplies | 5 | vessel |
| oxygen | 1 | vessel |
| water | 3 | vessel |
| food | 1 | vessel |
| eva-propellant | 1 | vessel |

There is no monoprop, xenon, solid fuel or ore. Ablator is registered as a resource but lives in module state, not in a container (`modules.ts:526-530`).

## A4. Power

**Producer:**
- One solar panel giving a constant 0.5 EC/s, including in the background. It has no sun angle, no occlusion and no distance falloff (`solar.ts:4, 25-28`).

**Storage:**
- Built in only: pod 50, probe 20, suit 20. There is no battery part, and the `stock.batteries` action group is empty.

**Consumers:**

| Consumer | Behaviour |
|---|---|
| Reaction wheel | 0.6 EC/s × demand; no EC means zero authority |
| Experiments | Pause with "no electric charge" (`science.ts:169, 216-219`) |
| Scrubber | Per person per day. When it runs short under life support `full`, a CO2 shortage starts with 30 minutes of grace (`life.ts:150-185`) |
| Antenna | Has a `power` field (`comms.ts:75, 85, 99`), but transmitting **draws no EC** |

There are no RTGs, fuel cells or alternators.

## A5. ISRU and bases (plan 128)

**Content (`bases.ts`):** a base hub, an ISRU plant, a storage module, an ice commodity, and the electrolysis recipe: 100 ice + 120 power → 40 LF + 49 Ox per day.

**Sim (`sim/bases.ts`):**
- `deployBase` (52) and `joinSite` (105)
- drilling (152-180)
- supply routes on the synodic window (186 onward)

**Gaps:**
- **No command refuels a vessel from site storage.**
- Bases are not drawn.
- Bases need no life support, power or crew.
- Route cargo moves without a flight.
- Site products can only be sold (`sim/market.ts:187`).

## A6. Science

**Situations:** Landed, Splashed, Flying low/high, Space low/high. All are regional except Space high (`science.ts:20-69`). The thresholds are per body.

**Experiments:**

| Experiment | Base value | Transmit factor | Power | Notes |
|---|---|---|---|---|
| temperature | 8 | 0.5 | 0.05 | |
| pressure | 10 | 0.5 | 0.05 | |
| seismic | 20 | 0.6 | 0.2 | landed only |
| surface-sample | 30 | 0 (recover only) | — | 5 kg, landed or splashed |
| atmosphere-sample | 15 | 0 | 0.1 | 2 kg |

**Value:** each repeat multiplies the value by `repeatFactor`, capped at base × multiplier × 3 (`core/science.ts:145-157`). The subject format is `exp@body:situation:region`.

**Module:**
- States are READY, RUNNING, PAUSED and INVALID. Runs take time, also on rails.
- A sample stays in the part, and **there is no reset or clean**.

**Regions (plan 104):**
- Home biome classes, with deserts, mountains and ice caps at ×1.5.
- Cinder: Highlands, Maria ×1.2, Crater fields ×1.5.
- Sol bodies have biomes.
- There is no region overlay on the map (draft plan 192).

**Transmit and recover:**
- Transmitting gives value × factor and queues per radio, with relays and store-and-forward (`sim/transmission.ts:42-190`).
- Recovery gives full value. Samples taken on EVA go to the locker.

**Lab:** there is no lab part. The R&D building has `lab` capacity 1/2/3, which only limits parallel discovery datasets.

**Body dossiers:** atmosphere, gravity, surface, regions and resources (`science.ts:278-320`; `BodyCard.svelte`).

**Discovery science (plan 129, rule `stock.science-depth=discovery`):** facts such as polar ice, magnetic field and subsurface ocean. Data has raw, calibrated and derived levels. Peer review takes 3 days and pays out in reputation.

**Science dock panel (plan 191):** only "Run the next experiment" and "Transmit the best result" (`mods/stock/src/panels.ts:14-30`). You cannot pick a specific experiment or result.

## A7. Tech tree (`mods/stock/src/tech.ts:8-115`)

10 nodes, 1 115 science in total, gated by milestones:
- basics (0)
- instruments (10)
- structures (15)
- propulsion (25, orbit)
- probes (20, orbit)
- aerodynamics (15, orbit)
- landing (220, flyby of Cinder)
- deep-space (190, flyby of Cinder)
- life-support (300, landing on Cinder)
- surface-operations (320, landing on Cinder)

KSP has about 60 nodes. A rule can turn the tree off.

## B1. EVA (plan 109, ADR 0120, `sim/eva.ts`)

**Implemented:**
- Step out (`eva.ts:132-158`; refused during warp).
- Walk at up to 1.5 m/s (`214-233, 253-280`).
- Board within 50 m at under 2 m/s with a free seat; samples go to the locker (`36-38, 161-211`).
- Plant a flag (`236-246`).
- EVA XP for `eva:<body>`.
- Suit radio, a 2 km UHF relay (plan 121).

**Partial:**
- **Jetpack:** the sim has 50 N with 5 kg of propellant, thrusting along the up axis only (no RCS). The **HUD cannot fly the suit**: throttle and stage act on the launched vessel (`flight-loop.ts:346, 416, 573`).
- **Samples:** the suit has a sampler, but the science panel acts on the launched vessel (`apps/web/src/lib/dock/panel-input.ts:7-14`).

**Missing:** ladders, grab and climb, ragdoll, removing the helmet, EVA construction, repair. There are no **keyboard bindings for EVA**. The UI is in `CrewPanel.svelte`: an EVA button, N/E/S/W walk buttons, Stop, Flag and Board. The suit's chip always reads "IVA" (`CrewPanel.svelte:75`).

## B2. Crew (plans 106 and 108)

- **Professions:** pilot, engineer, scientist, tourist.
- **Abilities:** seven quality factors, +5 % per level.
- **Traits:** six (`mods/stock/src/crew.ts:7-40`).
- **XP:** flyby 1, orbit 1.5, landed 2.3, EVA 1, ×2 away from home. Level thresholds are 2/8/16/32/64 XP. XP is booked at recovery.
- **Salaries:** 400/400/450/0 per day, +25 % per level. Recruiting costs 20 days of salary. Capacity is capped by the Astronaut Complex.
- **Most abilities do nothing.** The sim only reads `gTolerance` (`life.ts:252`) and `radio` (`sim/comms.ts:285`). These are never read: `controlSmoothing`, `scriptBudget`, `repairRate`, `dataQuality`, `panicResistance`. Unlike KSP, pilots do not gate SAS, engineers do not repair, and scientists do not reset experiments. `FLIGHT_TOOLS` must never be gated (`core/crew.ts:33-43`).
- **Missing UI:**
  - `crew-dismiss` exists in the sim (`sim/crew.ts:120`) with no UI.
  - `crew-transfer` exists (`sim/crew.ts:173`) with no UI.
  - Crew can only be assigned on the Launch screen, not in the VAB.

## B3. Crew simulation (plan 107)

- **Life support** has three levels: off, simple (1 supplies per person per day) and full (O2, water, food, and scrubbers drawing EC). It integrates exactly while on rails. Grace periods: O2/CO2 30 minutes, water/supplies 3 days, food 10 days.
- **Morale, fatigue and performance** follow the rules. **Fatigue has no rest action.**
- **G-load:** above 6 g × tolerance, stress builds up, and G-LOC lasts 8 s. **G-LOC does not take away control**; it only shows a "Blacked out" chip.
- **Radiation dose** accumulates, but there are no limits and no illness.

## B4. Death and rescue

- The `stock.crew-death` rule offers permanent, return (14 days) or off.
- `loseMember` handles the outcome (`sim/crew.ts:246-283`). It runs when a vessel is destroyed and when a crew member's grace runs out.
- Crewed pods are controlled vessels and are never reaped as debris.
- **There are no rescue contracts.** The six templates are altitude, orbit, moon flyby, moon landing, moon return and planet flyby (`mods/stock/src/contracts.ts:69-185`).

## Stale comments and placeholders

- `solar.ts:4`: "Sun exposure and occlusion by bodies come later"
- `charges.ts:2`: "operations placeholder"
- STATUS.md:178 and 182
- `core/science.ts:120`: "until plan 104" (plan 104 is done)
- `CrewPanel.svelte:75`: the IVA chip
