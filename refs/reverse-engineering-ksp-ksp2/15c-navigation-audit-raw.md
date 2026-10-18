# 15c — Navigation audit (raw, read-only)

Raw result of a read-only audit run on 2026-10-18. It fills section 2 of [15-orbital-today-inventory-2.md](15-orbital-today-inventory-2.md).
- Paths with a top-level folder (`apps/`, `packages/`, `mods/`, `docs/`) are relative to the repository root. Bare file names live under `apps/web/src/lib/` (or its `hud/` subfolder for `*.svelte`).
- `+page.svelte` means `apps/web/src/routes/flight/+page.svelte` unless another route is named.
- Status key: Impl = implemented, Partial = partly implemented, Missing = not found.

## 1. Map view

| Feature | Status | Evidence |
|---|---|---|
| Map toggle (M) | Impl | `keybindings.ts:96`, `flight-loop.ts:447-449,622-625` |
| Predicted path through spheres of influence (blue, then orange) | Impl | `packages/renderer/src/scene.ts:843-866`; `map-path.ts:73` |
| SOI transition dots and a ghost sphere for the moon | Impl | `scene.ts:868-901` |
| Encounter label "Moon Pe X km" or "impact" | Impl | `maneuver-controller.ts:317-350`; `ManeuverLayer.svelte:81-86` |
| Moon orbit lines and SOI spheres | Impl | `scene.ts:208-211,352-373` |
| Other vessels' orbit lines and markers | Impl | ADR 0118 Context; `target-view.ts:55,221`; `TargetMarkers.svelte:119` |
| Ap/Pe markers | Partial | Current orbit only (`MapMarkers.svelte:23-50`); none on the planned orbit |
| AN/DN markers | Missing | Only buttons on the Target card (`rendezvous-aids.ts:163-164,270-283`) |
| Closest-approach markers | Impl | One pair, where KSP shows two (`TargetMarkers.svelte:62-63,116,121-124`; `rendezvous-aids.ts:99-145`) |
| Body focus cycle (Tab, Shift+Tab) | Impl | `keybindings.ts:112`, `flight-loop.ts:450-456,628-633`, `scene.ts:914-924`. No double-click focus and no vessel focus |
| Picking: marker, then own path (adds a node), then other orbit lines | Impl | `map-pick.ts:35-62`, `flight-loop.ts:517-535` |
| Region overlay (plan 192) | Impl | `RegionsLayer.svelte:1-30`, `+page.svelte:255-264,786` |
| Prediction under n-body | Partial | Uses osculating conics, not DE440 paths (STATUS.md:181). Warp is capped (`packages/sim/src/commands.ts:424,439`) |
| Map ↔ Mission Center switch | Impl | `MapSwitch.svelte:1-21` |

## 2. Maneuver nodes (plan 045)

**Implemented:**
- Click the path to add a node: 14 px pick radius, at least 5 s ahead (`maneuver-controller.ts:119-121,297-315,419-428`).
- Six handles. Shift makes steps ×10, Alt makes them ×0.1 (`ManeuverLayer.svelte:99-128`, `maneuver.ts:20,35,48-57`, `maneuver-controller.ts:447-467`).
- Drag a node along the orbit (`maneuver-controller.ts:436-453`).
- Keyboard editing, 1 m/s steps (`keybindings.ts:113-119`, `maneuver-controller.ts:478-492`):
  - I/K: prograde/retrograde;
  - L/J: normal/anti-normal;
  - O/U: radial out/in;
  - Delete or Backspace: remove the node.
- Planned path in its own colour (`scene.ts:858`, `map-path.ts:176`).
- Burn time over stages, plus a "not enough fuel" flag, countdown, "Burn now" and overdue states (`maneuver.ts:116,159`, `ManeuverPanel.svelte:28-58`).
- Warp to burn, stopping 30 s before half the burn (`maneuver-controller.ts:122-123,502-519`).
- Navball maneuver marker (`navball-math.ts:297,309-318`).
- SAS maneuver mode on key 8 (`keybindings.ts:88`).
- Script API: addNode, removeNode, warpTo, nodes (`script-api.ts:66-72`).

**Partial:**
- Up to 8 nodes are chained (`packages/core/src/protocol.ts:53`, `packages/sim/src/maneuver.ts:193`), but the panel only describes the first one (`hud-controller.ts:265-282`).

