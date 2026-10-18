# 15a — Physics and flight model audit (raw, read-only)

Raw output of a read-only audit (2026-10-18) for section 1 of [15-orbital-today-inventory-2.md](15-orbital-today-inventory-2.md). Paths are relative to the repository root. Status: **IMPL** = implemented, **PARTIAL** = partly implemented, **MISSING** = not implemented.

## 1. Atmosphere and aerodynamics

- **Atmosphere: PARTIAL.** The model is isothermal exponential: `p = p0·exp(-h/H)`, cut to zero at `atmo.height`, with `ρ = p/(R·T)` at T = 288.15 K (`packages/sim/src/atmosphere.ts:11-15`, `constants.ts:21-23`). The home body uses H = 5600 m, p0 = 101 325 Pa and a 70 km top (`mods/stock/src/bodies.ts:47`). There is no temperature lapse rate and no per-body gas or curves.
- **Part drag: IMPL (simplified).** Drag is computed per part and per body axis: `F_i = -½ρ·Cd·A_i·|v_i|·v_i` (`aero.ts:1-10`, `frames.ts:546-553`).
  - The side area is `2rh` and the end area is `πr²`. An attached end has no area (`aero.ts:22-33`).
  - The default Cd is 0.3 (`constants.ts:19`). A part can override it with `dragCoefficient` (`frames.ts:547`): the nose cone uses 0.12 and the wing 0.05 (`mods/stock/src/parts.ts:416, 494`).
  - The only shielding is between attached end faces. Drag uses velocity relative to the co-rotating air (`frames.ts:536`).
- **Body lift: MISSING** (`aero.ts:9`).
- **Fins: IMPL.** They use a flat-plate normal force (`mods/stock/src/modules.ts:607-614`) plus rotational damping ×60 (ADR 0046) (`modules.ts:587, 622-629, 654-657`).
- **Wings: IMPL.**
  - Finite-wing lift slope (`modules.ts:789-791`), linear CL up to stall followed by a cosine fade (`810-814`).
  - Drag: `CD = CD0 + CL²/(πeAR) + crossflow·sin²α` (`815-819`).
  - Spanwise flow is ignored (`829-842`). The stock wing is 3 m² with aspect ratio 6 (`parts.ts:486-510`).
- **Flaps: IMPL**, settings 0, 0.5 and 1 (`modules.ts:772-777, 805-819, 886-891`).
- **Control surfaces: IMPL.**
  - Full-plate deflection of ±25° at 60°/s (`modules.ts:666-741`).
  - The mixer scales each surface by its lever arm (`mods/stock/src/steering.ts:23-28, 61-71`). Each surface reports its authority to SAS (`modules.ts:710-723`).
- **Pitch trim: IMPL** (`packages/core/src/protocol.ts:497-498`, `packages/sim/src/commands.ts:320-324`, `state.ts:150-156`).
- **MISSING:** Mach and transonic effects, wave drag and sweep. There is no speed of sound anywhere, and these were scoped out in `docs/plans/041-aero-and-structure-extras.md:31`.
- **MISSING:** ground effect and wing-tip stall (scope of `docs/plans/063-aeroplane-gameplay.md:30`, no code).

## 2. Re-entry heating (plan 014, ADR 0023)

- **IMPL:**
  - One skin temperature per part (`thermal.ts:1-8`).
  - Sutton-Graves convective heating `q = k·√(ρ/r_n)·v³` with k = 1.74e-4, applied over the exposed projected area (`thermal.ts:64-85`, `constants.ts:60`). It is computed in the same pass as drag (`frames.ts:396, 554`).
  - Radiative cooling `εσA(T⁴−Te⁴)` with ε = 0.8, using implicit Euler and Newton iteration (`thermal.ts:92-114`). The skin heat capacity equals 3 mm of aluminium (`constants.ts:62`).
  - A part above `maxTemperature` (1000 K by default) is cut off or destroyed (`thermal.ts:153-160`, `vessel.ts:634-648`).
  - The ablative heat shield starts ablating at 700 K, absorbs 3 MJ/kg, carries 120 kg of ablator, and loses mass as it ablates (`modules.ts:518-571`, `parts.ts:315-325`).
- **PARTIAL:**
  - On rails, parts only radiate; nothing heats them (`sim.ts:391`, `docs/plans/014-reentry-heating.md:27`).
  - On-rails debris that enters the atmosphere is deleted (`modes.ts:216-222`).
- **MISSING:** conduction between parts, separate internal and skin temperatures, per-face heating with occlusion, and convective cooling.

## 3. Structure, crashes and damage (ADR 0018, ADR 0019, plan 012)

