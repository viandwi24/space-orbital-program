# 060 — Stones you can hit

**Plan:** plans/060-stones-with-collision.md · **Session(s):** stones session (Claude, 2026-10-17) · **Date:** 2026-10-17

## What was done

- `@orbital/core` `stones.ts` (moved from `packages/renderer/src/stones-model.ts` with `git mv`, its test split: lattice tests in core, GLSL and instance tests stay in the renderer): added a `seed` (lattice salt `STONES.salt + 1009 * seed`, `stoneSalt`), `stoneCollider` (cap-sphere of the drawn dome) and `bodyHasStones`.
- Renderer: imports from core, `MoonStones` takes the body's craters seed, the ground shader reads the salt from a uniform `uStoneSalt` instead of a baked constant.
- Sim (`stones.ts`, `frames.ts`, `state.ts`, `constants.ts`): a kinematic body of stone spheres per low vessel on a craters body, attached to its `GroundTile`; contacts counted for `landed` and for impact damage (normal from the sphere's centre).
- Tests: core (identical lists, determinism, budget, seed, collider geometry), renderer (instances are core's stones), sim `test/stones.test.ts` (11 tests: rest, tip, beside, damage, bodies, home planet, determinism, resume, cost).
- Screenshot `assets/060-lander-resting-on-boulder.jpg`: production build (`NODE_ENV=development bun run build`, `scripts/serve.ts` on 5244, one tab), the page's own sim: a lander loaded on the moon over a 1.35 m boulder through `__orbital.send`, legs deployed, at rest on surface rails with one foot on the stone (all UI hidden, 800 x 600 pane). Server and tab closed afterwards; `apps/web/build` deleted.

## What surprised me

- **My tipping rule was wrong.** I derived that the stock lander tips when the centre of mass leaves the support triangle (a cap of 0.69 m) and wrote a test around it; a 0.56 m cap also tipped. A scan of 12 sites gave the real threshold: rest up to 0.42 m (3.5 to 5.9 degrees), tipped from 0.495 m (all lie at 97.9 degrees). The centre of mass sits over the edge between two grounded feet, so which way the body leans decides, not the triangle. The test states the measured values.
- The first drops started inside the stone (clearance counted from the flat ground): the depenetration threw the lander over. Every later case starts 0.4 m above the cap.
- Resume after a landing differs by 1.6 cm on a stone and 2.5 cm on bare ground in this scenario (30 s of settling): the cold solver start of ADR 0050 is the cause, not the stones.
- `git checkout -p` typed by mistake in a command (no input): it discarded nothing, but it is a reminder to not leave interactive git commands in a chain.

## Decisions made

ADR 0092 (lattice in core with a seed, sphere colliders in a second kinematic body, 24 m window, 96 at most, 8 m cadence, normal from the stone). No API version change.

## Measurements

Sim step (lander from 40 m to rest on busy craters ground, 1 500 steps, warm): mean 0.024 ms with stones, 0.020 without (a `hills` body of the same size); worst step 0.18 and 0.15 ms. Building a field: median 0.02, worst 0.04 ms (60 sites, up to the cap of 96 stones). The bounds in the tests are 0.1 ms (mean difference), 15 ms (worst) and 5 ms (build). The machine runs warm today; both numbers are from the same run.

## Open questions / follow-ups

- A vessel loaded on the surface of a craters body starts above the tile and can start inside a stone (not changed; placement). No draft: the solver pushes it out and it is a rare case.
- No CCD: a vessel faster than a few m/s can pass through a small stone. Out of scope (touchdown speeds).
- Stones on slopes sit on the true terrain, the tile on its tangent plane (ADR 0092, consequences).
- The cap-sphere ignores the mesh jitter of +-20 percent in radius.
- Human check: how a foot looks on a stone in motion (the screenshot is a still).

## Verification output

- `bun run test`: 1284 pass, 0 fail (143 files). `bun test packages/renderer`: 552 pass. Web vitest: 91 files, 821 tests pass.
- `bun run typecheck`: all packages and svelte-check 0 errors. `bun run build`: done.
- `bun test packages/sim/test/stones.test.ts`: 11 pass; with the stone colliders switched off on purpose, the rest, tip and body tests fail (3 fail), then restored.
- `bunx prettier --check` on core, sim, renderer, `apps/web/src/lib/public`, the plan, STATUS, decisions and research: only `packages/renderer/src/aurora-model.ts` and its test (another session's plan 061 work) are flagged.
