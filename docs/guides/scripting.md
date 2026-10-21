# Writing flight scripts

A script flies your vessel for you. It is plain JavaScript (not TypeScript), runs in the script panel of the flight view (**Script**, then Run) and talks to the game through a handful of globals. This page is the reference. The sample (**Load sample**) is a complete two-stage ascent to orbit and the best place to start; its source is `packages/scripting/src/samples/ascent.ts`.

## Before you run someone else's script

A script cannot read your files, the page, the network or other vessels, and it cannot issue commands except `throttle`, `attitude`, `stage`, `action`, `sas`, maneuver-node and target commands for the vessel it was started on, and time warp. It runs in a WebAssembly JavaScript engine (QuickJS) inside a Web Worker that lives in a hidden, sandboxed frame with no network access and no access to the game's saved data (ADR 0038), with a time budget per tick, a memory limit and a kill switch. That is strong, but not proven: the engine has not been independently audited. If a flaw in it let a script escape the engine, the script would still be inside that frame: no network requests, no browser storage or cookies of the game, no handle on the page. It could still waste your processor until you press Stop, and it could send commands for its own vessel. The panel says "Runs isolated" only after the game has tested this from inside the frame and the Worker; if the test finds anything reachable it says so, and then you should run only scripts you wrote. The game has no accounts or payment data. A script cannot harm your saved vessel designs, but a malicious one can fly your vessel into the ground.

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

## The editor

The editor knows the script API and the keys you expect from a code editor (plan 036, ADR 0066):

| Key | What it does |
|---|---|
| Tab, Shift+Tab | indent or outdent the line, or every selected line. **Escape, then Tab, moves focus out of the editor** (so the keyboard is never stuck in it) |
| Enter | new line with the same indentation, one level deeper after `{`, `(` or `[`; between `{` and `}` the closer goes on its own line |
| `}`, `)`, `]` | on a line that holds only indentation, takes one level off first |
| Ctrl+Space (Cmd+I on a Mac, Ctrl+I anywhere), or typing | suggestions: `ship.` lists the members of `ship` (a name from the second letter on for the globals); Up and Down choose, Enter or Tab accepts, Escape closes. Each entry shows its signature and a line of what it does |
| Ctrl/Cmd+F | find in the script (Enter next, Shift+Enter previous, Escape closes); the **Aa** button matches case, **ab** whole words only; under it a second field and the **Replace** and **Replace all** buttons (Enter in that field replaces the selected match; one undo step undoes Replace all) |
| Ctrl/Cmd+G | go to a line: type its number, Enter selects that line |
| Ctrl/Cmd+/ | comment or uncomment the selected lines (the `//` goes at the shallowest indentation) |
| Alt+Up, Alt+Down | move the selected lines; Shift+Alt+Up or Down copies them |
| Ctrl/Cmd+Z, Shift+Ctrl/Cmd+Z, Ctrl+Y | undo and redo; typing runs are one step |

Suggestions go deeper than `ship.` (plan 058): `ship.target.`, `ship.orbit.`, `ship.nodes[0].`, `ship.engines[0].`, `ship.wheels[0].`, `ship.parts[0].`, the vectors (`ship.position.`, `ship.target.velocity.`), `bodies[id].` with its `orbit.` and `atmosphere.`, and the keys of the object you give `addNode(` and `setNode(id,` (the ones you have not written yet; accepting one writes `name: `). They come from the same table as the rest and a test runs a real script to keep them true.

The bracket next to the caret and its partner are highlighted. Under the editor the game lists mistakes without stopping you from running. A moment after you stop typing the script is **compiled by the script engine in the sandbox, without running it**, and a syntax error appears with the engine's words and its line (`Syntax error: unexpected token in expression: ';'`, line button and a marked line number) before you press Run. The editor's own checks list the rest: `ship.altitud` (with "did you mean `ship.altitude`"), assigning to a read-only member such as `ship.altitude = 5`, and `wait(1)` without `await` (and, when the engine cannot be asked, brackets that do not pair or a string or comment that never ends). The engine's own error, with its line, still decides when you run (ADR 0085).

