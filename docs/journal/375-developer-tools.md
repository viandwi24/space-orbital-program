# 375 — Developer tools

**Plan:** [plans/375-developer-tools.md](../plans/375-developer-tools.md) · **Session:** developer tools (Claude, jovial-kilby worktree) · **Date:** 2026-10-23 · **ADRs:** 0311, 0313

## What was done

- **One shell for every developer page** (`apps/web/src/lib/dev/DevShell.svelte`, `routes/developer/+layout.svelte`):
  - Back (to Developer, or the main menu from the overview), Main menu, and the tabs Overview, Parts, Crew, Hangar, Blueprints and Mods;
  - page buttons in the bar (`devBar.actions`);
  - `/dev/parts` and `/dev/crew` moved under `/developer` and the old paths redirect, query included.
- **The loader log** (`apps/web/src/lib/mods/boot-log.ts`, `/developer/mods`):
  - `resolveMods` rejections carry a `code` (`api`, `dependency`, `duplicate`, `manifest`, `import`, `setup`, `content`, `assets`, `cycle`) and the stack of the thrown error. A setup error's stack points into the mod's own `blob:` code;
  - `evaluateMods` keeps the booted set's report and registries, and builds the log: boot order, each plugin's state and problem, counts per registry kind, patches applied or failed, warnings (registers nothing, a patch matched nothing);
  - model and portrait failures found later are added as asset problems;
  - the last boot is kept in `localStorage['orbital.modBootLog']`, with Copy and Download.
- **The viewers boot the game's plugin set** (`apps/web/src/lib/dev/dev-content.ts`):
  - "Include disabled mods" re-evaluates the store with every record on (still checking trust);
  - Parts names each part's provider and patchers, with each change (`from → to`), and filters by mod (`?mod=`);
  - `loadContent` takes a plugin list and returns the report and the registries.
- **Crew content from plugins** (ADR 0313):
  - five registries in core (`crew-look.ts`), with keyframe animations (`crewPoseAt`) and the `crew-outfit` patch target;
  - stock registers the ADR 0291 data (`mods/stock/src/crew-look.ts`);
  - the renderer keeps no crew data and draws from `crew/content.ts`, which the web layout fills (`lib/mods/crew-content.ts`);
  - outfit ids are now `stock.flight` and so on; walkers take turns through the outfits for their use; the EVA suit and pods take the last outfit registered for `eva` and `pod`;
  - image assets (PNG and WebP) in mod packages, format 3;
  - API 0.1.111;
  - `examples/mod-crew-sample` uses every piece, and `/developer/crew` lists all of it by mod.
- **The Hangar's looks** (`packages/renderer/src/vab/studio.ts`, `VabView.setLook`):
  - **Zen**: a gradient backdrop sphere, a shadow-taking floor, 1 m and 10 m grids, and three-point light. The hangar, props and walkers are hidden and the hangar's own movers stop updating;
  - one light set serves both looks (a studio fill that is dark in Normal), so a switch only changes intensities, colours, fog density and visibility;
  - both looks are warmed before the first frame: one `compile` and one offscreen draw with every object visible and culling off. They are warmed again after the signs are painted;
  - the toggle is in the world menu bar (Studio) and in the sandbox's bar, remembered per player (`orbital.vab.look`, `orbital.dev.hangar.look`).
- **The sandbox Hangar** (`/developer/hangar`): the world page's body became `lib/vab/HangarPage.svelte` (the route is a wrapper):
  - with `sandbox`: no world, no tech tree, no capacity, no roster, no tutorial or start modal, no Launch;
  - its own draft and library (IndexedDB `orbital-dev`), and the studio look by default;
  - `withPlugins` gives it the viewers' plugin set;
  - `?blueprint=` loads a blueprint.
- **The Blueprints tab** (`lib/dev/blueprint-check.ts`): every card is built against the loaded plugins and checked for missing parts, node size mismatches and the Hangar's pre-flight checks; each opens in the sandbox.
- `apps/web/scripts/capture-developer-tools.ts` takes the screenshots, optionally after installing a built package.

## What surprised me

- FNV-1a's bit 20 barely changes for short ids (`c0`…`c39` all had the same bit), so a second eye colour never showed. Eye colour now draws from a remixed hash. The old kinds keep ADR 0291's bits, so existing crew keep their looks.
- `WebGLRenderer.compile` covers every visible material but not the shadow pass's depth variants, and not the signs, whose textures arrive after the fonts load. Starting in Zen and switching to Normal built 2–3 programs until the warm-up also drew one offscreen frame with culling off, and ran again after the signs were painted. Measured in the browser: 0 programs built on a switch.
- Another session took API 0.1.110 minutes before this plan's push; the crew content moved to 0.1.111.
- The Blueprints tab found a real problem on its first run: in Kronos V + Selene the 1.25 m escape tower sits on the 0.625 m small docking port. The Hangar's own check flags it too: "Size mismatch: a 1.25 m part sits on a 0.625 m joint".

## Verification

- `bun run test` (packages, mods, examples, tools): 2 348 pass, 0 fail (after updating two tests that used format 3 as "a newer format"). `bun run typecheck`: no errors. `bun run build`: done. `bun run docs:check`: OK.
- `apps/web` vitest: 1 667 pass. The 2 failures are the script-worker timeouts and the trajectory golden snapshot, which fail the same way without this plan.
- `svelte-check`: 0 errors, 0 warnings (the sandbox worker files are generated by `build:sandbox`).
- In the browser:
  - `/developer/mods` lists `crew-sample` with its counts and patch;
  - the Crew tab shows the band outfit, the march (in use for `walk`) and the portrait image;
  - the sandbox opens Kronos V + Selene in Zen; the world Hangar switches both ways from the menu bar.
- Screenshots: shared notes `screens-375/` (8 shots).

## Open questions

- Kronos V + Selene's escape tower on the small docking port (part 3 on part 2): intended (Apollo's LES sits on the probe) or a node size to fix? Left for the part-visuals owner.
- ADR 0311's later rows (learn and mission blueprints, lessons, loading shots) are draft plan 379.
