# 286 — Mission blueprints, the remaining flights

**Plan:** [plans/286-real-rocket-blueprints-wave-1.md](../plans/286-mission-blueprint-flights.md) · **Session:** Worker C, 2026-10-24 · **ADRs:** 0263, 0316, 0317 (no new ADR)

## What was done

Four new headless flights in `apps/web/src/lib/editor/mission-flights.test.ts`, each on the blueprint as the Library loads it, with the launcher cut away where the flight starts in orbit (the launch is plan 380's flight to low orbit):

| Blueprint | Flight |
|---|---|
| Horizon Telescope | in a 300 km orbit: the observation is refused with its door shut, the door opens, the run starts and the result is READY after 40 s (plan 298's door and pointing conditions on the real blueprint) |
| Aurora Research Satellite | the magnetometer reads in high orbit and is refused in low orbit; the thermometer is refused in high orbit and reads in low orbit; the whip antenna and the folded arrays are fitted and working |
| Moonwatch Orbiter | at 100 km above the moon on an 800 m/s hyperbola its own engine, turned retrograde by SAS, brakes it into a closed orbit (e under 0.9, periapsis above 20 km) in about 45 s of burn |
| Horizon Station | a crewed ferry docks and the crew member is transferred from the ferry's pod into the station's habitat (`crew-transfer`) |

## Not done

- **Kronos V + Selene in one run** (launch, trans-lunar burn, lunar orbit, landing, ascent, rendezvous, return). The flights are still the pieces plans 309, 356 and 361 left: the capsule's return under chutes, the lander's touchdown, the ascent stage to a 10 km lunar orbit, the petals. Joining them needs the trans-lunar and rendezvous legs, which no autopilot flies from a design headless yet.
- The ascent from the pad for Moonwatch, the telescope and Aurora (the launcher flight to low orbit is plan 380's `blueprint-systems.test.ts`).
- Deploying "panels and boom": Aurora's arrays and boom have no deploy action (they are fixed parts); the plan's wording is met by the instruments.
- The long-run times and Δv left of each flight were not recorded beyond the Moonwatch burn above.
