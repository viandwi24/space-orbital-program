# Realistic part stats: engines, stages, counterparts (plan 380)

Checked **2026-10-23** (Wikipedia infoboxes; where a page contradicts itself, both figures are noted). These figures feed `mods/stock/src/parts/realism.ts` (ADR 0317).

## Engines

TWR is vacuum thrust over dry mass × g0 (9.80665 m/s²).

| Engine | Propellant | Thrust SL / vac | Isp SL / vac | Dry mass | TWR | Source |
|---|---|---|---|---|---|---|
| F-1 (S-IC) | kerolox | 6 770 / 7 770 kN | 263 / 304 s | 8 400 kg | 94 | https://en.wikipedia.org/wiki/Rocketdyne_F-1 |
| RD-180 (Atlas V) | kerolox | 3 830 / 4 150 kN | 311 / 338 s | 5 480 kg | 78 | https://en.wikipedia.org/wiki/RD-180 |
| RD-107A (Soyuz, 4 chambers) | kerolox | 839 / 1 020 kN | 263 / 320 s | 1 190 kg | 87 | https://en.wikipedia.org/wiki/RD-107 |
| Merlin 1D (Falcon 9) | kerolox | 845 / ≈914 kN | 282 / 311 s | 470 kg | 184 (infobox) | https://en.wikipedia.org/wiki/SpaceX_Merlin |
| Merlin 1D Vacuum | kerolox | — / 981 kN | — / 348 s | — | — | same (the infobox says 311 s, the text 348 s) |
| RS-25D (Shuttle) | hydrolox | 1 860 / 2 279 kN | 366 / 452 s | 3 177 kg (text: about 3.5 t) | 73 | https://en.wikipedia.org/wiki/RS-25 |
| J-2 (S-II, S-IVB) | hydrolox | 486 / 1 033 kN | 200 / 421 s | 1 788 kg (table: 1 438) | 59 by thrust/mass, 73 (infobox) | https://en.wikipedia.org/wiki/Rocketdyne_J-2 |
| RL10A-4-2 (Centaur) | hydrolox | — / 99 kN | — / 451 s | 170 kg | 59 | https://en.wikipedia.org/wiki/RL10 |
| RL10B-2 | hydrolox | — / 110 kN | — / 465.5 s | 301 kg | 37 | same |
| AJ10-137 (Apollo SPS) | Aerozine 50 / N2O4 | — / 91 kN | — / 314 s | not stated per variant (family 90–100 kg) | — | https://en.wikipedia.org/wiki/AJ10, https://en.wikipedia.org/wiki/Apollo_service_module |
| LM descent engine | Aerozine 50 / N2O4 | — / 45–47 kN | — / 311 s | 179 kg | 27 | https://en.wikipedia.org/wiki/Descent_propulsion_system |
| LM ascent engine | Aerozine 50 / N2O4 | — / 16 kN | — / 311 s | 95 kg | 17 | https://en.wikipedia.org/wiki/Ascent_propulsion_system |
| Shuttle SRB | PBAN solid | ≈12 MN at liftoff (14.7 max) | 242 / 268 s | 91 t empty of 590 t (15 %) | — | https://en.wikipedia.org/wiki/Space_Shuttle_Solid_Rocket_Booster |

## Early era (the first tech tiers)

| Hardware | Figures | Source |
|---|---|---|
| V-2 (A-4) | about 25 t (245 kN) of thrust on the pump, 29 t at altitude; 12.5 t at launch with about 8.7 t of propellant, so about 30 % dry for the whole rocket | https://en.wikipedia.org/wiki/V-2_rocket |
| LR-79 / S-3D (Thor) | 600 kN at sea level; Isp 247 s at sea level (the specifications say 282 s); the S-3 variant was 725 kg for 667 kN (TWR about 94) | https://en.wikipedia.org/wiki/Rocketdyne_LR79 |

The early kinds span the V-2 to the LR-79: kerolox Isp 230–310 s in vacuum, 195–260 s at sea level, TWR 20–100. Stock's first tiers use 250/215 s (V-2 and Redstone class) at TWR 80 (LR-79 class). Tanks are ×2.3 the size-class fraction, about 21 % at 1.25 m (Redstone's whole stage about 19 %, the V-2's 30 %). Storable upper stages are at 260–300 s (AJ10-37 and AJ10-104 class), and solids at 200–255 s. Modern tanks (aluminium-lithium, composite: Falcon 9's stages run 4–5 % with their engines) are ×0.85.

**Outcome in stock**, flown on the Guidance ascent to 80 km (`apps/web/src/lib/editor/eras.test.ts`). The trip planner's figure is pessimistic, so only flights decide:
- an early single stage falls back: a pod and the LV-T30 on one, two or three small tanks, or on a medium tank (periapsis −190 to −420 km);
- the two-stage starter reaches a 75 km periapsis;
- a heavy-lift-tier single stage (wide tank and wide engine) reaches a 75 km periapsis.

