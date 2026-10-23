# 0328 — One onboarding hand-off

**Status:** accepted
**Date:** 2026-10-23
**Plan:** the player-journey audit, Q8 (`docs/research/player-journey-audit.md`, J10 and J11)
**Builds on:** ADR 0314 (the Space Center tour), ADR 0059 (the first-flight guide), ADR 0151 (missions), ADR 0293 (lessons)

## Context

A new player met three onboarding systems in no order:

- the Space Center tour, per world;
- the first-flight guide, per browser;
- Lessons, each in a practice world of its own.

The tour ended on "Build your first rocket", which left the world for a lesson. The main mission line ("First launch") never started by itself: it was offered only in Flight's Missions panel, once the player was already flying. During the tour's Hangar visit, the tour's card and the guide's card showed together. Nothing said what the chosen mode meant.

## Decision

1. **A welcome per mode.** The tour offer on a world's first Space Center visit names the mode and gives its preset's description. It then adds one line on where money and parts come from, read from the world's resolved rules (`stock.economy`, `stock.tech-tree`, `stock.agency-type`). A company is told it has no monthly budget and what pays for its launches instead. The words come from `modeWelcome` in `apps/web/src/lib/onboarding/welcome.ts`.
2. **The hand-off.** The tour's last step offers:
   - **Fly here**, the main choice. It restarts the first-flight guide if it was finished or skipped. It starts the main line's first mission once per world: the first mission on offer, only in a world that never started one (`firstMission` in `lib/missions/tracker.ts`). Then it opens the Hangar.
   - **A lesson**, which opens the Hangar lesson as before.
   - **Done**.
3. **One guide card at a time.** In the Hangar, the first-flight guide waits while the tour is active.
4. The tour card stays above the backup prompt, as it does above the Space Center's bottom strips.

## Consequences

- A player who takes the tour and flies from the world has the guide and the mission tracker on the same flight.
- Guide progress is still per browser. A second world's player who finished it gets it back only by choosing Fly here.
- A world whose player skips the tour still has the mission on offer in Flight, as before.
