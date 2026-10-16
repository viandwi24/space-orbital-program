# Writing flight scripts

A script flies your vessel for you. It is plain JavaScript (not TypeScript), runs in the script panel of the flight view (**Script**, then Run) and talks to the game through a handful of globals. This page is the reference. The sample (**Load sample**) is a complete two-stage ascent to orbit and the best place to start; its source is `packages/scripting/src/samples/ascent.ts`.

## Before you run someone else's script

A script cannot read your files, the page, the network or other vessels, and it cannot issue commands except `throttle`, `attitude`, `stage` and `action` for the vessel it was started on. It runs in a WebAssembly JavaScript engine (QuickJS) inside a Web Worker that lives in a hidden, sandboxed frame with no network access and no access to the game's saved data (ADR 0038), with a time budget per tick, a memory limit and a kill switch. That is strong, but not proven: the engine has not been independently audited. If a flaw in it let a script escape the engine, the script would still be inside that frame: no network requests, no browser storage or cookies of the game, no handle on the page. It could still waste your processor until you press Stop, and it could send commands for its own vessel. The panel says "Runs isolated" only after the game has tested this from inside the frame and the Worker; if the test finds anything reachable it says so, and then you should run only scripts you wrote. The game has no accounts or payment data. A script cannot harm your saved vessel designs, but a malicious one can fly your vessel into the ground.

Read a script before you run it, as you would any code from a stranger. Scripts you import (from a file, pasted text or a link) are shown in the editor, marked as imported, and run only after you confirm.

## The script panel

- **Editor:** line numbers, colours for keywords, strings, numbers, comments and the game's own names (`ship`, `stage`, `wait`, ...). When a script fails, the line it failed on is marked and the message starts with `Line N:`.
- **Share:** *Copy text*, *Copy link* (the script is inside the link after the `#`, so nothing is uploaded; links work up to about 64 KB of script) and *Save file* (`<vessel>.orbital.js`).
- **Import:** *From file*, *Paste text*, or open a link. The script replaces the editor text (*Put my script back* undoes it), is not run, and the Run button reads *Run imported script*; pressing it asks you to confirm.
- **What the sandbox checked** (under the status line): the result of the isolation test in each of the two places your script's code lives.

## Program shape

The source is the body of an `async` function, so top-level `await` works. A script is a one-shot: when it ends (finished, failed, terminated or stopped) press Run again to restart.

```js
ship.throttle = 1;
stage();
while (ship.apoapsis === null || ship.apoapsis < 80000) await nextTick();
ship.throttle = 0;
print('apoapsis ' + ship.apoapsis.toFixed(0) + ' m');
```

## Globals

| Name | What it does |
|---|---|
| `ship` | read-only telemetry (below) plus the two writable setpoints `ship.throttle` and `ship.attitude` |
| `ship.throttle = x` | engine throttle, 0 to 1; reading returns the last value you set |
| `ship.attitude = { pitch, yaw, roll }` | steering demand for the reaction wheels, each -1 to 1, missing keys are 0. This is a torque demand, not a target angle: you need a control loop (the sample has a PD loop) |
| `stage()` | fire the next stage; returns a promise of `{ ok, reason? }` (see "Command feedback") |
| `action(part, module, action, ...args)` | call a module action; `part` is a `ship.parts[i].id`, e.g. `action(id, 'stock.landing-leg', 'deploy')` or `action(id, 'stock.reaction-wheel', 'setEnabled', false)`; returns a promise of `{ ok, reason? }` |
| `warp(factor)` | ask for time warp, 1 to 100 000; returns a promise of `{ ok, reason? }` that settles when the game has answered (see "Time warp") |
| `bodies` | frozen data of every body in the game, by id: `bodies[ship.body]` is `{ id, radius, mass, mu, rotationPeriod, atmosphere?: { scaleHeight, surfacePressure, height }, parent?, orbit? }` (SI) |
| `wait(s)` | promise that resolves when `s` seconds of **simulation** time have passed (resolution: one tick) |
| `nextTick()` | resolves on the next tick; use it in every loop |
| `waitUntil(fn)` | polls `fn` every tick until it returns truthy |
| `time()` | simulation time, s (same as `ship.t`) |
| `print(...)` | append a line to the panel log (strings as is, other values as JSON) |

