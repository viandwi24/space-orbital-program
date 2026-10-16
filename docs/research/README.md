# Research

Facts about the outside world that the code depends on, each with **the source URL and the date checked**. The rule (ADR 0008): do not use a CLI flag, API, or version from memory; look it up, then record it here so the next agent does not have to.

- `stack-versions.md` — the version table and scaffold commands, re-verified whenever a plan touches a tool.
- `bun-test.md` — the `bun:test` API surface and CLI filtering we rely on (plan 002).
- `zod.md` — the zod v4 surface `@orbital/core` schemas use (plan 003).
- Topic files (`rapier.md`, `three.md`, `sveltekit.md`, …) — created by the plan that first needs them; keep each to what we actually use.

When an entry is older than ~3 months or a major version behind, re-verify before relying on it.
