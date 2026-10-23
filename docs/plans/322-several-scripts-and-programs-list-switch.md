---
id: 322
title: "Several scripts at once, one per vessel; a script-only stop"
status: draft
owner: ""
depends: [320, 359]
phase: 0
created: 2026-10-21
updated: 2026-10-24
---

# 322 — Several scripts at once

## Goal

Each vessel can run its own script at the same time (ADR 0276 point 7 keeps one per world for now): the sim host keeps a script session per vessel, every saved script resumes when the world opens, the warp hold covers every scripted vessel, and the programs list can stop a script without stopping the vessel's autopilot.

## Context

- ADR 0276 (programs; point 7: one script per world), 0302 (plan 359: the programs popover with Open panel, Vessel and Stop), 0232 (one sandbox per world), 0038 (sandbox frame), 0039 (warp hold: written for one script vessel).
- Plan 359 already did "Switch to" (the popover's Vessel button). It lists 322 in its `depends`, though it shipped first.
- Code:
  - `apps/web/src/lib/sim-host.ts`: one `session` and one `scriptVessel` (about line 180); the warp hold reads `scriptVessel`.
  - `apps/web/src/lib/world-session.ts`: `resumeSaved` (about line 119) resumes only `savedScripts[0]`.
  - `apps/web/src/lib/layout/ProgramsPopover.svelte`: a script row's Stop sends `program-stop`, which ends the script and any autopilot on the same vessel.

## Scope

**In:**
- A session map keyed by vessel in the host.
- Script status and log per vessel in `script-status`/`script-log`.
- The warp hold over every scripted vessel.
- Resume every saved script.
- The Flight panel shows the active vessel's script.
- A script-only stop: ends the script and leaves the vessel's autopilot engaged.

**Out:**
- A budget shared across scripts beyond one Worker each.
- Scripts on agency vessels.
- Switch to from the programs list (done, plan 359).

## Steps

1. Session map in `sim-host.ts`, with per-vessel status and log.
2. The warp hold over all scripted vessels.
3. Resume every saved script in `world-session.ts`.
4. Script-only stop in the host and the programs popover.
5. New ADR superseding ADR 0276 point 7.

## Acceptance criteria

- [ ] web vitest: two vessels each run a script; both dispatch with their own vessel; stopping one leaves the other; a world opened from a save with two scripts resumes both.
- [ ] web vitest: a warp request with two scripted vessels in flight holds both attitudes and is granted once both are on rails.
- [ ] web vitest: the script-only stop ends the script and the vessel's autopilot stays engaged.
- [ ] `bun run typecheck`, web vitest with `CI=true`, `bun run docs:check` pass.

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row).
- [ ] `docs/journal/322-several-scripts-and-programs-list-switch.md` written.
- [ ] `docs/architecture/scripting.md` describes the session map; ADR 0276 point 7 superseded by a new ADR.

## Log

- 2026-10-24 — Rewritten by the coordinator after an audit against main @ 4c546c02: Switch to from the programs list is done by plan 359 (ADR 0302) and the StatusBar Stop is now `ProgramsPopover`, so that scope is removed; added a script-only stop; remaining: the per-vessel session map, resuming every saved script, the warp hold over several vessels and a new ADR superseding ADR 0276 point 7; depends add 359.
- 2026-10-21 — Drafted by the vessel programs session: plan 320 kept one script per world to leave ADR 0039's warp hold unchanged.
