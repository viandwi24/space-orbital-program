# Owner manual test, 2026-10-20 evening

The owner tested by hand on the GitHub Pages build of `main` (https://viandwi24.github.io/space-orbital-program/), after plans 237–253 landed. Items 11–19 come from a local build a few hours older; each plan that takes one checks it against current `main` first. The owner's words are paraphrased in English; screenshots are in `assets/2026-10-20-owner-test/`, numbered as the owner numbered them.

## Hangar

| # | Screenshot | Report | Plan |
|---|---|---|---|
| 1 | `01.webp` | The tower arms reach diagonally into the middle of the bay. They look bad, and the owner had asked for a large free space in the middle so building a rocket feels roomy. | 255 |
| 2 | `02.png` | The parts catalogue lists an EVA Suit and a Flag. In KSP and KSP2 these belong to the astronaut's inventory, not to the parts list. | 255 |
| 3 | `03.webp` | The right-hand panel needs to be compact and tidy. Staging looks untidy. Is the Trip / Low orbit block needed? Check how KSP and KSP2 show it, then tidy and compact it. | 255 |
| 4 | `04.webp` | The Hangar has a navbar inside a solid black container that the v2 design does not have; it should look like the Flight page. The time-bar chip "PAUSED · HANGAR" looks wrong; it should be a normal small badge like the one that reads "PAUSED" after a manual pause. | 255 (+ 256 for the badge) |
| 5 | `05.png` | The Hangar's top-bar actions (New, Open, Save, Launch) are text without icons. | 255 |

## Flight

| # | Screenshot | Report | Plan |
|---|---|---|---|
| 6 | `06.webp`, `07.webp` | Dock panels look right while short, but when a tall panel opens (for example Script), the dock's tab rail stretches with it and looks broken. | 256 |
| 7 | `08.webp` | When the navball panel is hidden, the camera's centre anchor moves up. The owner expects it to move down, so the vessel stays centred in the free space. | 256 |
| 8 | `09.png` | The vessel panel still looks bad: the buttons are untidy and should be icons where possible. It should be compact, and sections should be collapsed by default (accordion), as in KSP and KSP2. | 256 |
| 9 | `10.png` | Debug → Set orbit shows the fatal error card "Something went wrong / Internal Error". | 257 |
| 10 | (none) | Opening the Debug panel from the menu does not pause the game. Opening the menu itself does, and Debug should too. | 257 |

## Reported on the older local build: check whether still present

| # | Screenshot | Report | Plan |
|---|---|---|---|
| 11 | `11.jpg` | A "Touchdown at 17.5 m/s" warning appears while the active vessel is flying (another vessel's touchdown?). | 257 |
| 12 | `12.jpg` | "Cannot throttle — no free physics frame (another vessel is in flight far away)", often after time warp or Debug set orbit, so the engine cannot be lit. | 257 |
| 13 | (none) | After time warp returns to 1×, throttle sometimes does not apply until it is cut and raised again. | 257 |
| 14 | (none) | After time warp, SAS turns (prograde → retrograde) snap instantly, like a teleport, instead of rotating with the available torque. | 257 |
| 15 | (none) | Keyboard focus: after clicking a panel, hotkeys do not work until the canvas is clicked. | 257 |
| 16 | `13.jpg` | When the vessel crashes into the ground, the camera shows a noise image. | 257 |
| 17 | `14.png` | The time-bar chip "PAUSED · MENU" also looks wrong; it should be a normal badge. | 256 |
| 18 | `15.webp` | Map: orbits and vessels should look like KSP's. The active orbit line is white and other orbits grey; vessels use vessel/pod icons, not dots; comms links are drawn (green lines). The map needs show/hide toggles so the player chooses what is shown. | 258 |
| 19 | `16.webp` | The Map / Mission Center tabs are not aligned in y with the time-bar panel and the menu panel above. | 256 |
| 20 | `17.webp` | Space Center: the site picker for building is good, but the right-hand panel looks bad. | 259 |
| 21 | `18.webp` | Space Center: the building name labels do not blend with the scene. Research how building games do it (labels on hover?) and design labels that fit. | 259 |
| 22 | `19.webp` | Space Center: opening a building shows only a simple panel at the top right. Research a good building UI first. | 259 |

## Later the same night (Pages build after plans 255–260)

| # | Screenshot | Report | Plan |
|---|---|---|---|
| 23 | `20.webp` | In the Landing lesson, during the Touch down step, the throttle keeps climbing from 0 to 100 %, even after X is pressed. | 262 |
| 24 | `21.webp` | Close to the Moon's surface, at some angles, black slivers appear in the ground, as if the crust were see-through to the sky. | 263 |
| 25 | `22.webp` | On the Moon, a pod that fell rolls along without touching the ground. It hovers visibly above its own shadow. Is the collider wrong? Once it stops, it rests on the ground (second screenshot, chat only). | 264 |
