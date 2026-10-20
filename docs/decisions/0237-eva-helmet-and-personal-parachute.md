# 0237 — The EVA helmet and the personal parachute

**Status:** accepted
**Date:** 2026-10-20
**Plan:** plans/249-eva-helmet-chute.md
**Builds on:** ADR 0209 (EVA v2: O and P reserved), ADR 0203 point 4 (parachutes), ADR 0201 point 6 and plan 205 (P pauses on every page), ADR 0206 (key profiles)

## Context

ADR 0209 reserved O (helmet) and P (personal chute) for later. The suit was always sealed and had no chute. P is pause on every page, so the chute cannot take it.

## Decision

1. **A body says its air is breathable.** `atmosphere.breathable` (optional, additive, off unless `true`) is on Home. `Ambient` carries `breathable` (API 0.1.92). Other atmospheres, the Sol mod's included, stay unbreathable until their author says otherwise.
2. **The helmet is a module on the suit (`stock.helmet`).** It is on at the start. Taking it off is allowed only when `helmetMayComeOff(ambient)`: the air is breathable, the pressure at least 60 kPa (about 4 km up on Home) and the temperature between 243 and 318 K. The action is refused (the state stays) otherwise, and an off helmet goes back on by itself in the first step where the air stops allowing it. The suit's oxygen use is unchanged: the helmet is a rule and a look, not a second life-support model.
3. **The personal parachute is the stock `stock.parachute` module on the suit,** at a suit's scale: 55 m² of drag area fully open (1.2 m² semi), anchored over the head, full-deploy at 300 m. KSP's main (480 m² for 1 t, about 6 m/s) scaled to a suit of about 110 kg gives about 5.5 m/s, below the suit's 8 m/s tolerance. The module's states, tearing in fast air and the "when safe" opening are the capsule chute's.
4. **Keys, in both profiles, scope On EVA:** O toggles the helmet; **U** works the chute. P stays pause. U is Lights in flight; the two scopes never meet, as with Q and E. The chute key steps: stowed → arm it (it opens by itself when the air is thick and the airflow safe); armed → disarm; open → cut. A cut or torn canopy cannot be packed again: the toast says to board and step out for a new one (a fresh suit has a fresh chute). The crew panel has Helmet and Chute buttons for the same.
5. **The suit model shows both.** The helmet is the figure's moving piece, hidden by the `visible` articulation while the helmet is off; the canopy is the parachute generator's dynamic dome (4 m radius), driven by the module's `canopy` flag.

## Alternatives considered

- **Shift+P or Alt+P for the chute** — rejected: a chord on a key that pauses is easy to mistake; a free key is clearer.
- **A new module for the chute** — rejected: the existing one already has the physics and the states.
- **Oxygen saved with the helmet off** — left out; it needs the life-support model to know the air, which is plan work of its own.

## Consequences

- Old saves: the suit part gains modules; saves that hold a suit vessel get the new modules' default state when loaded (as with any module added to a part).
- Mods can mark their atmospheres breathable.
