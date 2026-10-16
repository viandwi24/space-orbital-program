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
| **Flight mode** | Vessel simulated as rigid bodies with joints (physics backend active). |
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