**Missing:**
- Numeric Δv entry, time ± buttons and "next orbit" (`ManeuverPanel.svelte:48-81`).
- Node editing by touch (plan 045 Out).
- Finite-burn prediction; the panel notes that it assumes an impulsive burn (`ManeuverPanel.svelte:82`).

## 3. Target and rendezvous (plans 035 and 057, ADR 0084)

**Implemented:**
- Target picking: dropdown, Y to cycle, click on the map (`TargetPanel.svelte:58-78`, `target-model.ts:33-64`, `keybindings.ts:98`).
- Distance, relative speed, closing/opening rate and closest approach (`TargetPanel.svelte:80-95`, `target-model.ts:90-113`).
- Navball target markers, including target prograde and retrograde (`navball-math.ts:276-278,319-333`).
- Speed reference "target" (V).
- SAS target and anti-target (keys 9 and 0).
- Node aids (`rendezvous-aids.ts:147-291`):
  - node at closest approach;
  - match velocities;
  - Hohmann transfer (assumes circular, coplanar orbits, `:256`);
  - plane change at AN/DN.
- Target orbit drawn on the map (`target-view.ts:106-115`).
- Label in the flight view and an arrow at the screen edge (`target-indicator.ts:38-56`).

**Missing:**
- Docking. It was out of scope in plan 057, and no docking command exists. There is only a "Docking" label among the action groups (`mods/stock/src/action-groups.ts:11`).

## 4. Alarms and Upcoming

**Implemented:**
- Upcoming in the Mission Center: nodes, next SOI change and reviews, up to 12 entries (`mission-center/model.ts:97-163`).
- Warp to each entry: a node stops 30 s before, an SOI change stops at the change (`model.ts:116,142,166-170`).

**Missing:**
- Alarm Clock: user alarms, Ap/Pe/AN/DN alarms, and alarms that stop warp automatically.
- Contract deadlines in Upcoming.

## 5. Delta-v

**Implemented:**
- Per-stage Δv, burn time, TWR, fuel and total. Values switch automatically between sea level and vacuum (`stage-stack.ts:5-60`, `StageStack.svelte`, `hud-controller.ts:343-356`).
- The trip planner (plan 034, ADR 0083) exists, but only in the VAB (`editor/trip.ts`, `vab/StatsStrip.svelte:124-147`).

**Partial:**
- There is no body selector for Δv in flight.

## 6. Tracking and Mission Center (plan 113, ADR 0118)

**Implemented:**
- A map of the whole system with highlights, layers and clustered labels.
- An object card.
- A comms planning toggle.

**Partial:**
- Filters: All, Vessels, Relays and Bodies. Relays is always empty (`MissionCenterOverlay.svelte:168`), and there are no vessel-type filters.
- Fly only works on the save's focus vessel; any other shows `NOT_FLYABLE` (`model.ts:185-186,237`; ADR 0118 point 5).

**Missing:**
- Recover from the Mission Center. Recovery exists only in flight, for a landed vessel at rest (`+page.svelte:272-276,750-794`; `commands.ts:472-483`).
- Terminate.
- Rename a vessel. Renaming exists only for designs in the VAB library.

## 7. Vessel switching, debris and launch sites

- **Vessel switching: Missing.**
  - `vessel` is set once (`flight-loop.ts:259,933,951`).
  - `[` and `]` are aircraft trim (`keybindings.ts:93-94`).
  - A switcher needs per-vessel designs (STATUS.md:178).
- **Debris: Impl (ADR 0021).**
  - Debris goes on rails and is removed on re-entry, or after 10 s at rest.
  - It can be targeted.
  - It is not persistent and you cannot switch to it.
  - Grazing debris stays in flight (STATUS.md:191).
- **Site choice (plan 092): Impl.**
- **Launch from pad or runway (plan 094): Impl** (`launch/launch-model.ts:33-90,121`, `+page.svelte:387,417,484-488`).
- **Stale docs:** STATUS.md:179 and :186 still say "launch at (0,0)".

## 8. Autopilot

- **Ascent autopilot: dev-only.** It is DEV-ONLY (`autopilot.ts:1-7`) and toggled with P only under `import.meta.env.DEV` (`flight-loop.ts:479,645-669`).
- **Missing:** node execution and rendezvous autopilot.

## Biggest navigation gaps

1. Switching to and flying any vessel other than the focus vessel
2. Recover, terminate and rename from tracking
3. Docking
4. Alarm Clock
5. AN/DN markers on the map
6. Ap/Pe markers on the planned orbit
7. Numeric node editor, and a panel for every node
8. Persistent debris
