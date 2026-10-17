# 0102 — Vessel control and HUD: part actions and group control, dock panels by `definePanel`, one Mission Center

**Status:** accepted
**Date:** 2026-10-17
**Plan:** none (owner decisions "part-control-scope", "panel-plugin-api", "mission-center-merge", 2026-10-17); delivered by plans 110 to 113
**Builds on:** ADR 0026 (HUD architecture: update cadence, navball, toasts), 0033 (module descriptors), 0057 (mods are trusted code), 0107 (refs UI language).
**Research:** `refs/space-orbital-program-ui/docs/CONCEPT.md` §3 and §4, `SCREENS.md` (Flight, Map, Mission Center), `refs/reverse-engineering-ksp2/13-ui-ux-patterns.md`.

## Context

In flight, module actions are reachable only through the `action` command and the staging and SAS buttons; there is no list of parts with their switches, no grouping and no way for a mod to add a HUD panel. The refs design has a left dock of panels with a Panel library (third-party panels get their own render area), a right vessel panel with Overview (group control), Parts (switch, info, actions per part) and Comms tabs, and a Mission Center that merges KSP's Tracking Station and Mission Control. The owner asked for part control "as complete and complex as possible, yet flexible so the UX works".

## Decision

1. **Part action descriptors.** A module describes its actions and their state through its descriptor (ADR 0033): `{ id, label, kind: toggle | value | trigger | mode, value, min, max, step, unit, options, enabled, reason when disabled, group, icon }`. The UI builds switches, sliders, segmented choices and buttons from it; mods' modules get controls with no UI code. The focused vessel's descriptors travel in the snapshot at the HUD cadence (10 Hz), other vessels' on request.
2. **Groups.** Every action names a **group** from a registry (stock: engines, batteries, solar, lights, antennas, science, docking, landing gear, parachutes; mods add groups). The Overview tab shows one switch per group with a **mixed** state when only some parts are on; one command (`action-group`) applies an action to every part of a group in the same tick. Players can also define **custom groups** (named, bound to keys through the binding table of ADR 0061, saved with the design as an additive field).
3. **Parts tab**: parts by category, each with its switches, info and icon actions; the selected part is highlighted in the 3D view. **Comms tab** arrives with comms tier 1 (ADR 0101).
4. **Dock panels.** A left rail of panels, one open at a time, and a Panel library to add or remove panels (persisted in settings). `definePanel({ id, title, icon, order, contexts: flight | map | mission-center, view })` in the SDK. The **view is declarative and environment-neutral**: sections of readouts, meters, switches, buttons, lists and small charts bound to pure selectors over the snapshot and to commands the sim validates as any other. A panel may also ask for a **canvas area** that it draws through an SDK-defined 2D drawing interface (a subset of Canvas 2D declared in the SDK), so a mod still imports only `@orbital/sdk` and stays free of DOM types (boundaries hold). Page-only panels that need rich page features (the script editor, the maneuver editor) are registered by the host into the same dock.
5. **Isolation.** Mods are trusted code (ADR 0057); no new sandbox. A panel that throws is shown in an error state and the game continues; selectors run at 10 Hz and canvas drawing only while the panel is visible.
6. **One Mission Center.** A route with the whole system map full-bleed (selection rings), Tracking (All / Vessels / Relays / Bodies), Upcoming events with warp-to, Contracts, the crew roster, the agency strip, a card for the selected object with Fly, and layers Orbits / Network / Labels. The per-vessel Map keeps the flight HUD (refs) with a `Map | Mission Center` switch. KSP's two buildings are one.

## Alternatives considered

- **Part action windows per part** (KSP) — rejected: windows pile up and controlling many parts is tedious.
- **Panels as arbitrary mod DOM or Svelte components** — rejected: breaks the boundary that mods are environment-neutral and import only the SDK, and ties mods to our framework version.
- **Separate Tracking Station and Mission Control** — rejected by the owner.

## Consequences

- **Mod API:** the action descriptor fields, `defineActionGroup`, `definePanel` and the SDK drawing interface (additive).
- **Protocol:** an `action-group` command; descriptors in the snapshot of the focused vessel (size measured in plan 110; must stay under 8 kB for a 100-part vessel).
- **Design format:** custom groups as an optional field (no version bump).
- **Performance (ADR 0053):** HUD work stays at the 10 Hz cadence of ADR 0026; the Mission Center map reuses the map renderer and gets its own measured budget.
- **Existing HUD:** Orbit, Resources, Target, Maneuver and Script panels move into the dock (plan 112); the stage stack, navball and warp control are restyled by plan 088.
- Follow-ups: plans 110 (descriptors, groups), 111 (vessel panel), 112 (dock, `definePanel`), 113 (Mission Center).
