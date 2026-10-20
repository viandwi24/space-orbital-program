# 248 — Shell everywhere: warp, Debug, Save/Load, the clock chip, branch buildings in 3D

**Plan:** [plans/248-shell-everywhere-branches-3d.md](../plans/248-shell-everywhere-branches-3d.md) · **Session:** Worker C, 2026-10-20 · **ADRs:** none (ADR 0201, 0222 point 4 and 0229 stand)

## What was done

| Where | What |
|---|---|
| `WorldShell.svelte`, world layout | a page that does not drive the warp (everything but Flight) gets the world's: segments call the `warp` command, the limit and its reason come from `snapshot.warpLimit`, the levels from the system (Sol adds 100k×) |
| world layout | the Debug panel on every page but Flight (Alt+F12 and a ☰ entry shown where debug tools are allowed), with the vessel library for Set orbit; Save and Load dialogs and their note |
| `WorldShell.svelte` | ☰ menu entries Save (when there is something to save), Load and Debug |
| `TimeBar.svelte` | the clock chip is a button while a place pauses the clock: it turns that place's pause off (Settings → Time puts it back) |
| `space-center/+page.svelte` | the 3D view draws the chosen site's buildings while it is on the home planet (HQ or a branch); a click places there by hand. Off-world bases keep the first-free-cell placement |
| tests | `e2e/shell-everywhere.e2e.ts`; `branch-sites.e2e.ts` now places by hand (run in the integration batch) |

## What surprised me

- **Flight already had all of it** (pause menu with Save, Load, Debug, its own `SaveController`); the layout mounts its own only off Flight so there is one dialog per page.

## Open questions / follow-ups

- A branch is drawn on the home site's terrain with its own cells (a flat grid), not on the ground at its latitude and longitude.
- The chip only lifts a pause; turning one back on is in Settings → Time.
