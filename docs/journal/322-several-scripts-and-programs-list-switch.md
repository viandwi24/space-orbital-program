# 322 — Several scripts at once

**Plan:** [plans/322-several-scripts-and-programs-list-switch.md](../plans/322-several-scripts-at-once.md) · **Session:** Worker C, 2026-10-24 · **ADRs:** [0332](../decisions/0332-several-scripts-at-once.md) (supersedes 0276 point 7)

## What was done

| Where | What |
|---|---|
| `sim-host.ts` | the one session and its state became a `ScriptRun` per vessel in a map (session, log, verdicts, memory, hold); a Run replaces its own vessel's script; `script-stop { vessel }`; the warp hold covers every scripted vessel (zero and hold each in flight, granted once all are on rails, retried when the last hold ends); the sim's `script:detached` ends that vessel's run |
| `messages.ts`, `sim-client.ts` | `script-status` and `script-log` carry `vessel`; `script-stop` takes `vessel`; `stopScript(keep, vessel)` |
| `world-session.ts` | a sandbox per scripted vessel (`scriptSandbox(vessel)`); every saved script resumes in its own sandbox; `end()` closes all |
| `flight-loop.ts`, flight page | per-vessel script views (the panel shows the active vessel's), per-vessel run counters and sandboxes; the panel's sandbox status follows the active vessel |
| world layout | the sign shows while any script runs; a script ending closes its own sandbox |
| `programs-model.ts` | the script row's Stop is `script-detach`: the script ends, the vessel's autopilot stays engaged |
| tests | `sim-host-scripts.test.ts` (5: two scripts command their own vessels, stop one, a Run replaces its own vessel's, the programs Stop, warp held over both), `world-session.test.ts` (resume two saved scripts), `programs.test.ts` (detach keeps the autopilot), `programs-model.test.ts` |

## Notes

- Several Workers run at once, each with its own watchdog and budget; there is no shared budget.
- The warp request waits for all scripted vessels in flight to reach the rails; a burn in any of them clamps it to physics warp, as before.