Invalid arguments throw inside the script (`RangeError`, `TypeError`) and issue nothing. A repeated identical throttle or attitude is not sent twice. Standard JavaScript built-ins are available (`Math`, `JSON`, `Date`, `Promise`, typed arrays, ...); `Math.random` is seeded and repeatable, and `Date` reads the **simulation** clock: `Date.now()` and `new Date()` are simulation seconds since the start times 1000, so a script behaves the same on every run (`new Date(2000, 0, 1)` and the other forms with arguments work as usual). There is no `fetch`, `window`, `document`, `process`, `console` or timers (`setTimeout`): use `wait`.

## `ship` telemetry

SI units. Axes are the body-centred inertial frame (+Y is north). A fresh copy every tick; changing it in the script changes nothing in the game.

| Field | Meaning |
|---|---|
| `t` | simulation time, s |
| `mode` | `'flight'` or `'on-rails'` (coasting or parked) |
| `body`, `bodyRadius`, `mu` | the body whose influence you are in, its radius (m) and gravitational parameter (m^3/s^2) |
| `position`, `velocity` | `{ x, y, z }` relative to the body centre (m, m/s), inertial; speed on the pad is not 0 because the planet rotates |
| `altitude`, `speed` | height above the sphere of the body (m; the root part is at the top of the stack, so about 7.5 m on the pad) and `|velocity|` |
| `up` | unit vector away from the body centre |
| `orientation`, `nose` | the root part's rotation quaternion `{ x, y, z, w }` and its +Y axis (the direction the engines push) in the inertial frame |
| `mass`, `inertia` | current mass (kg, with propellant) and an estimate of the transverse moment of inertia (kg m^2) |
| `orbit` | orbital elements `{ a, e, i, raan, argp, m0, epoch }` or `null` (no orbit on the pad or on a near-parabolic path) |
| `apoapsis`, `periapsis`, `eccentricity` | apsis **altitudes** in m and `e`; `null` without an orbit |
| `parts[]` | `{ id, definition, position, mass, modules }`: every part; `position` relative to the root in the inertial frame, `mass` the dry mass (kg), `modules` the module states by module id (an engine: `{ ignited, throttle, flameout }`, a tank: `{ amounts: { resource: units } }`) |
| `engines[]` | `{ part, module, thrust, ispVacuum, ispSeaLevel, ignited, throttle, flameout }`: vacuum thrust at full throttle (N), Isp (s), and the engine's state |
| `wheels[]` | `{ part, module, torque, enabled }`: maximum torque per axis (N m) of each reaction wheel |
| `refusals` | `[{ command, reason }]`: the commands the game refused since the last tick (including `throttle` and `attitude`, which have no return value) |

`engines` and `wheels` list the parts still attached, so they change when you stage. Any module whose configuration has `thrust`, `ispVacuum` and `ispSeaLevel` counts as an engine, and any with `torque` and an `enabled` state as a wheel, whoever made the mod. Exhaust speed is `ispVacuum * 9.80665`; with the engines that can still burn, `burn time = mass * ve * (1 - exp(-dv / ve)) / thrust` (the sample does this to time its circularisation burn).

## Timing and limits

