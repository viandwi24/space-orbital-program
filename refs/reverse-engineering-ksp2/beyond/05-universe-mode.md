# 05 — Universe mode

> Design proposal, research only. Sources `[ID]` are in [`00-sources.md`](00-sources.md). Feasibility numbers marked *estimate* are this author's reasoning, not measured.

## 0. Idea

The human's idea: combine the rocket game with something like **Universe Sandbox**, a mode where you control the universe, place planets, simulate many things, and fly rockets in what you made.

The honest core finding: **Universe Sandbox and a KSP-like flight game want opposite physics.** Universe Sandbox is an n-body scene where everything pulls on everything and you trade accuracy for speed. Orbital's flight sim is patched conics on rails: exact, cheap, deterministic, warpable to a million times. Forcing one engine to be both is how projects die. The proposal is therefore **one editor, two engines, and a clean hand-off between them**:

1. **System editor** (build): place stars, planets, moons, rings; set masses, sizes, orbits, atmospheres, terrain kinds. Instant visual preview on rails.
2. **Universe simulation** (play with physics): an n-body scene with simulation layers (collisions, tidal breakup, star evolution, climate), separate from flight, run at any speed.
3. **Freeze into a world** (hand-off): take the system at any moment, convert it into a body tree with Kepler orbits (what Orbital already runs), and play Sandbox, Science or Career in it.
4. *(later)* **Ephemeris flight**: fly vessels against n-body-computed body paths for systems where Kepler orbits are not good enough.

Steps 1 and 3 are cheap and deliver most of the value ("make my own system and play a career there"). Step 2 is the "wow" sandbox. Step 4 is the expensive, optional bridge.

## 1. Universe Sandbox: what it is

### What it simulates [U-US-HOME][U-US-STEAM][U-US-WIKI]

