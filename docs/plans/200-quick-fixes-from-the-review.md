---
id: 200
title: Quick fixes from the owner review
status: done
owner: "Worker B"
depends: []
phase: 7
created: 2026-10-18
updated: 2026-10-19
---

# 200 — Quick fixes from the owner review

## Goal

The small bugs the owner saw on the pad are gone. A pod counts as crewed only with crew in its seats, and a vessel with no control source shows an "Uncontrolled" chip and does not respond to throttle or staging. On the pad the situation reads "On the pad", the Orbit panel says there is no orbit yet, MET starts at liftoff, the throttle starts at 50 %, and the HUD has no duplicate or stale badges.

## Context

- rancangan §4.3b (control source bug), §7.6 and §7.6d (pad screen issues).
- Research: `refs/reverse-engineering-ksp-ksp2/15d-parts-science-crew-audit-raw.md` (B2 crew), `15b-presentation-release-audit-raw.md` §1d, `15c-navigation-audit-raw.md`.
- Evidence:
  - `packages/sim/src/comms.ts:247-252`: a pod counts as crewed because it has a seat, not because crew sit in it.
  - `apps/web/src/routes/flight/+page.svelte:773-776`: the blackout badge is drawn twice.
  - The toolbar Camera and Crew buttons are disabled with stale `title=` text (rancangan §7.6).
- ADRs: 0109 (control needs a command source). The plan applies 0109 as written; the "until plan 106" exception has expired because plan 106 is done.

## Scope

**In:**
- Pod crewed only with crew aboard; "Uncontrolled: no crew or probe core" chip; no throttle, staging or SAS input while uncontrolled (rancangan 4.3b.1–4.3b.3).
- Situation label "On the pad, ready to launch" before liftoff, then Landed or Splashed.
- Orbit panel on the ground: "On the surface, no orbit yet", with no Ap/Pe countdown.
- MET starts at liftoff; before liftoff the clock shows world time.
- "Catch up to now" only for worlds on a real calendar (Sol).
- Throttle default 50 %.
- One blackout badge.
- Toolbar Camera and Crew tooltips say what the buttons do now (Camera stays disabled until plan 226).

**Out:**
- The booster top-ring winding fix (`packages/renderer/src/parts/generators/booster.ts:14-20`): moved to plan 207, next to the geometry tests. This plan touches no renderer part generators.
- Pre-flight report (plan 218); SAS gated by pilot level (P1).

## Touches

- **Size:** M
- **Edits:** `packages/sim/src/comms.ts`, `packages/sim/src/snapshot.ts`, `apps/web/src/routes/flight/+page.svelte`, `apps/web/src/lib/hud` (`SituationBar.svelte`, `OrbitStrip.svelte`, `BlackoutBadge.svelte`, `AppBar.svelte`), `apps/web/src/lib/hud-controller.ts`, `apps/web/src/lib/flight-loop.ts`, `apps/web/src/lib/messages.ts`
- **Shared contracts:** **snapshot** (`controlled` / uncontrolled reason and a `prelaunch` situation on `VesselSnapshot`). No save change.

## Design notes

- The control check reads the crew roster for the pod's seats. Probe cores keep the comms rule from ADR 0109 (Career and Science `none`, Sandbox `full`).
- The sim refuses throttle, stage and SAS commands for an uncontrolled vessel and says why; the HUD shows the chip with text, never colour alone.
- "Pre-launch" is a sim situation, true from spawn until the first engine or decoupler event moves the vessel off the pad. MET is measured from that moment.
- Which calendars count as "real" comes from the world's system definition, not a name check.

## Steps

1. Control source: crewed check by occupancy, uncontrolled reason in the snapshot, command refusal; sim tests.
2. Uncontrolled chip and disabled throttle/stage input in the HUD.
3. Pre-launch situation and MET from liftoff; situation label and Orbit panel ground state.
4. "Catch up to now" gate, throttle default 50 %, single blackout badge, toolbar tooltips.
5. Vitest and one Chromium e2e for the pad state.

## Acceptance criteria

- [x] `bun test packages/sim` passes, including `test/control-source.test.ts`: an empty pod with no probe is uncontrolled and ignores throttle and stage; the same pod with one crew member is controlled; a probe without signal follows the world's comms rule.
- [x] `apps/web` vitest `hud/pad-state.test.ts`: from a pre-launch snapshot fixture the situation reads "On the pad", the Orbit panel shows the no-orbit text and no countdown, and MET reads 0.
- [x] `apps/web` vitest: the flight page renders one blackout badge; "Catch up to now" is hidden in a stock-system world and shown in a Sol world.
- [x] Chromium e2e `e2e/pad-state.e2e.ts`: launch an empty-pod vessel, see the "Uncontrolled" chip, press Space and the stage does not fire; the throttle reads 50 % on a crewed vessel.
- [x] `bun run check:affected --e2e e2e/pad-state.e2e.ts` passes.
- [x] CI green on the `ready/200` tag (`refs/ci/pass/<sha>`, ADR 0126).

## Docs checklist

- [x] `docs/STATUS.md` updated (board row, next plan, open issues).
- [x] `docs/journal/200-quick-fixes-from-the-review.md` written.
- [x] `docs/architecture/simulation.md` updated for the control-source rule and the pre-launch situation.
- [ ] ADR 0109 status line notes the expired exception, if the coordinator agrees. (Not done: left for the coordinator; ADR 0216 records it.)

## Log

- 2026-10-18 — Created from refs/rancangan-terpadu.md (release roadmap).
- 2026-10-18 — Booster ring winding fix moved to plan 207 on the coordinator's request.
- 2026-10-19 — Worker B. Applying ADR 0109 as written made every first pod uncontrolled (ADR 0176: no starting roster), so `load-vessel` seats crew when none is given (ADR 0216). Pre-launch is read in the web from `launchedAt` in the snapshot rather than a new sim situation field. The pad throttle (50 %) is the HUD's until the first stage sends it, so the sim's wake and warp rules stay as they are. "Catch up to now" was already gated by the system's calendar (`gregorian-utc` only in Sol); the plan adds the test. The single blackout badge is checked against the page source.
