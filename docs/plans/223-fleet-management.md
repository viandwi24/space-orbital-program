---
id: 223
title: "Fleet management: vessel list, recover anywhere, terminate, rename, debris"
status: draft
owner: ""
depends: [221]
phase: 7
created: 2026-10-18
updated: 2026-10-18
---

# 223 — Fleet management: vessel list, recover anywhere, terminate, rename, debris

## Goal

The Mission Center has a vessel list with type filters. From it the player can Fly any vessel, Recover a landed or splashed vessel with a value preview, Terminate a vessel, and rename it or change its type. Debris stays in the world as tracked objects up to a cap the player sets.

## Context

- rancangan §6.3 (vessel list, 9 type filters plus EVA and flag, Fly, Recover, Terminate, Rename), §6.4 (recovery value: 100 % on the pad, 98 % in the Space Center area, then falling with distance; crew and science credited), §5.11 (persistent debris with a cap).
- Research 15c §6 and §7:
  - filters today are All, Vessels, Relays, Bodies; Relays is always empty (`apps/web/src/lib/mission-center/MissionCenterOverlay.svelte:168`);
  - Fly works only for the save's focus vessel, others show `NOT_FLYABLE` (`apps/web/src/lib/mission-center/model.ts:185-186,237`);
  - recovery exists only in flight for a landed vessel at rest (`apps/web/src/routes/flight/+page.svelte:272-276,750-794`; `packages/sim/src/commands.ts:472-483`);
  - no terminate, no vessel rename;
  - debris goes on rails and is deleted at re-entry or after 10 s at rest (`packages/sim/src/modes.ts:208-230`, ADR 0021).
- Doc 12 (verified in doc 16): KSP's default debris cap is 250, as a setting.
- ADRs: 0208 (fleet management), 0113 (recovery and ledger), 0021 (debris lifecycle; this plan amends its "deleted at rest" rule), 0118 (Mission Center).
- Plan 221 makes every vessel flyable; plan 132 built the recovery dialog (`apps/web/src/lib/hud/RecoverDialog.svelte`, `apps/web/src/lib/hud/recovery-model.ts`).

## Scope

**In:**
- Vessel types: debris, probe, rover, lander, ship, station, base, plane, relay, plus EVA and flag. Stored per vessel; a default is guessed from parts.
- List view in the Mission Center with type filters, counts per filter, search and sort by name or distance.
- Actions per row: Fly (plan 221), Recover (landed or splashed only) with the value preview, Terminate (with confirm), Rename and Set type.
- Recovery factor rule: 100 % on the pad, 98 % inside the Space Center area, then falling with great-circle distance. Crew XP and stored science credit at recovery.
- `rename-vessel`, `set-vessel-type`, `terminate-vessel` commands; `recover-vessel` accepts any landed vessel, not only the focused one.
- Persistent debris: on-rails debris is kept, not deleted at rest. A cap setting (default 250) removes the oldest debris first.

**Out:** relay network filtering (comms plans own relays). Flags with plaques (EVA P1). Debris collision damage (P1).

## Touches

- **Size:** M
- **Edits:**
  - `packages/sim/src/commands.ts`, `packages/sim/src/modes.ts`, `packages/sim/src/vessel.ts`, `packages/sim/src/economy.ts`
  - `packages/core/src/protocol.ts`, `packages/core/src/save.ts`
  - `apps/web/src/lib/mission-center/model.ts`, `apps/web/src/lib/mission-center/MissionCenterOverlay.svelte`
  - `apps/web/src/lib/hud/recovery-model.ts`, `apps/web/src/lib/hud/RecoverDialog.svelte` (shared preview)
  - `apps/web/src/lib/settings/settings.ts`, `apps/web/src/lib/ui/SettingsDialog.svelte` (debris cap)
  - `apps/web/e2e/fleet.e2e.ts` (new)
- **Shared contracts:** three new commands; vessel `type` in the snapshot and save (save version bump with migration); recovery quote gains a distance line.

## Design notes

- The recovery factor is a pure function of distance from the nearest recovery site, so the Mission Center and the flight dialog show the same number.
- The debris cap is a player setting sent to the sim as a command, not a world rule. Cap 0 means "delete debris at once".

## Steps

1. Vessel type field, default guess and save migration.
2. Rename, set-type and terminate commands with tests.
3. Recovery anywhere with the distance rule; shared preview model.
4. Persistent debris and the cap.
5. Mission Center list with filters and row actions.
6. Chromium e2e.

## Acceptance criteria

E2E setup uses the plan 203 debug API (ADR 0200). This plan does not depend on 203; if 203 is not done yet, set up with `launchTwoStage` and `runScript` from `apps/web/e2e/support.ts` and record that in the Log.

- [ ] `bun test packages/sim` passes, including `test/fleet.test.ts`: recovery factor is 1.0 on the pad, 0.98 at 2 km from the pad, and lower at 200 km; rename and set-type round-trip through a save; terminate removes the vessel and its crew follow the `stock.crew-death` rule.
- [ ] Same file: 300 debris objects with cap 250 leave the 250 newest; debris at rest is no longer deleted after 10 s.
- [ ] `apps/web` vitest: the list model filters by each type and counts match.
- [ ] Chromium e2e `apps/web/e2e/fleet.e2e.ts`: in a Career world, use `debug.setLocation` (plan 203) to land a vessel 50 km from the pad; open the Mission Center; filter Probe; Recover shows a factor below 98 %; confirm; funds rise by the quoted credit. Rename another vessel and see the new name after reload.
- [ ] `bun run check:affected --build --e2e e2e/fleet.e2e.ts` passes.
- [ ] CI is green on the `ready/*` tag for this plan.

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row, next plan, open issues).
- [ ] `docs/journal/223-fleet-management.md` written.
- [ ] `docs/architecture/simulation.md` updated (vessel types, debris cap, recovery rule).
- [ ] ADR 0021 status line notes the amendment by ADR 0208.

## Log

- 2026-10-18 — Created from refs/rancangan-terpadu.md (release roadmap).
