# 203 — Debug panel, cheats, set orbit/location/resources, log

**Plan:** [plans/203-debug-panel-and-cheats.md](../plans/203-debug-panel-and-cheats.md) · **Session:** Worker B, 2026-10-19 · **ADRs:** [0200](../decisions/0200-debug-panel-cheats-set-state-debug-api.md), [0213](../decisions/0213-debug-access-rule-and-debug-state-in-world-info.md) · **Research:** none (no new tool or dependency)

## What was done

| Where | What |
|---|---|
| `packages/core` | `DEBUG_CHEATS`, `DebugOrbit`, `DebugLocation`, `DebugSnapshot`; eight `debug-*` commands and their schemas; `WorldInfo.debug` (optional, format 8 unchanged); `Snapshot.debug` |
| `mods/stock/src/rules.ts` | rule `stock.debug-tools` (`always` / `opt-in` / `locked`, category `world`, not changeable) |
| `packages/sim/src/debug.ts`, `cheats.ts` | access check, Debug mode, cheats, grants, set orbit, set location (site, surface, air), set resource, temperature and crew level; cheat readers in `resources.ts`, `vessel.ts`, `comms.ts`, `life.ts`, `buildings.ts` |
| `packages/scripting` | the `debug` global, defined only with `ScriptEnvironment.debug` |
| `apps/web/src/lib/log-buffer.ts` | the in-memory log with plan 202's API (2000 entries), `captureErrors` |
| `apps/web/src/lib/debug/` | `model.ts` (log filter, copy, file name, orbit presets, sim events as log lines), `api.ts` (debug API, `window.__orbitalDebug`), `DebugPanel.svelte` (seven tabs), `world-mark.ts` |
| flight | `Alt+F12` (action `debug`, F12 with Alt held), pause-menu entry, log lines for stages, sim events, refused commands and governor changes, Debug mode handshake, the world record's mark, achievements blocked |
| Settings, Worlds | Debug mode switch (Game tab); "Used cheats" chip on the world card; a note on the achievements panel |
| e2e | `debug.e2e.ts`; helpers `debugSetOrbit`, `debugSetLocation`, `debugSetResource`, `debugCheat`, `debugAmount` in `support.ts` |

## What surprised me

- **The key table has no modifiers.** A key id is one key, so `Alt+F12` is the action `debug` on `F12` that fires only with Alt held. Plan 216 (key profiles) may give chords a proper home.
- **The sim cannot tell Hardcore from Career** without naming a stock preset, so the access became a rule (ADR 0213). It shows in Create World under "world".
- **`main` did not pass `svelte-check`** (the Pages base path typed as `string`); `main` fixed it in `a5a62671` while this plan ran, and the rebase took that fix.
- **`check:affected` runs the root Prettier config, CI's `bun run lint` also the web package's**, so the first `ready/203` failed CI on formatting that passed locally. Run `bun run lint` before tagging.
- **ADR 0212 was taken** by plan 207 on `main` in the meantime; this plan's ADR is 0213.
- **The debug API waits for the next snapshot** after an accepted command, so a test reads the new state at once. A paused sim still sends snapshots but its time does not move, so the wait gives up after 3 s.
- **"Control changes" in the log** have no sim event yet (the comms control state is derived, not evented); stages, part damage with cause, losses, mode changes, SOI changes and refused commands with their reasons are logged.

## Decisions made (link ADRs)

- ADR 0213: access as the rule `stock.debug-tools`; state in `WorldInfo.debug`; `usedCheats` set by Debug mode and by every accepted debug command, in every mode; Debug mode in Settings is a player switch that the flight hands to an `opt-in` world.
- "Unlock all tech" is a one-shot grant (`debug-grant { tech: true }`), not a switch: turning a switch off could not take research back.
- The Settings switch marks the active world at once when it is `opt-in`; the flight marks any world whose snapshot says `usedCheats`.

## Open questions / follow-ups

- Overlay tab contents are P1 (out of scope).
- `unbreakable-joints` has no reader until joints can break.
- Plan 202 should rebase onto `log-buffer.ts` and replace `captureErrors` with its global hook.

## Verification output

```
bun test packages/sim         509 pass, 0 fail (test/debug.test.ts: 12 pass)
bun test packages/core        320 pass, 0 fail
vitest debug/model.test.ts    7 pass; script-api.test.ts 4 pass; tracker, settings, worlds pass
check:affected --build --e2e e2e/debug.e2e.ts   (after the rebase onto plan 207)
  ✓ prettier ✓ docs:check ✓ typecheck (11) ✓ typecheck (web) ✓ bun test (10 workspaces)
  ✓ web vitest 697 ✓ build ✓ e2e e2e/debug.e2e.ts (chromium) 3 passed
  check-affected: all passed in 432.5 s
```
