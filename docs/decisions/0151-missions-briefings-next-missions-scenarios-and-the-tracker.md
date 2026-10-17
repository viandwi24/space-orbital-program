# 0151 — Missions: briefings and next missions, a stock main line, scenarios as mission packs, the tracker panel

**Status:** accepted
**Date:** 2026-10-18
**Plan:** [100](../plans/100-authored-missions-and-mission-packs.md)
**Builds on:** ADR 0098 point 4 (missions and packs), ADR 0175 (objective trees, `objective-start`, prerequisites), ADR 0094 and 0143 (worlds, presets, Create World), ADR 0149 (dock panels)

## Context

Plan 098 gave missions an objective tree, a reward and prerequisites, started only by the `objective-start` command; nothing registers a mission, nothing shows one in flight, and a world cannot start from anything but the Hangar's design. Plan 100 asks for authored missions with briefings, a main line, a tracker, and mission packs that start a world in a given state.

## Decision

1. **Mission fields (additive).** `MissionDefinition` gains `briefing?` and `debriefing?` (plain text), `next?: string[]` and `line?: string` (a story line id). When a mission completes, the sim starts each of its `next` missions whose prerequisites are then met: a main line flows without a click. Any other mission starts with `objective-start` as before.
2. **The stock main line** (`line: 'stock.main'`): First launch (1 km), Space (70 km), Orbit (periapsis 70 km), Moon flyby, Moon landing, Home from the Moon (landed on the Moon, then recovered at home). Written for this game's bodies; no text from any other game.
3. **The tracker** is the host dock panel `host.missions`: active missions with each objective's progress from the snapshot, and missions on offer (registered, prerequisites done, not active or done) with their briefing and a Start button that dispatches `objective-start`. The first-flight guide stays as onboarding hints; the main line's first mission asks for the same first step.
4. **Scenarios are mission packs.** `defineScenario({ id, title, description, preset, rules?, vessels, missions? })`: `vessels` are `{ design, name?, orbit: { body, altitude } }` or `{ design, site: true }`; `missions` start with the world. Create World offers the registered scenarios; a world made from one records `scenario` in its world record. Its first flight (no save yet) loads the scenario's vessels (an orbit becomes a circular, equatorial `state` placement from the body's mass, `scenarioPlacement` in core) and starts its missions, instead of the Hangar's draft.

## Alternatives considered

- **Auto-start every available mission** — rejected: contracts and side missions are the player's choice; only a line's `next` flows on its own.
- **Starting vessels in `WorldInfo`** — rejected: world info is the identity and rules of a world (ADR 0110); the vessels are a one-time start, kept in the record like the info of a world without a save (ADR 0143 point 1).

## Consequences

- Core: mission fields, `ScenarioDefinition`, `registries.scenarios`, `scenarioPlacement`; SDK `defineScenario`; API_VERSION bump.
- Sim: `next` missions start on completion.
- Web: `host.missions` panel, Create World scenario choice, `WorldRecord.scenario?`, first flight from a scenario.
