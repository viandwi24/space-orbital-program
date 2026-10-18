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
- Hangar page actions (New · Open · Save · Launch) use the layout's actions slot; the Hangar still shows them in its own top bar (the slot is in place for plan 215's HUD layout).
- A script left running when the player leaves Flight stops with the page (its sandbox frame belongs to the page); ADR 0201 point 9 (plan 205) keeps it running.

## Verification output

(filled in at completion)
