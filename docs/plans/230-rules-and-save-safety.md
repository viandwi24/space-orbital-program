---
id: 230
title: World rules and save safety
status: in-progress
owner: "Worker C"
depends: [205, 212]
phase: 7
created: 2026-10-18
updated: 2026-10-20
---

# 230 — World rules and save safety

## Goal

World rules cover the options KSP players expect, and saves are hard to lose. A world can allow or forbid revert and quickload, and sets a re-entry heating percentage at creation. Rules can be changed mid-game toward easier only, with a visible changelog. The game prompts the player to export saves, asks the browser for persistent storage, and warns when storage is not persistent. The hidden-tab policy is a clear Settings entry.

## Context

- rancangan §12.2 (allow revert, allow quickload, re-entry heating %; "pause allowed" from §3.3; rules editable mid-game with a changelog; `set-rule` exists in the sim with no UI), §12.3 (save export/import protected from browser eviction, a warning when storage is not persistent; a clear hidden-tab policy from §3.5).
- Code today:
  - `set-rule` command (`packages/core/src/protocol.ts:543`, `packages/sim/src/commands.ts:468`); the world is a frozen copy replaced after each `set-rule` (`packages/sim/src/sim.ts:177`); rule values rebuilt after a change (`packages/sim/src/snapshot.ts:210`).
  - Stock rules in `mods/stock/src/rules.ts` (economy, science, crew, comms, reliability and others); no revert, quickload or heating rule yet.
  - Revert and quickload paths in `apps/web/src/lib/save/save-controller.svelte.ts` and `apps/web/src/lib/flight-loop.ts`.
  - Export and import per save in `apps/web/src/lib/save/LoadDialog.svelte:101,189`; `requestSavePersistence()` in `apps/web/src/lib/save/store-idb.ts:112-118`.
  - World creation form: `apps/web/src/lib/worlds/CreateWorld.svelte`.
- Research 15 §5 and doc 12 (KSP difficulty options; re-entry heating % is the most used accessibility option).
- ADRs: 0111 (rule values, `set-rule` and the changelog), 0094 (worlds are saves; modes are presets over rules), 0201 (clock states and pause rules), 0204 (re-entry heating % rule from plan 212).
- Owner question: rules editable mid-game, toward easier only, and logged. Default per owner review (rancangan §15 #1); may change.
- Plans: 205 (pause-allowed rule and tab policy setting), 212 (heating % rule in the sim).

## Scope

**In:**
- Rules `stock.allow-revert` and `stock.allow-quickload` (on in Sandbox, Science and standard Career; off in Career Hardcore). The page hides or disables Revert and Quickload with the reason.
- Re-entry heating % (plan 212's rule) and pause allowed (plan 205's rule) shown in Create World.
- Each rule declares its "easier" direction. A World settings dialog lets the player change rules mid-game only toward easier; harder changes are disabled with the reason. Each change goes through `set-rule` and appears in a changelog list (time, rule, old, new).
- Worlds list and world card show "rules changed" when the changelog is not empty.
- Save safety: call `requestSavePersistence()` on first world creation; if refused or missing, show a persistent warning in Settings → Saves and a one-time toast. An export prompt after the first hour of play time and then every 7 days, with "Export now" and "Remind me later".
- Export all worlds as one file and import it back.
- Settings → Time shows the hidden-tab policy (plan 205) with a one-line explanation.

**Out:** Easy/Normal/Hard bundles, G-tolerance multiplier, plasma blackout rule (P1). Cloud sync.

## Touches

- **Size:** M
- **Edits:**
  - `mods/stock/src/rules.ts`, `packages/core/src/rules.ts` (easier direction on rule definitions)
  - `packages/sim/src/commands.ts` (reject harder `set-rule` mid-game)
  - `apps/web/src/lib/worlds/CreateWorld.svelte`, `apps/web/src/lib/worlds/world-model.ts`
  - `apps/web/src/lib/save/save-controller.svelte.ts`, `apps/web/src/lib/save/store-idb.ts`, `apps/web/src/lib/save/saves.ts`
  - `apps/web/src/lib/ui/SettingsDialog.svelte`, `apps/web/src/lib/settings/settings.ts`
  - `apps/web/e2e/rules.e2e.ts` (new)
- **Shared contracts:** an optional `easier` field on rule definitions (mod API patch bump); two new stock rules.

## Design notes

- "Easier" is declared per rule: a boolean rule names its easier value; a number rule says whether higher or lower is easier. A rule without the field cannot be changed mid-game.
- The sim enforces the direction, so scripts and the debug panel cannot bypass it outside debug mode.

## Steps

1. `easier` on rule definitions and the sim check.
2. Revert and quickload rules and their page gates.
3. Create World additions.
4. World settings dialog with the changelog.
5. Persistence request, warning and export prompt; export-all and import.
6. Tab policy entry in Settings → Time.
7. Chromium e2e.

## Acceptance criteria

- [ ] `bun test packages/sim` passes, including `test/rules-direction.test.ts`: `set-rule stock.allow-revert true` succeeds in a Hardcore world; `false` back is refused with a reason; the changelog has one entry.
- [ ] `bun test mods/stock` passes: every stock rule that the World settings dialog shows declares `easier`.
- [ ] `apps/web` vitest: the export prompt schedule (first after 1 h, then every 7 days, "later" snoozes 1 day).
- [ ] Chromium e2e `apps/web/e2e/rules.e2e.ts`: create a Career Hardcore world with heating 50 %; Revert is disabled with its reason; turn on "Allow revert" in World settings; Revert is enabled; the changelog shows the change; the harder direction is disabled.
- [ ] Chromium e2e: Settings → Saves shows the storage state; "Export all" downloads one file; importing it into a fresh profile lists the same worlds.
- [ ] `bun run check:affected --build --e2e e2e/rules.e2e.ts` passes.
- [ ] CI is green on the `ready/*` tag for this plan.

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row, next plan, open issues).
- [ ] `docs/journal/230-rules-and-save-safety.md` written.
- [ ] `docs/architecture/simulation.md` updated (rule direction).
- [ ] `docs/guides/writing-a-mod.md` updated for the `easier` field.

## Log

- 2026-10-18 — Created from refs/rancangan-terpadu.md (release roadmap).
- 2026-10-20 — Worker C refined to ready and claimed (claim/230; moved from Worker D by the coordinator). Checked against the code: `set-rule` and the changelog exist (ADR 0111); no Revert existed at all (only the words "Revert to the VAB" on the lost-vessel card), quickload is F9 and the Load dialog; `requestSavePersistence()` exists in `store-idb.ts`. ADR 0230 (0229 is taken).
- 2026-10-20 — Defaults (not asked): the sim refuses a harder change unless the world's debug tools are on (Sandbox always; Science and Career with Debug mode), so tests that set a harder rule turn Debug mode on first. Rules without `easier` (contracts, science depth, professions) are fixed once the world is made. Revert is **Revert to the Hangar**: the flight page keeps the sim's save from just before the launch and Revert restarts the world from it.