"More editor keys and options" under the editor lists these keys and has one option, **Close brackets and quotes for me**, off by default and remembered in this browser: typing `(`, `[`, `{`, `"`, `'` or a backtick inserts the pair, typing the closer steps over it, Backspace between the two removes both, and nothing is closed inside a string or comment or before a letter. On a touch screen the editor shows buttons for Tab, Shift+Tab, Undo, Redo and Suggest. On a Mac, Ctrl+Space switches input sources: the Suggest button, or typing `ship.` or two letters, opens the list instead. Keys pressed while an input method (IME) is composing text are left alone.

## Globals

| Name | What it does |
|---|---|
| `ship` | read-only telemetry (below) plus the writable setpoints `ship.throttle`, `ship.attitude` and `ship.sas` |
| `ship.throttle = x` | engine throttle, 0 to 1; reading returns the last value you set |
| `ship.attitude = { pitch, yaw, roll }` | steering demand for the reaction wheels, each -1 to 1, missing keys are 0. This is a torque demand, not a target angle: you need a control loop (the sample has a PD loop) |
| `ship.sas = 'prograde'` | stability assist mode (plan 042): `'off'`, `'hold'`, `'prograde'`, `'retrograde'`, `'normal'`, `'antinormal'`, `'radial-out'`, `'radial-in'` `'maneuver'` (points at the burn of the earliest maneuver node), `'target'` or `'anti-target'` (points at, or away from, the target; plan 035); any other value throws a `TypeError`. The game holds or points the vessel with its reaction wheels, gimbal and control surfaces, so a script can fly a gravity turn with `ship.sas = 'prograde'` instead of a control loop. Reading returns the mode the game reports (the player may switch it with `T` or the buttons) |
| `stage()` | fire the next stage; returns a promise of `{ ok, reason? }` (see "Command feedback") |
| `action(part, module, action, ...args)` | call a module action; `part` is a `ship.parts[i].id`, e.g. `action(id, 'stock.landing-leg', 'deploy')` or `action(id, 'stock.reaction-wheel', 'setEnabled', false)`; returns a promise of `{ ok, reason? }` |
| `setTarget(spec)` | choose the target (plan 035, ADR 0065): a body id (`'stock.cinder'`), a vessel id, an entry of `ship.targets`, or `null` to clear it; returns a promise of `{ ok, reason? }`, `ship.target` shows it on a later tick |
| `setTarget({ vessel, port })` | target one docking port of another vessel (plan 310): `port` from that vessel's `ship.targets[i].ports`; `ship.target.position`/`velocity` then run from your control port (when you control from a port) to that port |
| `translate(x, y, z)` / `translate({ x, y, z })` | RCS translation (plan 310), each -1 to 1 in the **control part's** axes: x right, y forward (out of a control port's face), z up; `0, 0, 0` stops. Needs RCS on |
| `setRcs(on)` | RCS on or off; promise of `{ ok, reason? }` |
| `controlFrom(part)` | control from a command part or docking port (`ship.ports[i].part`), `null` for the root: SAS, the navball, the keys and `translate` follow it (ADR 0270) |
| `pointAt({ x, y, z })` | SAS mode `direction`: the control part's nose points along that inertial direction; call again to change it |
| `holdAttitude({ x, y, z, w })` | SAS `hold` turned to that orientation of the control part (inertial) |
| `engage(id, params?)` / `disengage()` | start or stop a mod autopilot on this vessel (plan 310, ADR 0271), e.g. `engage('autodock.dock')`; `ship.autopilot` shows its phase and read-outs |
| `runExperiment(partOrId)` | start a science experiment (plan 103): a part id from `ship.science.experiments`, or an experiment id such as `'stock.temperature'` (the first one aboard that is not running); returns a promise of `{ ok, reason? }`. A run in a wrong situation leaves it `INVALID` with the reason |
| `addNode({ time, prograde, normal, radial })` | plan a maneuver node (plan 045): `time` is simulation time, the three numbers are m/s in the orbital frame at the node (prograde = along the velocity, normal = `r x v`, radial = prograde x normal; missing ones are 0); returns a promise of `{ ok, reason? }`, the new node shows up in `ship.nodes` on a later tick |
| `setNode(id, { time?, prograde?, normal?, radial? })` | change fields of a node, the others keep their value |
| `removeNode(id?)` | remove one node, or all of them without an id |
| `setAlarm({ name?, time })` / `setAlarm({ name?, kind, lead? })` | set an alarm (plan 247): at a simulation `time`, or `kind` `'apoapsis'`, `'periapsis'`, `'soi'` or `'node'` of this vessel, `lead` seconds before it (an apsis alarm follows later burns); the warp stops when it fires; `ship.alarms` lists them |
| `removeAlarm(id)` | remove the alarm with that id from `ship.alarms` |
| `warpTo(time, factor = 100000)` | time warp that slows down by itself and stops at `time` (simulation time) with warp 1; resolves like `warp`, refused while the vessel is in flight; an SOI change ends it |
| `warp(factor)` | ask for time warp, 1 to 100 000; returns a promise of `{ ok, reason? }` that settles when the game has answered (see "Time warp") |
| `bodies` | frozen data of every body in the game, by id: `bodies[ship.body]` is `{ id, radius, mass, mu, rotationPeriod, atmosphere?: { scaleHeight, surfacePressure, height }, parent?, orbit? }` (SI) |
| `bodies[id].state(t, frame = 'parent')` | where the body is at simulation time `t`, from its orbit: `{ position, velocity }` (m, m/s) relative to its parent (`'parent'`) or to the centre of the root body (`'system'`, the frame `ship.target.position` is measured in too). The root body rests at the origin. Not listed when you print a body; throws `RangeError` for a time that is not a finite number |
| `wait(s)` | promise that resolves when `s` seconds of **simulation** time have passed (resolution: one tick) |
| `nextTick()` | resolves on the next tick; use it in every loop |
| `waitUntil(fn)` | polls `fn` every tick until it returns truthy |
| `time()` | simulation time, s (same as `ship.t`) |
| `date(t?)` | `{ text, julianDate }`: the game date at simulation time `t` (default: now) in the world's calendar, e.g. `"Day 3, 04:12:09"` in the stock system or `"2026-10-17 06:01:30.000 UTC"` in a real-calendar system (plan 081). The host formats it; the sandbox's own `Date` still has no clock. |
| `print(...)` | append a line to the panel log (strings as is, other values as JSON) |

