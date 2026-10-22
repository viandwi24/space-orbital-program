---
id: 345
title: "Single-use petals thrown off as debris, and Kronos V's separation without the service engine"
status: done
owner: "part visuals session (Claude)"
depends: [302, 303, 321]
phase: 0
created: 2026-10-22
updated: 2026-10-22
---

# 345 — Petals thrown off; no burn at separation

## Goal

The owner, on Kronos V in orbit:
- opening the bay "suddenly flung" its contents;
- in KSP the SLA panels come off when they open, while ours are doors held by hinges: make them single use.

## Context

- Plan 302 (`stock.bay`), plan 303 (the petals), plan 321 (Kronos V's explicit staging), plan 219 (fairing panels as debris).

## What the tests found

- Opening the petals by action, alone or on the whole stack, pushes nothing: one vessel, same parts, the speed changing by gravity only.
- The stage that opened the petals also separated the command ship **and lit its service engine**. With the throttle up, the command ship left at full thrust, and from its camera the petals' stack, lander inside, seemed thrown away.

## Scope

**In:**
- Kronos V: the separation stage is the decoupler and the petals; the service engine is the next press (Apollo's CSM turned round to dock first).
- `stock.bay` gets `jettison` (the panel parts, their mass, where they start, their push). Opening throws the panels off at once as debris, from outside the shell, pushed straight out. The pushes cancel, so the stack keeps its motion. The panels' mass leaves with them.
- The petals' ring is 300 kg plus 900 kg of panels. Four hidden debris parts `stock.petal-panel-0..3` use the `petal-panel` generator.
- `visual.deploy.gone`: a snapshot flag that hides the moving pieces once thrown off.
- Part info: a "Panels: thrown off when opened (single use)" readout and a "Jettison panels" control. The petals' staging icon is the decoupler's.
- The cargo bay and the service bays keep their doors (no `jettison`).

**Out:** the hinge-out-then-release animation. The panels leave at once, as a fairing's do; the debris tool cannot yet set a piece's spin.

## Acceptance criteria

- [x] `mission-flights.test.ts`: the Kronos petals staged far from any body. Four panel vessels leave, the lander stays on board (same part count), and the stack's speed changes by less than 0.05 m/s.
- [x] Stock and renderer tests with the new parts.

## Docs checklist

- [x] `docs/STATUS.md`, journal `345-petals-jettison-and-kronos-staging.md`.

## Log

- 2026-10-22 — Started on the owner's reports (relayed by the parent session).
- 2026-10-22 — Done.
