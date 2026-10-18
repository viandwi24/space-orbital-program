# Comms: the link budget, bands and dish gain

Recorded 2026-10-18 by Agent 3 for plan 116 (ADR 0101 tier 2, ADR 0185).

These are textbook relations and the conventional allocations of deep-space radio. Their source is listed per item; nothing here is copied from KSP.

## The Friis equation and free-space loss

- **Friis transmission equation**, in decibels: `P_r = P_t + G_t + G_r − L_fs`, where:
  - `P` is in dBW and `G` in dBi;
  - `L_fs = 20·log10(4π·d·f / c)` is the free-space path loss, with `d` in m, `f` in Hz and `c = 299 792 458 m/s`.
- **Source:** H. T. Friis, "A Note on a Simple Transmission Formula", *Proc. IRE* 34 (1946) 254–256. The decibel form is as in the JPL DSN Telecommunications Link Design Handbook, 810-005, module 201 (<https://deepspace.jpl.nasa.gov/dsndocs/810-005/>).
- **Doubling the distance** adds `20·log10(2) = 6.0206 dB` of loss. This is the plan's acceptance number.
- **Worked case** (the core test):
  - **Inputs:** `P_t` 10 W (10 dBW), `G_t` 10 dBi, `G_r` 40 dBi, `d` 1e7 m, `f` 2.25 GHz, `T` 100 K;
  - **Loss:** `L_fs` 179.491 dB;
  - **Received:** `P_r` −119.491 dBW;
  - **Noise:** `N0 = 10·log10(k·T)` = −208.599 dBW/Hz;
  - **Carrier:** `C/N0` 89.108 dB-Hz;
  - **Margin at 1 kbit/s** with Eb/N0 3 dB: 56.108 dB, giving 100 Mbit/s on the decade ladder.

## Noise and the data rate

- **Noise density:** `N0 = k·T`, where `k = 1.380 649e-23 J/K` (exact since the 2019 SI) and `T` is the receiving system's noise temperature.
- **Carrier to noise:** `C/N0 = P_r − N0` (dB-Hz).
- **Highest rate:** a link carries rate `R` when `C/N0 − 10·log10(R) ≥ Eb/N0 (required)`.
- **Required Eb/N0:**
  - modern turbo and LDPC codes reach a bit error rate of 1e-6 near 1 to 2 dB (CCSDS 130.1-G, TM synchronization and channel coding, green book);
  - the game uses 3 dB, which includes a small implementation margin;
  - it is one constant (`LINK_EB_N0`), not per band.

## Dish gain

- **Aperture gain:** `G = η·(π·D·f / c)²`, where `D` is the dish diameter and `η` the aperture efficiency.
- **Efficiency:** 0.55 is the conventional figure for a reflector (handbook 810-005, module 101).
- **Checks:**
  - a 10 m dish at S band is 44.85 dBi;
  - a 1 m dish at X band is 36.35 dBi;
  - a 34 m dish at X band is 66.98 dBi;
  - a 70 m dish at X band is 73.25 dBi.

  The real DSN 34 m beam-waveguide antenna is about 68 dBi at X band.
- **Omni antennas** are about 0 to 3 dBi. The game uses 2 dBi when an antenna gives neither a gain nor an aperture.

## Bands (stock values)

| Band | Frequency | Noise temperature | Where it is used |
|---|---|---|---|
| UHF | 401 MHz | 300 K | Mars proximity relays (Electra), short range |
| S | 2.25 GHz | 100 K | near-Earth TT&C (2.2–2.3 GHz) |
| X | 8.45 GHz | 50 K | deep-space downlink (8.40–8.45 GHz) |
| Ka | 32 GHz | 80 K | high-rate deep-space downlink (31.8–32.3 GHz); more weather noise |
| optical | 193.4 THz (1550 nm) | 10 000 K effective | laser comms (NASA DSOC, 2023) |

- **Frequencies:** the ITU space research allocations as used by the DSN (handbook 810-005, module 101).
- **Noise temperatures:** game values, chosen near a good ground system on each band, and rounded.
- **Optical:** a laser receiver is limited by photon counting and background light, not thermal noise. An effective temperature keeps one formula for every band, and is a game simplification.

## The rate ladder

- **Steps:** decades from 1 kbit/s to 1 Gbit/s, so each step is 10 dB of margin. The plan asks for readable numbers.
- **Bounds:** real deep-space links run from about 10 bit/s (Voyager now 160 bit/s) to about 260 Mbit/s (DSOC 2023).
- **Below the ladder:** a margin below 1 kbit/s is "commands only" (ADR 0185 point 4).
