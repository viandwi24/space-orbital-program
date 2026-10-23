# System audit, October 2026

Checked 2026-10-23, after plans 276–378 landed. The owner asked for a scan of the whole game for oddities like the ones they keep finding by hand. It started from one report: "after I build a deep-space dish the map shows the Space Center marker, but my rocket launches from somewhere else".

**Method:**
- Code reading across `packages/{core,sim,renderer}`, `apps/web` and `mods/{stock,sol,guidance}`.
- The code's own Δv calculator (`designStats`, `planTrip`) over every Library card, lesson vessel and Sol design, in stock, Sol 1:1 and Sol rescaled.
- Registry scripts over Stock + Sol: parts, tech nodes, icons, keybindings.
- Headless sims for each claim that needed one: the EVA suit refund, the scenario site, the station position in Sol.

Every finding below was verified. Speculation was dropped. Scratch scripts are not in the repo.

## Findings

Severity: **high** means a player hits it in normal play; **medium** means a feature is wrong or exploitable; **low** means a corner case or a latent issue.

| # | Severity | Area | Symptom | Cause | Status |
|---|---|---|---|---|---|
| 1 | high | Sites | In a world made from a site template, a quick launch (Shift+Launch from the Hangar) or a script launch starts at 0°, 0°, far from the Space Center the map and the Space Center scene show. | `load-vessel` without a placement defaulted to `{ kind: 'surface' }` at (0, 0). Only the Launch screen sent the site's pad. | Fixed `c6c7a632`: the sim and the flight page default to the primary site's first working pad (`defaultLaunchSpot`). |
| 2 | high | Comms, Sol | In a Sol world the Space Center's ground station, its map marker, terrain occlusion and the comms planner were about 2,500 km from the pad (2,563 km in the test). | Stations turned with `qAboutY(omega·t)`. Sol's bodies have an IAU pole tilt and start angle, which vessels on the ground use (`bodyOrientation`). | Fixed `057d8e42` (sim `comms.ts`, web `comms-planning`). |
| 3 | high | Career, Sol | In a Sol career world 18 tech nodes never unlock: "needs the milestone orbit:stock.home". | Tech nodes named stock bodies; a Sol world records `orbit:sol.earth`. | Fixed `1ba656ad`: node milestones may say `home` and `moon` (the home body and its first moon); the stock tree uses them. |
| 4 | high | Hangar, Sol | In a Sol world the Hangar shows the stock Home's Δv target (80 km, 3,343 m/s), gravity and unpatched part stats. The Sol 1:1 orbiter reads TWR 0.26 in the Hangar and 1.36 in flight. | `VabController` loads content without the world's system (`loadContent(undefined, …)`). | Owned by plan 380 (session "Realistic part stats"). Forwarded. |
| 5 | high | Hangar, Sol | Once the Hangar loads Sol 1:1, the trip planner returns no destinations, and `this.destinations[0]!` would throw. | `ascentOf(SolEarth, 1.5 g, 110 km)` fails in Earth's air. | Owned by plan 380. Forwarded. |
| 6 | medium | Economy | Recovering an EVA suit pays 850 plus its gas, from nothing; a planted flag pays 20. Repeatable without limit. | `vesselValue` counted parts never bought. | Fixed `fba351d5`: `walk` parts and planted (hidden, `keep`) parts are worth nothing. |
| 7 | medium | Economy | The "Reuse first" strategy turns every launch into profit. A Command Pod costs 8,820 to launch and 10,500 when recovered on the pad. | Recovery ×1.25 against launch cost ×1.05. | Fixed `e9fa3d59` (D1 (b), approved by the owner). |
| 8 | medium | Economy | Fuel bought at 0.4× on the market (or mined) and recovered on the pad is paid back at the full static price. | Recovery prices contents at the static resource price. | Fixed `e15aee15` (D2 (b), approved by the owner): traded contents go to the nearest home site's storage; what does not fit is sold at today's price. |
| 9 | medium | Missions, Sol | The main mission line ("Into space", "Orbit", "To the Moon", …) never completes in a Sol world; the briefings name Home and Cinder. | Objectives hard-code `stock.home`, `stock.cinder` and 70 km. | Fixed `dfabb9bb` (D3 (a), approved by the owner): `home`/`moon`, heights over the air, names in the text; the planet missions are not offered where their bodies are missing. |
| 10 | medium | Onboarding, Sol | The first-flight tutorial accepts "passes 70 km" as orbit inside Earth's 100 km air at Sol 1:1. It says the Two-stage starter reaches orbit, which it does not in either Sol variant. | `TARGET_ORBIT = 70_000`; the tutorial runs in any non-lesson world. | Owned by plan 380 (its branch reads the world's air top and fixes the text); D3 left `tutorial.ts` to it. |
| 11 | medium | Launch, Sol | The Launch screen's Δv and downrange drops use stock part stats in a Sol world. | `content` is not reloaded per world (`launch/+page.svelte:90`). | Owned by plan 380. Forwarded. |
| 12 | medium | Content, Sol | No Library card reaches orbit at Sol 1:1 (best 8,530 m/s against about 9,400). Rescaled: Two-stage starter is 662 m/s short, Horizon-station 1,435 short. Sol's own reference rockets are never registered as blueprints. | Balance (part stats). | Owned by plan 380. Forwarded. |
| 13 | medium | Settings | The Frame rate limit applies only in Flight; the Space Center, Mission Center and Hangar draw at the display rate. | Only `flight-loop.ts` reads `loadFrameCap()`. | Fixed `46841c43`: a `FramePacer` (the governor's rule) in the three loops, following the setting. |
| 14 | medium | Settings | Brightness had no effect in the Hangar. | `VabView` never read it. | Fixed `46841c43`: `VabView.setBrightness`, applied at mount and on change. |
| 15 | medium | Settings | Settings → Time: "Pause in Map" and "Pause in Mods" never pause. | The place is `Flight` with the map open, and `/mods` is outside the world shell. | Fixed `1f7317aa` (D4 (a), approved by the owner). |
| 16 | medium | Scenarios | A scenario vessel marked `site: true` fails in a world with its own site: "unknown site legacy". No stock scenario uses it yet; mods can. | `scenarioStart` defaulted the site to `legacy`; the flight page never passed the world's. | Fixed `50b781f6`: the world's primary site, and the world's system bodies. |
| 17 | medium | Saves | The Worlds page says "Uses a mod that is no longer installed" on worlds made while Trajectories was built in. Saves load fine. | The check ignored `RETIRED_BUILTIN_MODS`. | Fixed `50b781f6`: `usesMissingMod`. |
| 18 | low–medium | Renderer | Flight from a branch site: the vessel stands on bare ground (the HQ's buildings are drawn at the HQ). The Space Center with a branch selected draws the branch's buildings on the HQ's ground. `Environment.setSite` is never called. STATUS still says the 3D view draws the HQ only. | The renderer knows one site. | Fixed `d7246ae6` (D5 (b), approved by the owner): plan 384, ADR 0321. |
| 19 | low | Sites | Debug "teleport to site" and the launch-site occupancy check used the site centre (`pads[0]`), not the pad building. | Leftover `pads[0]`. | Fixed `50b781f6`: `defaultLaunchSpot` when no pad is named. |
| 20 | low | Create World | The Space Center goes on the first non-star body orbiting a star, not the variant's declared `home`. Sol works only because it lists Earth first. | `homeBodyOf(active.bodies)`; the catalog dropped `variant.home`. | Fixed `50b781f6`: the variant's `home` wins. |
| 21 | low | Cheats | "Infinite monopropellant and EVA propellant" no longer covers the EVA jetpack or the CG-1 RCS. | It still lists `stock.eva-propellant`, renamed to `stock.cold-gas` in plan 208. | Fixed `fba351d5`. |
| 22 | low | UI | Guidance's panel (`target`), stock's Science panel (`science`), the RCS and docking staging icons, and every action-group icon drew the generic part icon. | Names missing from `ICONS`. | Fixed `46841c43`: the icons, plus a test over every name the built-in mods use. |
| 23 | low | Keys | Rebinding an EVA, Carry or Tool key to P or N reported no clash, then shadowed Pause or Mute. | Global keys clash-checked only flight, map and vab. | Fixed `46841c43`: the clash check covers every scope. Lookup is unchanged. |
| 24 | low | Content | Kronos V and Selene stack the escape tower (1.25 m node) on a small docking port (0.625 m). The Hangar flags "Size mismatch". | Blueprint vs node size. | Needs a decision (D6). |
| 25 | low | Content | Two life-support parts with the same storage are priced 4.4× apart; plane wheels cost half the rover wheels per kg. | Cost classes. | Owned by plan 380. Forwarded. |
| 26 | low | Sol text | "the Earth is 1 593 km across"; 1,593 km is the radius. | `mods/sol/src/variants.ts:14,112`. | Owned by plan 380 (touches Sol). Forwarded. |
| 27 | low | Guidance | The Ascent panel shows 80 km by default; the autopilot flies `max(80 km, air + 10 km)`, which is 110 km at Sol 1:1. | Two defaults. | Owned by plan 380. Forwarded. |
| 28 | low | Saves | A save written from R&D, Test Stand, Administration or Astronauts in a Sol world shows the vessel's altitude 993–5,771 km too high in its summary. | These pages load stock-only registries for `bodyRadius`. | Open; a clear fix, left for a follow-up. |
| 29 | low | Shell | Mission Center is a 3D page but is boxed inside the safe area, unlike Flight and the Space Center. | `IMMERSIVE` lacks `/mission-center`. | Needs a decision (D7). |
| 30 | low | Settings | `interface.panelWidth` is stored, never read; `musicForPath` checks a `/settings` route that does not exist; Mission Center's layer toggles reset on each visit. | Leftovers. | Open, cosmetic. |
| 31 | medium | Tests | The web vitest run on main failed "the trajectory snapshot" (with `CI=true`: 4 obsolete snapshots). | The plan 364 merge (`7942d09c`) brought back the four old-format keys `d7a01375` had removed; the current entries were unchanged. Not a behaviour change. | Fixed `3c5d8cc2`; no other `.snap` file has duplicates. |

## Checked and consistent

- **Comms:**
  - Station height is terrain plus mast, on the site's own body.
  - Branch stations need a comms building. Bases keep tier 1 (ADR 0229 point 4).
  - Crewed vessels act as control points. "via" routing works.
  - The station cache resets on building, site and daily ticks.
  - The snapshot's station positions are what the map draws.
- **Recovery:**
  - The refund distance is to the nearest site on the home body.
  - Off-world recovery pays 0.1×.
  - Debris parts cost 0.
- **Tour building (ADR 0314):** the refund equals what was paid and is credited only on removal. There is no net gain.
- **Contracts:** accept-then-cancel loses money (the 50 % penalty is larger than the 20 % advance).
- **Saves:**
  - The sim save chain runs 1→10, the game save is v3, the design v4.
  - The only removed part id (`stock.eva-propellant`) has a migration.
  - Every `stock.*` reference resolves.
  - Crew outfit ids are not stored.
- **Parts:** all 203 stock parts have a title, cost > 0 (except debris), mass > 0, a visual and a tech node. No tech node points at a missing part.
- **Links:** every `resolve`/`href`/`goto` target in `apps/web` exists. Every localStorage key written is read.
- **Language:** no non-English text the player sees.
- **Map filters:** every layer toggles something.
- **Leaks:** each loop and the Hangar controller remove their listeners, observers, frames and subscriptions. Site geometry is freed on rebuild.
- **Lessons:** always run in a stock world, so their stock ids are safe.

## Design questions (not implemented)

**D1. "Reuse first" pays more than the launch cost.**
- Options:
  - (a) Cap a recovery credit at what was paid for that vessel's launch.
  - (b) Let the strategy shrink only the distance loss: factor `1 − (1 − f) / 1.25`.
  - (c) Make it a floor on the recovery factor.
- Recommendation: (b). It keeps the strategy's point, cheaper far landings, and can never exceed 100 %.

**D2. Recovered contents at the static price.**
- Options:
  - (a) Pay traded resources back at today's market price.
  - (b) Return recovered contents to the site's storage, not to funds.
  - (c) Accept it as a trading feature.
- Recommendation: (b). It matches KSP-like play and the market already exists to sell them.

**D3. The stock mission line and the first-flight tutorial in Sol worlds.**
- Plan 381 (`c659c48d`) added main-line missions that also name stock bodies (`stock.ochre-flyby`, `stock.ochre-landing`, `stock.tempest-flyby`), so the scope grows. The tech tree keeps `home`/`moon`.
- Options:
  - (a) Objectives and the tutorial use `home`/`moon` and the home body's air height (+10 km). Briefing text names the bodies at run time.
  - (b) Offer the stock line and the tutorial only in the stock system; Sol gets its own line.
  - (c) Both: (a) for the mechanics, and per-system text.
- Recommendation: (a). The tech tree now uses the same aliases, so it is consistent.

**D4. "Pause in Map" and "Pause in Mods".**
- Options:
  - (a) Flight reports map-open, so the place is `Map`; drop `Mods`.
  - (b) Remove both switches.
- Recommendation: (a). The map is where players warp and plan.

**D5. Only one site in the renderer.**
- Options:
  - (a) Call `setSite` on site switch and launch. It moves the HQ's flat zone in the renderer's terrain copy.
  - (b) One site mesh per site.
  - (c) Accept it and fix the STATUS line.
- Recommendation: (b) as a plan. Branches are a feature players will fly from.

**D6. The escape tower on a small docking port (Kronos V, Selene).**
- Options:
  - (a) Give the tower a 0.625 m bottom node variant.
  - (b) Put the tower on the capsule's top (Apollo's real stack) and move the port under the cover.
  - (c) Accept the mismatch.
- Recommendation: (b).

**D7. Mission Center under the bars.**
- Options:
  - (a) Add it to `IMMERSIVE` and keep its panels clear of the bars.
  - (b) Keep the box.
- Recommendation: (a), for the same feel as the other 3D pages.

## Follow-ups (clear fixes not done here)

- Finding 28: the world's own registries for `bodyRadius` in R&D, Test Stand, Administration and Astronauts.
- Findings 4, 5, 11, 12, 25–27: plan 380.
