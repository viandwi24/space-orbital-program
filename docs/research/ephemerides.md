# Ephemerides: planet elements with rates, and a lunar series

Looked up 2026-10-18 by Agent 3 for plan 123 (ADR 0103 point 5, ADR 0183).

## Planets: JPL "Approximate Positions of the Planets" (Level A)

- **Source:** E. M. Standish and J. G. Williams (1992), "Orbital Ephemerides of the Sun, Moon and Planets", as tabulated by JPL Solar System Dynamics: <https://ssd.jpl.nasa.gov/planets/approx_pos.html> (read 2026-10-18).
- **What it is:** Keplerian elements at J2000.0 with linear rates per Julian century (`T = (JD_TDB − 2451545.0) / 36525`), in the J2000 ecliptic and equinox. Table 1 covers 1800 AD to 2050 AD. Table 2 (3000 BC to 3000 AD) adds `b, c, s, f` terms to M for Jupiter to Neptune.
- **Elements:** `a` (au), `e`, `I`, `L` (mean longitude), `ϖ` (longitude of perihelion), `Ω` (deg), each with its rate per century. The algorithm:
  1. `ω = ϖ − Ω`, `M = L − ϖ` (+ the Table 2 terms);
  2. solve Kepler's equation;
  3. take the orbital-plane position, then rotate by `R_z(−Ω) R_x(−I) R_z(−ω)` into the J2000 ecliptic.
- **Table 1 nominal errors** (heliocentric longitude λ, latitude φ in arcsec, distance ρ in 1 000 km):

  | Body | λ | φ | ρ |
  |---|---|---|---|
  | Mercury | 15 | 1 | 1 |
  | Venus | 20 | 1 | 4 |
  | EM barycentre | 20 | 8 | 6 |
  | Mars | 40 | 2 | 25 |
  | Jupiter | 400 | 10 | 600 |
  | Saturn | 600 | 25 | 1 500 |
  | Uranus | 50 | 2 | 1 000 |
  | Neptune | 10 | 1 | 200 |
- **Table 1 rows used in the tests** (value / rate per century):
  - EM barycentre: a 1.00000261 / 0.00000562; e 0.01671123 / −0.00004392; I −0.00001531 / −0.01294668; L 100.46457166 / 35999.37244981; ϖ 102.93768193 / 0.32327364; Ω 0 / 0.
  - Mars: a 1.52371034 / 0.00001847; e 0.09339410 / 0.00007882; I 1.84969142 / −0.00813131; L −4.55343205 / 19140.30268499; ϖ −23.94362959 / 0.44441088; Ω 49.55953891 / −0.29257343.
  - Jupiter: a 5.20288700 / −0.00011607; e 0.04838624 / −0.00013253; I 1.30439695 / −0.00183714; L 34.39644051 / 3034.74612775; ϖ 14.72847983 / 0.21252668; Ω 100.47390909 / 0.20469106.

## Reference positions: JPL Horizons

