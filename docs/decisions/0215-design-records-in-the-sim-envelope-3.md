# 0215 — Design records live on the sim's vessels; save envelope 3 seeds the focus

**Status:** accepted
**Date:** 2026-10-19
**Plan:** plans/221-vessel-switching.md
**Builds on:** ADR 0208 point 1 (every vessel keeps its design), ADR 0050 (saves)

## Context

ADR 0208 point 1 says the sim stores a design record per vessel. Plan 221's design notes put the records in the web save envelope instead, keyed by vessel id and updated by the host from split events. Two copies of the truth would drift: the sim already knows which design indices each part has (`PartState.index`), and a split only divides the parts.

## Decision

1. **The record is on the vessel:** `VesselState.design`, the launch design, copied to every piece that splits off. A record is `{ design, parts }`: the design and the indices the vessel still has (`Sim.designOf`), so no host bookkeeping is needed. The sim emits `vessel:split { parent, vessel, parentParts, parts }` for hosts that want to follow it.
2. **A vessel without a design** (a save from before plan 221) gets one **rebuilt from its parts** when it is asked for: the part ids, the attachment tree from the root and the stages. Reading never changes the world, so a resumed save stays byte for byte.
3. **Game save envelope version 3.** Loading a version 2 save writes the envelope's design into its focus vessel's record (and re-signs the sim payload), so the vessel the player flew keeps its full design; the others are rebuilt (point 2).
4. **Snapshots** carry each part's design `index`, the vessel's `nextStage` and its `controlPart`, so a HUD for any vessel needs only the record and the snapshot.

## Consequences

- Plan 222 (docking) merges and splits records the same way: a merged vessel's design is the docked pair's, an undocked side keeps its parts.
- Plan 223's vessel list reads `designOf` for names and types.
