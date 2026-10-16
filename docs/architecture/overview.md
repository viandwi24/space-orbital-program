# Architecture overview

Orbital is a Bun workspace monorepo. The structure exists to enforce one idea: **the simulation is a pure, headless, environment-neutral library; rendering, UI, and physics engines are replaceable adapters around it.**

## Package graph

```
                 ┌────────────┐
                 │  apps/web  │  SvelteKit · UI chrome · Worker host · input
                 └─────┬──────┘
        ┌──────────────┼──────────────────┐
        ▼              ▼                  ▼
┌──────────────┐ ┌───────────┐     ┌─────────────┐
│   renderer   │ │    sim    │◄────│  mod-stock  │  (loaded via sdk)
│  Three.js    │ │ loop/modes│     └──────┬──────┘
└──────┬───────┘ └─────┬─────┘            ▼
       │          ┌────┴─────┐      ┌───────────┐
       │          ▼          ▼      │    sdk     │  public mod API
       │   ┌──────────┐ ┌────────┐  └─────┬─────┘
       │   │  physics │ │ kepler │        │
       │   │  Rapier  │ │  math  │        │
       │   └─────┬────┘ └────────┘        │
       │         ▼                        ▼
       └───────►┌──────────────────────────┐
                │           core           │  ids · units · world · registries · events · loader
                └──────────────────────────┘
```

Arrows point from importer to imported. The full rule set is in `boundaries.md`.

## Layers

| Layer | Packages | Environment | Knows about |
|---|---|---|---|
| **Math** | `kepler` | any | nothing else |
| **Core** | `core` | any | `kepler` only for types if needed |
| **Adapters** | `physics` (Rapier), `renderer` (Three) | `physics`: any (WASM); `renderer`: browser | `core` |
| **Simulation** | `sim` | any (Bun, Worker) | `core`, `kepler`, `physics` |
| **Scripting** | `scripting` | any (QuickJS-WASM) | `core` only; reads snapshots, returns commands (`scripting.md`) |
| **Public API** | `sdk` | any | `core` (re-exports a curated subset) |
| **Content** | `mods/*` | any | `sdk` only |
| **Client** | `apps/web` | browser | everything |

## Runtime topology (browser)

```
Main thread                              Worker
┌─────────────────────────┐   messages   ┌────────────────────────────┐
│ Svelte UI (HUD, VAB,    │ ───────────► │ sim: fixed-timestep loop   │
│ map) · input · renderer │ ◄─────────── │ core world · physics       │
│ (Three.js, floating     │  state       │ plugins (stock + mods)     │
│  origin)                │  snapshots   │                            │
└─────────────────────────┘              └────────────────────────────┘
```

Since plan 009 `sim` runs in a Worker: `apps/web/src/lib/sim.worker.ts` boots `createSim` (Stock plugin, Rapier backend), `sim-host.ts` owns the clock (`setInterval` about 60 Hz, wall delta clamped to 0.1 s, `sim.step`) and posts a snapshot per tick; `sim-client.ts` is the main-thread side (`dispatch` returns a promise, `onSnapshot` fans out). Messages are plain data (`messages.ts`): `command`/`dispose` to the worker; `ready` (plugin ids, parts, bodies, resources), `snapshot`, `result`, `error` back. Since plan 015 the script runner lives in the same Worker (ADR 0022): `script-start`/`script-stop` in, `script-status`/`script-log` out; `sim-host.ts` ticks the runner with each post-step snapshot and dispatches its commands directly. The render loop (`flight-loop.ts`) is plain TypeScript outside Svelte reactivity; Svelte gets a 10 Hz HUD copy.

## Key mechanisms (each has its own doc)

- Plugin system, registries, define-API → `plugin-system.md`
- Fixed timestep, flight vs on-rails, time warp, snapshots → `simulation.md`
- Units, frames, precision, floating origin → `units-and-frames.md`
- Import rules and environment constraints → `boundaries.md`

## What is deliberately *not* decided yet

- Terrain representation (Phase 3).
- A script editor beyond the plain textarea of plan 015 and a separate Worker for the runner (the runtime is decided: QuickJS-WASM, ADR 0020; the runner runs in the sim Worker, ADR 0022; `scripting.md`).
- Save format for flights (vessel designs are JSON; in-flight saves come with Phase 2).
