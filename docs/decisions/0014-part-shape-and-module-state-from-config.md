# 0014 — Part shape, `state(config)` and test-support exports

**Status:** accepted
**Date:** 2026-10-16
**Plan:** plans/006-stock-mod-minimal.md

## Context

Stock content (ADR 0005) must not use a back door, and writing it exposed three gaps in the 0.1.0 API:

1. `PartDefinition` carries no dimensions. The renderer needs a placeholder shape per part (ADR 0012 said the likely home is a definition field) and plan 007 needs one to build rigid bodies (`BodyDesc.shape` is box/sphere/capsule).
2. `ModuleDefinition.state` was a zero-argument factory, so a resource container could not start with the contents its part config declares.
3. A mod's tests need a `ModuleContext`, which contains a `World` and an `EventBus`; the SDK exported neither constructor and mods may import only the SDK.

## Decision

All three are additive, so `API_VERSION` goes 0.1.0 → 0.1.1 (`conventions/versioning.md`); `meta.api: "^0.1"` plugins keep loading.

- `PartDefinition.shape?: { kind: 'box'; size: [x, y, z] } | { kind: 'cylinder'; radius; height }`, metres, centred on the part origin, cylinder axis = local Y (the axis of the `top`/`bottom` attach nodes). Validated by `partShapeSchema` in `partDefinitionSchema`; `PartShape` type and schema exported from core and the SDK. The variants match the renderer's `PartShape`, so the host converts the tuple to `Vec3` and nothing else. Optional: parts without a shape keep working (renderer falls back to its 1 m box; plan 007 chooses a fallback body shape).
- `ModuleDefinition.state?(config: Out): State`: the factory receives the part's parsed config (defaults applied). Written as a method signature so `State` is still inferred from the return type while the erased registry type accepts every typed definition. Zero-argument factories remain valid.
- The SDK re-exports `createWorld` and `createEventBus` as test support.

## Alternatives considered

- **Host-supplied shapes only (ADR 0012's status quo)** — leaves stock without a place for dimensions and splits one part's data across two repos of truth. Rejected for part data; the renderer's own `PartShape` stays and is fed from `shape`.
- **A `sphere`/`capsule` shape variant** — no stock need; additive later.
- **Container state initialised by the sim from config** — makes the sim know the container's state layout; `state(config)` keeps that knowledge in the module.
- **Config-aware state via a separate `init` hook** — a second lifecycle hook for something the existing factory expresses.

## Consequences

- Plan 007 builds each module instance's state with `module.state?.(parsedConfig)` and each body shape from `PartDefinition.shape`.
- Plan 009 maps `shape` to the renderer's `PartShape` map instead of inventing sizes.
- `architecture/plugin-system.md` documents the new field and signature.
- Remaining gap, not fixed here: `ModuleContext` has no body handle or vessel resource access, so physical module behaviour belongs to plan 007 (see plan 006 design notes and journal 006).
