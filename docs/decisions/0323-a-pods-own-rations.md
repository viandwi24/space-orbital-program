# 0323 — A pod's own rations

**Status:** accepted
**Date:** 2026-10-23
**Plan:** the player-journey audit, Q2 (`docs/research/player-journey-audit.md`)
**Builds on:** ADR 0181 (life support: consumables, rates, shortages and the death rule)

## Context

With life support on (Science, Career and its variants), a crew drew consumables from the first second. The command pods carried none, and the supply parts sit in tier 4 of the tree. So a Career crew on its first orbital flight ran short at launch and was lost about 18 hours later.

Putting real supplies in the pods (4 crew-days of each consumable, about 40 kg a seat) broke 24 tests: the scripted two-stage ascent, the landers and the Sol 1:1 reference rocket all flew on margins that 40 kg erased.

## Decision

1. **Rations.** A part's modules may declare `rations(config)`, in crew-days per seat (API 0.1.117). From the vessel's launch, its crewed parts' seats times their rations, shared by the crew aboard, keep the crew: nothing is drawn and nothing runs short. Then the carried consumables are drawn as before.
2. **Before launch** (on the pad), the rations are not counting down.
3. **Stock.** Every part with `stock.command` carries `POD_RATION_DAYS` = 4 crew-days per seat. That is a full Earth day in the stock system (4 home days of 6 h). `rationDays` in the module's config changes it; 0 is none.
4. **No mass.** Rations are not a resource, so no reference vessel's mass, Δv or frozen flight moves.
5. **The snapshot.** `lifeSupport.rationsLeft` reports the seconds left, and each consumable's `timeLeft` includes them, so the HUD's countdown is right.

## Consequences

- A first orbital flight needs no supply part. A long mission still needs packs or scrubbers, as the tier-4 node intends.
- Rations follow the vessel's launch time. Leaving on EVA and boarding again does not refill them; a vessel split from another keeps its launch time.
