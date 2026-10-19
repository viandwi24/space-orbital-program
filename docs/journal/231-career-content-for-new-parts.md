# 231 — Career content for the new parts

**Plan:** [plans/231-career-content-for-new-parts.md](../plans/231-career-content-for-new-parts.md) · **Session:** Worker E (Agent 3, Linux Mint, 6 CPU, 8 GB), 2026-10-19 · **ADRs:** [0231](../decisions/0231-career-content-tech-tiers-rescue-spawn-objective-view.md) (new), [0154](../decisions/0154-tech-tree-nodes-research-locks-and-pacing-by-science-yield.md), [0175](../decisions/0175-objective-trees-scheduling-vessel-binding-and-save.md), [0186](../decisions/0186-procedural-contracts-templates-offers-slots-value.md), [0194](../decisions/0194-science-dock-panel-stored-results.md)

## What was done

| Where | What |
|---|---|
| `mods/stock/src/tech.ts` | 22 nodes over tiers 0 to 5, every stock part in exactly one. Basics gains the small SRB. New nodes: Experiments, Shapes and adapters, Orbital engines, Electrics, Recovery, Surface science, Reaction control, Heavy lift, Docking, Fairings, Advanced electrics, Nuclear power. The tier 1 to 4 totals stay 25, 60, 490 and 300, so the pacing tests hold |
| `packages/core` | `ContractTemplateContext.milestones`; `ContractSpawn`, `ContractBlueprint.spawn`, `ContractOffer.spawn`/`spawned` (schema additive); `ObjectiveVesselView` gains `inclination`, `seats`, `crew`, `antenna`, `power`, `ports`, `docked`; `ObjectiveView.rescues`; panel list items may carry `actions`; `API_VERSION` 0.1.85 (235 took 0.1.84) |
| `packages/sim` | `contracts.ts`: the milestones go to the templates; a spawn is made on accept (on rails, circular, with a stranded member). `crew.ts`: `newMember` (shared with `hireCrew`) and `strandMember`. `objectives.ts`: the richer vessel view, the dock rule for `since`, and `rescues` |
| `mods/stock` | The objectives `stock.rescue`, `stock.satellite`, `stock.station` and `stock.dock`. The templates Rescue and Satellite (tier 1, after the first orbit), Station (tier 2, after the first docking) and Docking (tier 2, after the first orbit). The science panel's rows have Run, Transmit and Discard |
| `apps/web` | `dock/evaluate.ts` and `PanelView.svelte` evaluate and draw row buttons (`<list path>:<row>:<action>`); the public roadmap's Contracts and Tech tree lines |
| tests | `mods/stock/test/tech-coverage.test.ts` (3); `mods/stock/test/objectives.test.ts` (+1, the four primitives); `packages/sim/test/contracts-new.test.ts` (3); `dock/science-panel.test.ts` (+1); `e2e/career-content.e2e.ts` (2) |
| docs | ADR 0231; `simulation.md`, `plugin-system.md`, the mod guide, the glossary |

## Decisions and deviations

- **Small contract changes.** The plan said there would be no ADR, but four items needed data the models did not carry: milestones for templates, a vessel made on accept, crew and ports in the objective view, and row buttons. ADR 0231 records them. They are all additive.
- **The rescue vessel has no contract tag.** It is a normal vessel named "Stranded pod". The offer keeps `spawned: { vessel, member }`, and the objective view reads the member from there. Tracking and Fleet list it like any vessel.
- **The stranded member** is made like a hire, but free and past the roster cap. Boarding takes the plan 225 rules: a hatch within 2 m, or 50 m with `stock.eva-board-assist`. The sim test turns the assist on.
- **A station from before the contract counts.** `since` drops older vessels, so a station launched before a docking contract would never be seen. A vessel now counts once a newer vessel docked to it.
- **Docking waits for the first landing on Cinder** (tier 4), after Reaction control (tier 3). The Docking contract waits only for the first orbit, so its offer can come before the parts. The player can research towards it, or decline it.
- **The starter craft already carries a parachute** (plan 209). Step 5 was a check that Basics keeps it.
- **No milestone setter in the debug API.** The e2e gets `orbit:stock.home` the honest way: it launches, puts the vessel in orbit with `setOrbit`, and warps 20 days with `send(warp-to)`.
- **Debug mode reaches an opt-in world from Flight** (ADR 0213 point 5). The e2e therefore launches before it calls `grant`.

## Verification

- `bun test mods/stock`: the tech, coverage and objective tests pass. The patch benchmark is flaky under load on this machine.
- `bun test packages/sim`: `contracts-new.test.ts` 3 pass. The related suites (contracts, objectives, crew, EVA, tech, milestones) are 36 pass.
- Web vitest: `dock/science-panel.test.ts` 4 pass; `public/roadmap.test.ts` 7 pass.
- Chromium e2e `career-content.e2e.ts`: every assertion passes on the system Chromium. The `/favicon.ico` 404 is this browser's own; the bundled CI Chromium does not log it.
- `check:affected --build`: prettier, docs, typecheck and 1814/1815 tests pass. The one failure is the world-tick benchmark under load, which passes alone at 0.47 ms against 0.5 ms. CI runs the full suite on `ready/231`.
