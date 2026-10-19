# 230 — World rules and save safety

**Plan:** [plans/230-rules-and-save-safety.md](../plans/230-rules-and-save-safety.md) · **Session:** Worker C, 2026-10-20 · **ADRs:** [0230](../decisions/0230-rule-direction-revert-quickload-save-safety.md), [0111](../decisions/README.md)

## What was done

| Where | What |
|---|---|
| `packages/core` | `easier` on rule definitions (checked by the schema), `ruleChangeProblem` |
| `packages/sim` | `set-rule` refuses a harder change outside debug mode |
| `mods/stock` | `easier` on every difficulty rule; `stock.allow-revert`, `stock.allow-quickload` (off in Hardcore) |
| web | World settings (world menu and pause menu) with the changelog; "Rules changed" on the world card; Revert to the Hangar (pre-launch sim save) and the quickload gate; Settings → Saves (storage state, Export all, Import); the backup reminder; a storage request on the first world |
| tests | `packages/sim/test/rules-direction.test.ts` (3), `mods/stock/test/rule-easier.test.ts` (2), `save/backup.test.ts` (3), `e2e/rules.e2e.ts` (2) |

## What surprised me

- **There was no Revert to gate.** It is "Revert to the Hangar" now: the flight keeps `client.save()` from just before `load-vessel`.
- **The flight's menu button opens the pause menu**, not the world's system menu, so World settings is in both.
- **Several sim tests set harder rules on Career worlds** as setup (the career bot switches the economy back on): they turn Debug mode on first, which is what the rule says a player would do.
- **The hidden-tab policy** was already a clear Settings → Time entry (plan 205); nothing changed there.

## Decisions made (link ADRs)

- ADR 0230; the defaults are in the plan's Log.

## Open questions / follow-ups

- A full-profile backup also carrying settings and the achievements profile.
