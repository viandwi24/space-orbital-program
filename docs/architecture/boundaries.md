# Boundaries (hard rules)

These rules are what make the stack upgradeable later (ADR 0001, 0003). A plan that violates one is not done, regardless of what else it achieved.

## Import rules

| Package | May import | Must NOT import |
|---|---|---|
| `@orbital/kepler` | nothing (std lib only) | anything |
| `@orbital/core` | `zod`; `@orbital/kepler` types only if needed | DOM, Bun/Node APIs, Three.js, Rapier, Svelte |
| `@orbital/physics` | `@orbital/core`, `@dimforge/rapier3d-compat` | DOM, Three.js, Svelte, `sim` |
| `@orbital/sim` | `core`, `kepler`, `physics` | DOM, Three.js, Svelte, `renderer`, `apps/web` |
| `@orbital/sdk` | `core` (re-exports) | everything else |
| `@orbital/scripting` | `core`, `quickjs-emscripten`, `quickjs-emscripten-core` | DOM, Bun/Node APIs, Three.js, Svelte, Rapier, `sim`, `physics`, `kepler` (`sim` and the stock mod are test-only devDependencies) |
| `@orbital/renderer` | `core`, `three` | `sim` internals (reads snapshots via `core` types), Svelte, Rapier |
| `mods/*` | `@orbital/sdk` **only** | `core`, `sim`, `physics`, `renderer`, DOM |
| `apps/web` | anything | — |

Enforcement: each package's `tsconfig.json` sets `lib` to `["ESNext"]` (no DOM) except `renderer` and `apps/web`. Dependency lists in `package.json` are the second line of defence: do not add a dependency that the table forbids. A lint rule will be added when it pays for itself (track in plans).

## Environment rules

- `core`, `kepler`, `sim`, `sdk`, `scripting`, `mods/*` must run identically in: Bun (tests), a Web Worker, the browser main thread, Node. Therefore: no `window`, `document`, `Bun.*`, `process.*`, `fs`, `fetch` inside them. I/O happens in `apps/web` or `tools/`.
- Nothing in `sim` reads the wall clock. Time is an input (`step(dt)`).
- Randomness in `sim` goes through a seeded PRNG passed in; never `Math.random()`.

## State rules

- All simulation state is plain serializable data (JSON-compatible, plus typed arrays where needed for performance). No class instances with methods in state; behaviour lives in modules/systems, state lives in components.
- The renderer and UI receive **snapshots** (read-only). They never mutate sim state; they send **commands**.

## Physics rules

- `sim` and everything above talk to `PhysicsBackend` (defined in `core`), never to Rapier. Only `packages/physics` imports Rapier.
- Forces are applied through the backend API in SI units in the sim frame; the adapter handles any conversion.

## Mod rules

- Stock content (`mods/stock`) uses the public SDK exactly like a third-party mod.
- The SDK surface is versioned (`API_VERSION` in `core`). Breaking changes bump it and get an ADR.
- A mod declares what it registers; the loader validates with zod schemas before anything touches the world.

## Docs rules

- A plan is not done until `docs/STATUS.md`, its journal entry, and any affected `architecture/` doc are updated (see `conventions/docs-maintenance.md`).