Invalid arguments throw inside the script (`RangeError`, `TypeError`) and issue nothing. A repeated identical throttle, attitude or SAS mode is not sent twice. Standard JavaScript built-ins are available (`Math`, `JSON`, `Date`, `Promise`, typed arrays, ...); `Math.random` is seeded and repeatable, and `Date` reads the **simulation** clock: `Date.now()` and `new Date()` are simulation seconds since the start times 1000, so a script behaves the same on every run (`new Date(2000, 0, 1)` and the other forms with arguments work as usual). There is no `fetch`, `window`, `document`, `process`, `console` or timers (`setTimeout`): use `wait`.

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
| `sas` | the stability assist mode the game reports (also the setter above) |
| `nodes` | maneuver nodes in time order: `[{ id, time, prograde, normal, radial, dv, body, vector }]`; the numbers are the burn that is **left** (the plan until you burn, then what remains), `dv` its size in m/s, `vector` the burn in the inertial `ship.position` axes (`null` if the path never reaches the node). A node whose time has passed and with under 0.5 m/s left disappears |
| `target` | the target or `null` (plan 035): `{ kind: 'body' \| 'vessel', id, name, position, velocity, distance, relativeSpeed, approach, part }` (`part`: the targeted docking port or `null`); `position` and `velocity` are the target's **minus yours** in the inertial axes (the same axes in every body's frame, so they mean the same in any sphere of influence), `distance` and `relativeSpeed` their lengths, `approach` is `{ time, distance, relativeSpeed }` for the closest approach of your current orbit to the target's within your next revolution (at most ten days) or `null` when the two do not orbit the same body or you are not on an orbit that clears the ground |
| `targets` | what you can aim at: `[{ kind, id, name, ports? }]`, every body, then every other vessel (debris included, named "... (debris)"); `ports` lists a vessel's free docking ports |
| `science` | `{ situation, experiments: [{ part, experiment, state, reason, progress }] }` (plan 103): the science situation (`'stock.landed'`, `'stock.space-low'`, ...; `null` without experiments aboard) and each experiment, `state` `READY`, `RUNNING`, `PAUSED` (no electric charge) or `INVALID` (`reason` says why), `progress` 0..1 |
| `rcs`, `controlPart` | RCS is on; the part you control from (`null`: the root) |
| `ports` | your docking ports: `[{ part, size, free, direction }]` |
| `dock` | your control port against the targeted port (plan 310), or `null`: `{ angle, along, lateral, lateralDistance, distance, closing, sameSize }`; `angle` in rad (0 = face to face), `along` how far you are out in front of the target face along its axis (m), `lateral` your offset from that axis, `closing` the approach speed along it (m/s) |
| `autopilot` | the engaged mod autopilot or `null`: `{ id, title, phase, status, readouts }` |
| `refusals` | `[{ command, reason }]`: the commands the game refused since the last tick (including `throttle`, `attitude` and `sas`, which have no return value) |

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

