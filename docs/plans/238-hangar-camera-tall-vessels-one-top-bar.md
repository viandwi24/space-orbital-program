---
id: 238
title: "Hangar: the camera reaches the top of a tall vessel; one top bar"
status: ready
owner: "Worker A"
depends: []
phase: 7
created: 2026-10-20
updated: 2026-10-20
---

# 238 — Hangar: the camera reaches the top of a tall vessel; one top bar

**Size:** M

## Goal

Close two owner complaints that the release audit (2026-10-20) found still open in code: C3 (scroll the camera up and down a tall rocket) and C15 (no second top bar).

## Context

The owner ordered real bugs fixed before v1.0.0 (2026-10-20).

1. **C3, camera height.** `packages/renderer/src/vab/orbit-camera.ts:29-38` fixes `panTop: 34`. `raise` (`:104-116`), `focus` (`:129`) and `pan` (`:179`) clamp the target's height to `[0, panTop]`, and `view.ts:572-576` `raiseBy` passes the default limits. A vessel taller than about 34 m cannot be scrolled to its top; a short vessel scrolls into empty space up to 34 m. Only follow mode uses the vessel's height.
2. **C15, two top bars.** The Hangar still mounts its own `lib/vab/TopBar.svelte` (`routes/(world)/vab/+page.svelte:16,171`), with a back button and Open / Save / Launch. Those actions are already in the shell's menu bar through `pageActions` (`vab/+page.svelte:103-134`, plan 204). BASE_LAYOUT (`refs/space-orbital-program-ui-v2/`, `docs/BASE_LAYOUT.md`) has one menu bar and no other top bar (ADR 0222 point 1).

## Scope

**In:**
- The camera's vertical range follows the vessel: from the floor up to the vessel's top plus a margin, never less than a small room height. The wheel, middle-click focus and pan use it.
- Remove the Hangar's own top bar; anything it has that the menu bar lacks (e.g. the vessel name field, if it lives there) moves to the matching place in the v2 design.

**Out:** free ghost under the cursor, top/bottom surface attach, Shift-click whole vessel (later plans).

## Touches

`packages/renderer/src/vab/orbit-camera.ts`, `packages/renderer/src/vab/view.ts`, `apps/web/src/lib/vab/controller.svelte.ts`, `apps/web/src/lib/vab/TopBar.svelte` (removed or reduced), `apps/web/src/routes/(world)/vab/+page.svelte`, e2e under `apps/web/e2e/`.

## Steps

1. Give the orbit camera a `panTop` that the view sets from the vessel's bounds (top + margin, at least the current room minimum), updated when parts are added or removed; renderer unit test: for a 60 m vessel the target can reach 60 m; for a 5 m vessel it stops a little above 5 m.
2. Remove the Hangar's top bar; compare with the v2 `.dc.html` for the Hangar (or BASE_LAYOUT if it has none) and move any field it alone held. Update e2es that clicked its buttons to use the menu bar.
3. Chromium e2e: build a tall stack through the debug API or the catalogue, scroll the wheel up, and check the camera target reaches the top part; check the page has exactly one menu bar and no `.topbar` inside the Hangar.
4. `check:affected`, then the worker brief's hand-over and merge.

## Acceptance criteria

- [ ] The camera's vertical range follows the vessel's height; renderer test passes.
- [ ] The Hangar shows only the shell's bars (no second top bar); e2e passes on Chromium.
- [ ] Every Hangar action that was on the old top bar is still reachable.
- [ ] `bun run check:affected` passes, and CI is green on `ready/238`.

## Docs checklist

- [ ] STATUS row, journal `docs/journal/238-hangar-camera-tall-vessels-one-top-bar.md`; remove the matching lines from STATUS "Known issues".

## Log

- 2026-10-20 — Created by the coordinator from the release audit; ready (both checked against main @ b2d2abb2). Owner order: fix before v1.0.0.
