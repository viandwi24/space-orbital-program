# Journal 046 — Runtime mod loading and mod manager

2026-10-17, mods session. ADR 0057, research `research/mod-loading.md`.

## What was built

- **Core** (`packages/core/src/mods.ts`, API 0.1.15): package format, `parseModPackage`, `resolveMods` (per-mod isolation by a trial `loadPlugins`), `importModBundle` (blob URL), `installModSdk`.
- **Build** (`tools/mod-build`): `Bun.build` with a plugin that replaces `@orbital/sdk` by a shim reading `globalThis[Symbol.for('orbital.mod-sdk')]`. The sample's bundle is 2.1 KB; there is one zod and one SDK in the page and in the Worker.
- **Sample** (`examples/mod-sample`, new workspace folder): a beacon part and a wide tank (own palettes), `sample.beacon` module (state in the world, counts in flight and on rails, `ping` action), `scripts/beacon.js`. Its test builds the package, reads it with `parseModPackage`, loads it through `resolveMods` + `importModBundle`, flies it on rails, saves and resumes it, and refuses the save without the mod.
- **Web** (`apps/web/src/lib/mods`): IndexedDB store (`orbital-mods`), runtime (root layout `load`, so the catalogue, the Worker start and `bootedMods()` read a finished set), `ModManager`, the `/mods` page with the trust prompt, a "Mods" link on the start page, the Worker `init` message carrying the accepted bundles, and a save message that says "installed but turned off / failed / not installed" with a link to the manager.

## Browser run (built-in browser, port 5208)

Installed from a file (a synthesized `File` through the real input; the URL path to the same prompt was also run), read the prompt (`046-trust-prompt.jpg`), confirmed, reloaded: "Running" (`046-mod-manager.jpg`). The VAB lists "Sample Telemetry Beacon" and "Sample Wide Tank" with their own icons (`046-vab-sample-parts.jpg`). A vessel with both flew on the pad (liquid fuel 600 u = 200 from the wide tank + 400 from the small one); the sample script pinged the beacon from the script panel and printed `{"beats":6,"pings":1}`, `{"beats":7,"pings":2}` (`046-flight-script.jpg`). F5 quicksaved. Disabled the mod, "Reload to apply" (`046-disable.jpg`); "Load a flight" refused with "needs mods that are not running: sample 1.0.0 (installed but turned off)..." and a link to the manager (`046-save-needs-mod.jpg`). Enabled again, reloaded and loaded: the flight resumed with the mod.

## Surprises

- vitest cannot `import()` a `blob:` URL (its transform treats it as a package) and a function built at run time has no import callback, so the web tests use a stand-in importer (`mods/fixtures.ts`); the real path is covered by `bun test` (core, sample) and the browser run.
- Bun's workspace linking is per package: the build tool needed its own `tools/mod-build/package.json` to resolve `@orbital/core` and `@orbital/sdk`.
- Adding a file under `static/` during a dev session makes Vite reload the page mid-flight; the run copied the files first.
- A vessel placed from `load-vessel` in orbit stays in flight mode for a few seconds; a warp request before that is refused (the sample test steps 5 s first).

## Found, not done

- Mod-supplied geometry/assets: draft plan 051 (ADR 0057 point 5).
- The manager's component states (prompt, list, banner) are checked in the browser and through the view model; there is no component-level test harness in the repo (vitest runs `server` only).
- Mods cannot be hot-swapped; a change needs the reload (decided, ADR 0057 point 7).

## For later plans

- Anything that reads `Stock` directly (`hud-model.ts`, `editor/categories.ts`, `stability.ts` import stock's definitions) still knows stock only: a mod engine/fin falls back to generic handling (writing-a-mod.md open items).
