# The stock system: bodies, Δv map and transfer windows (plan 381)

Checked **2026-10-23**. Generated from the body definitions by `bun run tools/stock-dv-map.ts`; re-run it after changing `mods/stock/src/bodies.ts` and paste the tables here.

## Design

KSP scale (the Sun is Kerbol's mass, Home is Kerbin), so the stock system stays the easy mode next to Sol. Difficulty grows outward, with two exceptions on purpose: Kiln is close but expensive (the Sun's well, an eccentric and inclined orbit), and Vesper is easy to land on but very hard to leave.

| Body | Kind | KSP / real analogue | What makes it a destination |
|---|---|---|---|
| Kiln | airless hot rock | Moho / Mercury | expensive to reach (plane change, capture), cheap to land |
| Vesper | thick hot CO₂, cloud deck | Eve / Venus | parachutes alone land; ascent ~8 km/s |
| Ochre | thin CO₂, polar caps, 25° tilt | Duna / Mars | the first interplanetary trip; aerobrake + wide chutes |
| Mote, Flick | captured moonlets | Phobos, Deimos | a docking-like landing, near zero gravity |
| Vagrant | asteroid, e = 0.68 | an Apollo asteroid | a rendezvous more than a landing |
| Tempest | ringed hydrogen giant, no surface | Jool / Jupiter + Saturn | aerocapture, a moon tour |
| Forge | volcanic moon | Io | high Δv inside the giant's well |
| Rime | ice over an ocean, lineae | Europa | subsurface ocean (discovery fact) |
| Bastion | large moon with thin cold N₂ haze | Tylo/Laythe / Titan | heavy gravity, but chutes help |
| Husk | captured rock, retrograde | Phoebe | the far, backwards moon |
| Glim | icy dwarf, i = 12°, e = 0.27 | Eeloo / Pluto | the longest trip |

## Method

The tables below use the following model:

- circular, coplanar Hohmann transfers between the semi-major axes;
- departures and captures by the Oberth form `√(v∞² + 2μ/r) − v_circ`, at a low orbit 10 km above the air (else 10 % of the radius, at least 5 km);
- the plane change as one mid-course burn `v_mid · 2 sin(Δi/2)`, an upper bound; a well-timed departure at the node does better.

The formulas are those of `delta-v-map.md` (plan 034). The ascent through an atmosphere is an estimate:

- Home is the measured 3.4 km/s;
- Vesper is scaled from Eve (8 km/s at 5 atm and 16.7 m/s² in KSP);
- Ochre is scaled from Duna (~1.45 km/s);
- Bastion is a 5.2 m/s² body with 0.25 atm (~2.6 km/s).

The airless ascent is `1.12 v_circ + √(2 g · 2 km)`.

