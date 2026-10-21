# 270 — A pick list for stacked map vessels, and distinct vessel names

**Plan:** [plans/270-map-pick-list-and-distinct-vessel-names.md](../plans/270-map-pick-list-and-distinct-vessel-names.md) · **Session:** map pick list / vessel names session (M5), 2026-10-21 · **ADR:** [0252](../decisions/0252-distinct-vessel-names.md)

## What was wrong

- **Names.** A launch took its design's name as it was, so a design flown twice made two vessels with one name. `splitAt` (`packages/sim/src/vessel.ts`) and queued debris (`debris.ts`) named the new side `"<name> (debris)"`. A piece of debris that split again appended another suffix, which gave the owner's "Moon shot (debris) (debris) (debris)". An undock stripped one `" (debris)"` to give the home side its name back.
- **Picking.** A map click gave one key: `target-view.ts` `pick` → `map-pick.ts` `pickTarget` takes the nearest marker. Zoomed out, a stack of vessels on one point could only be reached by luck. The Mission Center's cluster label ("N vessels") selected its first member.

## What was done

| Where | What |
|---|---|
| `packages/core/src/vessel-names.ts` | `uniqueVesselName`, `vesselBaseName`, `debrisName`, `splitName`, `tidyLegacyNames` (ADR 0252) |
| `packages/sim` `core.ts` | `vesselNames(core, ...except)` |
| `packages/sim` `fleet.ts`, `commands.ts` | `nameLaunched` after `spawnVessel` in `loadVessel`: "Moon shot", "Moon shot 2" |
| `packages/sim` `vessel.ts` | a split names the new side `debrisName`, or `splitName` when that side has a control source |
| `packages/sim` `debris.ts` | queued debris: a mod's name made unique, else `debrisName` |
| `packages/sim` `docking.ts` | undock: the home side keeps the combined vessel's name; the docked side gets its recorded name back, made unique |
| `packages/sim` `save.ts` | `restoreWorld` tidies legacy `"(debris)"` names; the save format is unchanged |
| `apps/web/src/lib/hud/map-stack.ts` | `stackAt` (the hit test: vessel icons within 12 px, nearest first) and `stackEntries` (name, type for the icon, role Active / Target / type label, altitude or Landed) |
| `apps/web/src/lib/hud/MapPickList.svelte` | the list: a type icon from `@orbital/renderer/map-style` (a new subpath export, pure), name, role, altitude. Focus goes to the first entry. Arrows, Home and End move it, and Enter or a click picks. Escape, × or a press outside closes the list. Keys pressed inside stay inside, so Space does not stage. |
| flight page | the map frame's `others` points (and the target's) are kept each frame. `onMapPick` opens the list when two or more vessels are under the click, else the card as before. An entry targets that vessel and opens its card, with Switch to. `flight-loop.ts` is untouched. |
| Mission Center | a canvas click on two or more vessel points opens the list (14 px), and so does a cluster label. An entry selects the vessel (its card with Fly). |

## Choice: old names

Old names are tidied when a save is loaded. Only names with a `" (debris)"` tail change. "Moon shot (debris) (debris) (debris)" becomes "Moon shot debris", numbered if that name is taken. New saves never hold such a name, so a save and its reload stay equal.

## Checks

See the plan's Log for the command output.

## Open

- The flight map leaves out the flown vessel itself, as before (`target-view.ts` never picks it), so "Active" shows only in the Mission Center. Making the flown vessel's own icon pickable needs a change in `flight-loop.ts`, which another session owns now.
- Not checked in a browser with a real stack of vessels (it needs a save with debris in one orbit). The list is covered by unit tests of the hit test and the entries, plus svelte-check.
