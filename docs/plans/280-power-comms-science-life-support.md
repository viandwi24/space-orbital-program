---
id: 280
title: "Deployables break in strong airflow; the Hangar offers to replace hidden legacy parts"
status: draft
owner: ""
depends: [302, 303]
phase: 0
created: 2026-10-21
updated: 2026-10-24
---

# 280 — Deployables break in strong airflow; the Hangar offers to replace hidden legacy parts

## Goal

A deployed solar panel or antenna breaks when the airflow is too strong and stops working; retracted, it survives. A design that still uses an old stack panel, antenna or instrument shows a Hangar notice that offers the new surface-mounted part, and such designs keep loading and flying.

## Context

- Already done by plan 303 (5dc6fbb4): surface-mounted power, comms, science and container parts with their own shapes and deploy animations; the old stack parts hidden with `catalog: { hidden: true }` (`mods/stock/src/parts/power.ts`, `comms.ts`, `science.ts`).
- Already done by plan 302: `ModuleFuelCell`, `stageable` on solar panels and `ModuleAnimate`, and the `track` mode of `ModuleSolarPanel` (`mods/stock/src/solar.ts:24-27`); tests in `mods/stock/test/part-support.test.ts`.
- Not done: no break pressure exists in `mods/stock/src/solar.ts` or `modules.ts`; the Hangar has no replace notice (`apps/web/src/lib/vab/controller.svelte.ts` only filters hidden parts out of the catalogue); no test flies a frozen design with the hidden parts.
- Research: `refs/part-visuals-and-blueprints/parts-tracker.md` (PWR, COM, SCI rows).
- ADRs: 0259, 0257, 0317 (part stats checked against their counterparts), 0268 (English text).

## Scope

**In:**
- A break dynamic pressure on deployable solar panels and deployable antennas: deployed above it, the part is broken (no output, no deploy toggle) and says so in its panel; retracted, nothing happens.
- A Hangar notice on a design with hidden legacy parts, naming each and offering the new part.
- A frozen-design test.

**Out:** Deployed science (284); reactor and radiators (a later draft); new part shapes (done in 303).

## Design notes

- Dynamic pressure comes from the vessel's ambient state, as parachutes read it (`mods/stock/src/parachute.ts`). Break pressures per part follow KSP-like values; record them in the journal.
- A broken state is saved with the module state.

## Steps

1. Break rule on the solar module and on antenna deploy, with module tests.
2. The Hangar replace notice for hidden parts.
3. The frozen-design test.

## Acceptance criteria

- [ ] A deployed folding array above its break pressure breaks and stops producing (sim test); retracted, it survives.
- [ ] Old designs with stacked panels and antennas still resolve and fly (test with frozen designs).
- [ ] A web test shows the replace notice for a design with a hidden part, and none for a design without.
- [ ] `bun test`, `bun run typecheck`, `bun run build` and `bun run docs:check` pass.

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row, next plan, open issues).
- [ ] `docs/journal/280-power-comms-science-life-support.md` written.
- [ ] Affected `docs/architecture/*.md` updated to match what shipped.
- [ ] New ADRs written for any decision made here, linked above.
- [ ] `docs/research/stack-versions.md` updated for anything looked up.
- [ ] `refs/part-visuals-and-blueprints/parts-tracker.md`: status column of every tracker ID this plan delivers.

## Log

- 2026-10-24 — Rewritten by the coordinator after an audit against main @ 4c546c02: parts (303), fuel cell, staging and tracking (302) are done; this plan keeps breaking in airflow, the replace notice and the frozen-design test; depends on 302 and 303.
- 2026-10-21 — Parts delivered in plan 303: power, comms, science and containers (surface-mounted, deploy animations; old stack parts hidden). Open: breaking in airflow, the replace notice.
- 2026-10-21 — Drafted from the part-visuals research and the owner's decisions of 2026-10-21 (CTO calls delegated by the owner). Not to be started until the owner releases the parts work: on 2026-10-21 main is busy with renderer fixes and a UI/UX agent.
