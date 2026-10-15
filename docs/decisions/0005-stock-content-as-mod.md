# 0005 — Stock content is a mod built on the public SDK

**Status:** accepted
**Date:** 2026-10-16
**Plan:** plans/006-stock-mod-minimal.md

## Context

Moddability is a product feature. The usual failure mode is that first-party content uses internal APIs that mods cannot, so the public API is always a step behind and under-tested.

## Decision

All stock parts, modules, resources, bodies and gameplay systems live in `mods/stock` and import only from `@orbital/sdk`. If stock content needs something the SDK lacks, the SDK is extended (with a plan and, if breaking, an ADR). No back doors.

## Alternatives considered

- **Stock content in `core`** — faster at first, guarantees API drift. Rejected.

## Consequences

- The SDK is exercised by every stock feature; its tests are stock's tests.
- Loading order: `core` boots, then the loader boots `stock` like any plugin. The web app can run with stock disabled (useful for SDK tests).
- Stock is a reference for modders; keep it readable.
