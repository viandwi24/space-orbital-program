# Maneuver nodes (plan 045)

Checked 2026-10-17.

## Conventions players expect (KSP)

- A node sits on the predicted orbit at a time; its handles are prograde/retrograde, normal/antinormal and radial in/out, a right-handed set relative to the orbit; prograde/retrograde change the speed directly, normal/antinormal change inclination, radial in/out point to or away from the body: <https://wiki.kerbalspaceprogram.com/wiki/Maneuver_node> (the wiki blocked a direct fetch on 2026-10-17; read through the search result summary and <https://forum.kerbalspaceprogram.com/topic/42065-how-to-use-maneuver-nodes>).
- Burn at the apoapsis to move the periapsis and vice versa; inclination changes at the ascending/descending node (same sources).
- The burn is centred on the node (half the burn time before it, half after); the KSP forum thread <https://forum.kerbalspaceprogram.com/topic/126264-to-follow-or-not-to-follow-the-node> discusses following the node vector during a long burn. The kOS reference documents a node as `time`, `radialout`, `normal`, `prograde` and a burn vector: <https://ksp-kos.readthedocs.io/en/latest/structures/vessels/node.html>. We use the same four numbers.
- The frame: prograde = unit velocity, normal = unit `r x v`, radial-out = prograde x normal (perpendicular to the velocity in the orbit plane, pointing away from the body; equals `r` for a circular orbit).
- While burning, the node's remaining burn vector shrinks to what is left (target velocity at the node minus the velocity the current orbit has there). I could not confirm the exact KSP internals online; the design (ADR 0056) states the rule used here and tests it.

## Burn time

- Tsiolkovsky: `dv = Isp g0 ln(m0/mf)`, `mdot = F / (Isp g0)`, `t = m0 (1 - exp(-dv / (Isp g0))) / mdot` for constant thrust `F`, `g0 = 9.80665 m/s^2`: <https://en.wikipedia.org/wiki/Tsiolkovsky_rocket_equation>. Gravity and drag losses are not in it; a burn in vacuum near a node is the intended use.
- A finite burn centred on the node is the standard approximation of the impulsive manoeuvre; the error grows with burn time over orbital period. The map shows the impulsive result and says so.