## Stages and tanks (dry fraction = empty / (empty + propellant))

| Stage | Diameter | Empty | Propellant | Dry fraction | Source |
|---|---|---|---|---|---|
| S-IC (5 F-1) | 10 m | 137 t | 2 077 t | 6.2 % | https://en.wikipedia.org/wiki/S-IC |
| S-II (5 J-2) | 10 m | 36.2 t | 443 t | 7.5 % | https://en.wikipedia.org/wiki/S-II |
| S-IVB (1 J-2) | 6.6 m | 13.5 t (text: 10 t) | 109.5 t | 11 % | https://en.wikipedia.org/wiki/S-IVB |
| Centaur III (1 RL10) | 3.05 m | 2 247 kg | 20 830 kg | 9.7 % | https://en.wikipedia.org/wiki/Centaur_(rocket_stage) |
| Falcon 9 FT first stage (9 Merlin) | 3.7 m | 22.2 t | 410.9 t | 5.1 % | https://en.wikipedia.org/wiki/Falcon_9_Full_Thrust |
| Falcon 9 FT second stage | 3.7 m | 4.0 t | 107.5 t | 3.6 % | same |
| Shuttle external tank (SLWT) | 8.4 m | 26.5 t | 735.6 t | 3.5 % | https://en.wikipedia.org/wiki/Space_Shuttle_external_tank |
| Apollo service module | 3.9 m | ≈6.1 t (derived) | 18.4 t | 25 % (with the SPS and systems) | https://en.wikipedia.org/wiki/Apollo_service_module |

The stage figures include engines and systems. A bare tank is lighter, and a small tank is heavier per kilogram. Hence the rule's curve: 12 % at 0.625 m, 9 % at 1.25 m, 7.5 % at 1.875 m, 6.5 % at 2.5 m, 5.5 % at 3.75 m, 5 % at 5 m, 4.5 % at 7.5 m.

## Stock counterparts (by size class and role)

| Stock part | Class | Kind | Counterpart | Rule values |
|---|---|---|---|---|
| `engine-lv` LV-T30 | 1.25 m | early kerolox | V-2 to LR-79 class (Basics) | 215 kN, 250/215 s, TWR 80 |
| `engine-cluster` KR-4 | 1.25 m | early kerolox | a four-chamber cluster (RD-107 class) | 340 kN, 265/230 s, +15 % plate |
| `engine-wide` RE-I5 | 2.5 m | kerolox SL | Merlin 1D | 650 kN, 311/282 s |
| `engine-vacuum` LV-909 | 1.25 m | early hypergolic | AJ10-104 (Able upper stage) | 60 kN, 280 s, TWR 20 |
| `engine-vacuum-xl` GP-J2 | 2.5 m | hydrolox vac | J-2 | 1 000 kN, 421/200 s, TWR 58 |
| `engine-plate-5` GP-F5 | 5 m | kerolox SL | F-1 figures (S-IC), five bells | 7 MN, 304/263 s |
| `engine-plate-9` GP-M9 | 3.75 m | kerolox SL | nine Merlin 1D (Falcon 9) | 4 MN, 311/282 s |
| `engine-plate-8` GP-R8 | 3.75 m | hydrolox SL | RS-25 class (Shuttle mains, Energia core) | 3.2 MN, 452/366 s |
| `orbiter-aft` | 4.6 m | hydrolox SL, stage | Shuttle aft fuselage | unchanged (in band) |
| `lander-descent`, `lander-ascent` | 2.5 / 2 m | hypergolic, stage | LM descent and ascent stages | unchanged (311 s) |
| `booster-liquid` LB-1 | 0.8 m | early kerolox, stage | a strap-on kerolox booster | 255/220 s; dry = early tank + engine |
| `booster` BST-1 | 0.8 m | early solid | Castor 1 class | 240/215 s |
| `srb-small` BST-0 | 0.8 m | early solid | Baby Sergeant class | 230/210 s |
| `srb-large` BST-3 | 1.25 m | early solid | Castor 1 / Algol class | 250/225 s |
| `srb-xl` | 1.875 m | solid | Shuttle SRB, half length | 268/242 s (unchanged) |
| `escape-tower` | 1.25 m | escape solid | Apollo LES | unchanged |
| RCS (monopropellant) | — | — | hydrazine thrusters 220–235 s | 240 s (band 200–240) |
| heat shields | all | — | Avcoat; journal 124's real-scale measurement | 300 kg of ablator per 1.25 m (by area), 12 MJ/kg |

Pods, structure, science, power and lights were compared with their counterparts and kept. For example: the 1.25 m one-seat pod at 840 kg (Mercury 1.1–1.35 t at 1.9 m), the 2.5 m three-seat pod at 2.7 t (Soyuz descent module 2.9 t at 2.2 m), and decouplers and adapters at structural masses. Propellant density stays the game's (5 kg per unit): a stock tank holds about twice the propellant of a real one of its size. That is a game convention, outside this note.