Queried 2026-10-18 through the Horizons API (<https://ssd.jpl.nasa.gov/api/horizons.api>). Vector tables, `CENTER='500@10'` (the Sun), `REF_PLANE='ECLIPTIC'` (J2000), `REF_SYSTEM='ICRF'`, au, TDB:

| Body | JD (TDB) | X | Y | Z |
|---|---|---|---|---|
| Mars (499) | 2451545.0 | 1.390715921746351 | −1.341631815101244e−2 | −3.446766277581799e−2 |
| | 2459000.5 | 6.131408532590118e−1 | −1.268998761099761 | −4.163228522572920e−2 |
| | 2466154.5 | −2.903959146522574e−1 | 1.567160495882598 | 3.996702366830432e−2 |
| EM barycentre (3) | 2451545.0 | −1.771587841839055e−1 | 9.672193524609504e−1 | −1.139275508446145e−6 |
| | 2459000.5 | −3.511582553894914e−1 | −9.511576870861485e−1 | 4.487328942356039e−5 |
| | 2466154.5 | −1.641321798521249e−1 | 9.695495018634084e−1 | −8.603666253972062e−5 |
| Jupiter (599) | 2451545.0 | 4.001177435589426 | 2.938575782470499 | −1.017852834518150e−1 |
| | 2459000.5 | 1.625771266821006 | −4.910006092682107 | −1.598104862413612e−2 |
| | 2466154.5 | −5.354415136563502 | 8.877640647780445e−1 | 1.161125974249393e−1 |

Moon (301), observer table, `CENTER='500@399'` (geocentre), quantities 20 (range) and 31 (ecliptic-of-date longitude and latitude, apparent), TT:

| Date (TT) | Δ (au) | λ (deg) | β (deg) |
|---|---|---|---|
| 2000-01-01 12:00 | 0.00268997545281 | 223.3148557 | 5.1708744 |
| 2020-05-31 00:00 | 0.00247079802353 | 171.2610741 | 5.2014413 |
| 2040-01-01 00:00 | 0.00270510211946 | 116.1423087 | 3.5882797 |

## The Moon: Astronomical Almanac low-precision formulae

- **Source:** the low-precision lunar formulae of the Astronomical Almanac, as implemented in `MOONPOS.PRO` (M. R. Greason 1988, D. P. Steele 1994): <https://data.phys.ucalgary.ca/sort_by_project/other/poca/eu9367/001/IDL/STEELE/MOONPOS.PRO> (read 2026-10-18). Its header says: "The error in right ascension will rarely exceed 0.3 degrees; the error in declination will rarely exceed 0.2 degrees." The almanac text itself was not available on line. A NASA scan (NTRS 19990040527) cites the same formulae but has no text layer.
- **Series** (`T` in Julian centuries from J2000, degrees, mean ecliptic and equinox of date):
  - λ = 218.32 + 481267.883 T + 6.29 sin(134.9 + 477198.85 T) − 1.27 sin(259.2 − 413335.38 T) + 0.66 sin(235.7 + 890534.23 T) + 0.21 sin(269.9 + 954397.70 T) − 0.19 sin(357.5 + 35999.05 T) − 0.11 sin(186.6 + 966404.05 T)
  - β = 5.13 sin(93.3 + 483202.03 T) + 0.28 sin(228.2 + 960400.87 T) − 0.28 sin(318.3 + 6003.18 T) − 0.17 sin(217.6 − 407332.20 T)
  - π = 0.9508 + 0.0518 cos(134.9 + 477198.85 T) + 0.0095 cos(259.2 − 413335.38 T) + 0.0078 cos(235.7 + 890534.23 T) + 0.0028 cos(269.9 + 954397.70 T)
  - distance = R⊕ / sin π, with R⊕ = 6 378.14 km.
- **Accuracy used in the tests:** λ within 0.3°, β within 0.2°. For π the almanac formula's usual figure is about 0.003°; the tests compare the distance within 0.5 %.
- **Why not ELP-2000/82 (Meeus ch. 47):** it is ten times more accurate but takes about 120 terms, and there was no free primary source to check them against. A body whose game needs better than 0.3° can use a longer series in the same data format (ADR 0183 point 3).

## Body constants and rotation for the Sol pack (plan 124)

Looked up 2026-10-18 by Agent 3.

- **Masses, radii, rotation periods:** JPL Solar System Dynamics, "Planetary Physical Parameters", <https://ssd.jpl.nasa.gov/planets/phys_par.html> (read 2026-10-18; its last change-log entry is 2019-12-12):

  | Planet | Mean radius (km) | Sidereal rotation (d) | Mass (10²⁴ kg) |
  |---|---|---|---|
  | Mercury | 2439.4 | 58.6462 | 0.330103 |
  | Venus | 6051.8 | −243.018 | 4.86731 |
  | Earth | 6371.0084 | 0.99726968 | 5.97217 |
  | Mars | 3389.50 | 1.02595676 | 0.641691 |
  | Jupiter | 69911 | 0.41354 | 1898.125 |
  | Saturn | 58232 | 0.44401 | 568.317 |
  | Uranus | 25362 | −0.71833 | 86.8099 |
  | Neptune | 24622 | 0.67125 | 102.4092 |
- **Sun and Moon:**
  - Sun: GM 1.32712440018e20 m³/s² (the IAU value Level A is fitted to), nominal radius 695 700 km (IAU 2015 Resolution B3).
  - Moon: mean radius 1737.4 km, GM 4.9028e12 m³/s², sidereal rotation 27.321661 d (synchronous).

  These are standard values; JPL's physical parameter page does not list the Sun or the Moon.
- **Rotation (pole and prime meridian):** NAIF generic PCK `pck00011.tpc`, <https://naif.jpl.nasa.gov/pub/naif/generic_kernels/pck/pck00011.tpc> (created 2022-12-27; read 2026-10-18). It follows the IAU WGCCRE report 2015 (Archinal et al., Celest. Mech. Dyn. Astron. 130:22, 2018). Values are α₀ and δ₀ in degrees (+ rate per Julian century), and W in degrees (+ rate per day), in ICRF, from J2000 TDB:

  | Body | α₀ | δ₀ | W |
  |---|---|---|---|
  | Sun | 286.13 | 63.87 | 84.176 + 14.1844000 d |
  | Mercury | 281.0103 − 0.0328 T | 61.4155 − 0.0049 T | 329.5988 + 6.1385108 d |
  | Venus | 272.76 | 67.16 | 160.20 − 1.4813688 d |
  | Earth (2009 values, kept by the file) | 0.00 − 0.641 T | 90.00 − 0.557 T | 190.147 + 360.9856235 d |
  | Moon (2009, without its periodic terms) | 269.9949 + 0.0031 T | 66.5392 + 0.0130 T | 38.3213 + 13.17635815 d |
  | Mars | 317.269202 − 0.10927547 T | 54.432516 − 0.05827105 T | 176.049863 + 350.891982443297 d |
  | Jupiter | 268.056595 − 0.006499 T | 64.495303 + 0.002413 T | 284.95 + 870.5360000 d |
  | Saturn | 40.589 − 0.036 T | 83.537 − 0.004 T | 38.90 + 810.7939024 d |
  | Uranus | 257.311 | −15.175 | 203.81 − 501.1600928 d |
  | Neptune (without its periodic terms) | 299.36 | 43.46 | 249.978 + 541.1397757 d |

  The pack uses the J2000 values (no pole drift: under 0.7° per century) and turns them from the ICRF equator into the J2000 ecliptic with the obliquity 23.43928° (the same rotation JPL's Level A page gives).
- **Moon frame:** the Almanac series is in the ecliptic and equinox of date. In the J2000 ecliptic its longitude rate is less the general precession, 5028.796″ per century (1.396888°), which the pack subtracts from the longitude rate.
