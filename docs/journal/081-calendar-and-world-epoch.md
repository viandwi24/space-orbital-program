# 081 — Calendar and world epoch: dates in the game

**Plan:** [plans/081-calendar-and-world-epoch.md](../plans/081-calendar-and-world-epoch.md) · **Session:** Agent 2 (Dev B, MacBook Pro M2 13"), 2026-10-17 · **ADRs:** [0141](../decisions/0141-calendar-on-the-root-body-epoch-from-j2000-and-a-year-only-with-an-orbit.md) (new), [0103](../decisions/0103-time-calendar-sun-and-the-real-solar-system.md), [0110](../decisions/0110-save-format-5-world-info-and-world-records.md) · **Research:** [`time-scales.md`](../research/time-scales.md) (new)

**Status when written: criteria met**, with the stock year deferred to plan 122 (below).

## What was done

| Where | What |
|---|---|
| `packages/core/src/calendar.ts` | `Epoch` (= `WorldInfo.epoch`), `instantAt` and `julianDate` on (days, seconds), Hinnant `daysFromCivil`/`civilFromDays`, the IERS `LEAP_SECONDS` table, `utcFields` (23:59:60 during a leap second), `epochFromUtc`, `epochFromUnixMs` (for 087's "today"), `calendarOf(bodies)`, `formatDate` |
| `packages/core/src/schemas.ts` | `BodyDefinition.calendar` (optional; `gregorian-utc` or `fictional` with `home`), read on the root body |
| `packages/core/src/version.ts` | `API_VERSION` 0.1.29 (additive) |
| `packages/sdk/src/index.ts` | re-exports `calendarOf`, `formatDate`, `epochFromUtc` and the types, so a system pack's tests can check its dates (ADR 0103 point 7) |
| `mods/stock/src/bodies.ts` | the home planet declares `{ kind: 'fictional', home: 'stock.home' }` |
| `packages/scripting` | `DateProvider` option and `date(t?)` in the prelude (same shape as `bodies.state`); `ScriptEnvironment.epoch` |
| `apps/web` | the sim's `ready` catalog carries the epoch (`catalogOf`); `HudModel.date`; `WarpControl` shows the date above MET (`hud-date`); `script-date.ts` provider in the script worker; `date` in the editor's API list |
| tests | core `calendar.test.ts` (10), stock `calendar.test.ts`, scripting `date.test.ts` (2), web `WarpControl.test.ts` (2), `script-date.test.ts` |
| docs | ADR 0141, `research/time-scales.md`, `architecture/units-and-frames.md` (Time), `guides/scripting.md` (`date()`) |

## What surprised me

- **The stock home planet has no year.** It is the root body until plan 122 adds a Sun, so "the fictional calendar's year equals the home body's orbital period" cannot hold for stock today. ADR 0141 point 3: no year without an orbit (`Day N, hh:mm:ss`); the year case is tested with a home planet around a test star, and the stock date gains years with 122 with no change here.
- **Core may not import the stock mod** (boundaries.md), so the criterion's "stock home body" assertion lives in `mods/stock/test/calendar.test.ts` (through the SDK), and the core test uses a fixture with the same shape.
- **Float error at a minute boundary**: `year + day + 60` s read `00:00:59`; times are now rounded to the millisecond before they are split into fields.
- `sim.step` takes a wall-clock delta (`sim.step(0.5)`), not a step count.

## Decisions made

- [ADR 0141](../decisions/0141-calendar-on-the-root-body-epoch-from-j2000-and-a-year-only-with-an-orbit.md): calendar on the root body; epoch days are SI days from J2000.0 for both calendars; fictional day = solar day, year only with an orbit; the host formats dates for the HUD and `date()`.

## Open questions / follow-ups

- Plan 122 (Sun as root): when the home planet orbits the Sun, check that `calendarOf` gives the year and the solar day the player expects; the stock test then asserts a year.
- Plan 087: write the epoch with `epochFromUnixMs` at world creation ("today"), and show the start date.
- The leap-second table expires 2027-06-28; a new IERS bulletin needs a table update (`research/time-scales.md`).

## Verification output

See the plan's Log.
