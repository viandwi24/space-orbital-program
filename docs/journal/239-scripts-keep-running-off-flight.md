# 239 — A running script keeps running when the player leaves Flight

**Plan:** [plans/239-scripts-keep-running-off-flight.md](../plans/239-scripts-keep-running-off-flight.md) · **Session:** Worker C, 2026-10-20 · **ADRs:** [0232](../decisions/0232-script-sandbox-lives-with-the-world.md), [0201](../decisions/README.md) point 9, [0038](../decisions/README.md)

## What was done

| Where | What |
|---|---|
| `lib/world-session.ts` | `scriptSandbox()`: one sandbox per world session; `end()` stops the script and closes it |
| `lib/flight-loop.ts` | leaving Flight with the world's client no longer closes the sandbox or stops the script |
| flight page | uses the world's sandbox |
| world layout | watches script status; closes the sandbox when the script ends; outside Flight the sign "A script is flying your vessel" with Back to Flight and Stop |
| tests | `world-session.test.ts` (+1: one sandbox kept across pages, stop and close on end), `e2e/script-off-flight.e2e.ts` (run by the integration batch) |

## What surprised me

- **Nothing else held the script back:** the sim already ran for the whole world; only the sandbox's owner and one `stopScript` in the flight's cleanup ended it.

## Open questions / follow-ups

- None. Batch mode (owner's order, 2026-10-20): the e2e runs in Worker B's integration run, not locally.
