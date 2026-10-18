---
id: 116
title: "Comms tier 2: link budget, bands, data rates, comms scale"
status: done
owner: "Agent 3"
depends: [114, 115]
phase: 7
created: 2026-10-17
updated: 2026-10-18
---

# 116 — Comms tier 2: link budget, bands, data rates, comms scale

## Goal

Links have a data rate from a link budget (transmit power, antenna gains, free-space loss, noise) mapped to a rate ladder, per band (UHF, S, X, Ka, optical); a per-world comms scale factor keeps small bodies playable; a link inspector lists every term by name.

## Context

- ADRs: 0101, [0185](../decisions/0185-comms-link-budget-bands-rate-ladder-inspector.md) (this plan)
- Read: ADR 0101 tier 2, `refs/reverse-engineering-ksp2/beyond/01-communications-network-and-radio.md` §3 Tier 2 (git-ignored); look up and record the Friis equation and band parameters in `docs/research/comms.md`.

## Scope

**In:**
- `defineBand`; antenna gain and band fields.
- Link budget and rate ladder as pure functions with tests.
- `commsScale` rule applied to distances in the budget.
- Link inspector data in the snapshot on request; inspector UI in the Comms tab.

**Out:** routing and capacity sharing (117).

## Touches

- **Size:** M
- **Edits:** `mods/stock`, `packages/sdk`, `packages/sim`, `apps/web/src/lib/hud`
- **Shared contracts:** **SDK (`defineBand`, antenna gain fields)**

## Design notes

Rate ladder steps keep numbers readable (for example 1 kbit/s to 1 Gbit/s in decades).

## Steps

1. Research and record.
2. Budget functions.
3. Bands and stock antennas.
4. Inspector.

## Acceptance criteria

- [x] `packages/core` or `mods/stock` test: the budget for a stated pair (power, gains, distance, band) equals a hand calculation within 0.1 dB.
- [x] `packages/sim` test: doubling the distance lowers the margin by 6.02 dB and steps the rate down at the stated thresholds.
- [x] vitest: the inspector lists each term with its value.
- [x] `bun test`, `bun run typecheck`, `bun run build` and `bun run docs:check` pass.

## Docs checklist

- [x] `docs/STATUS.md` updated (board row, next plan, open issues).
- [x] `docs/journal/116-comms-tier-2-link-budget.md` written.
- [x] `docs/research/comms.md`, `guides/writing-a-mod.md`.
- [x] New ADRs for decisions made here; `docs/research/` for anything looked up.

## Log

- 2026-10-17 — Created as draft from the owner's Fondasi Orbital decisions (ADR 0101).
- 2026-10-17 — `depends` gains 115 (three-agent roadmap review, `docs/roadmap/team-development-roadmap.md` "Notes for the Lead"): the link inspector UI lives in the Comms tab of plan 115.
- 2026-10-18 — Claimed by Agent 3 (`claim/116`, branch `devc/116-link-budget`).
- 2026-10-18 — ADR 0185: bands, antenna `band`/`gain`/`aperture`, station apertures, the Friis budget and rate ladder (pure core functions), the comms scale dividing the budget distance, the tier-1 rule still deciding the link, `comms-inspect` and `Snapshot.network.inspector`. Research in `docs/research/comms.md`.
- 2026-10-18 — Done here, handed over as `ready/116`:
  - **Core test:** `packages/core/test/comms-budget.test.ts` matches the hand calculation to under 0.1 dB in every term.
  - **Sim test:** `packages/sim/test/comms-budget.test.ts`: twice the distance gives −6.02 dB, and 1 Gbit/s steps to 100 Mbit/s across the 60 dB mark.
  - **Vitest:** `comms-render.test.ts` checks the inspector's 15 terms and values.
  - **Full checks:** in the journal.
- 2026-10-18 — Handover (`ready/116`):

```text
Handover: plan 116 — Comms tier 2: link budget, bands, data rates, comms scale

Agent: Agent 3 (Dev C, Linux Mint 6c/8 GB)   Branch: devc/116-link-budget
Base: origin/main @ 5f114dc (rebased 2026-10-18, after 096 and the crew-dismiss contract)
Commits:
2a62de4 docs(plan-116): journal, Log, STATUS, architecture and glossary; API_VERSION 0.1.60 (096 took 0.1.58, crew-dismiss 0.1.59); web test typings
415ee74 feat(web): the link inspector in the Comms tab: every budget term with its value, the rate, signal bars from the rate; comms-inspect while the tab is open (plan 116, ADR 0185)
2ed8282 feat(core,sdk,sim,stock): comms tier 2: bands, the Friis link budget and rate ladder per link, the comms scale in the budget, comms-inspect; API_VERSION 0.1.58 (plan 116, ADR 0185)
0d6daae docs(plan-116): claim (Agent 3)
Acceptance:
  [x] budget for a stated pair equals a hand calculation within 0.1 dB — `bun test packages/core/test/comms-budget.test.ts` — 4 pass (every term within 0.001 dB of docs/research/comms.md "Worked case")
  [x] doubling the distance lowers the margin by 6.02 dB and steps the rate down at the stated thresholds — `bun test packages/sim/test/comms-budget.test.ts` — 4 pass (2 000 vs 4 000 km: −6.02 dB, 1 Gbit/s → 100 Mbit/s across 60 dB; comms scale 2 gains 6.02 dB)
  [x] vitest: the inspector lists each term with its value — `bun run --filter @orbital/web test -- src/lib/comms` — 6 passed (15 terms rendered in the Comms tab)
  [x] bun test, typecheck, build, docs:check — see below
Checks run here: bun run test 1637 pass / 4 fail (551 s; all four load timeouts — surface-rails, scenario-orbit, heating, grouping — 34/34 pass alone) · web vitest 989 passed, 1 skipped, 4 env-only import suites (editor-options, settings, WarpControl, dock; no Node here) · typecheck exit 0 · build exit 0 · docs:check OK · e2e not run (no WebGL 2 here)
Contracts changed (from Touches): SDK — defineBand, antenna band/gain/aperture, station aperture, SignalState.rate, budget functions re-exported · also the protocol pieces the plan names ("inspector data in the snapshot on request"): command comms-inspect, Snapshot.network.vessels rate/margin, Snapshot.network.inspector (ADR 0185 point 9) · Contract requests: none
Save format / API_VERSION: save unchanged · API_VERSION patch bump 0.1.60 (096 took 0.1.58, crew-dismiss 0.1.59)
Docs: journal docs/journal/116-comms-tier-2-link-budget.md · ADR 0185 · research docs/research/comms.md · simulation.md, plugin-system.md, writing-a-mod.md, glossary · STATUS row only
Resource notes: swap used 907 MB, thermal ok, sub-workers used 0, anything left running: none
Follow-ups: new drafts none (117 takes relays, capacity, the budget as the link rule and combined antennas; the ADR lists UHF/Ka/optical parts and EC draw)
```
- 2026-10-18 — Merged by Agent 1: rebased on main (no conflicts); API_VERSION 0.1.60 set on the branch; bun test 1641 pass, web vitest 1012 pass, typecheck, build, docs:check, smoke e2e 7 passed; launch, mission-center and vessel-panel e2e pass (Chromium).
