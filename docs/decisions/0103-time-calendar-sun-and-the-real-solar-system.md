# 0103 — Time and the sky: a world epoch and calendar, the Sun as root with tilt and seasons, a real solar system pack at 1:1 and rescaled

**Status:** accepted
**Date:** 2026-10-17
**Plan:** none (owner decisions "start-date", "real-clock-sync", "fictional-sun", "rss-scale", "rss-fidelity" and chat clarifications, 2026-10-17); delivered by plans 081, 085, 087, 122 to 125
**Amends:** ADR 0007 (+Y is the system's north; a body's pole is data), ADR 0051 (the root is a star; children may follow paths that are not fixed conics).
**Research:** `refs/reverse-engineering-ksp2/beyond/09-time-and-real-solar-system.md`, `10-celestial-bodies-and-world.md`. Facts used by the plans (JPL elements, IAU rotation models, time scales) are recorded in `docs/research/` with dates when each plan looks them up.

## Context

The sim has `t`, seconds since the start, and no date. The root body is the home planet; every body spins about +Y; the renderer's sun is a fixed direction with no year or season. The owner wants a world to start "today" (changeable), the real clock only as an offer, the Sun as root with axial tilt and seasons also in the stock fictional system, and a real solar system with both 1:1 and rescaled options where "everything must work safely and appropriately". For orbit data the owner settled on JPL Keplerian elements with secular rates plus a dedicated Moon model for patched conics, with DE440 reserved for the future n-body mode (ADR 0095).

## Decision

1. **World epoch.** `t` stays seconds since the world's start (float64 precision stays high for years). The world stores its **epoch** (the instant of `t = 0`) as two numbers, a whole day count and a fraction, on the system's time scale (TDB, treated as TT, for real systems; `fictional` otherwise). Each system declares a **calendar**: `gregorian-utc` (leap-second table applied only at the UI edge) or a fictional calendar from the home body's day and year. Scripts get `date()` from the host; the sandbox's `Date` stays the sim clock.
2. **Start date.** Create World defaults to **today**: the host reads the clock once and writes the epoch. Alternatives: a fixed date, a historical date, J2000. The sim never reads a clock.
3. **Real clock only as an offer.** When a world loads behind the real date, the game offers "Catch up to now" (also a button in the time panel): a `warp-to` the real date, allowed only when every vessel is on rails, never backwards. No real-time mode is planned now.
4. **Sun as root, tilt and seasons, for the stock system too.** A body's orientation becomes `q_pole · Ry(W(t))` (pole as data, spin angle linear in time, optional periodic terms); identity pole and `W = ωt` reproduce today exactly. The stock system gains a Sun as root; the home planet orbits it with an axial tilt, so years, seasons and day length emerge. The renderer's sun comes from the Sun body's position. Surface placement, surface rails, the ground tile, terrain lookups, the SAS surface reference, the navball horizon, latitude read-outs and the rotation boost use the body's pole. The planet pass draws the **home body** (the body of the vessel's site and SOI), no longer "the first body". Frames still differ by translation only; for real systems the system frame is the J2000 ecliptic with +Y to ecliptic north.
5. **Body paths beyond fixed conics.** A body's path is `stateInParent(t)` from elements plus secular rates (JPL "approximate positions of the planets", Level A) for planets and a **dedicated Moon model** (a short periodic series) for the Moon; consumers that assumed a fixed conic use osculating elements at the current time (trajectory provider, ADR 0095). **DE440** (Chebyshev data per body) is reserved for the n-body mode.
6. **Real solar system pack ("Sol")** as a mod package in the repo built only on the SDK, with two **scale variants** chosen at world creation: `1:1` (real sizes; about 9.4 km/s to low orbit according to the research, unverified) and `rescaled` (real dates, angles, tilts and layout with smaller bodies; the factor is fixed at refinement from the community's 2.5 to 2.7 times stock-size compromise, unverified). Create World explains what each means (Δv to orbit, transfer times) so the player knows what they choose.
7. **"Everything must work safely" = per-scale balance plus validation.** Each scale variant ships a balance profile as typed patches (ADR 0104): engine thrust and efficiency, tank mass ratios, heat-shield ratings, antenna power and the comms scale, recovery distances, contract rewards. A headless validation suite runs per variant in `bun test`: a stock reference rocket reaches a stable low orbit, a stock transfer reaches the Moon, a capsule survives re-entry, the home site's ground station reaches the Moon, and the calendar shows the right date for a known epoch. A variant whose suite fails is not offered.

## Alternatives considered

- **`t` as seconds since J2000** — rejected: float64 spacing at 8e8 s rounds every 0.02 s step.
- **A real-time-locked sim** — rejected: breaks warp, determinism and pausing.
- **DE440 for everything** — the owner's first choice on the decision page, revised in chat: a data download per body for no gain under patched conics.
- **Rescaled only** (research recommendation) — not chosen: the owner wants 1:1 too, as an informed choice.
- **Fictional system without a Sun** — rejected: the same engine change is needed for Sol, and testing it on the stock system first is cheaper.

## Consequences

- **Core types / mod API:** `BodyDefinition.rotation` (pole, spin, optional periodic terms), `orbit.rates` and an orbit-model kind (`kepler`, `kepler-rates`, `series`), system-level `timeScale` and `calendar`, `defineSystemVariant` for scale variants (additive; identity defaults).
- **Save format:** the epoch, calendar id and system variant are world fields (format 5); the Sun-root change of the stock system needs a migration for existing worlds (the old root becomes a child of the new Sun with the same local behaviour; a test pins that a format 5 Legacy world flies the same in its home SOI).
- **Performance:** body states are analytic and cached per step; the renderer's sun direction is one more body lookup.
- **Visual:** a second body with an atmosphere (draft 071) is needed for Sol's planets to look right and is a dependency of the pack.
- Follow-ups: plans 081 (epoch, calendar), 085 (orientation, no behaviour change), 087 (start date, catch-up offer), 122 (Sun, tilt, seasons), 123 (elements with rates, Moon model), 124 (Sol pack), draft 125 (n-body).
