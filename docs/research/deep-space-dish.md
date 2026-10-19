# Deep-space dish reference (plan 234)

Checked 2026-10-20 by web search (Worker C). Used for the stock deep-space dish's proportions and slew rates.

| Fact | Value | Source |
|---|---|---|
| The three 70 m DSN antennas (DSS-14, -43, -63) were built as 64 m Cassegrain antennas and enlarged to 70 m in 1982–88 | 64 → 70 m | [List of antennas in NASA's Deep Space Network](https://en.wikipedia.org/wiki/List_of_antennas_in_NASA%27s_Deep_Space_Network) |
| The 70 m subreflector moves in x, y and z and rotates about z, refocusing as the structure deforms with elevation | — | [JPL TDA progress report 42-145](https://ipnpr.jpl.nasa.gov/progress_report/42-145/145B.html), [42-60](https://ipnpr.jpl.nasa.gov/progress_report/42-60/60V.html) |
| 34 m beam-waveguide antennas: azimuth-elevation mount, turning rate 0.8°/s, pointing within 0.004° | 0.8°/s | [CDSCC DSS-34](https://www.cdscc.nasa.gov/Pages/Antennas/dss34.html), [DSS-35](https://www.cdscc.nasa.gov/Pages/Antennas/dss35.html), [DSS-36](https://www.cdscc.nasa.gov/Pages/Antennas/dss36.html) |
| DSS-13 (34 m BWG research antenna): main reflector 34 m, hyperbolic subreflector 3.43 m | ratio ≈ 0.1 | [NTRS 19940031043](https://ntrs.nasa.gov/api/citations/19940031043/downloads/19940031043.pdf) |
| Authoritative motion limits: DSN 810-005 module 302 (antenna positioning) | not read | [DSN 810-005 (PDS copy)](https://pds-geosciences.wustl.edu/radiosciencedocs/urn-nasa-pds-radiosci_documentation/DSN_810-005/dsn_810-005.2013-03-01.302.pdf) |

Not verified online, used as rounded design values (marked so in the code): the 64/70 m antennas' slew of about 0.25°/s per axis, an f/D near 0.33–0.4, an elevation axis near 40 m, a 6° lower elevation limit and the zenith stow.
