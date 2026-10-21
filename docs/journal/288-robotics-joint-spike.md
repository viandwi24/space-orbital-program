# 288 — Robotics joint spike

**Plan:** [plans/288-robotics-joint-spike.md](../plans/288-robotics-joint-spike.md) · **Session:** Worker E (Agent 3, Linux), 2026-10-21, worktree off `origin/main` ad5777d8

## Verdict

**No-go** for ADR 0262 as written:

- A, B, C and E pass for both joint kinds.
- D (the 6-joint chain) and F (the cost) fail for both, which by the plan's rules is a no-go.

So [ADR 0265](../decisions/0265-robotics-short-impulse-chains-kinematic-arms.md) is written as `proposed`:

- impulse joints;
- at most two motored joints in series;
- optional sub-steps;
- kinematic poses for longer arms.

Plan 282 stays gated until it is decided. The full reading and the API mapping are in [`docs/research/rapier-joints.md`](../research/rapier-joints.md).

## What was done

| Where | What |
|---|---|
| `packages/physics/bench/joints.ts` | New bench for scenarios A–F, run with multibody joints (software PD, since 0.21 JS has no multibody motors) and with impulse joints (Rapier's force-based motors). The cross-process determinism check uses `Bun.spawnSync`. Diagnostic env knobs (`DT`, `ITER`, `CHAIN_W`, `CHAIN_LINKS`, `MOTOR`, `DIAG`) do not affect the verdict run. |
| `docs/research/rapier-joints.md` | API table, measurements, chain diagnostics (6 and 2 joints), reading, mapping for plan 282 |
| `docs/decisions/0265-…` | Superseding proposal (proposed) |
| ADR 0262 | Status line: the gate's result |
| plan 282 | Context link and a Log line only; status unchanged |
| `docs/research/stack-versions.md` | Rapier 0.21.0 joint API check |

## Run

The machine is an Intel Core i5-8265U (4 cores, 8 threads), with 5.8 GiB RAM, Linux Mint 22.3 (kernel 6.14) and Bun 1.4.2. The bench ran under `nice -n 10` and the heavy-job lock: `bun packages/physics/bench/joints.ts all`.

    Rapier 0.21.0 · linux x64 · Bun 1.4.2
    
    multibody joints (dt 0.02 s, 16 solver iterations)
    scenario       | measure                                         | rule        | result
    A hinge lift   | 90° in 0.34 s, overshoot 0.00°, hold err 0.000° (60 s) | ≤ 0.5°      | pass
    B piston       | 1.5 m in 0.24 s, overshoot 0.00 cm, hold err 0.61 cm | ≤ 1 cm      | pass
    C rotor        | 60.00 rpm after 5 s (error 0.01 %)              | ≤ 2 %       | pass
    D chain        | tip drift 576.66 cm after 10 s, late speed 4.220427028270915e+28 mm/s, settled false | < 1 cm      | FAIL
    E determinism  | in-process true, cross-process true (15770ef5:91 / 15770ef5:91) | bit-equal   | pass
    F cost         | chain 233.2 µs/step, compound 17.7 µs/step (13.20×) | ≤ 3×        | FAIL
    
    impulse joints (dt 0.02 s, 16 solver iterations)
    scenario       | measure                                         | rule        | result
    A hinge lift   | 90° in 0.30 s, overshoot 0.00°, hold err 0.000° (60 s) | ≤ 0.5°      | pass
    B piston       | 1.5 m in 0.22 s, overshoot 0.00 cm, hold err 0.61 cm | ≤ 1 cm      | pass
    C rotor        | 60.00 rpm after 5 s (error 0.00 %)              | ≤ 2 %       | pass
    D chain        | tip drift 104.51 cm after 10 s, late speed 1.33 mm/s, settled false | < 1 cm      | FAIL
    E determinism  | in-process true, cross-process true (d49b1c1c:91 / d49b1c1c:91) | bit-equal   | pass
    F cost         | chain 101.1 µs/step, compound 17.5 µs/step (5.78×) | ≤ 3×        | FAIL
    
    multibody: no-go on some rule
    impulse: no-go on some rule

A second run gave identical results for A–E (determinism hashes equal). F varied with the load: 11.9× multibody and 6.35× impulse.

## Scope check

`git diff --stat origin/main` (no file under `packages/*/src`, `mods/` or `apps/`):

     docs/STATUS.md                                     |   6 +-
     .../decisions/0262-robotics-articulated-vessels.md |   1 +
     ...robotics-short-impulse-chains-kinematic-arms.md |  35 ++
     docs/decisions/README.md                           |   1 +
     docs/journal/288-robotics-joint-spike.md           |  67 +++
     docs/plans/282-robotics-articulated-vessels.md     |   4 +-
     docs/plans/288-robotics-joint-spike.md             |  23 +-
     docs/research/rapier-joints.md                     |  86 ++++
     docs/research/stack-versions.md                    |   6 +
     packages/physics/bench/joints.ts                   | 494 +++++++++++++++++++++
     10 files changed, 709 insertions(+), 14 deletions(-)

Typecheck covers the bench, because `packages/physics/tsconfig.json` includes `bench/**/*.ts`.
