# Space Orbital Program

A free, moddable space-flight game that runs in your browser (the code name, in packages, file formats and storage keys, is `orbital`; ADR 0105). Build a rocket from parts in a 3D hangar, launch it, fly it to orbit and on to the Moon, plan maneuvers, save your flight, script your vessel and install mods.

**Status:** version 1.0 release candidate. The game is complete as described in [`docs/decisions/0048-v1-public-release-scope.md`](docs/decisions/0048-v1-public-release-scope.md); what is next is the foundation roadmap, announced in full on the in-game Roadmap page by phase (product, foundation, worlds and the Space Center, career, network and control, time and the real sky, a living world), without dates, and tracked in [`docs/STATUS.md`](docs/STATUS.md). It is licensed under Apache-2.0 (see [Licence](#licence)).

## How to play

Open the game, choose **New flight** and build a rocket in the hangar: pick a command pod on the left, click the glowing ring, then a fuel tank, then an engine. The first-flight guide (top left) walks you through the first launch and can be skipped. The empty hangar also offers a finished two-stage rocket that reaches orbit.

| In the hangar | In flight |
|---|---|
| Click a part, then a ring or a tank side to attach it. `X` symmetry, `Q` `E` turn, `Ctrl+Z` undo | `Z` full throttle, `X` cut, `Shift` `Ctrl` throttle, `Space` fire the next stage |
| Stages and delta-v on the right; **Launch** when the checklist is green | `W` `S` `A` `D` `Q` `E` steer, `T` stability assist (SAS), `1` to `7` SAS modes |
| `Ctrl+S` save to the library, `/` search | `M` map, click the orbit to plan a burn, `,` `.` time warp, `F5` `F9` quicksave and load |

The full list is in the game: **Settings, Controls** (or `?` in flight). A short route to orbit: full throttle, fire the first stage, climb straight up to about 10 km, tilt the nose a few degrees east, switch SAS to prograde (`2`), burn until the apoapsis is above 70 km, coast to it and burn again until the periapsis is above 70 km.

Settings (graphics quality, units, controls) are on the main menu and in the pause menu. Your designs and saves live in your browser (IndexedDB); export a save from the Load dialog to keep it elsewhere.

### Requirements

A browser (desktop, or a tablet in landscape) with WebGL 2, Web Workers and WebAssembly: Chrome or Edge 97+, Firefox 114+, Safari 16+. Tested engines and the matrix: [`docs/product/browser-support.md`](docs/product/browser-support.md). Tablets in landscape (1024 × 768 or larger) work with on-screen controls, tested in emulation only; phones are not supported (they get a notice). A graphics card from the last several years is advised; the game lowers its quality by itself if the frame rate drops (Settings, Graphics).

## How to run it from source

```sh
bun install
bun run dev        # http://localhost:5173
bun run build      # static site in apps/web/build
bun run --filter @orbital/web preview   # serve the build locally
bun test           # unit tests of the packages and mods
bun run typecheck  # tsc per package and svelte-check
bun run e2e        # Playwright in Chromium, Firefox and WebKit (bunx playwright install once)
```

Requires [Bun](https://bun.com) 1.4 or newer. To publish the build, see [`docs/architecture/hosting.md`](docs/architecture/hosting.md) (headers, Content-Security-Policy, caching); `bun --cwd apps/web scripts/serve.ts` serves it with those headers.

## How to mod

A mod is one `.orbital-mod.json` file: parts, modules, bodies and scripts written in TypeScript against the public SDK (`@orbital/sdk`). The stock game is itself a mod written the same way.

1. Read [`docs/guides/writing-a-mod.md`](docs/guides/writing-a-mod.md); the sample is in [`examples/mod-sample`](examples/mod-sample).
2. Build the package: `bun run tools/mod-build/build-mod.ts examples/mod-sample`.
3. In the game open **Mods**, choose the file (or give an address), read the trust prompt and install; reload to apply.

Mods are code with the same access as the game page: install only mods you trust. Scripts you write for a vessel run in a sandbox ([`docs/guides/scripting.md`](docs/guides/scripting.md)).

## For AI agents and contributors

Start at [`AGENTS.md`](AGENTS.md). The project is developed plan by plan (`docs/plans/`), with decisions recorded as ADRs (`docs/decisions/`) and a living status file.

## Layout

```
apps/web         SvelteKit client (the game's pages and interface)
packages/*       core, kepler, physics, sim, sdk, scripting, renderer
mods/stock       stock content, written with the public SDK
examples/        sample external mods
docs/            spec, architecture, decisions, plans, journal
```

## Licence

Licensed under the [Apache License, Version 2.0](LICENSE) (decision: [ADR 0106](docs/decisions/0106-licence-apache-2-0.md)). Contributions are accepted under the same licence. The licence grants no rights to the product name. The open-source libraries the game uses are listed with their licences on the in-game Credits page.
