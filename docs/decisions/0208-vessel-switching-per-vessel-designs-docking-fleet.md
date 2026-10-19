# 0208 — Vessel switching, per-vessel designs, docking and fleet management

**Status:** accepted
**Date:** 2026-10-18
**Plan:** plans/221-vessel-switching.md, plans/222-docking.md, plans/223-fleet-management.md
**Amends:** ADR 0118 point 5 ("Fly flies the save's focus vessel only"); ADR 0021 (debris removal at rest, point 6).
**Builds on:** ADR 0201 (one sim per world), ADR 0203 (node sizes, RCS), ADR 0021 (debris lifecycle), ADR 0174 (part action descriptors)

## Context

The flight's vessel is set once (`flight-loop.ts:259,933,951`), and `[`/`]` are trim (`keybindings.ts:93-94`). A save carries only the focus vessel's design, so the Mission Center's Fly works only on that vessel and shows `NOT_FLYABLE` for any other (`mission-center/model.ts:185-186,237`; ADR 0118 point 5). Docking does not exist: only a "Docking" action-group label (`action-groups.ts:11`) and a collar on the capsule. Recovery exists only in flight, for a landed vessel at rest (`commands.ts:472-483`). Debris is removed 10 s after it comes to rest (`modes.ts:208-230`). KSP references (verified, research doc 16): docking ports 0.625 / 1.25 / 2.5 m that do not cross-dock; recovery 100 % on the pad, 98 % on KSC grounds, about `0.98 − d_km/2150` elsewhere; max persistent debris 250 by default. Rancangan §6.1–6.4 and §5.11.

## Decision

1. **Every vessel keeps its design.** The sim stores a design record per vessel (parts, tree, staging, groups, names), updated on decouple, dock and undock. This amends ADR 0118 point 5: **Fly flies any vessel.**
2. **Switching:** `[` and `]` cycle vessels within about 2.5 km (physics range); "Switch to" in the map and in the vessel list; Fly from the Mission Center. "Control from here" on any command part or docking port sets the reference.
3. **Docking ports** 0.625, 1.25 and 2.5 m (KSP sizes as a starting point); only equal sizes dock. Ports pull together inside a magnet range and capture when aligned and slow. Captured vessels **merge into one vessel**. **Undock** splits them and restores each side's name and type. Ports have a crossfeed switch. An alignment indicator and the Locked camera support the approach. First dock is a milestone.
4. **Vessel list** in the Mission Center with 9 type filters (debris, probe, rover, lander, ship, station, base, plane, relay, plus EVA and flag). Actions: Fly, Recover, Terminate, Rename and change type.
5. **Recover anywhere landed or splashed,** with a refund preview: 100 % on the pad, 98 % on Space Center grounds, then falling with distance (KSP's rule as the starting point). Crew and science are credited.
6. **Persistent debris** with a cap setting, default 250 (KSP's default). Above the cap the oldest debris goes first. ADR 0021's removal at rest is replaced by the cap; removal at re-entry on rails stays.

## Alternatives considered

- **Save only the focus vessel and rebuild others from launch designs** — rejected: decouples and docks change a vessel's design.
- **Docking as a rigid joint between two vessels** — rejected: ADR 0018 keeps one rigid body per vessel; merging fits it.
- **Recover only on the home body's pad** — rejected: KSP players recover landers and splashed capsules anywhere.

## Consequences

- Point 3's numbers, the merge and the undock restore are in ADR 0218 (plan 222): magnet 5 m, capture 0.15 m, 15°, under 0.5 m/s.
- Plan 221 delivers points 1–2, plan 222 point 3, plan 223 points 4–6. Plan 229's docking lesson builds on 222.
- Saves gain per-vessel designs; the save version goes up with a migration that gives existing vessels the focus design or a "design unknown" record.
- The Mission Center's `NOT_FLYABLE` state is removed.
