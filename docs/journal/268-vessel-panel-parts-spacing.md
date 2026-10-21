# 268 — Vessel panel Parts tab spacing and the stacked transfer buttons

**Plan:** [plans/268-vessel-panel-parts-spacing.md](../plans/268-vessel-panel-parts-spacing.md) · **Session:** vessel-panel session (M5), 2026-10-21

## What was wrong

- **The transfer buttons.** `stock.resource-container` gives a container part two triggers, "Transfer out" and "Transfer in" (plan 214). `ControlRows` draws them as two `inline-flex` rows side by side. `.row` also carries `container-type: inline-size` for the slider's narrow form (plan 250). An inline-size container takes no width from its content, so each inline trigger row shrank to zero. Both buttons then overflowed from almost the same spot and their labels overlapped ("Trameffer ouint"). The part inspector shares `ControlRows`, so it had the same fault.
- **The gaps.** A part had `margin-bottom: 0.25rem`. A group header had a top margin from `.cap` but nothing below it, and groups had no gap between them.

## What was done

| Where | What |
|---|---|
| `vessel-panel/ControlRows.svelte` | `.row.trigger` sets `container-type: normal` (a trigger has no slider), and its button label does not wrap |
| `vessel-panel/VesselPanel.svelte` | an open group's header to its first row is `--s-2`, row to row `--s-2`, group to group `--s-4`, and the search field to the first group `--s-3`; a closed header has no bottom margin |

## Checked in the browser

The moon shot was flown from the Hangar (Shift+Launch), with the Parts tab open, all six groups open and the Command Pod expanded. Gaps were measured with `getBoundingClientRect`: header to row 8 px in every group, row to row 8 px, group to group 16 px. At panel widths 300, 340 and 440 px the two buttons are 85 and 77 px wide with a 4 px gap, on one line and without clipping. With `data-contrast="more"` at 300 px the result is the same.

## Checks

- `bun run typecheck`: 0 errors.
- `bun run lint`: fails only on three files that are not this plan's, the untracked `hud/MapPickList.svelte` and `hud/map-stack.test.ts` and the modified `space-center/model.test.ts`. Other sessions working in the same folder have these uncommitted. Prettier passes on this plan's files.
- `CI=true bunx vitest run` in `apps/web`: 1341 pass. Two fail in `sim-host-script-worker.test.ts` ("runs a script end to end in another thread", "a QuickJS builtin … is stopped by terminating the Worker"), and they fail when run alone too. That test drives the sim host and script worker, which this CSS change does not reach. The folder had uncommitted `packages/sim` and `packages/core` changes from the parallel sessions at the time. Not checked against a clean HEAD. `src/lib/vessel-panel`: 16 of 16 pass.

## Open

- The two triggers only hook the Resources tab's picker (the stock actions are no-ops). The buttons in the Parts tab do nothing visible yet. A follow-up could make them open the Resources tab's transfer picker with this part as the from or to end.