`ship.throttle = x`, `ship.attitude = {...}` and `ship.sas = mode` have no return value; if the game refuses one, it appears in `ship.refusals` on the following tick. A repeated identical setpoint is not sent, so it cannot be refused.

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

## Maneuver nodes

Nodes are part of the game state, so the nodes you plan in map view are in `ship.nodes` and the ones a script plans show in the map. A script that executes a node:

```js
const dv = 250;
await addNode({ time: time() + 600, prograde: dv });
await nextTick();                       // the node appears in ship.nodes
const node = ship.nodes[0];
ship.sas = 'maneuver';                  // point the nose at the burn
await warpTo(node.time - 60);           // needs the vessel on rails; stops at warp 1
await waitUntil(() => time() >= node.time - 60 - 1e-6);
await wait(40);                         // let the vessel turn
await stage();
while (ship.nodes.length > 0) {         // dv shrinks while you burn
  ship.throttle = ship.nodes[0].dv > 6 ? 1 : ship.nodes[0].dv > 0.4 ? 0.1 : 0;
  await nextTick();
}
ship.throttle = 0;
```

A burn of `T` seconds is centred on the node: start `T/2` before it (the burn time is `m0 (1 - exp(-dv / (Isp g0))) / mdot`, see ADR 0056). The prediction in the map is the impulsive burn.

## Targets

The target is part of the game state like a node: the one you choose in the Target card of the flight HUD (or `Y` to step through the list) is `ship.target`, and the one a script sets shows in the card. A target is another body or another vessel; the closest approach is a prediction of two orbits around the same body, so from low orbit the moon's "closest approach" is just its distance next orbit, and a piece of debris on a neighbouring orbit gets a real one.

```js
// target the nearest piece of debris, point at it and warp to the closest approach
const debris = ship.targets.filter((t) => t.kind === 'vessel');
await setTarget(debris[0]);
await nextTick();
const ap = ship.target.approach;
if (ap === null) throw new Error('not on a shared orbit');
ship.sas = 'target';
print('closest approach ' + Math.round(ap.distance) + ' m in ' + Math.round(ap.time - time()) + ' s');
await warpTo(ap.time - 30);

// where is the moon an hour from now (relative to its planet)?
const moon = bodies['stock.cinder'].state(time() + 3600);
```

SAS `target` and `anti-target` point the nose at, or away from, the target (buttons next to the navball, keys `9` and `0`); with no target they hold still.

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

## Signal delay (plan 117, ADR 0188)

A probe obeys commands over its comms route, and the world's `stock.signal-delay` rule decides what the light time does.

- **`display`** (the default): nothing waits. The HUD shows the light time (`Linked to Relay · 3.0 s`).
- **`enforced`:** the script runs on the ground. Its `throttle`, `attitude`, `sas`, `stage`, `action` and `action-group` commands reach the probe after the route's light time, as yours do.
  - The command result says `queued: <sim time>`.
  - Plan burns that many seconds early, or use maneuver nodes: planning never waits.
- **`flight-computer`:** the script runs on board. Its commands apply at once, and only your own commands from the page wait.

Crewed vessels never wait: the crew aboard give the orders.

## For mod authors

The same controls are the public vessel pilot of the SDK: a mod autopilot gets a `VesselPilot` with these read-outs and controls (`docs/guides/vessel-pilot-api.md`).

`ship.engines`/`ship.wheels` are built from the part definitions' module configs by shape, so a mod engine with `thrust`, `ispVacuum`, `ispSeaLevel` numbers in its config and a `snapshot` with `ignited`, `throttle`, `flameout` shows up without any scripting-specific code. Design background: `docs/architecture/scripting.md`, ADR 0020 (engine), ADR 0031 (Worker) and ADR 0038 (sandbox frame).