- **Rigid vessels by design.** Each vessel is a rigid compound body with one box collider per part (ADR 0018:24, 47; `frames.ts:256-304`). Mass, CoM and inertia are recomputed when parts are lost (`frames.ts:480-506`).
- **MISSING (by design):** joint flex and wobble.
- **Struts: PARTIAL.** The strut part exists and is cut when parts separate, but it "adds no stiffness" (`parts.ts:519-536`, `vessel.ts:392`).
- **MISSING:**
  - joint breaking, aerodynamic overstress and breakup; parts are only cut by staging, impact or overheat (`vessel.ts:610-654`);
  - g-force limits for parts and crew;
  - collision damage between parts or between vessels; only the ground and stones are read (`frames.ts:699-707`; `docs/plans/012-ground-contact-landing.md:26`).
- **Impact tolerance: IMPL.**
  - Each part has `impactTolerance` (6 m/s by default). Above that the part breaks off; above 2× (`DESTROY_FACTOR`) it is destroyed (`constants.ts:39-41`, `frames.ts:748-754`, `vessel.ts:610-627`).
  - Impact speed is the closing speed along the ground normal before the step (`frames.ts:685-745`). Stock values range from 3 to 12 (`parts.ts:67-801`).
- **Ground: IMPL.**
  - The ground is a kinematic tile of 400 × 200 × 400 m on the terrain tangent plane, spinning with the planet. It is created below 300 m and removed above 400 m (`frames.ts:575-647`, `constants.ts:28-37`).
  - Friction is 0.8 and restitution 0 (`frames.ts:290-291`). Stones have colliders on airless bodies (`frames.ts:654-677`).
- **Legs: IMPL without suspension.** Four static foot boxes (`modules.ts:435-512`; `docs/plans/012-ground-contact-landing.md:26`).

## 4. Engines and propulsion

- **Isp: IMPL, linear.** Two points interpolated in p/p0 (`mods/stock/src/engine.ts:38-42`), not KSP's multi-key curve.
- **Mass flow: IMPL.** Mass flow is fixed by the vacuum rating; thrust = `ṁ·Isp(p)·g0` (`engine.ts:49-58`). Propellants are split by volume ratio (`engine.ts:64-77`).
- **Throttle: IMPL.** A continuous vessel throttle from 0 to 1 (`modules.ts:247, 290-293`). There is no minimum throttle and no spool time.
- **Gimbal: IMPL.** Up to 30° with a slew rate (`modules.ts:152-159, 179-191`). LV-T30 has 3° and the cluster engine 2° (`parts.ts:209, 261`). Gimbal authority is reported to SAS (`steering.ts:78-92`).
- **Flameout: IMPL.** When propellant runs short, thrust is scaled down and the engine flames out (`modules.ts:257-273`).
- **MISSING: ignition limits and ullage.** Reliability only covers a failure to ignite on stage, with an 8 % chance (`mods/stock/src/reliability.ts:5-13`).
- **MISSING: true solid rocket boosters.** `stock.booster` is a liquid fuel/oxidizer booster with its own tank (`parts.ts:358-406`), although the tech text says "solid boosters" (`mods/stock/src/tech.ts:51`).
- **MISSING:** jet engines, air intakes and propellers (`docs/plans/063-aeroplane-gameplay.md:35`).
- **MISSING: RCS and monopropellant.** The closest thing is the EVA jetpack: the stock engine on cold gas, 50 N, Isp 60 s (`mods/stock/src/eva.ts:28-29, 58-73`).
- **Cluster engine: IMPL.** KR-4 with 4 bells (`parts.ts:216-266`).

## 5. Fuel flow (`packages/sim/src/resources.ts`)

- **Flow modes: IMPL.** `none`, `vessel` and `stack` per resource (`resources.ts:66-70`). LF and Ox use `stack`, EC and life support use `vessel`, ablator uses `none` (`mods/stock/src/resources.ts:12-51`).
- **Stack flow: IMPL.** Breadth-first search from the engine, neighbours in ascending id order, stopping at `crossfeed: false` (`resources.ts:37-64`). Engines and decouplers block flow (`parts.ts:197`).
- **Fuel lines: IMPL.** One-way; their sources are drained first, which supports asparagus staging (`resources.ts:15-27, 45-49`; `parts.ts:538-554`).
- **Flow priority: PARTIAL.** Parts are drawn in search order, and each store is drained in turn (`resources.ts:79-98`). There are no user-set priorities and no per-tank flow toggles.
- **MISSING: transfer between tanks.** Only module-level `withdraw`/`deposit` exist; there is no player transfer.

## 6. SAS and reaction wheels (plan 042, ADR 0049)

