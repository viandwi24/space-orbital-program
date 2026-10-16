---
id: 042
title: "SAS and flight assists"
status: draft
owner: ""
depends: [033]
phase: 2
created: 2026-10-17
updated: 2026-10-17
---

# 042 — SAS and flight assists

## Goal

A player can switch on SAS and the vessel holds its attitude, or points prograde/retrograde/normal/antinormal/radial-in/radial-out (and maneuver/target once 044/045 exist), using reaction wheels, gimbal and control surfaces through the existing torque-demand path, with navball buttons and keys like KSP players expect.

## Context

- `product/spec.md` Phase 1 lists "SAS-like stability assist"; never planned (ADR 0048). ADRs 0045 (gimbal/mixer), 0046 (fin damping), 0026 (HUD), journals 026, 033.

## Scope

**In:** an SDK-visible controller (stock module or sim system — decide by ADR) that turns a target direction into torque demand with a tuned, tested controller (no overshoot oscillation for stock vessels); modes; player input overrides while held; HUD navball mode buttons and key (T, plus mode keys); script API access; works on rails transitions (attitude frozen on rails per ADR 0017).
**Out:** autopilot ascent for players.

## Acceptance criteria

- [ ] To be made measurable at refinement. Must include: sim tests — hold attitude within a stated error under a disturbance for the two-stage and the 23-part booster rocket; prograde hold during an ascent; each mode points within N° in M s; no limit cycle above a stated amplitude; determinism; HUD vitest and screenshots; all repo checks.

## Docs checklist

- [ ] STATUS, journal, ADR, `simulation.md`, scripting guide.

## Log

- 2026-10-17 — Created as draft (ADR 0048, v1 scope).