- Your script is called once per simulation tick with the latest data. Work between two `await`s must be short: each tick has a 200 ms budget (the first tick of a run 300 ms, because the engine starts cold; ordinary ticks take well under 1 ms). A script that exceeds it is terminated (`terminated`, "time budget exceeded"). Memory is limited to 16 MiB and the call stack to 256 KiB.
- The script runs in a separate thread from the simulation. Commands reach the vessel one or two ticks after the data they were based on; a control loop with a bandwidth of about 0.5 rad/s is unaffected, a very fast one will be. If the script thread stops answering for half a second it is killed and the simulation carries on.
- Each tick also has a **work budget**: 20 000 interrupt polls (the engine polls about once per 10 000 operations; about 200 ms of pure looping on an idle desktop). A runaway ends at the same place on every machine ("work budget exceeded").
- Under time warp the script sees fewer snapshots per simulation second.
- One script per flight, controlling the vessel that was active when you pressed Run. It cannot address other vessels or load vessels; it can ask for time warp (below).
- A command the game refuses (for example `stage()` with no stage left) is logged once as `! stage: reason` and reported back to the script (below).
- The script text is saved in your browser per vessel design.

## Command feedback

`stage()`, `action(...)` and `warp(...)` return a promise that settles with the game's answer on the **next tick**: `{ ok: true }` or `{ ok: false, reason }`. A refusal is a value, not an exception.

```js
const fired = await stage();
if (!fired.ok) print('no stage fired: ' + fired.reason);
```

`ship.throttle = x` and `ship.attitude = {...}` have no return value; if the game refuses one, it appears in `ship.refusals` on the following tick. A repeated identical setpoint is not sent, so it cannot be refused.

## Time warp

Time warp needs the vessel on rails, and a vessel goes on rails only after two seconds without any engine or wheel force. A script that keeps writing a new `ship.attitude` every tick (any control loop does) would keep the vessel awake forever, so while a script runs the game helps (ADR 0039):

- You can press the warp buttons as usual. The game zeroes the vessel's attitude demand, **holds back** the script's attitude commands (each is answered `ok: false`, "held while time warp is requested or active"), waits for the vessel to settle on the rails (up to 8 seconds, then the button press is refused with the reason) and starts the warp. On rails the attitude is frozen, so nothing is lost.
- A script can ask the same with `await warp(10)`. It resolves `{ ok: true }` once the warp is on, or `{ ok: false, reason }`. `await warp(1)` goes back to real time; the game then sends the last attitude the script asked for and the vessel wakes into it.
- A script that is burning (throttle above 0) is refused immediately; cut the throttle first. A `stage()`, `action(...)` or a throttle above 0 while a warp request is waiting cancels the request.
- Warp never stops by itself at an event: choose a factor that leaves room. One simulation step is `factor` times up to 0.1 s of real time, so a script that must act at time `T` should stop warping while `(T - time()) / factor` is still above about 0.1 s, and re-align the ship after `warp(1)` (the ship does not turn while on rails).

```js
// coast towards a burn 10 minutes away: warp while there is time, then real time to re-align
const burnAt = time() + 600;
while (burnAt - time() > 120) {
  const factor = Math.max(1, Math.min(100, Math.floor((burnAt - time() - 60) / 2)));
  await warp(factor);
  await nextTick();
}
await warp(1);
```

## Common patterns

```js
// wait for the engine to run dry, then stage
await waitUntil(() => ship.engines.some((e) => e.flameout));
stage();

// available steering torque (all enabled wheels)
const torque = ship.wheels.reduce((sum, w) => sum + (w.enabled ? w.torque : 0), 0);

// rough burn time for dv at the current mass, live engines only
const live = ship.engines.filter((e) => !e.flameout);
const thrust = live.reduce((s, e) => s + e.thrust, 0);
const flow = live.reduce((s, e) => s + e.thrust / (e.ispVacuum * 9.80665), 0);
const ve = thrust / flow;
const burn = (dv) => (ship.mass * ve * (1 - Math.exp(-dv / ve))) / thrust;
```

## For mod authors

`ship.engines`/`ship.wheels` are built from the part definitions' module configs by shape, so a mod engine with `thrust`, `ispVacuum`, `ispSeaLevel` numbers in its config and a `snapshot` with `ignited`, `throttle`, `flameout` shows up without any scripting-specific code. Design background: `docs/architecture/scripting.md`, ADR 0020 (engine), ADR 0031 (Worker) and ADR 0038 (sandbox frame).
