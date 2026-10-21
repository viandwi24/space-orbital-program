# 285 — Blueprint Library

**Plan:** [plans/285-blueprint-library.md](../plans/285-blueprint-library.md) · **Session:** part visuals session (Claude), 2026-10-21

## What was done

- **API 0.1.100:** `defineBlueprint` and `ctx.blueprints`, a `blueprint` registry kind. A blueprint carries `{ id, title, inspiredBy?, goal, crew, summary, design }`, and the design is checked with `vesselDesignSchema`.
- **`lib/editor/blueprints.ts`:** one list of cards made of:
  - the five learn examples (the old text buttons);
  - the seven famous missions;
  - the mods' blueprints.

  It also has filters (origin, goal, crewed or probe, words) and card read-outs (parts, wet mass, vacuum Δv, liftoff TWR) from the Hangar's own `designStats`.
- **`BlueprintLibrary.svelte`:** each card is the design drawn by the Hangar's view on a blue grid, with badges, the summary, the numbers and a Load button. Pictures and numbers are worked out once per card.
- **The empty Hangar:** four featured cards (Two-stage starter, Kronos V + Selene, Wayfarer Shuttle, Trailblazer Rover), "Open the Library", and "Open a saved vessel" when there is one. They replace the ten text buttons.

## What surprised me

- ADR 0263 wanted the stock blueprints as mod data. They are built with the editor's operations (attach targets, radial sites, symmetry), which only the web app has. So they stay code in `apps/web`, and mods get the registry. Generating stock data from them would need a build step: draft 310 notes it.

## Open questions / follow-ups

- Draft 310: leader-line labels, the completeness checklist, a thumbnail cache, career locks, and tabs for saved designs and sub-assemblies.
- Screenshots: the heavy-job lock was held by another session at commit time; they come with plan 309's journal.

## Verification output

```
apps/web vitest blueprints.test.ts: 3 pass (every card resolves; "moon" gives three; a test plugin's blueprint is under Mod)
bun run test: 2141 pass, 0 fail
apps/web vitest src/lib: 1419 pass; failing: the two known sim-host-script-worker tests and two plan 309 tests in progress
svelte-check: 0 errors, 0 warnings
```
