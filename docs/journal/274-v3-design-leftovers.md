# 274 — The v3 leftovers: toasts, the chip flash, the Orbit panel, the demolish box, back to Overview

**Plan:** [plans/274-v3-design-leftovers.md](../plans/274-v3-design-leftovers.md) · **Session:** ui-v3 session (Claude, M5), 2026-10-22

## What was done

| Where | What |
|---|---|
| `lib/toasts.ts`, `ui/Toasts.svelte` | V3 §2.2:<br>• at most two toasts;<br>• the same event (same key, or with no key the same kind and words) merges into one toast that counts up, shown as a ×n badge;<br>• a dismiss button;<br>• a 28 px icon tile in the tone; title 12/600, detail 10, 380 wide. |
| `lib/hud/status-chips.ts`, `StatusStrip.svelte`, the flight page | `chipToFlash(toast, chips)`: a refused command or "Out of power" points at the chip that explains it (power, signal, torque, else control), and that chip flashes with its tone's outline for 1.2 s. With reduced motion it only outlines. |
| `lib/hud/OrbitStrip.svelte` | V3 §2.1: key · right-aligned value with the time as sub-text · a 28 px warp icon at the end of the apsis rows. The terms keep their tooltips without the dotted underline. |
| `lib/space-center/*`, the Space Center page | Demolish (V3 §1.3): the building under the bulldozer, or the one being confirmed, gets the red ghost box over its footprint. |
| `lib/layout/page-actions`, `MenuBar`, the Space Center page | `pageShell.home`: the page's own fixed icon calls it, so the Space Center icon returns to Overview (V3 §1.4). |

## Notes

- **The site's buildings are merged** into one mesh per material (plan 091), so tinting one building would need the renderer to split them. The red box reuses the placement ghost and needs nothing new.
- **Two toasts instead of four.** The region table and `hud-layout.e2e.ts` now say two.

## Screens

The Demolish confirm with the red box over the Hangar: `assets/274-sc-demolish.jpg` (Chromium, production build).

## Checks

- svelte-check: 0 errors.
- Web vitest with `CI=true`: 1473 pass, no obsolete snapshots. The two that fail are the `sim-host-script-worker` Worker timeouts, which fail on the base too.
- The Space Center screenshot spec passes.
- The Flight screenshot spec stops at `launchTwoStage`. The Hangar no longer shows "Load the two-stage example" since the Hangar work on main, so every e2e that uses that helper needs it changed. That is not this plan's; it was reported to the main session.
