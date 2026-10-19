# 0230 — Rules only easier during play; revert and quickload rules; save safety

**Status:** accepted
**Date:** 2026-10-20
**Plan:** plans/230-rules-and-save-safety.md
**Builds on:** ADR 0111 (rule values, `set-rule`, the changelog), ADR 0094 (worlds and presets), ADR 0201 (pause rules, tab policy), ADR 0204 (re-entry heating %), ADR 0213 (debug access)

## Context

The owner's default (rancangan §15 #1, §12.2): rules may change during play toward easier only, with a visible changelog; Career Hardcore forbids revert and quickload; saves should be hard to lose. `set-rule` had no direction, no rule told which way was easier, there was no Revert at all, and the only save safety was a quiet `navigator.storage.persist()` call on a save.

## Decision

1. **`easier` on rule definitions:** a boolean rule names its easier value, a number rule `higher` or `lower`, an enum lists its values hardest first (the schema checks the list). Core's `ruleChangeProblem(rule, from, to)` says why a change is refused.
2. **The sim enforces it:** `set-rule` toward harder is refused with the reason ("<label>: a rule can only be made easier during play"), and a rule without `easier` is fixed once the world is made, unless the world's debug tools are on (`debugAllowed`: always in Sandbox, with Debug mode in Science and Career). So scripts and the debug panel outside debug mode cannot bypass it.
3. **Stock directions:** less money pressure, fewer crew aspects, kinder comms and re-entry are easier; contracts, science depth and professions are feature switches without a direction (fixed during play).
4. **`stock.allow-revert` and `stock.allow-quickload`:** on except in Career Hardcore. **Revert to the Hangar:** the flight keeps the sim's save from just before a launch (`worldSession.revertPoint`) and Revert restarts the world from it; the pause menu shows it closed with the reason when the rule is off or the flight was not launched here. F9 quickload says why when the rule is off.
5. **World settings** (the world's menu and the flight's pause menu): every changeable rule, harder choices closed with the reason, a number bounded toward easier, and the changelog; each change autosaves and copies the changelog into the world record, whose card then says "Rules changed".
6. **Save safety:** the first world created asks the browser for persistent storage and says once if it will not; Settings → Saves shows the state and exports every world and save as one backup file (`orbital-backup-<date>.json`) that Import puts back (existing ids are kept). A reminder offers the export after the first hour of play, then every 7 days; "Remind me later" waits a day.

## Consequences

- API_VERSION gains `easier` and `ruleChangeProblem` (additive) and two stock rules.
- Tests that set a harder rule on a Career world turn Debug mode on first.
- Load from the Load dialog stays allowed in Hardcore: only the quickload is gated.
