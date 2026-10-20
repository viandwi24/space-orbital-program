---
id: 239
title: "A running script keeps running when the player leaves Flight"
status: in-progress
owner: "Worker C"
depends: []
phase: 7
created: 2026-10-20
updated: 2026-10-20
---

# 239 — A running script keeps running when the player leaves Flight

**Size:** M

## Goal

Meet ADR 0201 point 9. A script that flies a vessel keeps running while the player is in the Map, Space Center, Hangar or any other in-world page. It stops only when the player stops it, the world is left, or the script ends.

## Context

The release audit (2026-10-20) found that leaving Flight stops the script. The cleanup in `apps/web/src/lib/flight-loop.ts:~1884-1889` closes the sandbox (`options.sandbox?.close()`) and calls `client.stopScript()`, even when the world keeps running without the page (`ownsClient` false). Journal 204 listed this as a follow-up and no plan took it. The sim already runs for the whole world (plans 204/205, `lib/world-session.ts`). The owner ordered real bugs fixed before v1.0.0.

## Scope

**In:**
- Move the script sandbox's lifetime from the Flight page to the world session. The session starts it, Flight attaches to it, and leaving Flight leaves it running.
- The status bar or bell shows that a script is running when the player is not in Flight. One click returns to Flight; one action stops it.
- Stopping on world exit and on save load stays as today.

**Out:** a script editor outside Flight; scripts for several vessels at once.

## Touches

`apps/web/src/lib/flight-loop.ts`, `apps/web/src/lib/world-session.ts`, the sandbox/worker setup it uses, `routes/(world)/+layout.svelte`, the status bar, and an e2e (`leave-flight` or a new one).

## Steps

1. Read how the sandbox is created and wired to the client in the flight page, and refine this plan's Steps if the wiring needs an ADR. If so, write the ADR first, as CLAUDE.md requires.
2. Hold the sandbox in the world session, and let the flight page attach and detach.
3. Add a "script running" sign outside Flight, with a stop action.
4. E2e (Chromium): start a script that throttles up and holds a heading, go to the Space Center, wait, return. The script is still running, and the vessel kept being flown (its altitude rose). Leaving the world stops the script.
5. Run `check:affected`, then follow the worker brief's hand-over and merge.

## Acceptance criteria

- [ ] Leaving Flight does not stop a running script; e2e passes on Chromium.
- [ ] Leaving the world or loading a save stops it.
- [ ] The player sees that a script is running outside Flight and can stop it.
- [ ] `bun run check:affected` passes, and CI is green on `ready/239`.

## Docs checklist

- [ ] STATUS row.
- [ ] Journal `docs/journal/239-scripts-keep-running-off-flight.md`.
- [ ] Remove the matching Known-issues line.
- [ ] Add an ADR note if the session wiring changed.

## Log

- 2026-10-20 — Created by the coordinator from the release audit; ready (checked against main @ b2d2abb2). Owner order: fix before v1.0.0. It follows 237 in Worker C's queue; there is no code dependency, so `depends` is empty.
- 2026-10-20 — Worker C claimed (claim/239). Step 1: the wiring needs an ADR (the sandbox's owner moves): ADR 0232, written before the code. The sim needed nothing. Batch mode (owner's order): light checks here, the e2e `script-off-flight.e2e.ts` runs in the integration batch.
