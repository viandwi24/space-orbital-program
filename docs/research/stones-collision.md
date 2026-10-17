# Stones as colliders

Checked 2026-10-17 (plan 060).

- Rapier JS, colliders: https://rapier.rs/docs/user_guides/javascript/colliders - several colliders attach to one rigid body with `world.createCollider(desc, body)`; each has a translation relative to the body (`setTranslation`, `setTranslationWrtParent`); a ball is `ColliderDesc.ball(radius)` (the page shows the call and describes balls by their radius). The adapter already builds compound bodies of boxes this way (ADR 0018); `PrimitiveShape` has `sphere`.
- Rapier JS, rigid bodies: https://rapier.rs/docs/user_guides/javascript/rigid_bodies - a velocity-based kinematic body keeps the velocity the user sets and ignores contact forces; continuous collision detection sweeps a fast dynamic body ("bullet") against kinematic and dynamic bodies only when it is switched on and the body moves fast relative to another collider. The sim uses neither: stone bodies are kinematic like the ground tile (ADR 0019), a vessel is not a bullet, so a very fast vessel can pass through a small stone (stated in ADR 0092).
- Nothing else was looked up: the cap-sphere radius `(r^2 + c^2) / 2c` is the geometry of a spherical cap of base radius `r` and height `c`.
