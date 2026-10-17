# 023 — Release readiness

**Plan:** plans/023-release-readiness.md · **Session:** release session (Claude, 2026-10-17) · **ADR:** [0060](../decisions/0060-release-settings-onboarding-and-descriptor-hooks.md) · **Status when written:** everything is built and checked except the licence (the human's decision) and three things only a person at the machine can do (listed under "How to test manually").

## What was done

| Where | What |
|---|---|
| `apps/web/src/routes/+page.svelte`, `lib/ui/MenuShell`, `MenuButton` | Main menu over a rendered image of the game: Continue (newest save, disabled with a reason), New flight, Fly the last vessel, Load a flight, Vessel library, Mods, Settings, Roadmap, Credits |
| `lib/ui/SettingsDialog`, `lib/settings/*`, `lib/units.svelte.ts`, `format.ts`, `keybindings.ts` | Settings in the main and pause menus: graphics preset incl. Automatic, automatic quality, metric/imperial units (live, SI inside), the key list (one source with the help overlay), an honest "no sound in 1.0" row, restart of the guide |
| `lib/onboarding/tutorial.ts`, `hud/TutorialCard`, VAB and flight pages | Nine-step first-flight guide (build, launch, throttle, stage, SAS, prograde, apoapsis, map, circularise), pure step machine, skippable, persisted, restarts on a fresh pad, finishes when an orbit exists |
| `routes/roadmap`, `routes/credits`, `lib/public/*` | Roadmap from typed data (test: every plan exists and is not done), credits with licences; the game's licence reads "To be decided" |
| `+error.svelte`, `svelte:boundary`, `LoadingScreen`, `ErrorScreen`, `BrowserNotice` | Error screen with Reload and Main menu, loading screen (first paint and flight boot), failure cards on a backdrop |
| `PageMeta`, `static/*` | Title, description, Open Graph and Twitter tags on every page, own favicon (the SvelteKit one was still the Svelte logo), apple-touch icon, `social-preview.jpg` (1200x630, rendered by the game), `menu-orbit.jpg` |
| `core/schemas.ts`, `mods/stock`, `hud-model.ts`, `editor/categories.ts`, `editor/stability.ts` | API 0.1.16: `ModuleInfo.engine.throttle`, `lift`, `category`; the three web files no longer import `@orbital/mod-stock`; `mod-awareness.test.ts` runs a test mod |
| `renderer/scene.ts`, `renderer.ts`, `flight/+page.svelte` | Flight camera looks at the middle of the vessel and draws it in the middle of what the panels leave free (`setViewInsets`): the instrument deck no longer hides the lower half of the rocket |
| `scripts/serve.ts`, `lib/hosting-headers.ts`, `docs/architecture/hosting.md` | A reference server with the production CSP and headers; `E2E_HEADERS=1 bun run e2e` runs the suite against it |
| `scripts/capture-screens.ts`, `scripts/measure-load.ts`, `packages/sim/test/release-saves.tool.ts` | Tools used for the screenshots and the load numbers; the third flies the moon rocket headlessly and writes game saves (ascent, orbit, transfer, moon orbit) |
| `README.md` | How to play, run, mod, publish; the licence line |

Bug found and fixed on the way: after importing a save file in the Load dialog (and a design file in the library) the page threw `Cannot set properties of null (setting 'value')` (`currentTarget` is null after an `await`). It would have shown in the console of every player who imported a file.

## Screens and review

Screenshots (Playwright Chromium with software WebGL, so the 3D looks plainer than on a GPU): `assets/023-<screen>-1080.jpg` and `-720.jpg`, 28 screens each: menu, settings (graphics, game, controls, audio, from the pause menu), load (empty, with saves), credits, roadmap, mods, error (404), browser notice (WebGL 2 missing), VAB (empty, built, library), loading, flight (pad, ascent, 12 km save, low orbit, orbit map, moon orbit, moon-orbit map), script panel, pause, save dialog, controls overlay.

Review against `visual-direction.md`, "does it still look like a debug view?", fixed in this plan:

| Was | Now |
|---|---|
| Home page: a title and four links on black | Menu over the game's own render, wordmark, one primary action |
| Favicon: the SvelteKit logo | Own mark (SVG and PNG) |
| Flight camera: the rocket's lower half behind the instrument deck (journal 021) | Camera target is the vessel's middle and the view is centred in the free area; verified at 1080p and 720p |
| Mods page: a bare form with the browser's "Choose File" button | Same shell as the menu, own button, backdrop |
| Failure cards (no save, sim stopped) on pure black | On the loading backdrop; error screen with actions |
| The VAB's first-run welcome and the guide card stacked on each other | The guide card waits for the first part |
| Pause menu with one checkbox and three links | Same actions as the main menu (Save, Load, Settings, Controls, hangar, library, main menu) |
| Maneuver hint with key caps wrapping in a grid | Keys on one line |
| Units hard-coded in six places | One formatter |

Accepted for v1, with the reason:

- **Moon surface and the pad at 1080p** were not re-captured on a GPU in this session (the pane cannot show 1920x1080 at native size and the headless run is software-rendered); the surface looks as in journals 044 and 049. A generated landing on the moon cannot be made headlessly with the terrain on (the helper's landing logic never finishes on cratered ground), so the Moon screens are an orbit.
- **Thumbnails** of generated saves are placeholders (they are drawn from the canvas in a real session).
- **The orbit panel shows a negative periapsis** on the pad ("-598 km"): it is true and explained in the panel ("not an orbit yet").
- **Dialog backgrounds** are blurred, not dimmed to black, on purpose (the scene stays readable).
- The hangar and the pad scenery are procedural (no models); that is the visual direction's "code first, assets later".

## Earlier `[manual]` criteria re-run

| Item | Result |
|---|---|
| Warp keys `,` and `.` (journal 043 saw none) | Work: dispatched `KeyboardEvent`s in the built-in browser (1x, 2x, 5x, 2x, 1x), and a real keyboard in Playwright (`page.keyboard.press`), now a step of the smoke test in all three engines. The journal 043 failure was the browser tool's synthetic keys while the pane was hidden |
| F5 quicksave and F9 quickload | Work: F5 then F9 reloaded `?load=quick` and resumed on the pad at T+01:27 |
| Save file import | Works (a valid file is imported and listed; "Imported ..."); the export download itself (a browser file save) was not triggered to avoid writing files; it builds the same text that the import test reads back |
| Corrupt save | A file with a wrong checksum: "This save is damaged: its contents do not match..."; text that is not JSON: "This file is not valid JSON..."; `/flight?load=<unknown id>`: the card "That flight could not be loaded" |
| Native-builtin runaway script (plan 018's note) | A script allocating 50 MB: "terminated, Memory limit exceeded", the page and the sim kept running. The 500 ms watchdog on a long `indexOf` is covered by plans 018 and 030 and their tests |
| Sample ascent to orbit in real time | Not repeated (about 8 minutes per engine, `E2E_ORBIT=1`); the smoke test climbs past 1 km under the script in all three engines |
| Live governor run with the pane visible | **Not possible here** (the pane is hidden in these sessions, so its rAF does not follow the GPU, journal 039): stays on the human's list |
| Error boundary | A route that throws shows the error screen (through `+error.svelte`: "Internal Error" text from SvelteKit in a production build; the boundary in the layout renders the same screen with the real message) |

## Measurements

Apple M5, built-in pane (hidden), `NODE_ENV=development vite build` served by a small Bun server, canvas forced to 1920 x 1080 at pixel ratio 1, governor off, saves generated by `release-saves.tool.ts`. Sync ms per frame (mean of 8 frames with a read-back):

| Scene | low | medium | high |
|---|---|---|---|
| pad (T+10 s, real sun) | 7.6 | 10.2 | 12.7 |
| ascent, 12 km | 6.1 | 7.8 | 13.1 |
| low orbit (100 km) | 3.1 | 4.2 | 1.5 |
| moon orbit | 2.3 | 2.8 | 1.2 |

Budgets (journal 039, ADR 0053): `medium` 13.3 ms, `high` 16.7 ms at the scenes of journal 039: met at the pad and in the ascent. Caveats: low and medium were measured with the page's rAF loop running, high with `requestAnimationFrame` stubbed (as in journals 037 and 048), so the two orbit cells of high and medium are not comparable with each other; the throughput figure of `benchmark(8)` read 0.3 to 0.5 ms for medium and high (it does not wait for the GPU in this build) and is left out. Frame times are the M5 only: M1/M2 and Intel are not measured (the governor is the answer, ADR 0053).

Bundle (gzip, JS preloaded by the page; `scripts` read from `apps/web/build`): main menu 165 KB (it was 412 KB before `graphics.ts` read the preset table through `@orbital/renderer/presets` instead of the renderer, which pulled in Three.js); VAB 436 KB; flight 456 KB; mods 154 KB; roadmap and credits 150 KB. The sim Worker is 1 746 KB gzip (Rapier's WebAssembly inside) and the sandbox 51 KB plus 227 KB of QuickJS, fetched on the first Run. Everything the flight page downloads cold: 2.34 MB transferred (gzip, with the menu image and fonts), 6.5 MB decoded.

Budgets set by the plan: menu JS 150 KB gzip: **165 KB, not met, accepted** (SvelteKit and Svelte are about 45 KB, zod with the core validation 104 KB; the menu needs the save and mod validators); flight page under 2.5 MB gzip excluding the engines' WebAssembly: **met** (2.34 MB including them). First playable under 6 s on the M5: the page marks `orbital:flight-booted` (the sim has the vessel) and `orbital:flight-playable` (first HUD frame): 3.9 to 5.3 s and 5.0 s on the M5 in the hidden pane (warm HTTP cache, one reading of playable because frames only run when the pane draws), **9.0 to 10.4 s** in software-rendered Playwright with a cold cache (booted 6.5 to 7.8 s). The M5 live reading is the human's to confirm (below).

Menu: first contentful paint 80 to 216 ms, load event under 50 ms, 327 KB, cold cache, localhost.

## End-to-end

`E2E_HEADERS=1 bun run e2e` (the production CSP and headers), one engine at a time, `workers: 1`, against a fresh production build: Chromium 7 passed (3.2 min); Firefox 7 passed (44 s) after the suite learned to ignore one expected message (below); WebKit 6 passed and 1 flaky (the sample-script test failed once on its 60 s wait for "liftoff" and passed on retry; the same slowness was seen in journal 032). The skipped test is the 8-minute orbit run. New in the suite: main menu and settings persistence, roadmap, credits, 404 page, a mod installed from a file under the CSP, the warp keys.

Firefox logs a "blocked a JavaScript eval" console error for zod's probe (`new Function`) under a CSP without `'unsafe-eval'`; zod catches it and falls back. The e2e error watcher ignores that one message. `z.config({ jitless: true })` did not stop it (the schemas are built before any app code runs); it only appears in the console, not as a failure for players.

## Release checklist

| Item | Result | Evidence |
|---|---|---|
| Licence decided by the human | **FAIL (pending the human)** | README, Credits and `STATUS.md` say "to be decided"; no licence file exists; not chosen by an agent |
| Main menu, settings, loading, failure screens, error boundary | PASS | screenshots, e2e, manual checks above |
| Onboarding | PASS (partly by table) | 9 tests of the step machine; in the browser the guide followed build, launch, throttle, stage, SAS and prograde; the last steps (apoapsis, map, circularise) are covered by the table and by the orbit save finishing the guide |
| Mod-aware HUD, editor, stability | PASS | `mod-awareness.test.ts`, stock results unchanged |
| Page metadata and social image | PASS with a note | tags in the prerendered HTML; the image address is relative unless `VITE_SITE_URL` is set at build time (README, `architecture/hosting.md`); no host yet, so no scraper test |
| README, hosting guide | PASS | `README.md`, `docs/architecture/hosting.md` |
| Hosting headers and CSP | PASS | `scripts/serve.ts` sends them; the suite passes in three engines under them; the CSP forbids `unsafe-eval`, allows `blob:` for mods and the sandbox |
| Browser matrix | PASS | Chromium 156, Firefox 157, WebKit 27.2 (Playwright builds), `product/browser-support.md`; real Safari, Edge and older versions untested |
| Frame budgets | PASS on the M5 | table above; M1/M2/Intel unmeasured, the governor is the answer |
| Bundle and load budgets | PASS with two notes | menu 165 KB against 150 KB; first playable measured, not verified live on the M5 |
| Accessibility basics | PASS | keyboard order, visible focus, `Dialog` focus trap, tab roles with arrow keys, contrast test of the tokens (`tokens.test.ts`), `prefers-reduced-motion` in the tokens; no screen-reader test by a person |
| Known issues triaged | PASS | below |
| All repo checks | PASS | below |

Known issues triage (from `STATUS.md`):

- **v1-blocking:** the licence only.
- **Roadmap (published):** lakes and rivers, wreckage and trails, struts and wings, script targets and editor, mod models, moon shadows, half-resolution pass and M1/M2 measurements (plans 034 to 041, 050 to 053).
- **Accepted for 1.0:** debris vanishes, vessels on rails have no colliders, one rigid body per vessel, scripts are not saved, mods are trusted code, packages named `@orbital/*` are not published, phones and tablets unsupported.

## How to test manually

On a Mac with Chrome, Edge, Firefox or Safari, in the repository:

```sh
bun install
bun run build
bun --cwd apps/web scripts/serve.ts 4173      # then open http://localhost:4173
```

1. **Menu** (1 minute): the game's image behind the menu, "Continue" greyed out with "No saved flight yet". Open Settings: change Quality to Low, Units to Imperial, reload; both stay. Open Roadmap and Credits; Credits says the licence is to be decided.
2. **First flight with the guide** (5 to 10 minutes): New flight, "Load the two-stage example" (or build: pod, tank, engine), Launch. Follow the card at the top left: `Z`, `Space`, climb to 10 km, `T`, tilt east with `D` or `A` a few degrees, `2`, burn until Ap passes 70 km, `M`, coast to Ap (`.` and `,` warp), burn prograde until Pe is above 70 km. Expect: the rocket is fully visible above the instrument deck, each card changes only when you do what it says, the guide ends when the orbit is made.
3. **Save and load**: `F5` in flight, close the tab, open the page, Continue. Expect to be back where you were. Pause (`Esc`), Save the flight, Settings (change Units; numbers change at once), Controls.
4. **Frame rate on your GPU** (the part the agents could not do): with the flight page visible, open the browser console and run `performance.getEntriesByName('orbital:flight-playable')[0].startTime` after loading (expect under about 6000 ms), then fly with Settings, Quality, Automatic. Expect 60 fps at 1080p on an M1/M2; if the view slows, a toast says "Graphics adjusted".
5. **Mods**: Mods, choose a mod file. Build the sample with `bun run tools/mod-build/build-mod.ts examples/mod-sample`, then choose `examples/mod-sample/dist/sample-1.0.0.orbital-mod.json`, read the prompt, Trust and install, reload; "Sample Telemetry Beacon" appears in the hangar when you search "beacon".
6. **Import and export**: Load a flight, the download icon exports a file, "Import a save file" brings it back. Import a text file: expect a clear refusal.
7. **A real Safari** if you have one: steps 1 to 3.

## Not done / roadmap

- A licence (the human).
- Real-GPU frame times on M1/M2/Intel, the live governor run, first-playable on the M5 with a visible pane, the export download, a screen-reader pass, a phone: need a person or hardware.
- Draft plan 053 (remappable keys, audio, small screens) and the others on the roadmap page.

## Verification

`bun run test` 924 pass; web vitest 504 pass; `bun run typecheck` 0 errors (svelte-check 1442 files); `bun run build` ok; `bun run docs:check` ok; `bunx prettier --check .` clean except `.claude/launch.json` (another session's file, not touched); e2e as above. `packages/sim/test/fixtures` is now in `.prettierignore` (byte-exact frozen fixtures, unformatted since plan 045).
