---
id: 229
title: "Lessons: landing, maneuver nodes, rendezvous and docking, transfers"
status: draft
owner: ""
depends: [203, 222, 224]
phase: 7
created: 2026-10-18
updated: 2026-10-18
---

# 229 — Lessons: landing, maneuver nodes, rendezvous and docking, transfers

## Goal

After the first orbit, the game keeps teaching. A lesson framework extends the first-flight guide: each lesson starts from a prepared scene set by the debug set-state tools, limits what the player can do to what the lesson needs, and advances on observed state. Four lessons ship: landing, maneuver nodes, rendezvous and docking, and an interplanetary transfer.

## Context

- rancangan §11.6 (lessons after the first orbit: landing, maneuver nodes, rendezvous and docking, interplanetary transfer; topics KSP left to YouTube).
- Research:
  - 15b §1d: the first-flight guide is a nine-step pure step machine (`apps/web/src/lib/onboarding/tutorial.ts:1-5,72-150`) with a card in the VAB and flight (`apps/web/src/lib/hud/TutorialCard.svelte`); steps use the player's own keys and touch wording (`tutorial.ts:41-58`); reset in settings (`apps/web/src/lib/ui/SettingsDialog.svelte`). Tutorials past the first orbit are missing.
  - Doc 13 §6: only one lesson; no rendezvous, docking, transfer or landing lessons.
- ADRs: 0200 (debug API: set orbit, set location, set resources; lessons use it in a lesson-only mode that does not mark the save "used cheats"). No new ADR unless the scene-permission model needs one; if so, write it before Step 2.
- Plans: 203 (debug set-state), 222 (docking, needed by the rendezvous lesson), 224 (node editor, warp-to, transfer window).

## Scope

**In:**
- Lesson framework: a lesson is data (id, title, scene setup, permissions, steps). Steps reuse the `tutorial.ts` observation model.
- Scene setup through the plan 203 API, inside a throwaway lesson world so lessons never touch the player's saves.
- Scene permissions: which keys, panels and buildings are enabled (for example, no Hangar during the docking lesson). Disabled controls say why.
- A Lessons page (from the main menu and the help overlay) with progress per lesson and a restart button.
- Four lessons:
  1. **Landing:** from a 30 km suborbital arc over Cinder; suicide burn, legs, touchdown under 3 m/s.
  2. **Maneuver nodes:** from a 100 km Home orbit; add a node, type Δv, raise Ap, circularise.
  3. **Rendezvous and docking:** target vessel 2 km ahead; closest approach, match velocity, RCS approach, dock.
  4. **Transfer:** from a parking orbit; next-window view, node at the window, warp to node, burn, SOI change.
- Each lesson ends with a short debrief and a "try it in your world" hint.

**Out:** plane lessons, EVA and science lessons (P1). Voice-over.

## Touches

- **Size:** L
- **Edits:**
  - `apps/web/src/lib/onboarding/tutorial.ts` (shared step model), new lesson files in `apps/web/src/lib/onboarding/`
  - `apps/web/src/lib/hud/TutorialCard.svelte`
  - `apps/web/src/lib/flight-loop.ts`, `apps/web/src/lib/keybindings.ts` (permission gate)
  - `apps/web/src/routes/` (Lessons page), `apps/web/src/lib/settings/settings.ts` (lesson progress)
  - `apps/web/e2e/lessons.e2e.ts` (new)
- **Shared contracts:** a read-only use of the plan 203 debug API in a lesson mode; lesson progress in settings (format bump with a default).

## Design notes

- A lesson world is created with the Sandbox preset and a fixed seed, then the setup script runs. Leaving the lesson deletes nothing in the player's worlds.
- Permissions are a filter in front of key handling and panel opening, not changes to the sim.

## Steps

1. Lesson data model and the shared step machine.
2. Lesson world creation and setup through the debug API.
3. Scene permissions with reasons.
4. Lessons page and progress.
5. Landing and maneuver-node lessons.
6. Rendezvous-docking and transfer lessons.
7. Chromium e2e that drives each lesson's setup and first two steps.

## Acceptance criteria

- [ ] `apps/web` vitest: `onboarding/lessons.test.ts` runs a table of observation sequences for each lesson (advances only on its condition, never skips, completion persists, restart resets).
- [ ] `apps/web` vitest: every lesson's setup only calls debug API functions defined by plan 203.
- [ ] Chromium e2e `apps/web/e2e/lessons.e2e.ts`: from the Lessons page start each of the four lessons; the expected scene is set (altitude, orbit or target distance within 5 %); the first card shows; a blocked control shows its reason; leaving returns to the Lessons page and the Worlds list is unchanged.
- [ ] Chromium e2e: the landing lesson completes when `debug.setLocation` puts the vessel at rest on the surface.
- [ ] `[manual]` a human completes the maneuver-node lesson by the cards alone; recorded in the journal.
- [ ] `bun run check:affected --build --e2e e2e/lessons.e2e.ts` passes.
- [ ] CI is green on the `ready/*` tag for this plan.

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row, next plan, open issues).
- [ ] `docs/journal/229-lessons-past-first-orbit.md` written.
- [ ] `docs/architecture/overview.md` describes the lesson framework.
- [ ] `apps/web/src/lib/public/roadmap.ts` updated if it lists lessons as future work.

## Log

- 2026-10-18 — Created from refs/rancangan-terpadu.md (release roadmap).
