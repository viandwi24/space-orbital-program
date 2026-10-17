# 0108 — After v1: announce the big roadmap, with guardrails; no Universe mode

**Status:** accepted
**Date:** 2026-10-17
**Plan:** none (owner decisions "release-scope", "universe-scope", "online-features", 2026-10-17); delivered by plan 076 (roadmap page) and the plans of the foundation roadmap (STATUS)
**Amends:** ADR 0048 (its post-v1 roadmap list; the v1 must-ship scope stands).
**Research:** `refs/reverse-engineering-ksp2/14-strengths-weaknesses-and-player-feedback.md`, `beyond/05-universe-mode.md`, `beyond/07-recommendations.md`.

## Context

Orbital 1.0 is a release candidate; what was missing was the licence (now ADR 0106). The research's reading of KSP2 is that a sequel-sized roadmap sold at full Early Access price, then not delivered, destroyed trust. It recommended shipping v1 now and adding one system per release as complete slices, with an undated roadmap labelled shipped / in progress / exploring and a free or low-barrier price while incomplete. **The owner chose to announce the big roadmap** (worlds, Space Center, economy, science, crew, comms tiers 1 to 6, Mission Center, real solar system, living world, bases) for the hype, knowing it repeats KSP2's trust risk. The research also proposed a Universe mode (a system editor, a freeze into a playable system, an n-body sandbox); **the owner decided not to do it**.

## Decision

1. **v1 scope is unchanged** (ADR 0048): 1.0 ships with the rename (ADR 0105) and the licence (ADR 0106); it does not wait for the foundation.
2. **The roadmap is announced in full** on the in-game Roadmap page and the README, organised by the phases in `docs/STATUS.md` ("Next: foundation roadmap").
3. **Guardrails** that keep the announcement honest:
   - Every roadmap item links to a plan file; the page test already refuses an item without a plan or one that shipped (plan 076 extends it to phases and labels).
   - Labels are **shipped / in progress / planned / exploring**, never dates. Later-phase items with the most risk (n-body, discovery science, comms tiers 5 and 6, bases, the living world) are labelled **exploring** until their phase starts.
   - Each system ships as a complete slice that is fun alone (ADR 0098's thin slices); no half-system is released to fill a date.
   - At the end of each phase the roadmap is reviewed; an item may move back to exploring or be dropped, with a public note on the page saying why.
   - Pricing and distribution are **not decided here**. The research's recommendation (no paid access tied to roadmap items while the systems are incomplete) is recorded as an open question for the owner in STATUS.
4. **Universe mode is not pursued.** No system editor, no n-body sandbox, no "freeze" tool. Mods still add bodies and whole star systems through `defineBody` and the system variants of ADR 0103; a system editor may be reconsidered later only through a new ADR. The per-world n-body **gravity model** (ADR 0095) is a different thing: flight in an n-body field, not a sandbox.
5. **Online**: none. Everything stays client-side (ADR 0094 point 5); achievements, replays and challenges are local files.

## Alternatives considered

- **Core v1 first, one system per release, undated roadmap, low barrier** (research recommendation) — not chosen as the announcement policy; its practices are kept as the guardrails above.
- **Announce nothing beyond v1** — rejected by the owner.
- **Universe mode (editor and freeze first)** (research recommendation, M to L) — rejected by the owner.

## Consequences

- Risk: the KSP2 trust failure (promises outpacing delivery). Recorded in STATUS known issues with the guardrails; the roadmap page is the place where delays are admitted.
- `product/spec.md` §4 gains the foundation scope, the v1 / later split and "Universe mode: not pursued".
- Plan 076 rebuilds the roadmap page around the phases; the existing items for drafts 063, 065, 066, 067, 069, 070 and 073 stay listed while those drafts exist.
