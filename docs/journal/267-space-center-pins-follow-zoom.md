# 267 — Space Center pins that stayed behind on a zoom

**Plan:** [plans/267-space-center-pins-follow-zoom.md](../plans/267-space-center-pins-follow-zoom.md) · **Session:** space-center pins session, 2026-10-21 · **ADR:** [0251](../decisions/0251-space-center-pins-stay-on-their-anchors.md)

## Root cause (measured)

The projection was never stale: the loop projects every anchor each frame, after the draw. On `/space-center?renderer=webgl`, five wheel steps out, then read through the dev handle:

```
pins: launchpad-s 512,371 · mission-center 503,331 · administration 498,251 · hangar 447,291
projectSite(pad) = 512,384
```

The launch pad's pin is on its anchor; the other three sit 40, 80 and 120 px above theirs. That is `spreadLabels` (plan 091): a label box of 132 × 40 px overlapping a lower one is moved up 40 px. A zoom out brings the four buildings within 132 px of each other, so the pins stack over the site; turning the camera spreads the buildings sideways and the pins drop back, which is what the owner saw.

## What was done

| Where | What |
|---|---|
| `apps/web/src/lib/space-center/model.ts` | `pinPositions(rows, project, prev)`: each pin on its projected anchor, steadied by `steadyLabels`, no spreading |
| `apps/web/src/routes/(world)/space-center/+page.svelte` | `onFrame` uses `pinPositions` |
| `apps/web/src/lib/space-center/model.test.ts` | an eased zoom (200 m → 4 km → 200 m) keeps every pin within a pixel of its building; fails with the spreading put back; a pin behind the camera is hidden |
| docs | ADR 0251, plan 267 |

## Verification

- Browser, WebGL and WebGPU (`data-engine` "three.js r186 webgpu"): five wheel steps out, then ten in; in both screenshots each pin stands on its building. On WebGPU after the zoom in, the pad's pin is at x 512 and `projectSite(pad)` at x 512.
- Commands, in the shared checkout with other sessions' uncommitted work beside this one:
  - `bun run test`: 2083 pass, 0 fail.
  - `bun run typecheck`: 0 errors.
  - `CI=true` web vitest: 1341 pass, 2 fail, both in `sim-host-script-worker.test.ts` (the script Worker timed out at 5 s; untouched here, load average 7.5 and other sessions editing `packages/sim`); `src/lib/space-center` 31 of 31.
  - `bun run lint`: Prettier flags only `.claude/launch.json`, edited by another session.
  - `bun run docs:check`: flags rows 266 and 270, other sessions' plans still `in-progress`.

## What surprised me

The report pointed at the camera ("snaps back once panned or turned"), and the first guesses were an eased zoom or an event-driven update. The turn mattered only because it moved the buildings sideways out of the label box.
