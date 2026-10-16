# 009 — Web client MVP: build, launch, orbit

**Plan:** plans/009-web-client-mvp.md · **Session:** web session (Claude, 2026-10-16) · **Date:** 2026-10-16

## What was done

The draft was refined to `ready` at the human's request (research in `research/web-client.md`), then implemented. No scaffolding commands beyond `bun add '@orbital/physics@workspace:*' '@orbital/kepler@workspace:*'` in `apps/web` (the worker creates the Rapier backend; the dev autopilot uses kepler's vector helpers).

| File (`apps/web/src/lib` unless noted) | Contents |
|---|---|
| `messages.ts` | Worker protocol: `command`/`dispose` to the worker; `ready` (plugin ids, parts, bodies, resources), `snapshot`, `result`, `error` back; shallow runtime parsers |
| `sim-host.ts`, `sim.worker.ts` | Worker-side host (clock, `sim.step`, command answers, snapshot per tick at about 60 Hz, wall delta clamped to 0.1 s); the worker file is a 20-line shell around `createSim({ plugins: [Stock], backendFactory: createRapierBackend({ solverIterations: 16 }) })` |
| `sim-client.ts` | Main-thread client over a `WorkerLike`: `ready`, `dispatch -> Promise<CommandResult>`, `onSnapshot`, `onError`, `dispose`; `startSimWorker()` uses `new Worker(new URL('./sim.worker.ts', import.meta.url), { type: 'module' })` |
| `design.ts`, `catalog.ts`, `storage.ts` | Pure design editing and JSON (de)serialisation (zod shape + `resolveVesselDesign`), main-thread plugin load for the VAB palette, `localStorage` hand-off |
| `flight-loop.ts` | rAF loop, renderer, keyboard (Shift/Ctrl, Z/X, WASDQE, Space, M, `,` `.`), pointer camera, 10 Hz HUD copy, dev debug hook |
| `telemetry.ts` | altitude, speed, apoapsis, periapsis from a snapshot |
| `autopilot.ts` | dev-only ascent autopilot (see below) |
| `routes/vab`, `routes/flight`, `routes/+page.svelte` | Svelte chrome; `+page.ts` with `ssr = false` per canvas page |
| `packages/renderer/src/scene.ts` | flight camera "up" is radial (see below) |

## Manual run (acceptance criterion `[manual]`)

Built-in browser (`mcp__Claude_Browser__*`), dev server from `bun run dev` (`.claude/launch.json` entry `web-dev`, `bun run --filter @orbital/web dev`). Steps done through the real UI: `/vab` Place root, six Attach clicks (part, attach-to, nodes pickers), stage selects (lower engine in stage 1, decoupler and upper engine in stage 2), Launch; `/flight`: keys `Z` and `Space` (verified by hand: throttle 100 %, stage 1 fired, the vessel lifted off), then **autopilot `P`**, `M` for map view. Screenshots (canvas capture plus a text HUD overlay drawn by the dev debug hook): `assets/009-vab.png` (browser screenshot of the VAB), `assets/009-flight-ascent.png`, `assets/009-flight-orbit.png`, `assets/009-map-orbit.png`.

**Autopilot, stated explicitly:** hand-flying was not feasible: the stack needs closed-loop attitude control through a reaction wheel for 200 s and each browser tool call takes seconds. I therefore added a dev-only autopilot (`P`, compiled out of production builds by `import.meta.env.DEV` and loaded with a dynamic import), a port of the scripted ascent used by the plan 007 exit test. It sends the same `throttle`/`attitude`/`stage` commands through the same `dispatch` path as the keyboard. Build, launch, first stage, map view were all done by the UI/keyboard; the pitch program, the second `stage` and the circularisation burn were the autopilot's.

Results (two complete runs from the VAB on the final code, real time, no warp):

```
run 2: T+0 liftoff · staged at about T+60 · cut at 80 km apoapsis · circularise from about T+170
       T+221 s on rails: periapsis 76.03 km, apoapsis 271.48 km, speed 2394 m/s  (criterion: periapsis > 70 km)
map view: orbit line (Line2, light blue ellipse) and two markers (vessel and debris) drawn; the line is occluded by the planet sphere where it passes behind it
```