- **Newtonian n-body gravity** for every object, from moons to galaxies.
- **Collisions** between planets and stars, with fragmentation; since 2026 object cohesion depends on composition [U-US-36-1].
- **Material composition** (hydrogen, iron, rock, water and more), temperature, atmospheres, surface water and ice, a "life likelihood" readout.
- **Climate**: seasons and sea ice from axial tilt and orbital distance; geostrophic winds added in 2026 [U-US-36-2].
- **Roche limit breakup**, **tidal locking**, tidal lag view, **J2** (oblateness) gravity, flattening of fast spinners, **Lagrange points** and **predicted paths** (Update 36, March 2026) [U-US-36].
- **Stellar evolution** (raise a star's age or mass to trigger a supernova), black holes with lensing visuals and Hawking mass loss [U-US-36-3], gas clouds, nebulae, protoplanetary disks.
- **Tools**: add objects from a menu, edit properties, a laser with radiation pressure, graphs and 3D charts, temperature and height maps, duplicate / copy-paste, historical scenarios (eclipses, Apophis 2029, Artemis II in 2026), Steam Workshop sharing (since 2018) [U-US-WIKI][U-US-BLOG].
- Built in Unity; first released 2008; Universe Sandbox² alpha 2014; still Early Access on Steam with very positive reviews [U-US-WIKI][U-US-STEAM].

### How it stays fast [U-US-DOTS][U-US-SIMSET]

- **Update 36 rebuilt the physics on Unity DOTS**: fixed data layout, compiled jobs, multithreading across CPU cores [U-US-DOTS].
- **Barnes-Hut** (tree approximation of far gravity) is listed as a *future* plan, so the shipped gravity is likely direct all-pairs (an inference) [U-US-DOTS]; an older experimental "gravity tree" option exists [U-US-SIMSET].
- **Auto limit simulation speed**: the time step is capped by the **tightest orbit in the scene**, and the UI tells you which object limits it; presets trade accuracy for performance (a multiplier from 0.1 to 10). Turn it off and orbits break, by your choice [U-US-SIMSET].
- Several integrators available (Euler, velocity Verlet, RK2, Forest-Ruth, PEFRL); which is default is unclear across sources [U-US-SIMSET].
- **Known simplifications**: collisions and surfaces treat objects as perfect spheres [U-US-36].

### Lessons for Orbital

1. The **"what limits my speed"** readout is a great UX pattern: physics limits become understandable, not mysterious.
2. **Graphs of anything** (temperature, distance, energy) make a sandbox into an experiment, which fits the scientist role.
3. **Sharing** is half the life of the game (Workshop).
4. It is a **desktop** app needing DirectX 12 or Apple Silicon [U-US-STEAM]; we will not match its scale in a browser and should not try.

## 2. Other prior art

- **Principia** (KSP mod): n-body for vessels and bodies, no spheres of influence. It replaces "current body" with **user-chosen reference frames** (body-centred, body-fixed, the rotating frame of two bodies in which Lagrange points stand still). Flight plans of burns and coasts with finite burns; prediction length and tolerance are user settings, and a long, tight prediction can stall the game [U-PRINCIPIA][U-PRINCIPIA-CONCEPTS]. *Lesson:* n-body flight works but changes the whole UX (navball reference, maneuver planning) and costs performance.
- **SpaceEngine**: a procedurally generated universe of enormous size combining real catalogues; bodies move on **Kepler rails**, no planetary collisions, gravity only for spacecraft [U-SE]. *Lesson:* scale and beauty without n-body is possible; most "universe" feeling comes from content and exploration.
- **Juno: New Origins Planet Studio**: players build planets, moons and star systems from templates, procedural noise layers and an advanced mode; custom worlds work in the game's orbital mechanics and can be shared [U-JUNO-PS]. *Closest precedent to the "editor + play in it" path.*
- **Kopernicus** (KSP mod): rebuilds the game's star system from config files at startup; multiple stars are limited because the game assumes one central sun [U-KOPERNICUS]. *Lesson:* design for several stars from day one.
- **Gravity Simulator** (browser): an n-body engine in the browser with many integrators and a softening constant [U-GRAVSIM]. *Proof that a browser n-body sandbox is viable at small scale.*
- **REBOUND**: an open-source n-body library with symplectic (WHFast, leapfrog, high-order) and adaptive (IAS15) integrators; C99 core, examples compiled to the browser with Emscripten; no JS API package [U-REBOUND]. IAS15 is 15th-order, adaptive, and handles close encounters with energy error at machine precision levels over very long runs [U-IAS15].

## 3. Orbital's constraints (from `docs/architecture/simulation.md`)

- Bodies are a **tree**: each child follows a Kepler orbit around its parent; vessels feel **one body at a time** (patched conics). The moon does not pull the planet.
- **Determinism** on the same build: fixed step, seeded PRNG, byte-for-byte replays and resume. Cross-machine determinism is *not* a goal.
- **Time warp to 1e6**, rails propagation is analytic, SOI crossings found by bisection.
- Everything runs in a **Web Worker**; float64 is authoritative; rendering uses a floating origin.
- **Bodies come from plugins** (`defineBody` with mass, radius, rotation, atmosphere, terrain kind, parent, orbit). A star system is already a set of mod definitions.

That last point is a gift: **a Universe-mode system can be saved as an ordinary mod package** that only registers bodies. Sharing, versioning and loading already exist (ADR 0057).

## 4. Proposal

### U0 — System editor (rails only)

- Place bodies: star, planet, moon, asteroid belt (as a field of small rails bodies or a ring visual), ring, comet.
- Properties: mass or density, radius, rotation period and axial tilt, atmosphere (scale height, pressure), terrain kind and seed, colour/biome palette, parent, orbit (a, e, i, Ω, ω, M₀) set by numbers **or by dragging in the map** (drag apoapsis/periapsis handles like maneuver nodes).
- Live derived readouts: orbital period, SOI radius (Laplace, as the sim computes it), Hill radius, surface gravity, escape velocity, **Roche limit** for each moon (warn when inside) [U-ROCHE], **habitable zone** band from the star's luminosity [U-HZ], equilibrium temperature, synodic periods and **transfer windows** to siblings, the home planet's Δv map (plan 034's trip planner reused).
- **Validation**: overlapping SOIs, moons outside the parent's SOI, moons inside the Roche limit, bodies inside a star; offer fixes.
- **Star from mass**: luminosity ≈ M^3.5 (solar units, a common simplification of the piecewise mass–luminosity relation) and main-sequence lifetime ≈ 10¹⁰ yr × M^−2.5 [U-ML][U-MS]; colour from temperature.
- **Templates and generators**: "Sol-like", "Kerbin-like small system", "binary star", "gas giant with 12 moons", "random from seed".
- **Output**: a body tree in Orbital's existing format, playable immediately. *This alone matches Juno's Planet Studio and goes further on validation and gameplay readouts.*

### U1 — Universe simulation (n-body sandbox)

A separate scene (not the flight sim) where bodies are point masses under mutual gravity.

- **Integrator**: a symplectic fixed-step method (leapfrog/velocity Verlet, or a 4th-order one such as Forest-Ruth/PEFRL) for normal runs; optional adaptive IAS15-style for close encounters. Symplectic methods keep energy bounded over long runs, which is what makes orbits not spiral.
- **Speed limit like Universe Sandbox**: time step ≤ (shortest orbital period)/k, and the UI names the limiting body [U-US-SIMSET].
- **Scale**: direct all-pairs gravity in float64 on the CPU. *Estimate:* a few hundred massive bodies at interactive rates in a Worker with JS; with WASM and SIMD perhaps a few thousand. Massless particles (ring debris, asteroid fields) can be many more because they only feel massive bodies (N_massive × N_particles, not N²).
- **GPU**: WebGPU is available in all major desktop browsers since 2025 [U-WEBGPU], but WGSL has no guaranteed float64, so GPU use is for **visual particles** (debris clouds, rings, dust), never for authoritative orbits.
- **Simulation layers** (each a toggle, each cheap at body level):
  1. Gravity (always).
  2. **Collisions and merges**: spheres touching → merge (momentum conserved, mass and composition combined) or fragment into N new bodies plus a visual debris cloud above an energy threshold.
  3. **Roche breakup**: a body inside its Roche limit becomes a ring (a visual particle ring plus a mass that keeps orbiting) [U-ROCHE].
  4. **Tides**: slow spin change toward tidal locking (an analytic rate, not a physical simulation).
  5. **Star evolution**: luminosity and radius change with age along a simple track; end of life as white dwarf / supernova / black hole by mass. A supernova is an event that strips atmospheres and pushes bodies.
  6. **Climate (energy balance)**: equilibrium temperature from stellar flux, albedo and a greenhouse factor; ice/ocean/desert state from temperature; feeds "habitability" and planet colour.
  7. **Graphs**: any property over time (the scientist's tool).
- **Tools**: throw a body (drag a velocity vector), delete, duplicate, change mass live, "explode", a time scrubber (snapshots every N steps so the player can go back).

### U2 — Freeze into a playable world

The bridge from physics to game:

1. Pause the simulation at the chosen time.
2. **Build the hierarchy**: for each body, choose its parent as the body whose Hill sphere it lies in (smallest such); stars at the root (one root star; for binaries see below).
3. **Osculating elements**: compute each body's Kepler elements relative to its parent from the current state vectors.
4. **Check**: warn where the Kepler approximation is poor (strong perturbations, chaotic configurations), estimated by comparing a short n-body run against the rails prediction; show the drift after 10 years.
5. Save as a **world definition** (a body-only mod package) and open the world-creation dialog with it (mode, difficulty, launch site on a chosen body).

**Binary stars**: patched conics need one root. Options: (a) the barycentre as a massless root with two stars on Kepler orbits around it (planets orbiting both use the barycentre as parent: approximate but playable for wide circumbinary orbits); (b) S-type planets orbiting one star of a wide binary, with the other star as a distant child. Both fit the existing tree.

### U3 — Ephemeris flight (later, optional)

For systems where Kepler rails are too wrong (tight binaries, resonant chains, Lagrange-point stations):

- Precompute **body ephemerides** with the U1 integrator over the world's play horizon (or in rolling chunks), stored as piecewise polynomials (the way planetary ephemerides are distributed in astronomy). Bodies then follow these paths instead of Kepler orbits; still deterministic and analytic to evaluate at any time, so time warp stays.
- **Vessels**: keep patched conics relative to the dominant body (SOI logic unchanged) as the default; offer an **n-body vessel propagator** (vessel as a test particle feeling all bodies via the ephemeris) for advanced players, with a Principia-like reference-frame picker for the map [U-PRINCIPIA-CONCEPTS]. On-rails propagation for those vessels becomes numerical, so warp is limited by integration cost (like Universe Sandbox's speed limit).
- This touches `@orbital/kepler`, `sim` rails, SOI, maneuver nodes and the map: **XL** and should only follow proven demand.

### U4 — Gameplay in Universe mode

- **Sandbox**: everything unlocked, editor always available, "god tools" during flight (move a moon, add a planet; the world re-freezes).
- **Career in a custom system**: the economy and science (`03`, `04`) work on any body tree; hidden facts are generated from body properties (a cold moon gets ice, a hot one does not).
- **Scenarios / challenges**: "save the colony: a rogue planet passes in 5 years", "build a relay network around a binary system", "land on a planet before its star goes supernova". These are shareable files (`06`).
- **Science in the sandbox**: the scientist's graphs and hypotheses work against the simulation itself ("will this moon be ejected?").
- **Exploration**: generated systems as destinations for late-game interstellar play.

### Sharing

- A system = a mod package with only bodies (plus optional ground stations, launch sites, hidden-fact seeds, scenario scripts).
- Importing someone's system into a new world uses the existing mod-loading flow (fingerprint, version, dependencies).
- A **scenario** = system + initial vessels + objectives + world rules, as a JSON file.

## 5. Determinism and precision

- U0/U2 output is plain data; the flight sim's determinism is unchanged.
- U1 is chaotic: tiny floating-point differences (e.g. JS `Math` functions, which MDN documents as implementation-dependent in precision across browsers and platforms [U-MDN-MATH]) grow exponentially in close encounters. So: **save state, not inputs**; replays of n-body runs are guaranteed on the same build and machine only. Use only `+ − × ÷ sqrt` in the integrator core (exactly specified by IEEE 754) if cross-browser repeatability matters; avoid trig in the hot loop.
- **Precision**: float64 positions at planetary-system scale are fine (sub-millimetre at 1 AU); galaxy scale is not, so Universe mode should be scoped to **star systems** (and perhaps small clusters with per-system frames), not galaxies.
- **Close encounters**: softening (a small ε in the gravity law) avoids infinite forces in visual-only interactions; collisions catch real contacts.

## 6. Honest feasibility in a browser

| Feature | Feasible? | Notes |
|---|---|---|
| System editor with live readouts | yes, M | pure UI + existing body format |
| Freeze to rails world | yes, M | hierarchy + elements; the mod package format exists |
| n-body sandbox, ≤ ~500 massive bodies | yes, L | Worker, float64 CPU, symplectic integrator (*estimate*) |
| Visual particle rings/debris (100k+) | yes, M | WebGPU/WebGL, float32, cosmetic |
| Collisions merge/fragment (spheres) | yes, M | Universe Sandbox also uses spheres |
| Climate energy-balance, star evolution | yes, M | analytic per body |
| Procedural terrain and visuals for any new planet | partly, L–XL | terrain kinds exist (hills, craters); oceans, gas giants, stars need renderer work |
| Ephemeris flight (U3) | hard, XL | touches kepler, sim, map, maneuvers |
| Galaxy scale | no | precision and content; out of scope |
| Universe Sandbox-level material/surface simulation | no | desktop-class compute and years of work |

## 7. Open decisions

1. Is Universe mode a **world type** (sandbox only) or an **editor available to all modes**?
2. Ship U0 + U2 first (editor + freeze) and defer the n-body sandbox?
3. Binary stars: support from the start (barycentre root) or later?
4. Is U3 (ephemeris flight) ever a goal, or should Orbital stay patched-conics forever for flight?
