# 0293 — Lessons by level, with a start place, a wider observation and checked targets

**Status:** accepted (owner's request, 2026-10-22)
**Date:** 2026-10-22
**Plan:** plans/344-lessons-overhaul.md
**Amends:** plan 229's lesson model (no ADR of its own)

## Context

Plan 229's lessons start in Flight, observe only throttle, SAS, map, orbit, nodes, target and docking, and fly hand-written four-part stacks. The game has since gained a Hangar with a Library and free placement, the Guidance Computer and Auto Dock as dock panels, science, comms routing, EVA with flags, rovers, robotics and a Mission Center. The owner asked for lessons that teach all of it, with rockets that make sense. Lesson text also went stale silently: nothing checked that a step's key, button or panel still exists.

## Decision

1. **Level.** Each lesson has `level`: `basics`, `flight` or `advanced`. The Lessons page groups by it, in that order, with each group's done count.
2. **Start place.** `start` is `flight` (default), `vab` or `space-center`. A Flight lesson flies `design(content)` and runs its debug setup as before; the others open their page with no vessel and no setup. The lesson card shows on every in-world page: Flight draws its own, the world layout draws it elsewhere. Each lesson lists the places it closes; the default closes every building but Flight.
3. **Observation.** One `LessonObservation` for every page, with defaults when a page does not know a field: the page, stages fired, a parachute open, dock panels and the open one, the running autopilot and the last one's outcome, EVA and flags planted, science run and stored, the comms route, robotic joint travel, vessel and debris counts, and the Hangar's build (parts by kind, checks clear, Library open).
4. **Goal.** Optional. Without one, the last step ends the lesson (a lesson whose goal would hold at the start, as "landed" on the pad).
5. **Targets.** A step may name `targets`: test ids, dock panel ids and sim commands it tells the player to use. A unit test checks each exists in the source (test ids), the registered panels (panels) or the command union (commands); the `{key:…}` placeholders must be actions.
6. **Lesson vessels** are built with the mission blueprints' `Build` helper over the editor's operations, so they are valid by construction, and must pass the Hangar's pre-flight checks with no error or no-go. Headless tests fly them through their goals with the same autopilots the lessons teach.

## Consequences

- Lesson progress ids of plan 229 are kept (`landing`, `nodes`, `docking`, `transfer`), so progress survives.
- A lesson world stays Sandbox: the debug API sets the scene; the Space Center lesson tours buildings instead of taking contracts.
- New UI text in a step that names a button must carry its test id, or the targets test cannot vouch for it.