- **SAS modes: IMPL.** off, hold, prograde, retrograde, normal, antinormal, radial-in, radial-out, maneuver, target, anti-target and level (`packages/core/src/protocol.ts:25-39`). Prograde can follow surface or orbit speed (`43`).
- **Controller: IMPL.** A rate-limited PD controller with an integral term, a braking profile and a quiet band (`packages/sim/src/sas.ts:19-51, 214-307`). It scales with authority over inertia (`265-271`) and yields to manual input (`232-239`).
- **SAS on rails: IMPL.** Pointing modes snap the attitude analytically (`sas.ts:313-330`).
- **MISSING: SAS gated by pilot or probe level.** Every controlled vessel gets full SAS (`docs/plans/042-sas-and-flight-assists.md:32`).
- **Reaction wheels: IMPL.** Fixed torque per axis, drawing EC in proportion to use (`modules.ts:367-429`). The stock wheel gives 5000 N·m (`parts.ts:95`). The pod has no built-in wheel (`parts.ts:75-78`).

## 7. Wheels, parachutes, water

- **Wheels: IMPL, simplified.**
  - Frictionless box colliders; the sim adds rolling resistance, brakes and side grip, each limited by grip × load (`frames.ts:414-477`; `modules.ts:936-998`).
  - The steerable wheel turns up to 20° with yaw (`parts.ts:815-816`).
  - There is no suspension, no wheel spin and no motor.
- **Parachutes: MISSING.** Only the action-group id exists (`action-groups.ts:13`).
- **Buoyancy: IMPL** (plan 067, ADR 0182).
  - Each part is cut into 6 slices, with buoyancy `ρ_w·g·V·f` plus linear and quadratic water drag (`packages/sim/src/water.ts:22-28, 62-129`).
  - Water entry counts as an impact at 0.5 × speed (`water.ts:120-124`; `packages/core/src/terrain.ts:475`).
  - The seabed tile sits 30 m below the surface (`frames.ts:600-606`). A floating vessel counts as landed (`frames.ts:768`). The flotation collar part is at `parts.ts:775-789`.

## 8. Step rate, physics range, rails and warp

- **Step rate: IMPL.** A fixed 0.02 s step (50 Hz, `constants.ts:4`), at most 5000 steps per call (`sim.ts:229`). Rapier runs 16 solver iterations (`apps/web/src/lib/sim.worker.ts:49`). Gravity is applied as a force (`rapier-backend.ts:40-44`; `frames.ts:384-390`).
- **Floating origin: IMPL.** Frames use constant velocity and re-anchor after 1 km (`frames.ts:1-6, 777-797`; `constants.ts:12`).
- **Physics range: IMPL.** 2.5 km with two physics frames by default (`constants.ts:14-16`; `frames.ts:99-117`). There are no separate pack and unpack distances for flying and landed vessels.
- **Rails: IMPL.** A vessel goes on rails after 2 s idle in a stable orbit, as ballistic debris, or after 2 s at rest on the ground (`modes.ts:106-200`; `constants.ts:7-8, 48-53`). Rails steps are analytic and at most 10 s long (`sim.ts:463-506`; `constants.ts:5`).
- **Debris: IMPL.** Debris is removed after 10 s at rest on the ground, or when it enters the atmosphere on rails (`modes.ts:208-230`).
- **Warp: IMPL on rails only.** Up to 1e6× (`constants.ts:9`), but refused while any vessel is in flight (`commands.ts:420-450`; `modes.ts:67`).
- **MISSING: physics warp** (KSP's 2–4×).

## 9. Docking, decouplers, staging

- **Decouplers: IMPL.**
  - Top, bottom or radial nodes, with an ejection impulse (`modules.ts:311-361`).
  - Simultaneous cuts are resolved together (`vessel.ts:497-592`), and both sides keep momentum (ADR 0018:32).
  - There is a stuck-decoupler failure (`mods/stock/src/reliability.ts:14-22`).
- **MISSING: docking.** Only an action-group id (`action-groups.ts:11`) and a visual collar on the capsule exist (`packages/renderer/src/parts/generators/capsule.ts:1, 72`).
- **MISSING: launch clamps.** ADR 0019 removed the pad hold.

## 10. Markers in code

There are no TODO, FIXME or "coming soon" markers. Comments that admit a limitation:
- `mods/stock/src/modules.ts:620`: downwash lag "(not modelled)".
- `packages/sim/src/aero.ts:9`: "Lift is out of scope".
- `packages/sim/src/constants.ts:18`: "no per-part data yet". This is stale: `dragCoefficient` exists.
- `mods/stock/src/solar.ts:4`: "Sun exposure and occlusion by bodies come later (plans 122, 065)".
- `packages/sim/src/parts.ts:1`: colliders use placeholder shapes.

## Biggest physics gaps compared with KSP

1. Parachutes
2. Docking
3. RCS
4. Jet engines and air intakes
5. True SRBs (the booster runs on LF/Ox)
6. Physics warp
7. Mach effects
8. Joint flex, overstress and g-force limits
9. Collision damage between parts and vessels
10. Isothermal atmosphere
11. Heating has no conduction and does not run on rails
12. Ignition limits and ullage
13. SAS needs no pilot or probe level
