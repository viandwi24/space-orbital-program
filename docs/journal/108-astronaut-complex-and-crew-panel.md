# 108 — Astronaut Complex and the crew panel

**Plan:** [plans/108-astronaut-complex-and-crew-panel.md](../plans/108-astronaut-complex-and-crew-panel.md) · **Session:** Agent 2 (Dev B, MacBook Pro M2 13"), 2026-10-18 · **ADRs:** [0152](../decisions/0152-astronaut-complex-applicants-by-profession-and-launching-into-the-world.md) (new), [0176](../decisions/0176-crew-roster-places-xp-seats-death-salaries.md), [0118](../decisions/0118-mission-center-system-scope-own-sim-and-fly.md), [0143](../decisions/0143-worlds-screen-active-world-record-world-info-and-catch-up.md), [0150](../decisions/0150-launch-facilities-from-buildings-surface-placement-and-the-launch-choice.md) · **Research:** none

**Status when written: criteria met; dismiss waits for a contract request.**

## What was done

| Where | What |
|---|---|
| `lib/astronauts/roster-model.ts` | `rosterRows` (Roster: available and assigned; Lost: lost and missing; a profession filter), `recruitCost` (20 days of salary with the economy and salaries on), `applicants` (one per profession), `profileOf` (chips, level, XP, traits, this flight's places; the refs stats the model does not keep are `[—]`) |
| `routes/astronauts` | Roster / Applicants / Lost, profession filter, profile, Hire; runs the world's sim from its newest save (or its info) and autosaves after a hire |
| flight | a launch from the Launch screen into a world with a save resumes the newest save and adds the vessel (`FlightOptions.into`), with `crew` seated by `load-vessel` |
| `routes/launch`, `lib/launch` | the available crew of the newest save, seats per pod (`seatsOf`, `toggleSeat`), the choice carries `crew` |
| `hud/CrewPanel.svelte` | an IVA chip and "no radio" bars per member; the empty state points to the Launch screen |
| `lib/space-center/model.ts` | the Astronaut Complex opens `/astronauts` |
| tests | `astronauts/roster-model.test.ts` (2, one with a real sim and the economy on), `launch-model.test.ts` (+1), `crew-card.test.ts` (+1, 1 updated), e2e `astronauts.e2e.ts` (hire two, seat them at Launch, two rows in flight) |

## What surprised me

- **Every launch threw the world away.** A flight from the Hangar or the Launch screen started a fresh sim, so the roster (and the ledger and missions) never reached the next flight. ADR 0152 point 1: a launch into a world with a save resumes the newest save and adds the vessel, which is what ADR 0143 meant.
- **No applicant pool and no dismiss** exist in the sim. Applicants are the professions (`crew-hire` draws the person); dismiss needs a command: contract request `crew-dismiss { member }` (plan Log and handover).
- **A save needs a readable design**, even for a world with no vessel: the Astronaut Complex's autosave uses the last design flown, the Hangar's, or the reference rocket; an empty design made the save unreadable on the Launch screen.
- **Sandbox has salaries off**, so recruits are free there; the cost appears with the economy and the salaries rule on.
- **Hire waits for the sim**: the buttons are disabled until the world's worker is ready.
- The stock pod has one seat; the e2e flies a vessel with two pods.
