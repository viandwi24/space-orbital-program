# Space Center UI: how building games show names and building panels

Research for plan 259 (owner items 20–22: the building labels do not blend with the scene, opening a building shows a plain panel, the right panel looks bad).

## How this was researched, and its limits

Web search through the tools available to this session, no bot checks bypassed. The searches (Cities: Skylines building panels and selection, KSP's Space Center, world-anchored labels in Anno, Frostpunk and Planet Coaster) returned **little usable detail**: mostly Steam Workshop changelogs and forum threads about mods. What they confirmed is listed under "Verified". The rest is **from the author's general knowledge of these games**, not from a source fetched here; it is marked "Recalled" so nobody reads it as a citation. The owner's approval of the result is a manual gate in the plan.

## Verified (from the search results)

- **Cities: Skylines** shows a "smart UI" while placing: a fire station's menu shows coverage and the fire risk around it, so the information is where the decision is made ([Game Developer, "Understanding smart UI design"](https://gamedeveloper.com/design/understanding-smart-ui-design)). Building info panels are a separate panel per selected building; modders extend them with extra indicators on the side of the panel ([Steam Workshop changelogs](https://steamcommunity.com/sharedfiles/filedetails/changelog/2133705267?p=5)).
- **KSP** lets the player open a facility's upgrade by right-clicking the building at the Space Center; the building is highlighted on hover through the game's own picker ([KSP wiki, Kerbal Space Center](https://wiki.kerbalspaceprogram.com/wiki/Ksc); [forum thread on upgrade levels](https://forum.kerbalspaceprogram.com/topic/145405-changing-the-building-upgrade-level)). Upgrades cost funds in Career.
- **UI libraries** treat "label on hover" and "label always visible" as one switch (a persistent flag): a label can be anchored to its target and shown always, or only on hover or press ([Material 3 Label API](https://kotlinlang.org/api/compose-multiplatform/material3/androidx.compose.material3/-label.html)).

## Recalled patterns (not sourced here)

| Game | Names in the world | Selecting a building | Panel |
|---|---|---|---|
| Cities: Skylines I/II | no permanent names; a hover highlight and a small tooltip; info views overlay colour when asked | click → outline on the building and an info panel | header with the name, then stats (service, upkeep, level), actions at the bottom |
| KSP / KSP2 Space Center | none until hover; the hovered building lights up and a tag with its name appears | click opens the building's scene; right-click shows upgrade | a small card: name, level, upgrade cost |
| Anno | names only on hover or selection | click → outline and a bottom or side panel with the production chain | tabs, stat blocks, a level and upgrade row |
| Frostpunk | icons over buildings that need attention, not names | click → a panel at the side with workers and a toggle | one primary toggle, short stats |
| Planet Coaster | hover tooltip, rides show a queue icon when busy | click → a floating panel anchored beside the object | many tabs; heavy |

## The patterns that repeat

1. **Names are not drawn over the scene all the time.** Dense scenes use a quiet marker per object and show the name on hover, focus or selection. Markers that need attention keep a loud colour. An "always" switch is a courtesy for players who want it.
2. **A leader (a stem or an outline) ties the tag to its object**, so the tag cannot be mistaken for a button floating in space.
3. **A selected object is outlined or lifted, and the camera frames it** (a short ease, not a cut).
4. **The panel has a fixed order:** header (name, level pips), status, what it does, the numbers it provides, upkeep, the upgrade offer (cost and days) as its own block, then the main action. Secondary actions (frame, remove) are small.
5. **One list, not three.** An "attention" list is a state of the building list, not another panel: rows that need attention are marked, and a count sits in the header.

## What plan 259 takes

- Pins: a dot and a stem at each building; the name tag on hover, keyboard focus and selection, or on every pin with a "Names" switch (remembered in the browser). A building that is not running keeps a warning-coloured dot.
- A building panel in the order of pattern 4, with a Frame button; selecting a building eases the camera onto it (it jumps for players who prefer reduced motion), and closing returns to the site centre.
- A compact right panel: the site picker and the switch on top, the building panel when one is open, one Buildings list that scrolls, with the attention lines under it and a count in its header.
- Not taken: biome or info-view overlays (Cities), tabs (Anno, Planet Coaster), an outline shader on the selected building (a renderer task of its own; the dot, the tag and the camera frame carry the selection for now).
