# 045 — Maneuver nodes

**Plan:** plans/045-maneuver-nodes.md · **Session(s):** node session (Claude, 2026-10-17) · **Date:** 2026-10-17 · **ADRs:** [0056](../decisions/0056-maneuver-nodes.md) · **Research:** [maneuver-nodes](../research/maneuver-nodes.md)

## What was done

| Where | What |
|---|---|
| `packages/kepler` | `maneuver.ts`: `orbitalAxes`, `burnVector`/`burnComponents`, `patchedStateAt`, `predictWithManeuvers` (patched conics chained through impulsive nodes, optional absolute `target` velocity, nodes in the past reported but not applied, unreachable nodes listed) |
| `packages/core` | commands `node-set`, `node-remove`, `warp-to`; SAS mode `maneuver`; `VesselSnapshot.nodes`; event `vessel:maneuver-complete`; save format 3 (`SimSave.warpTarget`, `nodes` on every vessel) with the 2 to 3 migration; API 0.1.14 |
| `packages/sim` | `maneuver.ts` (node storage in `VesselState.nodes`, resolution, commands, completion), SAS `maneuver` on rails and in flight, `warp-to` in `step`, nodes follow the controlled half of a split vessel; fixtures `save-v2.json` (frozen before the change) and `save-v3.json` |
| `packages/scripting` | `ship.nodes`, `addNode`, `setNode`, `removeNode`, `warpTo`, `ship.sas = 'maneuver'` |
| `packages/renderer` | only the colour of the planned stretches (`MapPathSegment.planned`) |
| `apps/web` | `maneuver.ts` (burn time, burn indicator, handle drag to delta-v, picking a time on the path), `maneuver-controller.ts` (selection, drag draft, prediction, projection of node and handles, keys, warp to node), `ManeuverLayer.svelte` (node, six handles, encounter labels), `ManeuverPanel.svelte` (countdown, delta-v, burn time, warp, SAS, remove), navball marker, SAS button `8`, "Maneuver complete" toast, the sim's own warp in the snapshot message |

## How it works

A node is `{ id, time, prograde, normal, radial, target }` on the vessel in the sim. Creating or editing one asks `kepler.predictWithManeuvers` for the state at that time and stores the post-burn velocity as `target`; from then on the burn that is left is `target - pre.v`, where `pre.v` is the velocity the vessel's *current* orbit has at the node time. That is the whole burn-tracking model: coasting, it equals the plan; burning, it shrinks; a passed node under 0.5 m/s is removed. The page draws with the same kepler function from the snapshot's remaining burn, so the map and the sim agree by construction (the moon encounter test below compares them to the metre).

## What the numbers say

```
moon encounter (predicted vs sim run on rails): pe 218.632 km vs 218.632 km, entry 23625.7 s vs 23628.5 s
sas maneuver in flight: worst pointing error after 25 s 0.129 deg
finite burn 400 m/s (stock lander): 21.3 s; full throttle until 8 m/s left 20.24 s vs rocket equation 20.21 s;
  apoapsis 1758.8 km vs impulsive 1761.1 km (0.13 %); remaining at node time 207.6 m/s of 400 (centred burn)
web burn time vs Tsiolkovsky: equal within 1e-9; kepler post-burn apoapsis vs vis-viva within 1e-6
warp-to 50 000 s at 1e5x: lands within 1e-6 s of the target, about 12 s of frames
```

## In the browser (manual criterion)

A 100 km circular orbit of the stock moon lander, built from a generated game save (a temporary dev file loaded into IndexedDB; the flight page loaded it with the save loader). Clicked the orbit (top-down map camera) to put a node, dragged it along the orbit to 8:22 ahead (burn point of a 500 km miss: planned for 8:14), added 844 m/s prograde with Shift+I and I; the map drew the violet post-burn orbit entering the moon's sphere and labelled it `cinder Pe 60.0 km`. "Warp to burn" stopped 30 s before the burn start at 1x, `8` pointed the SAS at the node (error 0.0 degrees), Space and Z started the burn, the panel counted the delta-v down ("Burn now"), the throttle was cut at 10 m/s left and finished in short blips; the toast "Maneuver complete" removed the node. The flown orbit (apoapsis 11.69 Mm) showed `cinder Pe 7.00 km`: an encounter, 53 km lower than planned because the node sat 10 s late and the burn was cut by hand. Screenshots: `assets/045-map-transfer-node.png`, `045-warp-to-burn-sas.png`, `045-burn-now.png`, `045-encounter-after-burn.png`.

## What surprised me

- **Overlapping passes broke picking.** A circular orbit drawn for three periods lies over itself, so the nearest sample to the pointer could belong to any pass; dragging a node to "8 minutes" gave "40 minutes". The rule is now: of the hits within a pixel of the best, the earliest (and the planned stretch of the node being dragged must not win).
- **The remaining-burn definition has a limit.** Comparing velocities at the node time (not at the vessel's place) makes the "left" value jitter by a few m/s once the vessel is half a minute past the node: a script that burns at throttle 0.1 and tests `dv > 0` oscillated forever. The completion threshold is 0.5 m/s and the guide's script cuts at 0.4.
- **A passed node must still draw its burn.** The first version drew nothing for a node whose time had passed, so the map showed the pre-burn encounter (974 km) for the last 10 m/s. The page now draws the remaining burn as finished at the current time and keeps the marker where the node was.
- **A shared Vite dev server reloads the page when another session edits a workspace package**, which threw the flight away several times; the saved-flight loader made each retry cheap.
- **Warp state lived only in the page**: the sim drops the warp itself (SOI change, finished `warp-to`), and the HUD kept showing the old factor. The snapshot message now carries `sim.warp`.

## Decisions (ADRs)

0056.

## Open questions / follow-ups

- The prediction and the burn time are impulsive; a 40 s burn at 845 m/s moves the encounter by tens of kilometres. A finite-burn preview (apply the burn over the centred window) would be the next step; it needs thrust and mass flow in the prediction (plan 035/050 territory, not drafted).
- Several nodes are supported by the sim and the map, but the panel shows the earliest only.
- Node edits during a burn (the target is rebuilt from the remaining burn) were not exercised in the browser.
- Handles are 56 px from the node at every zoom; when the orbit is seen edge-on two handles can overlap (see the first screenshots).
- Touch input for handles is untested (the browser matrix excludes phones and tablets).

## Verification output

```
bun run test            863 pass, 0 fail (101 files)
apps/web: vitest --run  453 pass, 0 fail (54 files); bun run typecheck 0 errors; bun run build ok; bun run docs:check ok
```
