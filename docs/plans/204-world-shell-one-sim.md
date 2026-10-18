---
id: 204
title: "World shell: Base layout, one sim per world, client navigation"
status: in-progress
owner: "Worker B"
depends: []
phase: 7
created: 2026-10-18
updated: 2026-10-19
---

# 204 — World shell: Base layout, one sim per world, client navigation

## Goal

Every in-world page (Space Center, Flight and Map, Mission Center, Hangar, Launch, Astronaut Complex, R&D, Administration, Test Stand, mod pages) sits inside one shared Base layout with the time bar, the menu bar and the status bar. One sim worker runs per world: it starts when the world opens and stops on the way back to Home, and moving between pages is client navigation that never reloads it. Funds live in the status bar, autosave runs every 60 s and on events and hide/close, and a second tab on the same world sees a "This world is open in another tab" screen.

## Context

- rancangan §2.1–2.6, §3.1, §3.8, §3.9. Layout source: `refs/space-orbital-program-ui-v2/` (`docs/BASE_LAYOUT.md`).
- Research: `refs/reverse-engineering-ksp-ksp2/01-time-scenes-and-persistence.md` (KSP rebuilds scenes; KSP2 warp bug from per-scene limits, §8); `15-orbital-today-inventory-2.md` #2.
- Evidence: each page starts its own sim and pages navigate with `location.assign`:
  - `apps/web/src/routes/flight/+page.svelte:217,232,283`;
  - `apps/web/src/routes/mission-center/+page.svelte:77,208`;
  - `apps/web/src/routes/space-center/+page.svelte:53`, `rnd/+page.svelte:39`, `administration/+page.svelte:62`, `astronauts/+page.svelte:53`, `mods/+page.svelte:27`.
- Worker and host: `apps/web/src/lib/sim-client.ts`, `apps/web/src/lib/sim-host.ts`, `apps/web/src/lib/sim.worker.ts`.
- Autosave today: every 120 s (`apps/web/src/lib/save/autosave.ts:13`), after events and on hide (`15b` §2).
- Funds capsule from plan 132: `apps/web/src/lib/hud/FundsCapsule.svelte` (absorbed into the status bar, rancangan §2.5).
- ADRs: 0201 (one simulation per world; supersedes 0118 and 0152, amends 0123), 0118, 0152, 0123.

## Scope

**In:**
- SvelteKit route group `apps/web/src/routes/(world)/` with a shared `+layout.svelte`; in-world routes move under it. Home, Worlds and public pages stay outside.
- Time bar (warp control and clock; the warp segments themselves are plan 206), menu bar (page actions slot, 🚀 🗺 🏢 🏠, ☰), status bar (world, connection, location, Funds · Science · Rep · Contracts, autosave age, mods, 🔔 bell).
- A world session store that owns the one sim client for the world; pages subscribe instead of creating their own.
- Replace every in-world `location.assign` with `goto`; loads and flights hand over through the session store, not query strings.
- Autosave every 60 s of wall time, on key events, and on `visibilitychange`/`pagehide`.
- Two-tab lock with `BroadcastChannel` and a "Take over" button.
- Hangar page actions New · Open · Save · Launch in the menu bar (rancangan §2.4).

**Out:** clock states, place pauses and the leave-flight warning (plan 205); warp segments and limits (plan 206); HUD region spec (plan 215).

## Touches

- **Size:** L
- **Edits:** `apps/web/src/routes/` (new `(world)/+layout.svelte`; move `flight`, `vab`, `space-center`, `mission-center`, `launch`, `astronauts`, `rnd`, `administration`, `test-stand`, `mods` under it), `apps/web/src/lib/layout/` (time bar, menu bar, status bar components), `apps/web/src/lib/world-session.ts` (new), `apps/web/src/lib/sim-client.ts`, `apps/web/src/lib/sim-host.ts`, `apps/web/src/lib/save/autosave.ts`, `apps/web/src/lib/save/save-controller.svelte.ts`, `apps/web/src/lib/hud/FundsCapsule.svelte` (removed), `apps/web/src/lib/hud/AppBar.svelte`, `apps/web/src/lib/worlds/enter.ts`
- **Shared contracts:** **world session store** (the single sim client; every in-world page and plans 205, 206, 214, 215, 221, 223 read it); **layout slots** (page actions, status bar items, bell feed). No save format change.

