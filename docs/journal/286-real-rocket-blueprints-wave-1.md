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

## Kronos V + Selene in one run (second part)

`kronos-trip.test.ts` (one test, about 7 minutes) joins the pieces: the ascent to 80 km; a trans-lunar burn found by scanning the departure time and Δv over the patched-conic predictor (`@orbital/kepler`); the spent S-II dropped; the petals and service-module decoupler; Auto Dock turns the command ship round and docks with the lander's port; the lander is released from the S-IVB's adapter; burns (SAS on the node, throttle to the Δv left) put the lunar periapsis at about 75 km; the insertion burn at the periapsis; two crew into the lander, which undocks and lands with Guidance Land; the ascent stage lifts off to 20 km; Guidance Rendezvous hands over to Auto Dock; the crew return, the ascent stage is cast off; the burn home is searched the same way (inbound, periapsis 636 km); two corrections aim the entry corridor; the service module goes and the capsule enters under SAS re-entry with the chute armed, landing at under 10 m/s with all its parts.

Findings: the service module needed the full wide tank (the burn home failed on the short one); the chute must be armed with the parachute's own `deploy` action (the docked vessel's stage list no longer holds the pod); the periapsis window for the entry is narrow at lunar-return speed (632 km radius is a steep dive, 640 km skips out); the `vessel.orientation` is the root part's, not the pod's, so alignment checks use SAS's own error.

Left from the plan text: "deploying panels and boom" of Aurora has no action (fixed parts).
