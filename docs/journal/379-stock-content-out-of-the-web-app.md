# 379 — The web app's own content moves into plugins

**Plan:** [plans/379-stock-content-out-of-the-web-app.md](../plans/379-stock-content-out-of-the-web-app.md) · **Session:** Worker C, 2026-10-24 · **ADR:** [0349](../decisions/0349-loading-shots-registry.md)

## What was done: the loading shots

| Where | What |
|---|---|
| `core/loading-shots.ts`, `plugin.ts`, `registry.ts`, `sdk` | the `loadingShots` registry, `LoadingShotDefinition` and its schema, `ctx.loadingShots`, `defineLoadingShot`; API 0.1.126; the report lists them as `loading-shot` |
| `mods/stock/src/loading-shots.ts` | stock registers its ten shots with the captions that were in the app |
| `web/lib/loading-slides.ts` | `slidesOf` (order, game files from `static/loading/`, a mod's pictures from its package through object URLs, a missing picture left out) and `loadingSlides()` over the booted registries; the world layout uses it |
| tests | `core/test/loading-shots.test.ts` (a plugin registers shots, the report names them, the shape is checked), `web/lib/loading-slides.test.ts` (stock's ten in order, a mod's shot from its package, a missing one skipped) |
| guide | a section in `docs/guides/writing-a-mod.md` |

## Not done: the lessons

A lessons registry needs the lesson's types where a mod can reach them. Today a lesson is written against web-only types: `LessonObservation` (derived from the HUD model and snapshot), `VabLessonState`, the scene-setting `DebugApi` calls, the keybinding ids and the Hangar's `Content`. They (about 80 lines of types plus the step machine's contract) would move into the SDK, then the lessons' checks (pure functions of an observation) can be registered by plugins, and stock's three lesson files (`lessons-basics/-flight/-advanced.ts`, 1 100 lines, with `lesson-kit` and `lesson-vessels`) move into `mods/stock`. The gate, the guide and the tour hand-off then read the registry instead of `LESSONS`. That is the rest of the plan; the first step is the types.

Nothing yet checks, at load, that a mod's shot `image` is in its package; the screen skips it.