## Design notes

- The route group keeps URLs unchanged (`/flight`, `/vab`, …), so links and e2e paths keep working under the GitHub Pages base path.
- The world session store is created by the `(world)` layout's load and torn down by the layout's destroy; a page never constructs a `SimClient`.
- Pages that today build their own sim for a view (Mission Center's system scope, ADR 0118) read the shared sim's snapshot instead; ADR 0201 records this.
- Bell entries are a typed feed (source, time, text, optional action); plan 205 adds warp-stopping events to it.

## Steps

1. World session store and the `(world)` route group with an empty Base layout; move routes.
2. Pages read the shared sim client; remove per-page sim start-up.
3. Replace `location.assign` with client navigation; flight and load hand-over through the store.
4. Time bar, menu bar and status bar (funds, autosave age, bell); remove the HUD funds capsule.
5. Autosave cadence 60 s, events, hide/close.
6. Two-tab lock and "Take over".
7. Vitest and e2e.

## Acceptance criteria

- [ ] `apps/web` vitest `world-session.test.ts`: two page mounts in a row reuse one sim client; leaving to Home terminates it.
- [ ] `apps/web` vitest `save/autosave.test.ts` (extended): a 60 s timer, an event save and a `pagehide` save, with the minimum gap kept.
- [ ] `apps/web` vitest `layout/status-bar.test.ts`: funds, science and reputation from a snapshot fixture; the bell counts unread entries.
- [ ] `grep -rn "location.assign" apps/web/src/routes` returns nothing inside `(world)` except the mod reload.
- [ ] Chromium e2e `e2e/world-shell.e2e.ts`: open a world, read the world clock in Space Center, go to Hangar, Mission Center and Flight by the menu bar; the clock never goes back, the page never reloads (a `window` marker set on first load survives), and the status bar shows "Saved … ago".
- [ ] Chromium e2e `e2e/two-tabs.e2e.ts`: a second page on the same world shows "This world is open in another tab"; "Take over" moves the lock.
- [ ] Existing `e2e/space-center.e2e.ts`, `e2e/mission-center.e2e.ts` and `e2e/recovery.e2e.ts` pass unchanged (Chromium).
- [ ] `bun run check:affected --build --e2e e2e/world-shell.e2e.ts` passes.
- [ ] CI green on the `ready/204` tag (`refs/ci/pass/<sha>`, ADR 0126).

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row, next plan, open issues; plan 132's capsule noted as absorbed).
- [ ] `docs/journal/204-world-shell-one-sim.md` written.
- [ ] `docs/architecture/overview.md` updated (one sim per world, route group, session store).
- [ ] ADR 0201 linked; ADR 0118 and 0152 status lines say "superseded by 0201", ADR 0123 notes the amendment.

## Log

- 2026-10-18 — Created from refs/rancangan-terpadu.md (release roadmap).
- 2026-10-19 — Refined to ready and claimed by Worker B (`claim/204`). Checked against the code: every in-world page starts its own Worker through `startSimWorker` (flight-loop, space-center-loop, mission-center-loop, R&D, Administration, Astronaut Complex) and hands over with `location.assign`; autosave runs only in Flight (120 s). The refs folder `refs/space-orbital-program-ui-v2/` is not in the repository, so the bars follow `refs/space-orbital-program-ui/docs/STYLE.md` and rancangan §2 (default per owner review). Design: `lib/world-session.ts` holds the one client (acquire / restart / end, the focus vessel, the boot save); `lib/world-boot.ts` boots it from the newest save or the start info; `(world)/+layout.svelte` holds the lock, the autosave cadence (60 s, events, hide, pagehide, leaving the world) and `lib/layout/WorldShell.svelte` (time bar, menu bar, status bar, bell). Flight takes the session's client (`FlightOptions.client`), launches into the running world and comes back to the focus vessel (`attach`).
