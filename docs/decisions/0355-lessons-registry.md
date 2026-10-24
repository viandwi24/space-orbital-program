# 0355 — Lessons are a registry; stock owns the game's

**Status:** accepted
**Date:** 2026-10-24
**Plan:** plans/379-stock-content-out-of-the-web-app.md
**Builds on:** ADR 0293 (lessons), ADR 0311 (content comes from plugins), ADR 0316 (blueprints are baked), ADR 0349 (loading shots)

## Decision

1. **A `lessons` registry.** `ctx.lessons.register(defineLesson({...}))`, `LessonDefinition` in core, `defineLesson` in the SDK (API 0.1.128). The types a lesson is written against move to core: `LessonObservation`, `VabLessonState`, `LessonStep`, `LessonSetupCall`, `LessonPlace`, `LessonLevel`, `LessonTargets`. A step's `done` and a lesson's `goal` are pure functions of an observation; the app builds the observation from the flight, so a mod never touches the DOM or the sim.
2. **Data, not builders.** A lesson's vessel is a `VesselDesign`, and its `setup` is a list of `{ fn, args }` calls of the app's debug API (`LESSON_FOCUS` stands for the lesson vessel). The app checks `fn` when it runs the call; a name the debug API lacks stops the setup with a reason. Stock's lesson vessels are built by the Hangar editor's operations and baked into `mods/stock/src/lessons/designs.generated.ts` by `apps/web/scripts/bake-lesson-designs.ts`, like the blueprints (ADR 0316); a web test fails when the bake is stale. The numbers the lesson texts quote (low orbit, Δv to orbit) are baked with them and checked the same way.
3. **Ids.** The registry id is `<plugin>.<name>`. The game's lessons are `stock.<name>` and the app drops `stock.` (`lessonKey`), so a world's saved progress, the Lessons page's `?lesson=` links and the Space Center tour's hand-off keep their ids (`first-launch`, `docking`, …). A mod's lesson keeps its full id.
4. **The app reads the registry.** `lessons()` lists the booted plugins' lessons in registration order (stock's first); the Lessons page, the lesson gate and the Flight page use it. A lesson's blocked actions and places, the guide and the tour hand-off work as before.
5. **Out.** A lesson cannot add its own scene-setting call: the debug API stays the app's. A mod's lesson that needs a vessel ships it as a design.

## Consequences

- The last built-in content of the web app that a mod could not replace or extend is a registry; the developer tools list lessons by plugin like any other.
- Changing a lesson vessel in `lesson-vessels.ts` needs a bake, like changing a blueprint.
