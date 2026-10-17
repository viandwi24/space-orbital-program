# 0109 — Control needs a command source (KSP-like), the Career crew preset, and 10 px text

**Status:** accepted
**Date:** 2026-10-17
**Plan:** none (owner confirmations in chat, 2026-10-17); delivered by plans 078, 087, 106, 107, 114, 115
**Amends:** ADR 0101 point 4 (`controlWithoutSignal` default), ADR 0100 point 3 (Career preset); confirms ADR 0107 point 5.

## Context

The foundation ADRs left three defaults as interpretations to confirm (STATUS known issues). The owner answered in chat:

1. Control without signal should follow KSP: a vessel is controllable only through a command module, and a crewed command module needs its crew (a pilot) aboard; a probe needs its link. The interpreted default (`full` without signal) did not match that.
2. The Career crew preset: "decide what is best, but everything stays configurable or customisable".
3. The 10 px text floor: accepted.

## Decision

1. **A command source is required for control, as in KSP.** A vessel accepts control commands (throttle, attitude, SAS, staging, actions) only while it has at least one working command source:
   - a **crewed command part** (pod, cockpit) with at least one crew member aboard (any profession; a pilot adds finer control and SAS quality per ADR 0100 point 2, never unlocks a tool);
   - a **probe core**, which needs a link to a ground station or a crewed command part (comms tier 1, ADR 0101).
   Until the crew system ships (plan 106), crewed command parts count as crewed (today's behaviour). Debris and parts without a command source stay uncontrolled (ADR 0021 unchanged).
2. **`controlWithoutSignal` applies to probe-only vessels** and defaults per preset: **Career and Science `none`** (KSP's "require signal for control"): no manual input, SAS keeps its last mode, scripts already running on board continue only when `signalDelay` is `flight-computer`); **Sandbox `full`**. `partial` stays available as a rule value. Crewed vessels with crew in a command part are always controllable locally, with or without signal.
3. **Career crew preset = "Career (standard)"**, chosen for depth without a logistics wall for first careers:
   - professions, traits, XP and levels: **on**; salaries and recruit costs: **on**;
   - life support: **`simple`** (one consumable per crew member, predicted and shown);
   - morale: **on**; rest and fatigue: **off**; g-load and radiation: **on**;
   - death: **`permanent`**, with rescue contracts possible.
   A fourth preset **"Career (hardcore)"** sets everything to `full`/`on` (the owner's maximal simulation). Every value remains editable in Create World and mid-game (ADR 0094 point 4); "custom" is any mix.
4. **Text floor 10 CSS px** at the default UI scale, as ADR 0107 point 5 states.

## Alternatives considered

- **`controlWithoutSignal: full` by default** (the earlier interpretation) — rejected by the owner: it makes probes and command modules meaningless.
- **Career = everything `full`** (ADR 0100 as written) — kept as the "Career (hardcore)" preset; the standard Career avoids making full life-support logistics the first thing a new player meets.

## Consequences

- **Rules:** plan 078 registers the per-preset defaults above and the two Career presets; plan 087 shows them in Create World.
- **Sim:** plan 114 adds the command-source check per vessel (crew aboard or probe linked) and the refusal reasons ("No crew in a command part", "No signal: probe cannot be controlled"); plan 106 links crew seats to command parts.
- **HUD:** the vessel panel and HUD show the control state and its reason (plan 115); the guide explains it.
- **Scripts:** a script on a probe without signal behaves per `signalDelay` (ADR 0101).
- STATUS's "interpretations to confirm" item is closed.
