# 0048 — v1 public release scope

**Status:** accepted
**Date:** 2026-10-17
**Plan:** plans/023-release-readiness.md

## Context

The human asked (2026-10-16/17) that work not stop until the game is "finished and ready to market to the public", judged against Kerbal Space Program 2. By plan 033 the visuals, HUD, VAB, terrain, heating, boosters/fins, gimbal and scripting are in place, but a review of `product/spec.md` against the code found gaps a KSP player meets in the first hour: no stability assist (SAS — in the spec's Phase 1 scope but never planned), no saving or resuming a flight, a single body with no moon to fly to, no maneuver nodes, and no way to install a mod at runtime although moddability is the product's headline. Meanwhile follow-up drafts keep appearing (034–038, 040, 041); without a cut there is no release.

## Decision

**v1 (must ship):**
- Everything already `done` (plans 001–033 except drafts).
- 032 browser matrix, 039 frame budget / mountain haze / radar altitude (in progress).
- 042 SAS and flight assists (attitude hold, prograde/retrograde/normal/antinormal/radial-in/out, navball buttons).
- 043 Save and load game (quicksave/quickload, autosave, named saves, resume a flight, versioned format with migration).
- 044 A moon and SOI transitions (second stock body, patched conics, map view and time warp across SOIs).
- 045 Maneuver nodes (create/edit in map view, Δv vector, burn time, navball marker, predicted orbit incl. SOI encounters).
- 046 Runtime mod loading (install a mod from a file/URL with a trust prompt, mod manager, mod content in VAB/flight; spec Phase 2 success criterion).
- 023 release readiness (menus, settings, onboarding/tutorial, performance, review of every screen, release checklist incl. the human's licence decision).

**Should ship if budget allows:** 037 volumetric clouds (the flat cumulus is the most visible remaining look gap).

**Post-v1 roadmap (published, not blocking):** 034 VAB extras, 035 script targets/maneuver data (after 045 it becomes cheap), 036 editor niceties, 038 lakes/rivers/site animation/mobile, 040 effects & assets 3, 041 struts/fuel lines/wings. Device measurements on M1/M2/Intel need hardware the sessions do not have; v1 ships with the automatic quality governor of plan 039 and states measured hardware honestly.

## Alternatives considered

- **Ship as is** — rejected: no SAS and no save make the game frustrating; a KSP-like with nowhere to go but orbit undersells it.
- **Implement every draft** — rejected: drafts spawn drafts; there would be no release.

## Consequences

- `product/spec.md` §4 gains a "v1 public release" list pointing here.
- Plans 042–046 are drafted now; 023 runs last and owns the final review and the roadmap page.
