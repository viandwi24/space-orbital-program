# 204 — World shell: Base layout, one sim per world, client navigation

**Plan:** [plans/204-world-shell-one-sim.md](../plans/204-world-shell-one-sim.md) · **Session:** Worker B, 2026-10-19 · **ADRs:** [0201](../decisions/0201-one-sim-per-world-base-layout-clock-states-pause.md) (0118 and 0152 superseded, 0123 amended) · **Research:** none

## What was done

| Where | What |
|---|---|
| `apps/web/src/routes/(world)/` | the ten in-world routes moved under the group (`git mv`; imports one level deeper); `+layout.svelte` with the session, the lock, autosave and the bars |
| `lib/world-session.ts`, `lib/world-boot.ts` | the one client per world (`acquire`, `restart`, `end`), focus vessel, boot save, `collect`, `requestSave`, `saved` |
| `lib/world-lock.ts` | the `BroadcastChannel` lock (ask, held, take, release) |
| `lib/layout/` | `WorldShell.svelte` (time, menu and status bars, bell) and `status-bar.ts` (items from a snapshot, "Saved … ago", the bell feed) |
| `lib/save/autosave.ts` | 60 s; reasons `change` and `pagehide`; leaving reasons skip the minimum gap |
| `lib/flight-loop.ts` | `client` and `attach` options; it unsubscribes and leaves a shared client running on dispose |
| pages | Flight (launch into the running world, take up the focus vessel, loads in place), Space Center and Mission Center (loops take the client), R&D, Administration, Astronaut Complex, Test Stand (read the shared client); every in-world `location.assign` but the mod reload is gone |
| HUD | the funds capsule of plan 132 is the status bar's Funds cell (`data-testid="hud-funds"` kept) |
| Mission Center | Fly opens `/flight` on the same sim (no autosave hand-over) |
| e2e | `world-shell.e2e.ts`, `two-tabs.e2e.ts` |

## What surprised me

- **SvelteKit 3's typed `resolve()` takes route ids**, and a route id keeps its group: every `resolve('/flight')` had to become `resolve('/(world)/flight')` (46 call sites). The URL stays `/flight`.
- **A page's `position: fixed` root** would cover the bars; `contain: layout` on the page box makes it the containing block, so no page needed its own CSS change.
- **The refs folder `refs/space-orbital-program-ui-v2/` named in the plan does not exist** in the repository; the bars follow the v1 style guide and rancangan §2 (default per owner review).
- **The flight page reuses its component on `?load=`**, so a load from the dialog restarts the flight in place (`restartWith`) instead of navigating.

## Decisions made (link ADRs)

- ADR 0201 as written. Details kept inside it: the lock waits 250 ms for an answer before it holds; a page renders only while the tab holds the world; the layout saves before navigation leaves the group.
- Opening Flight without a launch choice takes up the focus vessel (the last flown, else the boot save's) if it is still in the world; otherwise it launches the Hangar's draft into the running world.

## Open questions / follow-ups

- Clock states, place pauses and the leave-flight warning: plan 205. Warp segments: plan 206.
- The Hangar's New · Open · Save · Launch are in the menu bar (`lib/layout/page-actions.svelte.ts`) and still in its own top bar; plan 215 (HUD layout) can drop the duplicate. Their accessible names differ from the top bar's ("New", "Go to the launch screen") because Playwright matches names by substring.
- A script left running when the player leaves Flight stops with the page (its sandbox frame belongs to the page); ADR 0201 point 9 (plan 205) keeps it running.

## Verification output

```
vitest world-session 4, autosave 5, status-bar 4, world-lock 3; web vitest 147 files, 1091 pass
svelte-check: 1855 files, 0 errors, 0 warnings
grep -rn "location.assign" apps/web/src/routes  ->  (world)/mods/+page.svelte (the mod reload) only
playwright chromium: world-shell, two-tabs, space-center, mission-center, recovery, debug: 8 passed
  the rest of the suite: 34 passed + mobile/worlds/touch 15 passed after the layout fixes
check:affected --build --e2e e2e/world-shell.e2e.ts: all passed
```

- **Tests adapted, not just rerun:** `worlds.e2e.ts` counted exactly 1 and then 2 saves; the world now also autosaves on `pagehide` and after the Space Center change, so it checks the count grows. `touch.e2e.ts` tapped 10 px below the top of a 150 px track; the track now shortens to the room the bars leave (72 to 150 px), so it taps 4 px down.
