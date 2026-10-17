# Delta-v map: transfers, capture, losses (plan 034)

Checked **2026-10-17**.

| Topic | Fact used | Source |
|---|---|---|
| Vis-viva | `v^2 = mu (2/r - 1/a)`: speed on any conic from the radius and the semi-major axis. Every burn of the trip map is a difference of two vis-viva speeds. | https://en.wikipedia.org/wiki/Hohmann_transfer_orbit |
| Hohmann transfer between coplanar circular orbits `r1 < r2` | Burn 1 (leave `r1`): `dv1 = sqrt(mu/r1) (sqrt(2 r2/(r1+r2)) - 1)`. Burn 2 (circularise at `r2`): `dv2 = sqrt(mu/r2) (1 - sqrt(2 r1/(r1+r2)))`. Metres, `mu` in m^3/s^2. The map uses burn 1 from the home low orbit; the second burn is replaced by a capture at the moon (below). | same |
| Delta-v budget method | A mission is a list of propulsive legs (launch, transfer, capture, landing, return); each gets a delta-v and the totals are summed (delta-v is additive), then compared with what the stages give by the rocket equation. A launch to low orbit costs the orbital speed (about 7.8 km/s at Earth) plus an estimated 1.5 to 2 km/s of gravity and drag loss. The article gives no loss formula: the loss model of ADR 0083 is ours (a point-mass ascent integrated at the body's own gravity and atmosphere) and is checked against the repo's own sim ascents, not against this page. | https://en.wikipedia.org/wiki/Delta-v_budget |
| Capture from a hyperbolic approach (patched conics) | Not on the pages above, derived from vis-viva: with excess speed `v_inf` at the moon's sphere and periapsis radius `rp`, `dv = sqrt(v_inf^2 + 2 mu_m/rp) - sqrt(mu_m/rp)`; the same expression is the ejection burn from a circular orbit of radius `rp` onto a path with `v_inf`. `v_inf` is the moon's circular speed minus the transfer ellipse's apoapsis speed (coplanar, circular moon orbit). The journal-044 hand value (858 m/s transfer for a 680 km to 11 800 km Hohmann, about 150 m/s capture for a 367 m/s flyby) uses the same formulas. | derived; check against journal 044 |
| Tsiolkovsky rocket equation | `dv = ve ln(m0/m1)`; the per-stage delta-v the VAB shows (`lib/delta-v.ts`) is this, with a sea-level and a vacuum figure. | https://en.wikipedia.org/wiki/Tsiolkovsky_rocket_equation |
