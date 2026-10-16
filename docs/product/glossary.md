# Glossary

Use these terms consistently in code, docs, and UI.

| Term | Meaning |
|---|---|
| **Body** | A celestial body: planet, moon, star. Has mass, radius, optional atmosphere, and a sphere of influence. |
| **SOI** | Sphere of influence: region where a body's gravity dominates; patched-conics boundary. |
| **Vessel** | A connected set of parts under one control authority. A vessel can split (staging, breakage) into several vessels. |
| **Part** | Smallest placeable unit in assembly. Pure data: mass, mesh, attach nodes, list of module configs. Defined with `definePart`. |
| **Module** | Reusable behaviour attached to a part with a config: `Engine`, `FuelTank`, `Decoupler`, … Defined with `defineModule`. |
| **Resource** | A quantity that flows between parts: liquid fuel, oxidizer, electric charge. Defined with `defineResource`. |
| **Plugin** | Unit of distribution and loading. Registers parts, modules, resources, bodies, systems. Defined with `definePlugin`. Also called **mod** when third-party. |
| **Stock** | The plugin shipped with the game (`mods/stock`). Written with the public SDK. |
| **SDK** | `@orbital/sdk`: the only package a mod may import from. |
| **Core** | `@orbital/core`: environment-neutral runtime (world, registries, events, loader). |
| **Sim** | `@orbital/sim`: the fixed-timestep simulation loop that drives the world. |
| **Flight mode** | Vessel simulated as one compound rigid body (physics backend active); split into two bodies when a decoupler fires. |
| **On rails** | Vessel propagated analytically along a Keplerian orbit; no physics backend. Enables time warp. |
| **Orbital elements** | The classical set `{ a, e, i, raan, argp, m0, epoch }` describing a two-body orbit (`@orbital/kepler`). Conventions in `architecture/units-and-frames.md`. |
| **Time warp** | Simulation time runs faster than wall time. Only on rails (physics warp is out of scope for MVP). |
| **Floating origin** | Rendering trick: the render world's origin is re-centred near the camera so float32 GPU math stays precise. |
| **Fixed timestep** | Sim advances in constant `dt` steps (default 1/50 s) regardless of render frame rate. |
| **Stage** | Ordered group of parts activated together (engines ignite, decouplers fire). |
| **Attach node** | Named point on a part where another part can connect (`top`, `bottom`, `surface`). |
| **System** | Logic that runs every sim step over the world (e.g. resource flow, aerodynamics). Registered by plugins. |
| **Component token** | Typed key for world data, made with `defineComponent<T>(name)` (ADR 0010). |
| **Snapshot / Command** | Read-only sim state sent to hosts / input messages sent to the sim; plain data (`core/src/protocol.ts`). |
| **PhysicsBackend** | Interface in core that `@orbital/physics` implements (ADR 0004). |
| **Plan** | A numbered unit of work in `docs/plans/` with executable acceptance criteria. |
| **ADR** | Architecture Decision Record in `docs/decisions/`. |
| **Contributes** | The typed API a plugin exposes to its dependents: declared with `contributes: {} as {...}`, implemented with `ctx.provide`, visible on a dependent's `ctx` (ADR 0013). |
| **Load report** | Result of `loadPlugins`: boot order, disabled plugins with reasons, and what each plugin registered (`{ id, by }` per kind). |
| **Module augmentation** | `declare module '@orbital/sdk' { interface EventMap {…} }`: how a mod adds typed events, resource ids and module config types to the open interfaces. |
| **Part shape** | Placeholder geometry of a part (`box` or `cylinder`, metres, axis = local Y) used by the renderer and physics body until art exists. `PartDefinition.shape`, ADR 0014. |
| **Vessel API** | `ModuleContext.vessel`: the capabilities a module hook has over its vessel (forces, control input, ambient, resources, detach); ADR 0015. |
| **Crossfeed** | Whether resources may flow through a part (`PartDefinition.crossfeed`, default true). Engines and decouplers block it, which makes a decoupler a stage barrier. |
| **Flight frame** | One physics backend with a local frame that moves at constant velocity; holds a cluster of flight vessels (ADR 0017). |
| **Pad hold** | Removed by plan 012 (ADR 0019): a stack now stands on the ground tile by friction. Was: the sim pinned a surface-loaded vessel to its pad pose until thrust exceeded weight (ADR 0017). |
| **Ground tile** | A kinematic slab under each flight vessel near the ground whose top face is the tangent plane of the reference sphere; real contact, friction and the rotating ground's velocity (ADR 0019). |
| **Impact tolerance** | `PartDefinition.impactTolerance`, m/s: ground impact speed above which a part breaks off (above twice: destroyed). |
| **Module colliders** | `ModuleDefinition.colliders`: extra collision boxes a module adds to its part for its current state (landing-leg feet). |
| **Vessel design** | The JSON a VAB saves: flat part list with parent links plus `stages` (`VesselDesign`, ADR 0016). |
