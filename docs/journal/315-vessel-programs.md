# 315 — Vessel programs

**Plan:** [plans/315-vessel-programs.md](../plans/315-vessel-programs.md) · **Session:** vessel programs session (Claude), 2026-10-21 · **ADR:** 0273 · **Research:** `research/vessel-programs.md`

## What was done

- **Research** (four parallel look-ups): KSP 1 stock, kOS, MechJeb 2, kRPC, background-thrust mods, KSP 2; Juno, Space Engineers, From the Depths, Starbase, Stormworks; Boeing CWS, Airbus, autothrottle, ArduPilot, PX4, Tesla, Shuttle CSS, Apollo DAP, TORU; ROS `twist_mux`; Screeps, Factorio, ComputerCraft, OpenComputers/Eris, quickjs-wasi, Temporal. The answer was the same everywhere: per-axis override, take back after a quiet time, never silent, throttle is latched, persist an explicit JSON state and restart.
- **Part A:** the Mods page has a "Built in" section from `BUILTIN_PLUGINS` (`lib/mods/builtin-list.ts`).
- **Part B (sim):** `CommandSource` gains `autopilot`; the delay queue keeps the source; `programs.ts` holds the override per channel; `throttle` and `attitude` drop a program's write to a held channel and report `overridden`; `program-stop`; events and snapshot `override`.
- **Part C (scripts):** `script-attach`/`-memory`/`-detach`; the runner's `memory`/`resumed` globals and `TickResult.memory`; the host commits memory every second and detaches on end; `script-stop { keep }` on world end; `ready.savedScripts` and `worldSession` resuming; switching vessels no longer stops the script.
- **Part D (web):** "N programs" in the status bar with a list and Stop; the Delete key and Abort send `program-stop`; toasts and debug-log lines for the program events.
- **Merge:** `origin/main` brought plan 310's control-part axes (ADR 0270) into the same `attitude` handler; held channels are now compared in the control part's axes.

## What surprised me

- **The replay recorder dropped `source`.** `recordReplay(...).dispatch(command)` ignored the options, so in the web client every script command reached the sim as the player's. In the browser this made the script's own throttle an override, and the runner's re-send after the override ended started it again forever. It also means the `flight-computer` signal rule (plan 117) never saw a script command in the web client. The recorder now passes the options and logs `source`; `programs.test.ts` covers it.
- **The runner deduplicates setpoints.** A script sets `ship.throttle` once; a write dropped during an override would never come back. The runner now re-sends the last throttle and attitude command on the tick the override ends.
- **Node 26 removed `--experimental-transform-types`**, so `sim-host-script-worker.test.ts` (two real-thread tests) fails on this machine on `main` too. Not caused by this plan; left for its own fix.

## Verification output

See the plan's Log for the final command output. Browser (dev server on the worktree):

- Mods page: "Built in" lists Orbital stock content and The real solar system.
- Two-stage on the pad, a script `memory.runs = (memory.runs || 0) + 1; print('resumed', resumed, 'runs', memory.runs); ship.throttle = 0.3; while (true) await nextTick();` → status bar "1 program". After a page reload the world reopened from its autosave and the log said `resumed true runs 2`.
- Delete in Flight: toast "Programs stopped · Delete key", the script panel `stopped`, the chip gone.

## Open questions

- Several scripts at once (draft 317) and the MechJeb-style autopilots (draft 316, waits for plan 310 Part 3).
- Plan 310 Part 3 merged in: its runner dispatches with source `autopilot` (changed here) and `program-stop` calls its `endAutopilot(..., 'disengaged', reason)`; `programs.test.ts` flies a test autopilot through both.
- The HUD's throttle gauge shows the page's throttle, not the sim's: a script's throttle is not reflected (as before this plan).
