# 0216 — A pod controls only with crew in it; launches seat crew; the pad state

**Status:** accepted
**Date:** 2026-10-19
**Plan:** plans/200-quick-fixes-from-the-review.md
**Builds on:** ADR 0109 point 1 (control needs a command source), ADR 0176 (no starting roster)

## Context

ADR 0109 says a vessel takes commands only from a command source: a crewed part with crew aboard, or a powered probe core with a link. The sim counted a pod as a source because it has seats, empty or not ("until plan 106"; plan 106 is done). Applying the rule as written breaks the plain launch: ADR 0176 gives a new world no crew, and the Launch screen sends no crew list unless the player picks one, so every first pod would be uncontrolled.

The owner also saw the pad screen read as if the vessel were already flying: an orbit through the ground, a running MET, and a throttle at 0.

## Decision

1. **Occupancy, not seats.** A crewed control part counts as a source only with at least one crew member aboard; the comms graph skips an empty seat part the same way. `controlProblem` says `'no-crew'` when the only sources are empty seats (`'no-source'` when there is none at all), and the HUD chip reads "Uncontrolled: no crew or probe core". Throttle, stage, SAS and attitude commands are refused with that reason.
2. **Auto-crew on launch.** `load-vessel` without a `crew` field seats the first available member in the first crewed control part when the vessel would otherwise be `'no-crew'`. With nobody available and the economy off (Sandbox), it hires a pilot first. In Career with nobody available, nothing is hired: the vessel stays uncontrolled and the chip says why. An explicit `crew: []` means "no crew" and is kept.
3. **Liftoff time.** `VesselState.launchedAt` is set by the first stage (or at load for a vessel placed in flight or orbit) and saved with the vessel. Before it, the vessel is **pre-launch**: the HUD reads "On the pad, ready to launch", the Orbit panel shows no orbit, MET reads 0 and the clock shows world time. MET counts from `launchedAt`.
4. **The pad throttle is the HUD's until liftoff.** A new vessel's HUD reads 50 % throttle; the flight sends it to the sim with the first stage. The sim keeps its rule that a raised throttle wakes a vessel on rails and caps warp as "engine running", so the vessel stays at rest on the pad and warp stays open until the player stages or moves the throttle.

## Consequences

- Saves from before this ADR have no `launchedAt`: their vessels read MET from t = 0, as before, and count as pre-launch only while still unstaged near the ground.
- Tests that load a pod for a probe-like vessel pass `crew: []` or a probe core; tests that relied on empty pods counting as crewed seat crew explicitly.
