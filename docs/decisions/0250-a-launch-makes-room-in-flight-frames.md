# 0250 — A launch makes room in the flight frames; only a controlled vessel in the air keeps its frame

**Status:** accepted
**Date:** 2026-10-21
**Plan:** plans/266-launch-refused-no-free-physics-frame.md

## Context

A world keeps `DEFAULT_MAX_FLIGHT_FRAMES` (2) physics frames. Plan 257 added `makeRoom`/`makeRoomAt`: when a wake (or Debug's set location) finds every frame held by vessels far away, a frame whose vessels are all landed or in a stable orbit goes on rails. `load-vessel` never called it, so a launch with two far vessels still in flight (a vessel in orbit that had not been idle long enough for auto rails, a stage still falling, a vessel landed elsewhere) was refused with "no free physics frame", and Flight showed "The simulation stopped" with no vessel. Plan 257 also left a vessel in the air holding its frame, debris included.

KSP never refuses a launch: the other vessels go on rails (packed), and a packed vessel in the atmosphere below a set height is deleted.

## Decision

1. `load-vessel` into flight runs `makeRoomAt` at the vessel's place before taking a frame, as a wake does.
2. `makeRoomAt` picks, in order: a frame whose vessels are all landed or in a stable orbit (as plan 257); else a frame whose other vessels are **uncontrolled debris in the air** (no control source, not kept, not an agency's): that debris goes on ballistic rails (reason `ballistic debris`), and ADR 0021 rule 2 removes it when it descends below the atmosphere top.
3. A **controlled vessel in the air** (not landed, not in a stable orbit) keeps its frame. The refusal (`roomBlocker`) names it and what to do: land it, reach orbit, or recover or end it in the Mission Center. Wake and Debug's set location give the same text.
4. Flight shows a refused launch as **Launch refused** (warning, the refusal's text, Back to the VAB and Mission Center), not as "The simulation stopped": the sim is still running.

## Alternatives considered

- **Put a controlled vessel in the air on rails too, as KSP does** — rails have no drag, so a vessel in the atmosphere would fall through it to the ground on a conic; KSP deletes it instead. Losing a crewed vessel to a launch the player did not connect with it is worse than a refusal that says which vessel and what to do.
- **More frames** — moves the limit, does not remove it; each frame has its own physics world.
- **Leave debris in the air holding its frame** — the debris is gone within minutes anyway; blocking a launch on it is the bug the owner hit.

## Consequences

- Launching with other vessels in flight works whenever they are landed, in orbit or debris; they stay in the world on rails.
- A falling stage can go on rails a little earlier than ADR 0021 rule 1 would put it there (no 2 s idle, below the atmosphere top). Below the atmosphere top and descending, rule 2 then removes it at the next step instead of letting it crash in physics: no ground impact events for it.
- Test `packages/sim/test/launch-room.test.ts`.
