# 237 — Bug fixes from the release audit

**Plan:** [plans/237-flight-and-sim-bug-fixes.md](../plans/237-flight-and-sim-bug-fixes.md) · **Session:** Worker C, 2026-10-20 · **ADRs:** none new (ADR 0204 for the heat limit, 0218 docking, 0229 branches)

## What was done

| Bug | Fix | Test |
|---|---|---|
| The heat toast used a 1000 K fallback, the sim 2000 K | `DEFAULT_MAX_TEMPERATURE` lives in core; the sim re-exports it and the HUD's `heatRatio` (toasts.ts) uses it | `toasts.test.ts`: 1500 K no warning, 1900 K the warning, a declared limit wins |
| A docked vessel lost the player's type on undock | `DockRecord.type` at capture; undock gives the docked side its type back and the keeper's side the combined vessel's | `docking.test.ts`: station and relay survive dock, undock and a save and resume |
| Founding a branch before any save lost the funds on the reload | `worldSession.saveNow()` writes a save even with no flight yet (the starter design in the envelope, no focus); the autosave timer still waits for a flight | `branch-sites.e2e.ts`: after the reload the funds are 3,100,000 less the 250,000 founding cost |

## What surprised me

- **The schema's own comment** on `maxTemperature` still said "the sim assumes 1000": the drift came from there. It names the shared constant now.
- **A world with no flight cannot be saved** in the game-save format, which needs a design; only the explicit `saveNow` borrows the starter rocket for the envelope.

## Open questions / follow-ups

- None.
