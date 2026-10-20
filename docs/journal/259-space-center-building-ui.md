# 259 — Space Center building UI

**Plan:** [plans/259-space-center-building-ui.md](../plans/259-space-center-building-ui.md) · **Session:** Worker B (M5), 2026-10-21 · **ADRs:** [0242](../decisions/0242-space-center-pins-building-panel-compact-list.md) · **Research:** [refs/space-center-ui-research.md](../../refs/space-center-ui-research.md)

## What was done

| Where | What |
|---|---|
| `refs/space-center-ui-research.md` | what the searches verified and what is recalled, the repeating patterns, what the plan takes |
| `SpaceCenterOverlay.svelte` | pins (dot, stem, name tag on hover, focus, selection or "always"), the Names switch, the building panel (level pips, status, description, provides, upkeep, upgrade block, main action, Frame, Remove), one scrolling Buildings list with the attention lines and a count |
| `model.ts` | `BuildingRow` gains `level`, `maxLevel`, `description`, `upkeep`, `capacity`; `capacityLines` |
| `renderer` | `setSiteFocus` moves the site view's orbit pivot to a building and eases there |
| `space-center/+page.svelte` | label mode kept in `localStorage`, hover from pins and list rows, framing on select and Frame, back to the centre on close |
| tests | `model.test.ts`: the new row fields, which pins show their name, the panel's blocks, `capacityLines` |

## What surprised me

- Web search returned almost nothing about the building games' own UIs; the research doc says which parts are sourced and which are recalled.
- The building definitions already held the description, the levels' upkeep and capacity: the panel needed no sim change.
- The camera pivot of the site view is the site centre's stand-in vessel; an offset added after the centre keeps all the existing orbit and zoom code.

## Open questions / follow-ups

- **No screenshots** (before or after): no browser run was made, and e2e is paused by the owner (2026-10-20). `[manual]` The owner looks and approves.
- A selection outline on the building's mesh is a renderer task of its own.
- The pointer hovering a building in the scene does not show its tag (only pins and list rows do); picking by footprint cell would add it.

## Verification output

pending
