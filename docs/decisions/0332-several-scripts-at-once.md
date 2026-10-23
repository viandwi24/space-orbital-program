# 0332 — Several scripts at once: one per vessel, a Worker each

**Status:** accepted
**Date:** 2026-10-24
**Plan:** plans/322-several-scripts-and-programs-list-switch.md
**Supersedes:** ADR 0276 point 7 (one script runs per world)
**Builds on:** ADR 0276 (vessel programs), ADR 0232 (the sandbox lives with the world), ADR 0038 (sandbox frame), ADR 0039 (warp hold), ADR 0302 (the programs popover)

## Decision

1. **A script run per vessel.** The sim host keeps a map from vessel to its run: the session, the log, the verdicts, the memory not yet committed and the warp hold. A Run on a vessel replaces that vessel's script only. Each run's commands are checked against its own vessel.
2. **A sandbox and Worker per script.** The world session keeps a sandbox per scripted vessel (`scriptSandbox(vessel)`); a script's end or Stop closes its sandbox only. A world that opens resumes every saved script, each in its own sandbox. There is no budget shared across scripts beyond the per-run budget.
3. **Status and log name their vessel.** `script-status` and `script-log` carry `vessel`; the Flight panel shows the active vessel's script; the world layout's sign shows while any script runs.
4. **The warp hold covers every scripted vessel.** A rails warp request zeroes and holds the attitude of every scripted vessel in flight; it is granted when all are on rails; a burn in any of them clamps it to physics warp as before; a script that ends frees its hold, and the request is retried when none is held.
5. **A script-only stop.** `script-stop { vessel }` stops one script (without it, every one); the programs list's Stop on a script row is `script-detach`, which ends the script and leaves the vessel's autopilot engaged. `program-stop` (the Delete key, Abort) still ends both.

## Consequences

- Messages gain optional `vessel` fields, so old fixtures stay valid.
- Several Workers can run at once: each has its own watchdog and first-tick budget.
