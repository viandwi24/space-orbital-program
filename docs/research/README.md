# Research

Facts about the outside world that the code depends on, each with **the source URL and the date checked**. The rule (ADR 0008): do not use a CLI flag, API, or version from memory; look it up, then record it here so the next agent does not have to.

- `stack-versions.md` — the version table and scaffold commands, re-verified whenever a plan touches a tool.
- `bun-test.md` — the `bun:test` API surface and CLI filtering we rely on (plan 002).
- `zod.md` — the zod v4 surface `@orbital/core` schemas use (plan 003).
- `typescript.md` — module augmentation rules the SDK's open interfaces rely on (plan 005).
- `rapier.md` — the Rapier JS API `@orbital/physics` uses, determinism notes and measured integrator behaviour (plan 004).
- `three.md` — the Three.js surface `@orbital/renderer` uses: renderer options, log depth, `Line2`, camera (plan 008).
- `atmosphere.md` — ISA sea-level constants behind the sim density, zod 4 number validation (plan 007).
- `web-client.md` — Vite worker import, Rapier in a module worker, SvelteKit page options, Svelte 5 runes, vitest config (plan 009).
- `scripting.md` — Worker vs QuickJS-WASM vs ShadowRealm for the scripting sandbox; `quickjs-emscripten` API and measured interrupt latency (plan 010).
- Topic files (`sveltekit.md`, …) — created by the plan that first needs them; keep each to what we actually use.

When an entry is older than ~3 months or a major version behind, re-verify before relying on it.
