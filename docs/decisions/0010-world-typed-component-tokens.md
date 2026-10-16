# 0010 — World components are keyed by typed tokens

**Status:** accepted
**Date:** 2026-10-16
**Plan:** plans/003-core-world-registries-events.md

## Context

Plan 003's design notes sketch `components: Map<ComponentKey, Map<EntityId, unknown>>` with `add/get/remove/has/query(keys[])`, leaving `ComponentKey` open. With plain string keys every `get` returns `unknown` and callers cast, which is how silent type drift starts across plugins.

## Decision

Components are addressed by a token created with `defineComponent<T>(name)`: `{ name: string; __type?: T }` (the `T` is phantom). `world.add(id, token, value)` and `world.get(id, token)` are typed by `T`; `query` takes `ComponentType<unknown>[]`. Storage is keyed by `token.name`, so serialization (`WorldData`) is name-keyed JSON and independent of tokens. Entity ids come from `world.createEntity()` (numeric, never reused, preserved across serialize/deserialize). The single type assertion in `get` is documented at the call site; `deserializeWorld` validates the structure with zod but component values stay opaque to core (the owning module validates them).

## Alternatives considered

- **Plain string keys + generics at call sites** — every call site could lie about `T`. Rejected.
- **Module-augmented `ComponentMap` interface** — fully typed by name, but forces augmentation even for module-private state and makes tests awkward. Can be layered on later without changing this API.

## Consequences

- Plugins export their component tokens; two tokens with the same `name` address the same data (names should be `"<plugin>.<name>"`).
- Plan 005/007 build module state storage on `world.add/get` with tokens.