The first window of each planet is placed by its phase at t = 0 (ADR 0318 point 3): Kiln at day 30, Ochre 45, Vagrant 90, Tempest 120, Vesper 160 and Glim 200 (a day is Home's solar day, 21 651 s). For Vagrant and Glim, the eccentric orbits make the Hohmann numbers a guide only: plan the trip with the map's maneuver tools.

### Bodies

| Body | Parent | Radius km | g m/s² | Day s | a Mm | e | SOI km | Low orbit km | v low m/s | Air |
|---|---|---|---|---|---|---|---|---|---|---|
| Home | Sun | 600 | 9.81 | 21,600 | 13599.8 | 0 | 84,158 | 80 | 2,279 | 101.3 kPa, 70 km |
| Cinder | Home | 190 | 1.60 | 135,524 | 11.8 | 0 | 2,277 | 19 | 526 | — |
| Kiln | Sun | 260 | 2.70 | 1,210,000 | 5600.0 | 0.18 | 10,595 | 26 | 799 | — |
| Vesper | Sun | 700 | 16.20 | 81,000 | 9900.0 | 0.012 | 84,702 | 100 | 3,150 | 506.6 kPa, 90 km |
| Ochre | Sun | 330 | 2.95 | 65,500 | 21500.0 | 0.05 | 50,998 | 58 | 910 | 6.5 kPa, 48 km |
| Mote | Ochre | 13 | 0.06 | 36,173 | 2.2 | 0.02 | 35 | 5 | 24 | — |
| Flick | Ochre | 9 | 0.04 | 109,368 | 4.6 | 0.07 | 46 | 5 | 15 | — |
| Vagrant | Sun | 7 | 0.01 | 31,000 | 36000.0 | 0.68 | 433 | 5 | 7 | — |
| Tempest | Sun | 5,500 | 7.60 | 36,000 | 70000.0 | 0.04 | 2,301,906 | 360 | 6,264 | 1500.0 kPa, 350 km |
| Forge | Tempest | 300 | 2.40 | 58,137 | 27.0 | 0.004 | 1,662 | 30 | 809 | — |
| Rime | Tempest | 260 | 1.35 | 129,285 | 46.0 | 0.009 | 2,006 | 26 | 565 | — |
| Bastion | Tempest | 520 | 5.20 | 353,813 | 90.0 | 0.02 | 11,717 | 60 | 1,557 | 25.0 kPa, 50 km |
| Husk | Tempest | 45 | 0.22 | 4,357,850 | 480.0 | 0.18 | 2,490 | 5 | 94 | — |
| Glim | Sun | 200 | 0.90 | 19,500 | 95000.0 | 0.27 | 93,890 | 20 | 405 | — |

### From Home (low orbit, 80 km)

| To | Eject | Plane change | Capture to low orbit | Land | Ascent | Δi ° | Trip days | Window every days | Phase angle ° |
|---|---|---|---|---|---|---|---|---|---|
| Kiln | 1,620 | 1,309 | 2,176 | 895 | 999 | 6.2 | 126 | 153 | 136 |
| Vesper | 1,033 | 371 | 1,381 | aerobrake + chutes, ~100–300 | ~8000 (est.) | 2.1 | 171 | 697 | -53 |
| Ochre | 1,093 | 117 | 651 | aerobrake + chutes, ~100–300 | ~1450 (est.) | 0.8 | 312 | 855 | 47 |
| Vagrant | 1,463 | 1,335 | 1,474 | 8 | 15 | 10.0 | 523 | 554 | 77 |
| Tempest | 1,945 | 169 | 2,767 | — (no surface) | — (no surface) | 1.4 | 1,145 | 465 | 97 |
| Glim | 2,122 | 1,381 | 1,441 | 453 | 513 | 12.0 | 1,696 | 449 | 102 |

### Moons, from their planet's low orbit

| Moon | Planet | Transfer | Plane change | Capture to low orbit | Land | Ascent | Trip hours |
|---|---|---|---|---|---|---|---|
| Cinder | Home | 855 | — | 303 | 589 | 669 | 7.2 |
| Mote | Ochre | 277 | — | 152 | 27 | 42 | 2.3 |
| Flick | Ochre | 326 | — | 146 | 17 | 30 | 6.1 |
| Forge | Tempest | 1,766 | — | 831 | 906 | 1004 | 3.8 |
| Rime | Tempest | 2,079 | — | 854 | 633 | 706 | 7.6 |
| Bastion | Tempest | 2,319 | — | 878 | aerobrake + chutes, ~100–300 | ~2600 (est.) | 19.1 |
| Husk | Tempest | 2,541 | 264 (retrograde: arrive head-on instead) | 505 | 106 | 135 | 217.9 |

## Round trips from Home's low orbit (sum of the legs above, no aerobraking credit)

| Trip | Δv m/s |
|---|---|
| Cinder land and return | ~3,100 (855 + 303 + 589 + 669 + 303 + 855 − aerobrake at Home) |
| Ochre land and return | ~3,800 (1,093 + 117 + 651 + chutes ~200 + 1,450 + 651 + 117 + 1,093 − aerocapture at Ochre saves ~600) |
| Vesper landing, one way | ~1,500 (1,033 + 371 + aerocapture; a probe) |
| Tempest aerocapture and a moon | ~4,000–5,000 (1,945 + 169 + aerocapture + 800–900 per moon) |
| Glim landing, one way | ~5,400 (2,122 + 1,381 + 1,441 + 453) |
| Kiln landing, one way | ~6,000 (1,620 + 1,309 + 2,176 + 895) |

Targets for the parts calibration (plan 380): a stock "interplanetary stage" should carry ~2.5 km/s (Ochre and back with aerobraking); a "deep space" probe ~5.5 km/s from low orbit.
