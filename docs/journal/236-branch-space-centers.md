# 236 — Branch space centers on the home planet, linked into the network

**Plan:** [plans/236-branch-space-centers.md](../plans/236-branch-space-centers.md) · **Session:** Worker B (M5), 2026-10-20 · **ADRs:** [0229](../decisions/0229-branch-space-centers.md), 0222 point 4, 0177, 0142, 0115, 0123, 0125, 0179, 0150

## What was done

| Where | What |
|---|---|
| `packages/core` | site kind `branch`; `BRANCH_HQ`, `branchHqOf`, `hqReady`; `canPlace` waits for a branch's HQ (code `hq`) and never places a `branch-hq` by hand; command `found-branch`; the site placement's `at: { east, north }`; `terrainReadout` (sea, coast, land from the templates' probe); API 0.1.86 |
| `packages/sim` | `found-branch` (the site rules of `found-site`, now shared as `siteRefusal` and `addSite`; the HQ's level-1 cost paid; the HQ under construction); a branch is a ground station only with a working comms building; site placement at a spot; the `instant-construction` cheat also finishes work in progress |
| `mods/stock` | `stock.branch-hq` (250 000 funds, 20 days, upkeep 2 500, Infrastructure) |
| web, Space Center | "Found a branch" and `BranchPicker.svelte`: a map of the home planet (sea, coast, land by height; the sites' zones drawn as land with keep-out rings), the spot's place, ground, what lies east, rotation boost, lowest inclination, nearest site, cost and HQ time, and the refusal in words; founding writes the record, saves and reloads the world; the site switcher; the status bar names the shown site; at a branch a building goes to the first free cell; the build menu says "Comes with a new branch" and "The branch HQ is still under construction" |
| web, Launch | a site choice (the HQ and the branches) with each site's live buildings from the running sim; the vessel goes to the chosen pad or runway with `{ kind: 'site', site, at }` |
| web, Mission Center | a Sites panel: name, kind, place, ground station and its range |
| web, world layout | Settings' Debug mode reaches the sim on every in-world page (Flight did it alone before), and `worldSession.saveNow` |
| tests | sim `branches.test.ts` (the far-side link, the charge, the HQ's days, nothing before the HQ, the cheat, the zone rules); core `categories` unchanged; web vitest `branch-model` (map, rules, rows, build-menu reasons) and `launch-model` (site placement); e2e `branch-sites.e2e.ts` |

## Screenshot

- The picker with a spot on the equator east of the HQ: `assets/236-branch-picker.jpg`

## What surprised me

- **The picker's first click landed 43° south of the pointer.** The dialog scales in when it opens, and a client rect read during that animation is the scaled one. The click's own offset over the canvas's layout size is right at any moment.
- **The terrain probe reads the map without zones**, so the HQ itself stands in the sea there (its zone makes the land). The picker checks the sites before the sea and draws each zone as land.
- **A Career world's debug API needs Debug mode in the sim**, which only the flight page sent. The world layout now does it for every page.
- **The Launch screen read the world record**, which the Space Center writes only after a change: a pad finished on the world tick would not have shown. It now takes each site's buildings from the running sim.

## Decisions made (link ADRs)

- [ADR 0229](../decisions/0229-branch-space-centers.md); the choices the plan left open are in the plan's Log.

## Open questions / follow-ups

- The Space Center's 3D view draws the HQ's site only; a view that centres on any home site would let the player place a branch's buildings by hand.
- In a world with no save yet, the reload after founding starts from the world record: the sites are kept, the funds spent are not (the same holds for buildings placed before any save).

## Verification output

```
bun run check:affected --build --e2e e2e/branch-sites.e2e.ts (under /tmp/orbital-heavy.lock, Chromium, 1 worker)
  ✓ prettier (36 changed files) · ✓ docs:check · ✓ typecheck (11 workspaces) · ✓ typecheck (web)
  ✓ bun test (10 workspaces) · ✓ web vitest (related to the change)
  ✓ build · ✓ e2e e2e/branch-sites.e2e.ts (chromium)
  check-affected: all passed in 396.4 s
bun run lint: all matched files use Prettier code style
sim branches.test.ts: 4 pass (far-side link, charge and HQ days, the cheat, the zone rules)
e2e (Chromium): branch-sites, space-center, build-menu, launch, mission-center, debug, world-shell, smoke: 17 passed
CI: refs/ci/pass/eac2d416b831f584b651dbc905ead56c85c5b0ac (ready/236)
```
