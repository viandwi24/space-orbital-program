# 0001 — TypeScript first, WASM per hotspot later

**Status:** accepted
**Date:** 2026-10-16
**Plan:** plans/001-repo-bootstrap.md

## Context

The team is small, the design is still moving, and the mod/scripting ecosystem will be JavaScript/TypeScript because that is what the browser runs. Choosing Rust/WASM for the whole core now would slow iteration and make the modding API foreign to its users. But some workloads (terrain generation, per-part aerodynamics at scale, large resource graphs) may eventually need more than JS speed.

## Decision

Write all first-party code in TypeScript. Use WASM only through libraries we consume (Rapier) or, later, for specific profiled hotspots packaged as their own workspace package behind an existing interface. Never rewrite the stack wholesale; rewrite one module when profiling proves it.

## Alternatives considered

- **Rust core compiled to WASM from day one** — maximal performance, but slow iteration, a bridge to maintain, and a modding API that TypeScript modders cannot read. Rejected for now.
- **Pure JS with no WASM at all** — leaves Rapier (and future hotspots) on the table for no benefit. Rejected.

## Consequences

- Boundaries (ADR 0003, 0004) must be strict so later WASM swaps are local.
- Performance budgets are tracked per plan; a hotspot gets a plan + ADR before any Rust appears.
- Modders and scripters get one language.
