# 0039 — Time warp while a script runs: the host holds the script's controls

**Status:** accepted
**Date:** 2026-10-17
**Plan:** plans/032-script-api-additions-and-browser-matrix.md
**Amends:** ADR 0031 (what the sim host does with a script's commands); builds on ADR 0016/0021 (rails rules), which are not changed.

## Context

Plan 030's manual run: the warp buttons did nothing while the sample ascent coasted in orbit. Cause (read from `packages/sim`): time warp needs every vessel on rails (`dispatch` refuses `warp` otherwise); a flight vessel goes on rails only after `RAILS_IDLE_TIME` (2 s) with no force or torque applied (`vessel.idle`, reset whenever `core.active` has it); a reaction wheel with any non-zero demand applies torque; the sample's attitude loop writes a new, non-zero `ship.attitude` every tick (a PD output is never exactly zero), and the HUD only enables the buttons for a vessel on rails. So a running script that holds an attitude keeps the vessel in flight and warp is impossible. A person who wants to warp lets go of the keys; a script cannot.

On rails the attitude is frozen (`simulation.md`), so "holding" an attitude during warp costs nothing and means nothing: the sim neither needs nor can use the demand.

## Decision

**While a script runs, the sim host gates warp requests and the script's controls; the sim and its rules are unchanged.**

1. **A warp request** (the page's `warp` command with a factor above 1, or the script's own `warp(factor)`, below) while a script is running does not go to the sim at once if the script's vessel is in flight:
   - If the script's last accepted throttle is above 0 (it is burning), the request is refused immediately: "the script is burning (throttle above 0); cut the throttle first".
   - Otherwise the host zeroes the vessel's attitude demand (`attitude 0,0,0`) and keeps the request **pending**; the vessel goes on rails after its 2 s of idle time (or it already was); the host retries the sim's `warp` each tick and answers the request when it is accepted. A pending request that the sim still refuses after **8 s of wall time** is answered with the sim's reason and the hold is released.
2. **The hold.** From a pending request until warp returns to 1, the host does not pass the script's non-zero `attitude` commands to the sim (they would wake the vessel, or be refused at warp above 1); it remembers the latest and answers the script with a refusal "held while time warp is requested or active". A `throttle` above 0, a `stage` or an `action` during a pending request **cancels** the request (the script wanted to act now; the request is answered with a refusal naming the command), and during active warp the sim refuses them as it already does.
3. **Release.** A `warp` to 1 (page or script) is dispatched at once; the hold ends and the remembered attitude is sent, so the vessel wakes into the script's last demand at 1x. The hold also ends when the script ends (Stop, finish, failure).
4. **The script's side.** `warp(factor)` is a new script function (a command with no vessel, factor from 1 to 100 000, the top HUD step), answered like `stage()`: a promise resolving to `{ ok, reason? }` when the request is settled. Scripts pick their own factor; the sim steps `factor * min(wall delta, 0.1 s)` per host tick, so a script that must act at a time `T` stops warping with `time-to-event / factor` still above about 0.1 s (the sample leaves 90 s for re-aligning).
5. **The HUD** enables the warp buttons while a script runs (the host decides), with the host's refusal reason shown as a toast like any refused command.

## Alternatives considered

- **Change the sim: "attitude demands from a script do not count as activity"** or a "hold attitude" command on rails. Touches `core` protocol and `sim` while another plan (026) is changing them; the same effect is reachable in the host, and a demand that keeps applying torque is the right physics at 1x. Revisit if more hosts than the web client run scripts.
- **Make `wait()` integrate with warp automatically** (the host warps while every script is in `wait`). Hidden magic: a script cannot reason about when it wakes; overshoots become the engine's fault. An explicit `warp()` keeps the script in control and is how a player would do it.
- **Zero the attitude without a pending request** (always release the controls when the vessel coasts). Changes the script's behaviour at 1x; no.
- **Let the page retry**: needs the player to press the button repeatedly for 2 s; the pending request is the same thing done once.

## Consequences

- Tests (`sim-host-script.test.ts`): a script that writes a new non-zero attitude each tick keeps a coasting vessel in flight (control: warp refused), and with the hold warp is accepted after the idle time, the vessel is on rails, `t` advances at the factor, the script keeps running, attitude commands during warp are answered as held, a burn is refused, a `warp 1` restores the demand, and the 8 s timeout answers with the sim's reason.
- The script's later commands can be refused with reasons; ADR 0039's feedback channel (plan 032, `guides/scripting.md`) tells the script, so a refusal is no longer visible only in the log.
- Warp does not stop at events: the player or script chooses the factor (as before).
