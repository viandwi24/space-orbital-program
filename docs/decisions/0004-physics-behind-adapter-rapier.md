# 0004 — Physics behind an adapter; Rapier (compat build) first

**Status:** accepted
**Date:** 2026-10-16
**Plan:** plans/004-physics-backend-rapier.md

## Context

Per-part rigid bodies with joints need a real physics engine. Rapier (Rust → WASM) is mature, deterministic on a given build, and has first-class JS bindings. It ships two npm builds: `@dimforge/rapier3d` (separate `.wasm`, needs bundler WASM support) and `@dimforge/rapier3d-compat` (WASM embedded as base64, works in any bundler and in Bun without configuration). Verified 2026-10-16: both at 0.21.0.

## Decision

`core` defines a `PhysicsBackend` interface (bodies, joints, forces, step, queries). `packages/physics` implements it with `@dimforge/rapier3d-compat`. Nothing else imports Rapier. Start with the compat build for zero bundler setup and headless tests; switch to the non-compat build later if bundle size matters (adapter-local change).

## Alternatives considered

- **Hand-written physics** — full control, but joints and stable stacking are hard; months of work. Rejected for MVP; the adapter keeps the door open.
- **cannon-es / ammo.js** — cannon-es is unmaintained and less stable with joints; ammo.js is a heavy Emscripten port. Rejected.
- **Direct Rapier calls throughout `sim`** — simpler today, locks the engine in. Rejected (ADR 0001).

## Consequences

- Flight-mode physics runs in a local frame (float32-safe); `sim` handles the frame offset.
- Determinism tests pin the Rapier version.
- Bundle includes ~2 MB of WASM; acceptable for MVP.
