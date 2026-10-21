# 302 — Part-support modules

**Plan:** [plans/302-part-support-modules.md](../plans/302-part-support-modules.md) · **Session:** part visuals session (Claude), 2026-10-21

## What was done

This is the preparation step the owner asked for. I audited what the planned parts need against the modules that exist (table in the plan), then added:

- **`stock.animate`:** a generic open/close with a staging option, for doors, dishes and petals.
- **`stock.bay`:** doors; while they are closed, its `shell` shields the parts inside, the same mechanism as a fairing.
- **`stock.fuel-cell`:** 1.5 EC/s by default, at KSP's 0.0016875 LF and 0.0020625 Ox per EC.
- **A single landing leg** (`layout: 'single'`).
- **Stageable solar panels.**

## What surprised me

The fairing shell (ADR 0224) needed no change: a module whose `shell()` returns null while open is exactly a bay with doors.

## Open questions / follow-ups

- Refuse to decouple a payload inside a closed bay (plan 281).
- Robotics: ADR 0265 is still proposed.

## Verification output

```
bun test mods/stock: 160 pass, 0 fail
```
