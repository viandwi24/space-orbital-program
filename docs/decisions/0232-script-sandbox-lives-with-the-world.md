# 0232 — The script sandbox lives with the world, not with Flight

**Status:** accepted
**Date:** 2026-10-20
**Plan:** plans/239-scripts-keep-running-off-flight.md
**Builds on:** ADR 0038 (the script sandbox), ADR 0201 point 9 (a vessel keeps flying when the player leaves Flight)

## Context

The world's sim already outlives the Flight page (plan 204), but the script sandbox (the iframe with the script Worker) was made by the Flight page and closed with it, and the flight loop sent `stopScript` on the way out. A script stopped whenever the player looked at the map or the Space Center, against ADR 0201 point 9.

## Decision

1. **The world session owns the sandbox** (`worldSession.scriptSandbox()`, made once per page load on first use). Flight runs and stops scripts in it; leaving Flight neither closes it nor stops the script.
2. **The world layout watches the script:** it closes the sandbox when the script ends (so a Worker spinning in a native builtin dies with its iframe, as ADR 0038 asks) and, outside Flight, shows a sign "A script is flying your vessel" with **Back to Flight** and **Stop**.
3. **A script ends with its world:** `worldSession.end()` (leaving the world, and every restart: a load, a quickload, a revert) sends `stopScript` and closes the sandbox.

## Consequences

- One script at a time per world, as before; the Flight panel shows the running script again when the player returns (its periodic status).
- A flight that owns its own client (no world session) keeps the old behaviour: its sandbox closes with the page.
