# 379 — The web app's own content moves into plugins

**Plan:** [plans/379-stock-content-out-of-the-web-app.md](../plans/379-stock-content-out-of-the-web-app.md) · **Session:** Worker C, 2026-10-24 · **ADR:** [0349](../decisions/0349-loading-shots-registry.md), [0355](../decisions/0355-lessons-registry.md)

## What was done: the loading shots

| Where | What |
|---|---|
| `core/loading-shots.ts`, `plugin.ts`, `registry.ts`, `sdk` | the `loadingShots` registry, `LoadingShotDefinition` and its schema, `ctx.loadingShots`, `defineLoadingShot`; API 0.1.126; the report lists them as `loading-shot` |
| `mods/stock/src/loading-shots.ts` | stock registers its ten shots with the captions that were in the app |
| `web/lib/loading-slides.ts` | `slidesOf` (order, game files from `static/loading/`, a mod's pictures from its package through object URLs, a missing picture left out) and `loadingSlides()` over the booted registries; the world layout uses it |
| tests | `core/test/loading-shots.test.ts` (a plugin registers shots, the report names them, the shape is checked), `web/lib/loading-slides.test.ts` (stock's ten in order, a mod's shot from its package, a missing one skipped) |
| guide | a section in `docs/guides/writing-a-mod.md` |

## The lessons registry (second part, ADR 0355, API 0.1.128)

| Where | What |
|---|---|
| `core/lessons.ts`, `plugin.ts`, `registry.ts`, `sdk` | the `lessons` registry, `LessonDefinition` and the types it is written against (`LessonObservation`, `VabLessonState`, `LessonStep`, `LessonSetupCall`, `LessonPlace`, `LessonLevel`), `defineLesson`, `LESSON_FOCUS`; the report lists `lesson` |
| `mods/stock/src/lessons/` | the 20 lessons (basics, flight, advanced), the shared kit, and `designs.generated.ts` (the lesson vessels and the stock system's numbers, baked) |
| `apps/web/scripts/bake-lesson-designs.ts`, `onboarding/lesson-bake.ts` | the bake: the lesson vessels are still built by `lesson-vessels.ts` with the Hangar editor's operations |
| `onboarding/lessons.ts` | the observation and the step machine stay in the app; `lessons()` lists the registry (ids without `stock.`), `lessonDesign` copies a design |
| `lessons/+page.svelte`, `flight/+page.svelte`, `lesson-gate` | read the registry |
| tests | `core/test/lessons.test.ts`; `onboarding/lesson-bake.test.ts` (the bake is current, stock registers the lessons); the existing lessons and lesson-flights tests read the registry |

The lessons' `setup` and `design` are data now (the scene calls name the debug API by string; an unknown name stops the setup with a reason); the `(content) =>` builders became baked designs.

Left: the lesson texts' `{key:action}` tokens and the debug API itself stay in the app by design (ADR 0355 point 5).
