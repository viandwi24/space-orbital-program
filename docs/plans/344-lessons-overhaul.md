---
id: 344
title: "Lessons overhaul: today's game, sensible lesson rockets, more lessons, grouped Lessons page"
status: done
owner: "lessons session (Claude)"
depends: [229, 331, 310, 318]
phase: 0
created: 2026-10-22
updated: 2026-10-22
---

# 344 — Lessons overhaul

## Goal

Every lesson matches the game as it is today, flies a rocket that looks and flies sensibly, and the lessons together teach the game from the first launch to docking: grouped by level on the Lessons page with progress.

## Context

- Owner (2026-10-22): "fixing semua lessonnya dong diperbarui, terus parts parts rocket di lesson juga dibuat lebih masuk akal, lessonnya diperbanyak biar orang tau cara memainkannya".
- Plan 229 (four lessons, flight-only, a Sandbox lesson world); plans 286/303 (mission blueprints and the `Build` helper), 285 (Library, example buttons gone), 279 (free placement), 318 (Recover/Terminate, launchpad occupied), 331/332/333 (Guidance tabs, Rendezvous), 310/330 (Auto Dock), 341 (Nova crew).
- Audit findings: the lesson pods carry a 1.25 m docking port on the pod's 0.625 m top node (size mismatch); lesson rockets lack parachutes, antennas, power and decouplers; the nodes step says "choose Add node" (a click adds it); the first-flight guide says "Launch at the bottom right" (now the menu bar, then "Launch from pad"), "the Two-stage example" (now the "Two-stage starter" card or the Library) and "Ap in the strip at the bottom left" (now the Orbit panel); the Guidance and Auto Dock panels must first be added from the Panel library.
- ADR **0293** (this plan).

## Scope

**In:**
- Lesson model: `level` (basics, flight, advanced), `start` place (flight, Hangar, Space Center), an optional world preset, `design(content)`, optional goal, per-lesson closed places, and step `targets` (keys, UI test ids, panels, commands) checked by a test.
- A wider observation: stages fired, parachutes, the page, dock panels, the running autopilot, EVA and flags, science, comms route, robotic joints, vessel count, the Hangar's build.
- The lesson card on the Hangar and Space Center pages (the world layout), the flight card unchanged.
- Lesson vessels built from today's stock parts with the editor's operations; each passes the pre-flight checks.
- Audit and fix the four lessons and the first-flight guide text.
- The guide card (first flight and lessons) in Flight's bottom-left corner, beside the dock and above the navball module where they meet; compact, with a minimise pill, Skip, and a highlight on the control a step names (owner, 2026-10-22).
- New lessons: first launch, Hangar, orbit by hand, ascent with Guidance, re-entry, Space Center, science, comms and relays, EVA and flag, rendezvous, Auto Dock, rover, robotics, Mission Center.
- Lessons page grouped by level with progress and completion marks.
- Unit tests (designs, checks, targets, step machines) and headless flights of the lesson rockets (orbit, landing, re-entry, rendezvous, docking).

**Out:** e2e (owner: skip); Career contracts as lesson goals (a lesson world stays Sandbox for the debug API; the Space Center lesson tours the buildings).

## Steps

1. ADR 0293 and this plan.
2. Lesson model, observation and lesson card outside Flight; the Hangar feed; Lessons page by level.
3. Lesson vessels (`lesson-vessels.ts`) with the mission `Build` helper; fix the four lessons and the first-flight guide.
4. New lessons, in groups (Basics, Flight, Advanced); commit and push each group.
5. Tests: designs resolve and pass checks; step targets exist; step machines; headless flights.
6. Docs: STATUS row, journal, guide; screenshots of the Lessons page.

## Acceptance criteria

- [x] Web vitest `src/lib/onboarding`: every lesson's design resolves against stock, has no error or no-go check, liftoff TWR above 1.2 where it launches from the pad; every step's keys, test ids, panels and commands exist; each lesson's run completes its steps in order.
- [x] Headless flights (`lesson-flights.test.ts`): Skylark hops past 20 km and lands under its parachute; Pathfinder reaches orbit on Guidance Ascent; the capsule deorbits and lands whole under its parachute; the Lark lander lands on Cinder on Guidance Landing; Kestrel holds within 300 m of Beacon Station on Rendezvous; Kestrel docks on Auto Dock.
- [x] Guide card bottom left, compact, minimise pill, Skip, highlight; checked at 1280×800 and 1920×1080 with the dock panel open (short and tall) and closed (screenshots).
- [x] Lessons page: groups Basics, Flight, Advanced with done counts and marks (screenshot).
- [x] `bun run typecheck`, `bun run docs:check`, `bun run build` pass.

## Docs checklist

- [x] `docs/STATUS.md` board row.
- [x] `docs/journal/344-lessons-overhaul.md`.
- [x] ADR 0293 in the index.
- [x] `docs/architecture/overview.md` Lessons section.

## Log

- 2026-10-22 — Plan written in the lessons session.
- 2026-10-22 — Done. Web vitest `src/lib/onboarding` + `src/lib/hud` + tutorial: 163 pass; `lesson-flights.test.ts`: 6 pass (Pathfinder ascent 84 × 75 km after the service module took the LV-T30: the 60 kN vacuum engine circularised at 95 × 65 km); svelte-check 0 errors. Pushed c00ebd7a (lessons) and the guide-card commit.
