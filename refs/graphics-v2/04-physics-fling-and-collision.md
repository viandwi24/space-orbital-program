# 04 — Physics: deploy "fling" and missed collisions

Read-only audit of `main` at 5c07a270. Model recap: each vessel is **one** compound Rapier body (ADR 0018). It has one box per part, plus the boxes its modules add. There are no physics joints in the sim: robotics re-poses parts in the design frame and rebuilds the body (ADR 0269). A change to the collider set rebuilds the body at the same root pose and velocity (`frames.ts:321-334`). A vessel's own colliders therefore never collide with each other. **Every distinct body in a frame collides with every other one:** the backend sets no collision groups, no contact filter and no CCD (`packages/physics/src/rapier-backend.ts:93-104, 119-131`). Its only filter is `setContactsEnabled(false)` on fixed joints (`:188`), and the sim never creates any.

## Part 1 — "opening a container flings the rocket"

The force comes from Rapier's penetration resolution. A new body that spawns inside another one (or a box that appears inside one) is pushed out at the solver's maximum corrective velocity. When the contact is off-axis, the push also spins the vessel. `ModuleAnimate` itself is innocent: it has no `colliders` and no `mass` hooks (`mods/stock/src/animate.ts:31-68`), so its toggle never rebuilds the body.

### F1. Single-use bay panels spawn inside the ring's collider — **present, confirmed**
- `openBay` places each panel at `radius` along its sector direction (`animate.ts:128-144`). `spawnQueuedDebris` gives every panel the **source part's rotation**, not the sector's (`packages/sim/src/debris.ts:77-89`).
- `stock.payload-petals`: ring `cyl(1.875, 3.5)`, panels `box [0.4, 3.3, 2.4]`, radius 2.325 (`mods/stock/src/parts/missions.ts:461-515`). Because the panels are not rotated, their 2.4 m side always lies along Z. The panels sit at 45°/135°/…, so that long side cuts into the ring.
- Numeric check (panel box against the ring's four inscribed squares, `parts.ts:49-57`): **each of the 4 panels starts 0.22 m deep inside the ring.** That gives 4 × 225 kg of overlap, resolved in one step. This is the classic "Jettison panels → violent spin" case.
- **Fix:** rotate each panel to its sector (`qMul(t.rotation, qAboutY(a))`). Compute the offset from the panel's half extent plus a clearance, not a fixed `radius`. More generally, see F0.
- **Test** (`packages/sim/test/bay-jettison.test.ts`, Rapier): fly the petals with a payload, `open`, step 10 times. Expect the ring vessel's angular speed < 0.01 rad/s and its Δv < 0.05 m/s. A cheaper unit check: build each panel's spawn AABB/OBB and assert no overlap with `collectColliders(ring)`.

### F2. Payload released from a *solid* bay is embedded in it — **present**
- A bay is hollow only when it has `walls` (`animate.ts:213`; `frames.ts:238-239`). `stock.cargo-bay` and the service bays come from `bay()` with **no `walls`** (`missions.ts:395-441`). The petals ring has none either. So the whole bay is a solid cylinder collider, yet the cargo bay and the petals have an `inner` seat for a payload *inside* it. Only `stock.orbiter-bay` has walls (`missions.ts:1315`).
- While attached, the payload belongs to the same body, so nothing happens. When it is released (decoupler, undock, `detach`), `splitVessel` builds two bodies at the same poses (`vessel.ts:477-495`). The payload's boxes are then fully inside the bay's box, metres deep, and both are kicked apart.
- **Fix:** give `bay()` walls (as for the orbiter bay) for every bay with an `inner` node, including the petals ring. Also add a guard (registry lint): a part with an `inner` node must be `hollow`.
- **Test:** a stock-part lint test, "every part with an `inner` attach node has a module whose `hollow()` is true". A sim test: release a 1 t payload from `stock.cargo-bay` in orbit, and assert the carrier's |Δv| < 0.1 m/s and |Δω| < 0.01 rad/s after 1 s.

### F0 (root of F1/F2/F6). No overlap grace between bodies that were just separated — **present**
- Splits (`vessel.ts:477-495`), debris (`debris.ts:83-90`) and docking undo all create bodies that may overlap. Part boxes overlap freely inside a design: a cylinder's squares, engine bells into decouplers. Nothing in the backend can say "ignore A↔B until they are apart". KSP has this (a grace period for parts that just separated).
- **Fix:** add `PhysicsBackend.setPairContacts(a, b, enabled)`. In Rapier, collect the disabled pairs in a set and filter them through `PhysicsHooks.filterContactPair` (`ActiveHooks.FILTER_CONTACT_PAIRS` on the colliders), or through collision groups. The sim disables the pair on a split, a debris spawn or an undock. It re-enables the pair once `contacts(a, b)` has no point with `distance < 0` for N steps (or the AABBs separate). The mock backend keeps a set.
- **Test** (`packages/physics/test/contacts.test.ts`): two boxes created 0.3 m interpenetrating, with contacts disabled for the pair. After a step both velocities are still 0; after re-enabling at separation, normal contact resumes.

### F3. A module box appears instantly at full size — **present (ground; space if a neighbour is close)**
- `refreshColliders` swaps the whole collider set in one call (`frames.ts:321-334`). Landing-leg feet (`modules.ts:808-828`) and wheels (`modules.ts:1580-1597`) appear fully extended. Closing a bay's doors adds the door slab at once (`animate.ts:223-224`). Near the tile, or with a released payload or another vessel in the slab, this is a deep overlap → pop.
- **Fix:** run a sweep or overlap query before the swap (new backend `overlaps(handle, shape)`). If the new box overlaps another body, refuse, delay, or grow the box over the animation's `seconds`. Use F0's grace for the bay-door case.
- **Test:** a landed lander deploys its legs. Assert the max upward speed over 1 s is < 0.5 m/s (`landed` stays true, no `part:damaged`).

### F4. Robotics re-pose: COM teleports, momentum not conserved — **present**
- `stepJoints` (`robotics.ts:76-103`) moves the moving side in the design frame every `JOINT_POSE_INTERVAL` = 0.1 s, then rebuilds the body at the **root's** pose and old COM velocity (`frames.ts:327-333`). When the root is on the moving side, the *rest* of the vessel moves (`robotics.ts:57-60`). The system COM jumps by the mass-weighted shift every 0.1 s. Internal motion should leave it fixed. Angular velocity is copied while the inertia changes, so angular momentum is not conserved either. The 0.1 s steps also drive parts into the ground or neighbours as discrete jumps.
- **Fix:** in `refreshColliders(force)`, keep the world COM and the angular momentum: `origin' = origin + R(com_old − com_new)` and `ω' = I'⁻¹·(I·ω)`. Apply joint deltas every step, rate-limited per part, or check overlap as in F3.
- **Test:** in free space, a hinge swings a 1 t arm 90°. Expect the vessel COM (`vessel.com`, BCI, minus `v·t`) to drift < 1 cm. Expect the angular momentum about the COM to stay within 1 %.

### F5. Minor — **present**
`setMass` jumps mass and COM in one step, keeping `linvel` at the new COM (`frames.ts:505-530`). The docking merge averages ω by mass, not by angular momentum (`docking.ts:399-400`). Fix: conserve L. Test: a 100 kg probe spinning at 1 rad/s docks to a 20 t station → ω = I⁻¹·L.

Fairing panels (`fairing.ts:139-151`) start clear (`wide + 0.15`, 0.1 m box): **likely OK**.

## Part 2 — missed collisions

### C1. No CCD anywhere — **present**
`setCcdEnabled` is never called (`rapier-backend.ts:119-132`). `SIM_DT` = 0.02 s (`constants.ts:4`). Bay walls are 0.1 m thick (`animate.ts:217`), fairing panels 0.1 m (`structure.ts:334`), and small parts' boxes are a few tens of cm. Any closing speed above about (thickness_A + thickness_B)/0.02 tunnels: 10 m/s for two 0.1 m slabs. A docking overshoot, debris leaving at a few m/s, or a fast pass all miss.
- **Fix:** `RigidBodyDesc.setCcdEnabled(true)` on dynamic vessel bodies (cheap with few bodies). Optionally set `maxCcdSubsteps`.
- **Test** (`rapier-backend.test.ts`): a 0.1 m slab at 30 m/s starting 0.5 m from a fixed 0.1 m slab, `dt` 0.02, 5 steps. It must end on the near side, with velocity ≤ 0 along the approach.

### C2. Vessels on rails have no colliders, and orbiting vessels go on rails after 2 s idle — **present (main cause of "debris / docking passes through")**
- `autoRails` (`modes.ts:261-269`) puts any flight vessel that is idle `RAILS_IDLE_TIME` = 2 s (`constants.ts:14`) in a stable orbit on rails, and ballistic debris too. On rails a vessel has no body.
- Only `wakePortNeighbours` brings one back, and only when **both** vessels have a docking port and are within `PORT_WAKE_RANGE` = 50 m (`docking.ts:57, 161-179`). Stations without ports, spent stages and debris are never woken, so the active vessel flies through them. KSP loads everything within about 2.3 km.
- **Fix:** a load range. Wake every rails vessel (of the same SOI) within `LOAD_RANGE` (about 2 km, ≤ `PHYSICS_RANGE` 2.5 km) of a controlled flight vessel, and refuse `railsEligible` for vessels inside that range of a controlled vessel. Wake with a margin based on closing speed: `range + v_rel·T`.
- **Test:** an idle portless 5 t vessel in a circular orbit. A controlled craft 30 m behind closes at 1 m/s. Step 40 s and assert a contact (`backend.contacts` > 0) or a Δv on the target. Today the craft passes straight through.

### C3. Frames never merge — **present**
- `acquireFrame` picks a frame only when a vessel **enters** flight (`frames.ts:104-122`). No code moves a vessel between frames (all `frame.vessels =` writes are at `frames.ts:359`, `vessel.ts:483`, `save.ts:363`). Two flight vessels anchored more than 2.5 km apart that later converge stay in two Rapier worlds, and nothing between them can ever collide.
- **Fix:** in `flightStep`, when two in-use frames of one SOI have any vessels within `LOAD_RANGE`, move the vessels of one into the other. Rebuild each body with `local' = local + oA − oB` and `v' = v + vA − vB`. Do this between steps, as `refreshColliders` does.
- **Test:** two flight frames, vessels 3 km apart closing at 50 m/s. Once they are under 2 km apart, `frameOfVessel` is the same for both, and at the meeting a contact is reported.

### C4. Ground is one flat tangent plane under the COM — **present (by design; "sinks into terrain")**
- `updateTile` builds a 400×400 m box whose top is the terrain's tangent plane on the COM's radial (`frames.ts:664-728`; `terrain.ts:53-81`). Parts away from the COM over a hill, a crater rim or a boulder enter the rendered terrain. The plane is also re-placed with `setTransform` every step (`frames.ts:723`). When the COM crosses a slope change, the plane jumps and teleports into a resting vessel, causing a pop or a drop.
- **Fix:** replace the single plane with a small Rapier `heightfield` patch (or a few planes, one per lowest contact point) sampled from `terrain.heightAt` around the vessel's footprint. Move it only when the vessel leaves the patch, so it does not teleport every step.
- **Test:** a 20 m-long rover, COM over flat ground and its nose wheel over a +2 m bump (fixture terrain). After settling, every part's lowest point is ≥ `terrainUnder(point) − 0.05 m`.

### C5. Every vessel's tile collides with every vessel — **present**
- Tiles are ordinary kinematic bodies with no filter (`frames.ts:699-717`). A vessel near another's tile rests on, or is shoved by, a plane fitted to the *other* vessel's terrain. When a tile is created (that vessel descended below 300 m) it can appear inside a landed neighbour → fling. `groundContacts` reads contacts only with the vessel's own tile (`frames.ts:781`), so `landed` and impact damage miss hits on a foreign tile.
- **Fix:** collision groups (tile *i* interacts only with vessel *i*), or one shared heightfield per frame (C4).
- **Test:** A is landed on sloped ground and B lands 80 m away. When B's tile is created, A's |Δv| < 0.05 m/s, and A's lowest point stays at its own terrain height.

### C6. Ground tunnelling — **mostly mitigated** by the 100 m-thick tile (`constants.ts:40`); C1 and C4 close the rest.

## Priority
F1, F2 (+F0) explain the reported fling. C2 explains "debris/station passes through". C4 and C5 explain "into terrain". C1 and C3 are the remaining gaps.
