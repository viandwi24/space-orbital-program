# 344 — Lessons overhaul

**Plan:** [plans/344-lessons-overhaul.md](../plans/344-lessons-overhaul.md) · **Session:** lessons session (Claude) · **Date:** 2026-10-22 · **ADR:** 0293

## What was done

- Lesson model (`lessons.ts`): `level`, `start` (Flight, Hangar, Space Center), `design(content)`, optional `goal`, setup as data or a function of the content, `FOCUS` for the lesson vessel's id, step `targets`. One `LessonObservation` for every page (stages fired, parachutes, dock panels, autopilots, EVA, flags, science stored and credited, comms hops, robotic joints, vessel and debris counts, target and control ports, the page, the Hangar's design).
- 18 lessons in three levels (`lessons-basics.ts`, `lessons-flight.ts`, `lessons-advanced.ts`): First launch, Building in the Hangar, Orbit by hand, Maneuver nodes, Coming home, The Space Center; Ascent with the Guidance Computer, Transfer to Cinder, Landing on Cinder, EVA and a flag, Science, Comms and relays; Rendezvous, Docking by hand, Auto Dock, Driving a rover, Robotic parts, The Mission Center and debris. The plan 229 ids are kept.
- Lesson vessels (`lesson-vessels.ts`), built with the mission blueprints' `Build` (now exported): Skylark (hop), Pathfinder and its capsule ship (2.5 m booster, decoupler, service module, heat shield, parachute), Lark Lander, Kestrel chaser (small port on the pod's collar, RCS on monopropellant, radial parachutes, heat shield), Beacon Station, Wren probe, Relay One, Heron arm, a spent stage; the Aurora satellite and Trailblazer rover blueprints are reused.
- The world layout draws the lesson card off Flight (`LessonOverlay.svelte`); the Hangar feeds its design (`lessonVab`); a Hangar lesson keeps the player's draft aside. The first-flight guide stays out of a Hangar lesson.
- Lessons page grouped by level, each with "N of M done", a progress bar and check marks; the first unfinished lesson is selected.
- Fixes found in the audit: lesson vessels never lit their engines (engines ignite on staging and nodes/transfer blocked staging; the landing never staged): the setup now stages the vessel in focus. The 1.25 m port on the pod's 0.625 m collar. "Choose Add node" (a click adds it). The first-flight guide's "Launch at the bottom right", "Two-stage example" and "Ap in the strip at the bottom left". Auto Dock needs control from the port (a step now) and starts within 250 m (the lead is 200 m).

- The guide card (owner, 2026-10-22: "jelek kalau diletakan diatas panel vessel"): `GuideFrame.svelte` (compact card, minimise to a "Lesson 4/9" pill, kept in `guide-ui.svelte.ts`), `GuidePointer.svelte` (a ring round the step's `point` test id), Skip step on lesson cards. Flight places it in the bottom-left corner: under a short dock, beside a tall one, lifted above the navball module when they would meet (`updateInsets`). The Hangar and Space Center overlay sits beside the parts column and above the tool bar.

## What surprised me

- Every orbit lesson of plan 229 was unflyable as shipped: the debug placement does not stage, and the lessons either blocked or never mentioned staging.
- The Hangar's Launch moved out of the menu bar (plan 346) while this ran; the targets test is what keeps such text honest now.

## Verification output

```
vitest src/lib/onboarding/lessons.test.ts src/lib/onboarding/tutorial.test.ts src/lib/hud: 163 passed
vitest src/lib/onboarding/lesson-flights.test.ts: 6 passed
  Pathfinder ascent: done: Node executed; 84055 x 75187 m
svelte-check: 0 errors
```

## Open questions

- The comms lesson's relay geometry is not flown headless; the route through the relay depends on the antenna ranges.