Apoapsis is 271 km, not the 137 km of the headless exit test: same scripted logic, but after plan 011 (compound bodies) landed in the tree and with wall-clock scheduling the circularisation burn starts later or lasts longer. Not investigated (the criterion is periapsis > 70 km); it is a hint for plan 010 that scripts reading snapshots at about 60 Hz see 16 ms jitter.

Warp from the keyboard was exercised: `.` is refused with "time warp needs every vessel on rails; in flight: 8 (\"Untitled vessel (debris)\")" because the discarded stage stays in flight (periapsis in the atmosphere), still after 2.5 simulated minutes. The refusal text reaches the HUD. This blocks warp after any normal launch: draft plan 013.

## Surprises

- **Entity id 0 is falsy.** The first vessel has id 0 and `if (!vessel)` hid all telemetry. Compare with `=== null`.
- **The pad is not at the pole.** The renderer's flight camera had +Y up, so the vessel (stack axis radial, +X at lat 0 lon 0) lay on its side. Fix in `SceneModel.placeCamera`: in flight view the camera `up` is the radial direction of the active vessel and the rig offset is rotated accordingly; the map keeps +Y (test added, `packages/renderer/test/scene.test.ts`). This is the only renderer change.
- **Real-GL check of the renderer:** `WebGLRenderer` with the logarithmic depth buffer, `Line2` orbit line and the marker sizing (1.2 % of camera distance) worked first time in Chromium (the browser pane). No other renderer fix was needed. `canvas.toDataURL()` right after `render()` in the same task works without `preserveDrawingBuffer`.
- **Rapier compat in a module worker works** (the wasm is embedded in `rapier.mjs`; the production build emits one 4.3 MB worker chunk, `build/_app/immutable/workers/sim.worker-*.js`). Vite 8 accepted the `new URL(..., import.meta.url)` form in dev and build with the default worker format.
- **Vite HMR reloads the page when a workspace package changes** (`packages/sim` was being edited by the parallel session during the run), which reset the flight twice. For the final runs I used a temporary vite config that ignores `packages/**` and `mods/**` for watching (not committed; it is the same app, config and code). A plain `bun run dev` behaves the same except for that reload risk.
- `form_input` batches in the VAB initially attached a part to the wrong parent because the "attach to" picker kept its previous value after an add; fixed so the picker follows the part just added and prefers the `bottom` node.
- The built-in browser's synthetic `.` key had an empty `code`; punctuation keys are now matched by `e.key`.

## Decisions

No ADR: the design questions were answered by existing ones (0006 static client, 0012 host-supplied shapes, 0016 protocol). Choices recorded here: the Worker owns the clock (the main thread never calls `step`); design hand-off via `localStorage` key `orbital.design`; the `ready` message carries the content catalog; `ssr = false` per canvas page (prerender shell stays).

## For plan 010 (scripting sandbox)

- Everything crosses `postMessage` as plain data (`messages.ts`). A script host can sit next to `sim-client.ts`: read `SimClient.onSnapshot` (about 60 Hz, 2.8 kB per vessel, only `VesselSnapshot` data plus `parts[].modules`), issue `SimClient.dispatch(command)`; validation is in the sim (`commandSchema`), so a sandboxed script can send untrusted objects safely, and refusals come back as `{ ok: false, reason }`.
- The sim does not know about the page: the Worker host (`sim-host.ts`) could serve a second client (a script worker) with the same message types.
- `autopilot.ts` is the reference for "what a script needs": the vessel's parts and resource densities (from the `ready` catalog), `orbit`, `orientation`, `modules` state, and 16 ms-granular timing.
- Commands are asynchronous round trips (`Promise<CommandResult>`), not synchronous like in headless tests.

## Open questions / follow-ups

- Plan 013 (debris blocks warp). Plan 012 may change debris anyway.
- Apoapsis of the browser run (271 km) vs headless (137 km): unexplained, benign.
- Not done: interpolation between snapshots, fuel/Δv readout, attitude hold (SAS), stage preview in the VAB, part art.

## Verification output

See the plan Log. Commands: `bun run --filter @orbital/web test` (21 tests), `bun run build`, `bun run typecheck`, `bun run docs:check`, `bun test packages/renderer`.
