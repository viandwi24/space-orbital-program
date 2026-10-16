# AGENTS.md — read this first

You are an AI agent working on **Orbital**, a web-based, moddable space-flight game (think Kerbal Space Program in the browser). This file is the entry point. Everything else lives under `docs/`.

## 1. Orient yourself (every session, in this order)

1. `docs/STATUS.md` — where the project is right now: current plan, last completed plan, open issues.
2. The plan you are assigned: `docs/plans/NNN-*.md`. If none is assigned, take the lowest-numbered plan with `status: ready`.
3. `docs/architecture/boundaries.md` — hard rules. Violating them fails the plan.
4. `docs/decisions/` — ADRs. Do not re-litigate an accepted decision inside a plan; write a new ADR instead.
5. The journal entries of the previous one or two plans in `docs/journal/` — context that never made it into code.

Do not read the whole `docs/` tree up front. Read what the plan's **Context** section lists.

## 2. How work happens

- Work is done **one plan at a time**. A plan is done only when every item in its **Acceptance criteria** passes, verified by running the listed commands, not by reading the code.
- Each plan ends with the **docs update checklist** in `docs/conventions/docs-maintenance.md`. A plan whose docs are stale is not done.
- Scope creep goes into a new plan file (`status: draft`), not into the current one.
- If a plan turns out to be wrong or impossible as written, stop, write what you found in the journal, set the plan to `status: blocked`, and explain in `docs/STATUS.md`.

## 3. Non-negotiable rules

- **Official scaffolding only.** Never hand-write files that a tool's official init/create command generates (`bun init`, `sv create`, `sv add`, …). Run the official command, then edit the result. See ADR 0008.
- **Verify against the internet before using a tool, API, or version.** Look up the official docs for the current command syntax and current version. Record what you checked in `docs/research/stack-versions.md`. Do not rely on memory for CLI flags or package versions.
- **Boundaries** (`docs/architecture/boundaries.md`): `core`, `kepler`, `sim`, `sdk`, and all `mods/*` are environment-neutral — no DOM, no Bun/Node APIs, no Three.js. Only `packages/physics` imports Rapier. Only `packages/renderer` and `apps/web` import Three.js. Mods import only from `@orbital/sdk`.
- **Stock content is a mod.** `mods/stock` uses the same public SDK as any third-party mod. If it needs a back door, fix the SDK.
- **Units:** SI, float64, right-handed. See `docs/architecture/units-and-frames.md`.
- **Tests before "done".** `bun test`, `bun run typecheck`, `bun run build` must pass at the end of every plan.
- Do not use the `gh` CLI. Use plain `git`; leave PR creation to the human unless told otherwise.

## 4. Commands

```sh
bun install            # whole workspace
bun test               # unit tests in packages/ and mods/ (bun:test)
bun run typecheck      # tsc per package + svelte-check for apps/web
bun run build          # static build of apps/web
bun run dev            # apps/web dev server
bun run docs:check     # validates plan/ADR/STATUS consistency
```

## 5. Repository map

```
apps/web/          SvelteKit client (Svelte 5, static build)      — UI chrome only
packages/core/     ids, units, world, registries, events, loader  — environment-neutral
packages/kepler/   orbital mechanics                              — pure math
packages/physics/  PhysicsBackend interface + Rapier adapter
packages/sim/      headless fixed-timestep simulation             — runs in Bun and in a Worker
packages/scripting/ sandboxed player scripts (QuickJS-WASM): snapshot in, validated commands out — environment-neutral
packages/sdk/      public mod API: definePlugin/defineModule/definePart/…
packages/renderer/ Three.js rendering, floating origin            — reads sim state only
mods/stock/        stock parts/modules/resources/bodies            — a mod like any other
tools/             repo scripts (docs check, future CLI)
docs/              everything below
```

## 6. Docs map

| Path | What it is | When you touch it |
|---|---|---|
| `docs/STATUS.md` | living project status | end of every plan |
| `docs/product/` | product spec, glossary | when scope changes (via ADR) |
| `docs/architecture/` | how the system is built | when a plan changes structure |
| `docs/decisions/` | ADRs (numbered, immutable once accepted) | any non-trivial choice |
| `docs/guides/` | how-tos for mod authors, written from stock | when the SDK or stock changes |
| `docs/plans/` | numbered plans with acceptance criteria | lifecycle: draft → ready → in-progress → done/blocked |
| `docs/journal/` | one entry per plan execution: what happened, surprises, open questions | end of every plan |
| `docs/research/` | verified facts from the internet with date checked | whenever you look something up |
| `docs/conventions/` | code style, testing, versioning, docs maintenance | rarely |
