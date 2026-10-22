# 343 — Mod World API

**Plan:** [plans/343-mod-world-api.md](../plans/343-mod-world-api.md) · **Session:** mod world API session (Claude) · **Date:** 2026-10-22 · **ADR:** 0292

## What was done

- Audit table in the plan: content registrars, patches, module hooks, autopilots and panels existed; a whole-world read view, world commands for mods, mod saved state, an events reference, mod keys and mod toasts did not.
- Core: `world-query.ts` (`createWorldQuery`, `WorldVessel`/`WorldPart`/`WorldBody`/…, `classifySituation`, `situationOfVessel`), `mod-api.ts` (`StoreDefinition`, `KeybindingDefinition`, `ModCommands`, `ModContext`), `events-catalogue.ts` (`SIM_EVENTS`), events `vessel:situation-changed`, `mod:notice`, `mod:focus`, `mod:key`, command `mod-key`, registries `stores` and `keybindings`, `Snapshot.stores`, `SimSave.stores`, `VesselSnapshot.situation`, `PanelInput.world`, `SystemContext extends ModContext`, `SystemDefinition.on` (phase and update optional), autopilots' `start`/`step` take `ctx` last. API 0.1.106.
- Sim: `mod-runtime.ts` (per-plugin context, lazy query per sim time, `MOD_ALLOWED`/`MOD_DEBUG` gate, stores with restore/save/snapshot, system `on` subscriptions, situation tracking), `situation.ts`; systems and world-tick systems get the context; autopilots too.
- Web: `input.world` (non-enumerable, so the mod frame still gets plain data), mod notices as toasts (`key: mod:<plugin>`), `mod-focus` switches the flown vessel, `mod-keys.ts` with clash rules, `settings.modKeys`, Controls → Mods section, flight key handler falls through to mod keys for keys the game does not use.
- `examples/mod-world-api`: a flight log store, landing and SOI handlers with notices, Alt+N targets the nearest vessel, a fleet panel by situation; its test builds the package and runs it in a sim.

## What surprised me

- The first situation check ran once per rails chunk for every vessel: the ten-year career bot went from 14.6 s to 68 s under a parallel suite (20 s alone). Rails vessels only change situation on an event or a command, so rails chunks now check only after one of those (`situationsDirty`); the bot is back to 14.2 s.
- Most plain letters are taken in both key profiles (KSP leaves C, F, O free); mod keys should use `Alt+` chords.
- Mod commands reuse the `autopilot` source rather than a new `mod` source: the comms queue and replay schemas already accept it, and the semantics (a program) are the same.

## Verification output

```
bun test ./packages ./mods ./examples ./tools: 2244 pass, 0 fail
web vitest: 1504 pass, 2 fail (script worker: Node 26 refuses --experimental-transform-types)
svelte-check: 0 errors; docs:check OK; career bot 14.2 s (14.6 s before)
```

## Open questions

- Module hooks have no `ctx.world` facade; systems cover the need so far.
- Panels cannot write a store (only through a command a system handles, e.g. `mod-key`).
