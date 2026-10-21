---
id: 322
title: "Several scripts at once, one per vessel; Switch to from the programs list"
status: draft
owner: ""
depends: [320]
phase: 0
created: 2026-10-21
updated: 2026-10-21
---

# 322 — Several scripts at once

## Goal

Each vessel can run its own script at the same time (ADR 0276 point 7 keeps one per world for now): the sim host keeps a script session per vessel, every saved script resumes when the world opens, and the status bar's programs list can switch Flight to a program's vessel.

## Context

- ADR 0276 (programs), 0232 (one sandbox per world), 0038 (sandbox frame), 0039 (warp hold: written for one script vessel).
- Code: `apps/web/src/lib/sim-host.ts` (`session`, `scriptVessel`, the warp hold), `world-session.ts` (`resumeSaved` takes the first), `layout/StatusBar.svelte` (Stop only).

## Scope

**In:** a session map keyed by vessel in the host; script status and log per vessel in `script-status`/`script-log`; the warp hold over every scripted vessel; resume all saved scripts; the Flight panel shows the active vessel's script; "Switch to" in the programs list (navigates to Flight and switches).
**Out:** a budget shared across scripts beyond one Worker each; scripts on agency vessels.

## Acceptance criteria

- [ ] web vitest: two vessels each run a script; both dispatch with their own vessel; stopping one leaves the other; a world opened from a save with two scripts resumes both.
- [ ] web vitest: a warp request with two scripted vessels in flight holds both attitudes and is granted once both are on rails.
- [ ] `bun run typecheck`, web vitest with `CI=true`, `bun run docs:check` pass.

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row).
- [ ] `docs/journal/322-several-scripts-and-programs-list-switch.md` written.
- [ ] `docs/architecture/scripting.md` describes the session map; ADR 0276 point 7 superseded by a new ADR.

## Log

- 2026-10-21 — Drafted by the vessel programs session: plan 320 kept one script per world to leave ADR 0039's warp hold unchanged.
