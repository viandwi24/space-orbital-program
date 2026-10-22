---
id: 313
title: "Tethers and winches between vessels, and releasable struts"
status: done
owner: "part visuals session (Claude)"
depends: [306]
phase: 0
created: 2026-10-21
updated: 2026-10-22
---

# 313 — Tethers, winches, strut release

## Goal

A winch reels a rope to another vessel (a rover to its lander, cargo to a station, a harpoon into an asteroid), and a strut can be released in flight.

## Context

- ADR 0272 (accepted with the plan 313 amendment), research `refs/part-visuals-and-blueprints/connectors-and-tethers.md`.
- ADR 0071 (connectors), ADR 0265 (Rapier joint measurements).

## Scope

**In:**
- strut release (an action and a staging option);
- the `tether` and `socket` module hooks;
- a rope the sim applies between two vessel bodies: pull only, reeled, snapping above its strength, saved;
- a winch part and a tether socket part, and the rope drawn between them in flight.

**Out (later plans):**
- the harpoon (it sticks to terrain and asteroids, which needs ray hits);
- an EVA crew member carrying the hook end;
- fuel hoses (a tether with `feeds`);
- the map view's rope.

## Design (amends ADR 0272, now accepted)

- **The rope is the sim's, not a Rapier joint.** Rapier 0.12's rope joint has a fixed length and reports no force. A winch must change the length every step, and a rope must snap by its tension.
  - Before each physics step, for each tether: when the anchors are farther apart than the rope's length and separating, the sim applies equal and opposite pulls at the anchors. Each pull is the impulse that stops the separation over the step, plus a small correction for the overshoot.
  - That pull is the tension. Above the rope's strength it snaps.
  - The mock backend needs nothing new.
- **The hooks.**
  - `tether(config, state)` returns `{ anchor, maxLength, length, strength, connect }`, or null.
  - `socket(config)` returns `{ anchor }`.
  - The sim writes back the state fields `connected`, `length` (set to the distance when it attaches, so attaching never jerks), `tension` and `snapped`.
- **Attaching.** "Connect" arms the winch: it attaches to the nearest socket on another vessel within its reach. It prefers a socket on the vessel's target, and waits until one is in reach. "Release" disarms and lets go.
  - The pair is stored on the winch part (`PartState.tether = { peer }`), so it saves with the world.
  - A peer part that is gone ends the tether.
- **Flight.** Tethered vessels stay in flight (a vessel on rails is woken).
- **Strut release.** A connector part with `stock.strut` gets "Release" (and "Release on stage"). The sim cuts its `link`; the strut stays as a stub.

## Steps

1. Core: the `tether`/`socket` hooks, the `releaseLink` capability, `PartState.tether`, and the snapshot's `PartSnapshot.tether`.
2. Sim: `tethers.ts` (attach, the rope's pull, the tension, snapping, release, waking); strut release.
3. Stock: `stock.winch` (reel in, stop, out, drawing EC), `stock.tether-socket`, and the `stock.strut` module on the strut.
4. Renderer: the winch and socket models; the rope drawn between the anchors every frame, sagging with slack.
5. Tests, docs, push.

## Acceptance criteria

- [x] Sim test: a crane's winch on the ground reels a 1 t load up 10 m under gravity (it rose 11.9 m on a 10.7 kN pull).
- [x] Sim test: in orbit, reeling in closes two vessels by 10 m (13.0 to 1.8 m), with their momentum kept to 0.0002 % against an untied control pair.
- [x] Sim test: the tether snaps above its strength and the drum stops; tying on changes neither vessel's velocity; Release lets go.
- [x] Save and load keep a tether and its length.
- [x] A released strut no longer links its two parts (`packages/sim/test/tethers.test.ts`).

## Docs checklist

- [x] `docs/STATUS.md` updated (board row).
- [x] `docs/journal/313-tethers-winches-and-strut-release.md` written.
- [x] ADR 0272 accepted with the plan 313 amendment.

## Log

- 2026-10-21 — Drafted from the owner's question about KSP's cables and struts.
- 2026-10-22 — The owner said to go ahead; refined (the sim's rope instead of a Rapier joint, see Design).
- 2026-10-22 — Done. Found on the way:
  - an armed winch must wake the socket vessels near it (`wakeTetherNeighbours`, as the docking ports do);
  - the rope's correction must be allowed up to 3 m/s, or a hanging load lags the drum (0.3 m/s against 1 m/s);
  - the tension is smoothed over 0.1 s before it is held against the strength, so taking up slack does not snap it;
  - a snapped rope stops the drum.

