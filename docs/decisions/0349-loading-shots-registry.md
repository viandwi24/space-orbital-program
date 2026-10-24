# 0349 — Loading-screen shots are a registry

**Status:** accepted
**Date:** 2026-10-24
**Plan:** plans/379-stock-content-out-of-the-web-app.md
**Builds on:** ADR 0311 (content comes from plugins, stock is one among them), ADR 0316 (blueprints, the first content to move), ADR 0313 (crew content)

## Decision

1. **A `loadingShots` registry.** `ctx.loadingShots.register({ id, caption, image, order? })` (`defineLoadingShot` in the SDK, `LoadingShotDefinition` in core). `image` is a `.webp` or `.png` path (the package-asset path rules of format 3, no `.ktx2`); `order` sorts the shots (lower first, then registration order). API 0.1.126.
2. **Where the picture is.** A shot of a game plugin (stock) is a file of the app's `static/loading/` folder under its `image` path: stock ships no asset package. A mod's shot is a picture in its package, read from the booted mod's decoded assets and shown through an object URL. A shot whose picture is missing is left out of the screen, never an error.
3. **Stock registers its ten shots** (`mods/stock/src/loading-shots.ts`) with the captions that were in `apps/web/src/lib/loading-slides.ts`; the world loading screen takes its slides from the registries of the booted plugins (`loadingSlides()`), so a mod adds shots and shows beside the game's. The tips stay in the app.
4. **Lessons are not moved by this ADR.** A lesson's observation type, its scene-setting calls (`DebugApi`) and the Hangar's state are web types a mod cannot import; a `lessons` registry needs those moved into the SDK first. They are the first step of the rest of plan 379.

## Consequences

- The loading screen is the first built-in content of the web app that a mod can extend; the developer tools list shots by plugin like any other registry.
- Nothing checks that a mod's `image` is in its package until the screen is built (it is skipped if not); a loader check can come with the lessons.
