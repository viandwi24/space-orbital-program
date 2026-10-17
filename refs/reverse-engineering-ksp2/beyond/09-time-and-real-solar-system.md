# 09 — Time and the real solar system

> Design proposal, research only. Added at the human's request (2026-10-17): "The time system is very important, because we will take data from the real solar system: what today's date is, and its effect on the orbits and rotation of all planets, so everything is in sync." Sources `[ID]` are in [`00-sources.md`](00-sources.md). Numbers marked *computed* are this author's arithmetic.

## 0. Summary

1. **A world has a calendar epoch.** Simulation time stays what it is today (seconds of sim time, float64, no wall clock inside the sim). A world additionally stores **the real instant that `t = 0` corresponds to** (for example "2026-10-17 09:00 UTC", or J2000, or 4 October 1957). Every date shown to the player is `epoch + t`, converted at the edges.
2. **"Start at today's date" is a one-time read of the clock by the host** when the world is created, never by the sim. After that, game time runs at time-warp speed, so it **cannot stay locked to the real clock**. Instead the game offers **"catch up to now"**: a forward warp to the current real date, allowed when it is safe (nothing in flight), recorded as an ordinary `warp-to` command so determinism and replays hold.
3. **Bodies get real orbits and real rotation** from public models: planetary orbits as Kepler elements **with secular rates** (JPL's approximate elements, valid for centuries at arc-minute level [T-JPL-APPROX]) or as compact precomputed ephemeris pieces from JPL's DE440 for higher accuracy [T-DE440]. Rotation follows the IAU pole-and-prime-meridian model (pole direction plus `W = W0 + Ẇ·d`) [T-IAU-WGCCRE]. Both stay **analytic and on rails**, so time warp to 1e6 keeps working.
4. **Our code needs four changes** for this: a Sun at the root of the system, axial tilt (today every body spins about +Y), element rates on body orbits, and a world epoch with a time-scale convention. A fictional Kerbin-scale system keeps working unchanged (tilt 0, rates 0, a fictional calendar).
5. **Scale is a separate choice** from "real data": 1:1 real (≈9.4 km/s to low orbit, months-long transfers), rescaled real (real layout and dates, smaller planets), or our fictional Kerbin-scale system. All three can share the same time system.

## 1. Prior art

- **JPL "Approximate positions of the planets"** [T-JPL-APPROX]: for each planet (and the Earth–Moon barycentre, not the Moon itself), six Kepler elements at J2000 plus a linear rate per century. Two fits: 1800–2050 (Earth–Moon barycentre good to about 20″ in longitude; Jupiter about 400″, Saturn about 600″) and 3000 BC–3000 AD (with extra periodic terms for Jupiter–Neptune). The recipe: elements at T centuries past J2000, mean anomaly, Kepler's equation, rotate by the angles into the J2000 ecliptic, optionally into the equatorial frame with obliquity 23.43928°. **This is exactly the shape of our `@orbital/kepler` bodies plus a rate.**
- **JPL DE440 / DE441** [T-DE440]: the reference ephemerides, Chebyshev polynomials fitted to positions and velocities of the Sun, planets and Moon (typically 32-day pieces, km and TDB days), with lunar librations. DE440 spans 1549–2650; DE441 spans about −13 200 to +17 191 and agrees with DE440 to about a metre for planets. **JPL Horizons** serves any of this on demand [T-HORIZONS].
- **VSOP87** [T-VSOP87]: an analytic planetary theory (series of periodic terms), 1″ for the inner planets over ±4 000 years from J2000 (±2 000 for Jupiter and Saturn). Successors: VSOP2013 / TOP2013. **ELP** is the matching lunar theory family (Orbiter uses ELP2000 for the Earth–Moon system [T-ORBITER]).
- **Astronomy Engine** (Don Cross, MIT licence, JavaScript on npm among other languages) [T-ASTRO-ENGINE]: truncated VSOP87 for planets, checked against NOVAS, stated accuracy ±1 arcminute; its own small n-body integration for Pluto. A ready-made oracle (to test our elements) or a drop-in.
- **Rotation models**: the IAU WGCCRE report (latest full report for 2015, published 2018) gives pole directions and prime-meridian angles for planets, moons and small bodies; it **removed** its approximate Earth expressions and the low-precision Moon series to avoid confusion, pointing to precise models instead (Earth: the Earth Rotation Angle and precession–nutation; Moon: librations in the DE ephemerides) [T-IAU-WGCCRE][T-SIDEREAL].
- **Orbiter** (spaceflight simulator): planets from VSOP87 and the Earth–Moon system from ELP2000, Newtonian flight [T-ORBITER].
- **Celestia**: mainly VSOP87 (other theories for some moons); time can be set billions of years either way but orbits are only accurate within a few thousand years of now [T-CELESTIA]. *Lesson:* say honestly where the data is valid.
- **KSP Real Solar System + Principia + RP-1** (KSP1 mods): RSS replaces Kerbol with a 1:1 real system [T-RSS]; Principia integrates all bodies as n-body from configured initial states and gravity models [T-PRINCIPIA-WIKI]; RP-1 builds a historical career on top (community reports say it starts in 1951; not in its official docs) [T-RP1]. *Lesson:* a real system at real scale is a different, much harder game; its players accept that, most players do not.
- **Rescaled systems for KSP**: JNSQ (a 2.7× reimagined Kerbol system), KSRSS (the real solar system at 2.7× stock scale by default, 2.5× as an option), Sigma Dimensions (rescaling tool) [T-JNSQ][T-KSRSS]. *Lesson:* the community's favourite compromise is "real or realistic layout, 2.5–2.7× Kerbin scale".
- **Pacing numbers** [T-DV-LEO][T-SYNODIC]: Earth surface to low orbit about 9.3–10 km/s including losses (9.4 km/s to the ISS orbit); low orbit to trans-lunar injection 3.2 km/s; heliocentric Hohmann to Mars about 8½ months; Mars synodic period about 780 days (windows every ~26 months). Stock KSP's Kerbin needs about 3.4 km/s to an 80 km orbit by the common community figure [T-KSP-DV].

## 2. Time scales, in plain words

| Scale | What it is | Why it matters to us |
|---|---|---|
| **UTC** | civil time; kept within 0.9 s of Earth's rotation by leap seconds | what the player's clock and calendars show |
| **TAI** | atomic time, no leap seconds; TAI − UTC = 37 s since 2017 [T-LEAP] | a bridge between UTC and TT |
| **TT** | Terrestrial Time = TAI + 32.184 s exactly [T-TT] | today TT − UTC = 69.184 s |
| **TDB** | Barycentric Dynamical Time, the scale ephemerides use (JPL's Teph is practically the same); differs from TT by periodic terms under 2 ms [T-TDB] | treat TDB = TT in the game (error < 2 ms) |
| **Julian Date (JD)** | days since a fixed start; MJD = JD − 2 400 000.5 [T-JD] | compact date arithmetic |
| **J2000.0** | JD 2451545.0 TT = 2000-01-01 12:00 TT [T-EPOCH] | the reference epoch of elements and rotation models |
| **Unix time** | seconds since 1970 UTC, every day exactly 86 400 s (leap seconds ignored); JD = unix/86400 + 2440587.5 [T-UNIX][T-JD] | what the browser clock gives; convert once at world creation |

- **Leap seconds are ending.** The 2022 CGPM decided to let UT1 − UTC grow beyond 0.9 s by or before 2035 [T-LEAP]; Wikipedia also reports a 2026 resolution making UTC continuous from 2027 (not checked against a BIPM primary source). Either way: keep a small leap-second table for past dates, and no new entries are expected.
- **Sidereal day** of Earth: 86 164.0905 s (23 h 56 m 4.09 s), about 4 minutes shorter than the solar day [T-SIDEREAL].
- **Historical dates before 1972** (UTC with variable-length seconds) are messy; for a 1957 career start, use TT and an approximate ΔT; nobody will notice a second.

## 3. Proposal

### 3.1 The world clock

| Field | Where | Meaning |
|---|---|---|
| `t` | sim (exists) | seconds of simulation time since the world's start, float64. Unchanged. |
| `epoch` | world save (new) | the instant of `t = 0` on the system's **time scale**, stored exactly as two numbers (Julian day and fraction, or integer seconds plus fraction since J2000) so no precision is lost. |
| `timeScale` | system definition (new) | `TDB` for real-ephemeris systems (the scale planetary ephemerides use); `fictional` for invented systems. |
| `calendar` | system definition (new) | how dates are displayed: `gregorian-utc` for the real system (TDB→TT→TAI→UTC with a leap-second table, at the UI edge only); a fictional calendar ("Year 3, Day 112, 04:12") with day and year lengths from the home body. |

Why keep `t` world-relative instead of "seconds since J2000": precision. A float64 has a relative precision of 2⁻⁵² [T-FLOAT64]. *Computed*: at `t` ≈ 8.3e8 s (seconds from J2000 to 2026) the spacing between representable values is about 1.2e-7 s, and every `t += 0.02` rounds by up to half of that. Starting each world at `t = 0` keeps the clock exact for the first years of play, and the epoch carries the absolute date. Astronomy libraries commonly avoid the same problem by carrying a date as two numbers (a whole day count and a fraction); that is this author's understanding, not checked against a source here. If long campaigns (centuries) matter, a further step is to count flight steps as an integer and derive `t = n·dt`.

### 3.2 Why the sim cannot follow the real clock

- **Time warp** is the core of the genre: a Mars transfer takes about 8½ months [T-MARS-TRANSFER]; nobody plays that in real time.
- **Determinism** (`docs/architecture/simulation.md`): the sim never reads a clock; a save resumed gives exactly the same run. A sim tied to the wall clock would give different results each time it is loaded.
- **Pausing, menus, tab in the background**: browsers throttle background tabs; a real-time lock would jump or stall.

So real time is a **display and a starting point**, not a driver.

### 3.3 Options the player gets

1. **Start date at world creation**: "Today" (the host reads the clock once and writes the epoch), a fixed date ("1 January 2030"), a historical date for a historical career (e.g. "4 October 1957", the Space Race), or J2000.
2. **Catch up to now** (button, and an offer when loading a save whose game date is behind the real date): a `warp-to` to the real current date. Allowed only when every vessel is on rails (the same rule as time warp today, ADR 0021); otherwise refused with the reason. Going *backwards* is never allowed (a save cannot un-happen).
3. **Real-time mode** (optional rule, for players who want "live" planets): warp limited to 1× while playing, and "catch up to now" on every load. It is the same mechanism with a different default, not a separate sim.
4. **Show both clocks** in the time panel: game date (UTC for the real system) and, for real-date worlds, how far ahead of or behind real time the world is ("+3 y 41 d ahead of today").

### 3.4 Body orbits from real data

Three levels of fidelity. Each is an analytic function of time, so rails and warp keep working:

| Level | Data | Accuracy | Validity | Cost |
|---|---|---|---|---|
| **A. Elements + secular rates** | JPL "Approximate positions of the planets": 6 elements and their rates per century for each planet [T-JPL-APPROX] | about 20″ in longitude for the Earth–Moon barycentre over 1800–2050; a second table covers 3000 BC–3000 AD with extra terms for Jupiter–Neptune | centuries | trivial: what `@orbital/kepler` does today, plus a linear term per element |
| **B. Analytic theory** | VSOP87 for planets, ELP for the Moon [T-VSOP87][T-ORBITER] (or a library that packages them, e.g. Astronomy Engine [T-ASTRO-ENGINE]) | arc-second level | millennia | hundreds of periodic terms per body; still microseconds per call |
| **C. Precomputed ephemeris** | JPL DE440 (the current reference planetary and lunar ephemeris) as Chebyshev polynomial pieces [T-DE440][T-HORIZONS] | the reference itself | the span we ship (e.g. 1950–2150) | a data file per body, evaluation is cheap |

**Recommendation:** level A for planets as the default (it fits our Kepler model exactly: the orbit of each body becomes "elements at epoch plus rates"); the **Moon** needs more than A because its orbit, inclined about 5.1° to the ecliptic, is strongly perturbed: the nodes regress with an 18.6-year period and the perigee advances once every 8.85 years [T-MOON-ORBIT]: use a short periodic series or level C chunks for the Moon only. Level C for everything is the "Principia-grade" option and costs a download.

**Patched conics stay.** Vessels still feel one body at a time (`simulation.md`); bodies simply follow better paths. A body whose path is no longer a fixed conic is still a deterministic function `stateInParent(t)`, which is the only thing the SOI code and the map need. Where the current code assumes a body's orbit is a fixed conic (closed-form periods, `findCrossing` over a conic, the trip planner's Δv map), use the osculating elements at the current time: over one transfer the rates change little.

**n-body?** Not for flight. The ephemeris already *contains* the n-body solution of the real system (DE440 is fitted to observations and integrated with full physics) [T-DE440]. For invented or edited systems, Universe mode's "freeze" (`05`) produces elements, and its "ephemeris flight" option (`05` U3) is the same machinery as level C.

### 3.5 Body rotation, axial tilt, day and night, seasons

The IAU Working Group on Cartographic Coordinates and Rotational Elements publishes, for planets, moons and small bodies, the **pole direction** (right ascension and declination, with slow rates) and the **prime meridian angle** growing linearly with days since J2000, plus periodic terms for some bodies [T-IAU-WGCCRE]. For **Earth** the precise model is the Earth Rotation Angle with precession and nutation [T-SIDEREAL]; for the **Moon**, the librations in the DE ephemerides [T-DE440]. (The general form written above, pole plus `W = W0 + Ẇ·d`, is how these models are usually presented; the coefficients should be taken from the report itself when an ADR is written.) For a game, a fixed pole and a linear `W` are visually exact for centuries.

For Orbital:

- A body's orientation becomes `q(t) = q_pole · Ry(W(t))`: a constant (or slowly changing) tilt of the body's spin axis, then the spin about it. Today it is `Ry(ωt)` with the pole fixed at +Y for every body (`units-and-frames.md`). With `q_pole` = identity and `W = ωt` the old behaviour is reproduced exactly, so fictional systems and old saves are unaffected.
- **Seasons and day length** follow automatically once the Sun is a body: the sun direction is the Sun's position relative to the planet, the tilt makes the sub-solar latitude move over the year (±23.44° for Earth, the J2000 obliquity being 23.43928° [T-JPL-APPROX]), and day/night is the existing terminator. Today the renderer uses a fixed star direction and a constant "declination" of 0.2 rad (`packages/renderer/src/sun.ts`), so there is no year and no season.
- **Sidereal vs solar day**: the spin period is sidereal (Earth: 86 164.09 s [T-SIDEREAL]); the solar day is longer because the planet also moves around the Sun. The calendar shows solar days; the sim uses the sidereal spin.

### 3.6 Frames

- **System frame axes.** Real data comes in the ICRF/J2000 frame (equatorial) or the J2000 ecliptic [T-JPL-APPROX]. Choose the **J2000 ecliptic** for real systems, with +Y = ecliptic north (keeps "+Y up" and puts the planets near the X–Z plane, which suits the map view), and rotate equatorial data at load time by the obliquity 23.43928° [T-JPL-APPROX].
- **Every frame keeps the same orientation** (the current rule: frame changes are translations only). What changes is that a body's equator is no longer the X–Z plane. Places that assume "+Y is the body's north" need the body's pole instead: surface placement and surface rails, the ground tile, terrain lookups (body-fixed directions), SAS "surface" reference and the navball horizon, the heading/latitude readouts, launch-site coordinates, and the rotation boost.
- **Inclination shown to the player** should be relative to the **current body's equator** (what players mean by "equatorial orbit"), computed for display from the inertial elements; the sim's elements stay inertial.

### 3.7 Scale: real, rescaled, or fictional

| Option | What it is | Pacing |
|---|---|---|
| **1:1 real** | real sizes, masses, orbits, rotation (as KSP's Real Solar System mod does [T-RSS]) | about 9.4 km/s to low Earth orbit with losses vs about 3.4 km/s on stock Kerbin [T-DV-LEO][T-KSP-DV]; Moon in about 3 days; Mars transfer about 8½ months with windows about every 26 months [T-MARS-TRANSFER]; big multi-stage rockets; long warps |
| **Rescaled real** | real layout, real dates, real tilts and periods relationships, bodies shrunk (e.g. 2.5× or 2.7× the stock Kerbin scale, as KSRSS and JNSQ do for KSP [T-KSRSS][T-JNSQ]) | between the two; recognisable Earth, playable rockets |
| **Fictional (today)** | our Kerbin-scale home planet and moon, invented calendar | KSP pacing; fast to orbit (about 2.3 km/s orbital speed at 80 km, *computed*) |

Real-data features (dates, tilts, seasons, ephemerides) do not require 1:1. A rescaled real system can use real **angles and dates** (positions of planets in their orbits, axial tilts, the Moon's phase on a given date) with scaled **distances and sizes**, keeping "the sky matches today's sky" while rockets stay playable. This is the most interesting middle ground for Orbital.

### 3.8 How saves and mods carry it

- **System package** (a mod with bodies, as today) gains: `timeScale`, `calendar`, reference `epoch` of its elements, per-body `orbit.rates`, optional `orbit.periodic` terms or an `ephemeris` asset (level C), per-body `rotation: { poleRa, poleDec, poleRates?, w0, wDot, periodic? }`, the Sun as root. Stock could ship two: the current fictional system and a "Sol" system (scale chosen by the human).
- **World save**: `epoch` (two-part), the system package id and version, the scale variant. The sim save keeps `time` as now.
- **Universe mode** (`05`): a frozen system records its epoch, so a shared system plays at the same "date".
- **Scripts**: `time()` stays sim time; add `date()` (UTC string and Julian date) built from the epoch by the host, so scripts can plan with real dates without a wall clock (the sandbox's `Date` is already the simulation clock, `scripting.md`).

### 3.9 Gameplay that real time unlocks

- **Launch windows as events**: transfer windows to planets appear in the timeline and the news feed (`03`); rivals plan around them too.
- **Real sky events**: eclipses, oppositions, conjunctions on their real dates; solar conjunction blocking comms (`01`).
- **Historical career**: start in 1957; contracts tied to real milestones and dates; race the real space programs (Mars Horizon does a fictionalised version of this [G-MH]).
- **"Look up tonight"**: the map and a sky view show where the planets really are today; a planet visible from the launch site at dusk in the game is visible in the real sky too (for a real-data world in catch-up mode).

## 4. Impact on existing code (summary for the ADRs)

| Area | Today | Change |
|---|---|---|
| Body tree (`core.bodies`, ADR 0051) | root = home planet, children on fixed Kepler orbits | a Sun root; `orbit` gains optional rates/periodic terms/ephemeris; `stateInParent(t)` evaluates them |
| Body rotation | `Ry(2πt/T)` about +Y, `BodySnapshot.rotation` | `q_pole · Ry(W(t))`; identity pole and `W = ωt` reproduce today |
| Frames (ADR 0007, `units-and-frames.md`) | +Y = the body's north pole; frames differ by translation | +Y = system (ecliptic) north; body poles are data; frames still differ by translation |
| Surface placement, surface rails, terrain, ground tile, SAS surface reference | assume pole = +Y | use the body's orientation quaternion |
| Renderer sun (`sun.ts`) | fixed star direction, no seasons | from the Sun body's position |
| Kepler/trip planner | fixed conics | osculating elements at the current time |
| Time | `t` seconds since world start | unchanged, plus world `epoch`, `timeScale`, `calendar`; UTC conversion only in UI |
| Saves | `time` | plus epoch and system id; a migration fills the epoch of old worlds with "fictional, day 0" |

None of these changes is needed for the fictional system to keep working; they are all "data that defaults to today's behaviour".

## 5. Open decisions for the human

1. **Scale of the real system**: 1:1, rescaled (which factor), or both as options?
2. **Default start date** for new worlds: today, a fixed modern date, or a historical date per mode?
3. **Catch up to now**: offered on load, a button only, or a "real-time mode" rule?
4. **Fidelity**: level A (elements + rates, tiny data) for planets with a special Moon model, or level C (DE440 pieces, a download) for everything?
5. **Calendar and time scale shown to players**: UTC dates (with leap seconds) or simply "TDB ≈ UTC + 69 s" ignored for display?
6. Does the fictional stock system get a Sun body, tilt and seasons too (recommended: yes, it makes the existing game look better and tests the machinery)?
