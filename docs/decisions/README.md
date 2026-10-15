# Architecture Decision Records

An ADR records one decision, its context, and its consequences. ADRs are **append-only**: to change a decision, write a new ADR that supersedes the old one and update the old one's status line only.

## When to write one

- Any choice that is expensive to reverse (stack, package boundaries, data formats, public API shape).
- Any time a plan deviates from the architecture docs.
- Any time two reasonable options exist and a future agent would otherwise re-ask the question.

## Process

1. Copy `0000-template.md` to `NNNN-short-slug.md` (next number).
2. Status `proposed` while discussing; `accepted` once the human or the plan owner accepts it; `superseded by NNNN` or `deprecated` later.
3. Link the ADR from the plan that triggered it and, if it changes the design, from the relevant `architecture/` doc.
4. Add a row to the index below.

## Index

| # | Title | Status | Date |
|---|---|---|---|
| 0001 | [TypeScript first, WASM per hotspot later](0001-typescript-first-wasm-later.md) | accepted | 2026-10-16 |
| 0002 | [Bun workspace monorepo with per-package boundaries](0002-bun-monorepo-workspaces.md) | accepted | 2026-10-16 |
| 0003 | [Simulation is headless and separate from rendering](0003-sim-render-separation.md) | accepted | 2026-10-16 |
| 0004 | [Physics behind an adapter; Rapier (compat build) first](0004-physics-behind-adapter-rapier.md) | accepted | 2026-10-16 |
| 0005 | [Stock content is a mod built on the public SDK](0005-stock-content-as-mod.md) | accepted | 2026-10-16 |
| 0006 | [SvelteKit static client, Svelte 5, no SSR for the game](0006-sveltekit-static-client.md) | accepted | 2026-10-16 |
| 0007 | [SI units, float64 state, floating origin, +Y up](0007-units-si-float64-floating-origin.md) | accepted | 2026-10-16 |
| 0008 | [Official scaffold commands only; verify tools against the internet](0008-official-scaffold-commands.md) | accepted | 2026-10-16 |
| 0009 | [Plan-driven development with executable acceptance criteria](0009-plan-driven-development.md) | accepted | 2026-10-16 |
