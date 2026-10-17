# Time scales, leap seconds and the calendar

Checked 2026-10-17 (plan 081, ADR 0103 point 1).

## Leap seconds (TAI − UTC)

Source: IERS Earth Orientation Centre, `https://hpiers.obspm.fr/iers/bul/bulc/Leap_Second.dat`, fetched 2026-10-17; "Updated through IERS Bulletin 72 issued in July 2026", "File expires on 28 June 2027".

| From (UTC, 00:00) | TAI − UTC (s) | | From (UTC, 00:00) | TAI − UTC (s) |
|---|---|---|---|---|
| 1972-01-01 | 10 | | 1985-07-01 | 23 |
| 1972-07-01 | 11 | | 1988-01-01 | 24 |
| 1973-01-01 | 12 | | 1990-01-01 | 25 |
| 1974-01-01 | 13 | | 1991-01-01 | 26 |
| 1975-01-01 | 14 | | 1992-07-01 | 27 |
| 1976-01-01 | 15 | | 1993-07-01 | 28 |
| 1977-01-01 | 16 | | 1994-07-01 | 29 |
| 1978-01-01 | 17 | | 1996-01-01 | 30 |
| 1979-01-01 | 18 | | 1997-07-01 | 31 |
| 1980-01-01 | 19 | | 1999-01-01 | 32 |
| 1981-07-01 | 20 | | 2006-01-01 | 33 |
| 1982-07-01 | 21 | | 2009-01-01 | 34 |
| 1983-07-01 | 22 | | 2012-07-01 | 35 |
| | | | 2015-07-01 | 36 |
| | | | 2017-01-01 | 37 |

- Each leap second is inserted as 23:59:60 UTC on the day before the "From" date.
- The table is copied into `packages/core/src/calendar.ts` (`LEAP_SECONDS`). After the file's expiry date the last value (37) is used; a new announced leap second needs a table update (Bulletin C, every six months).
- Before 1972 UTC had fractional steps and a rate offset; the game clamps to 10 s there (dates before 1972 are off by up to 10 s, which only the Gregorian calendar of a real system would show).

## TT, TAI, TDB

- TT = TAI + 32.184 s exactly (the definition of TT in the IAU 1991 resolutions; the same constant in the IERS Conventions 2010, chapter 10). Not fetched again here: a fixed definition, and the J2000 check below confirms it.
- TDB differs from TT by under 2 ms (periodic terms); ADR 0103 treats TDB as TT, so the game uses one scale for the epoch.
- J2000.0 = JD 2451545.0 TT = 2000-01-01 12:00:00 TT = 11:58:55.816 UTC (TAI − UTC was 32 s, so UTC = 12:00:00 − 32.184 − 32). This is the acceptance check of plan 081.

## Precision

`t` is seconds since the world's start (float64). A Julian date near 2.45e6 in one float64 has a resolution of about 40 µs, so adding `t` to it loses the sub-millisecond part the display needs after a few additions. The epoch is stored as whole days plus a fraction (ADR 0103), and the conversions carry (days, seconds) separately and normalise, never `jd + t / 86400` in one float (ADR 0141).

## Civil date from a day count

Howard Hinnant, "chrono-Compatible Low-Level Date Algorithms" (`civil_from_days`, `days_from_civil`), https://howardhinnant.github.io/date_algorithms.html: proleptic Gregorian, exact for any day count in a 32-bit range. Used for the `gregorian-utc` calendar.
