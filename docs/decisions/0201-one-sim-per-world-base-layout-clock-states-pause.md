# 0201 — One simulation per world: Base layout shell, clock states and pause rules

**Status:** accepted
**Date:** 2026-10-18
**Plan:** plans/204-world-shell-one-sim.md, plans/205-clock-states-and-pause-rules.md
**Supersedes:** ADR 0118 (each page runs its own sim from the world's save), ADR 0152 (launch into the newest save; the Astronaut Complex runs its own sim)
**Amends:** ADR 0123 Consequences (the Space Center runs the world's newest save and writes it back)
**Builds on:** ADR 0143 (worlds in the client), ADR 0171 (world tick), ADR 0050 (saves), ADR 0094 (rules)

## Context

Every in-world screen starts its own sim Worker from the newest save, the world's start info or nothing (`sim-client.ts:239-276`; research doc 05 §1). Moving between screens is a full reload (`location.assign`) or a plain link with no save first (`WorldCapsule.svelte:14`, `AppBar.svelte:61`). So time can be lost or run backwards, there is no warp or pause outside Flight, and autosave runs only while flying (every 120 s, `save/autosave.ts:13,41`). KSP stops the clock in the VAB and rebuilds each scene from the save; we want a world that keeps running. The Base layout v2 (`refs/space-orbital-program-ui-v2/docs/BASE_LAYOUT.md`) gives every in-world page one shell: time bar, menu bar and status bar. Rancangan §2 and §3.

## Decision

1. **One sim per world.** The sim Worker starts when a world is opened and stops when the player leaves to Home. Every in-world page talks to that one Worker. Navigation between them is client-side (SvelteKit `goto`); `location.assign` is removed from in-world navigation.
2. **One shared layout.** Space Center, Flight and Map, Mission Center, Hangar, Launch, Astronaut Complex, R&D, Administration, Test Stand and mod pages sit in one SvelteKit route group whose layout owns the Worker, the time bar, the menu bar and the status bar. Home, Worlds and public pages are outside it.
3. **Status bar:** world and mode, connection, location; funds, science, reputation, contracts (this absorbs draft 132's funds capsule); autosave age ("Saved 12 s ago"), mods, and a notification bell that collects events the player did not see.
4. **Clock states:** Running, Warp, Paused by player, Paused by place, Paused by tab, Background. The time bar shows a chip: `PAUSED`, `PAUSED · HANGAR`, `LOCKED`, `BACKGROUND`. **A player pause always wins:** nothing resumes the clock after the player pressed pause; only the player does.
5. **World rule "pause allowed":** yes for Sandbox, Science and Career standard; no for Career Hardcore. When it is no, the pause control is locked, the world always runs (also in the background), and warp is still allowed. The rule can be changed mid-game only toward easier (no → yes), and the change is logged (default per owner review, rancangan §15 #1; may change).
6. **Pause key:** `P` on every page; `Space` pauses only outside Flight, where it stages (default per owner review, rancangan §15 #6; may change).
7. **Pause by place** belongs to the player: Settings → Time, and a chip on the time bar. Defaults: Hangar, menus and Launch paused; Space Center, Mission Center, Map, other buildings and Flight running.
8. **Background tab:** a player setting "world keeps running while the tab is hidden", off by default. When on, the sim catches up from wall-clock time, because browsers throttle hidden tabs. When off, a hidden tab is Paused by tab.
9. **Leaving an active flight** (in atmosphere, engine burning, or in physics) asks "Stay here" or "Leave anyway", with a "Don't ask again" box that Settings can reset. A vessel left behind keeps full physics, SAS and scripts.
10. **Warp-stopping events go to the bell:** alarm, maneuver, SOI change, atmosphere entry, construction done, contract deadline, EC empty, life support critical, transfer window.
11. **Autosave** every 60 s of wall-clock time, on important events, and on leaving, tab close and tab hide. Quickload and revert roll back the whole world.
12. **Two tabs:** a second tab on the same world shows "This world is open in another tab" with Take over (a `BroadcastChannel` lock).
13. **Game closed means time stops.** Catching up to wall-clock time on reopen is deferred to P2 (default per owner review, rancangan §15 #2; may change).

## Alternatives considered

- **Keep a sim per page and save between pages** (ADR 0118, 0152) — rejected: it is the source of lost and reversed time, and it costs a sim start on every page.
- **Stop the clock outside Flight, as KSP does** — rejected: the world's construction, comms and life support run on the world tick, and the owner wants the world to keep running; places may still pause it per point 7.
- **A SharedWorker across tabs** — rejected: Safari support is uneven and a world in two tabs is an edge case; a lock is enough.

## Consequences

- ADR 0118 and 0152 are superseded: the Mission Center and the Astronaut Complex no longer start their own sim; a launch always adds a vessel to the running world.
- ADR 0123's note on the Space Center running and writing back the newest save no longer applies; construction and spending live in the one sim.
- Plan 204 delivers points 1–3, 11 and 12. Plan 205 delivers points 4–10. Plan 230 adds the rule's mid-game edit UI and the tab policy in Settings.
- Every in-world page becomes a child of one layout; pages lose their own Worker start code.
