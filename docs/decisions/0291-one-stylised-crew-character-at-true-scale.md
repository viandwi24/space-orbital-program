# 0291 — One stylised crew character at true scale for EVA, the Hangar, the Space Center and portraits

**Status:** accepted (owner's request, 2026-10-22)
**Date:** 2026-10-22
**Plan:** plans/341-stylised-crew-character.md
**Amends:** ADR 0120 point 7 (the EVA figure), plan 029 (the Hangar crew)

## Context

The owner asked to replace every person in the game with the chibi astronaut of his character sheet (`refs/crew-character-nova.jpg`, "NOVA": big rounded sky-blue head, big eyes, brown tousled hair, small body, many outfits and expressions), to stop drawing people as stacks of boxes, and to normalise their size against the rockets. People were drawn in two unrelated ways: the EVA suit generator (boxes and a lathed helmet, `parts/generators/eva.ts`) and the Hangar crew (instanced boxes and a sphere head, `vab/hangar-movers.ts`). The Space Center had nobody, and the Astronaut Complex had no faces.

## Decision

1. **One character, procedural, in `packages/renderer/src/crew/`.** `buildCharacter(spec)` returns rigid pieces (head, torso, hips, two arms, two legs) as three geometry, each piece's vertices coloured by role. No glTF: the repo has no asset pipeline for characters and the parts are procedural (ADR 0028). The spec is plain data: `outfit`, `skin`, `hair`, `expression`, `props`.
2. **Outfits, skins, hair and expressions are data** (`crew/outfits.ts`, no three import): Flight (orange, the default crew), EVA (white suit, helmet, backpack), IVA (light grey coverall), Engineer (orange coverall, hard hat, wrench), Scientist (lab coat, glasses, tablet), Flight Control (navy, headset), Mechanic (navy coverall, cap), Doctor (white coat, stethoscope), Researcher (lab coat, goggles, clipboard), Field Worker (olive, cap) and Tourist (shirt, sunglasses, camera). Skins: sky blue (default), pale cyan, lavender, teal, muted blue. `appearanceOf(id)` hashes a crew id to a stable skin, hair style and hair colour.
3. **True scale.** Every figure is `CREW_HEIGHT` = 1.7 m tall in world metres (feet at y = 0), the scale of the parts. A chibi head is about a third of that height, so the body below it is short: the figure reads as a small cute astronaut and still stands at a person's height beside a 1 m tall, 1.25 m wide pod, a ladder and a hatch. A unit test keeps the bounding box between 1.6 and 1.85 m for every outfit.
4. **One material per use.** The walkers (Hangar, Space Center) draw every figure as one `SkinnedMesh` with rigid one-bone weights and vertex colours: one shared `MeshStandardMaterial` (`vertexColors`, plus `skinning` by the mesh type) for every person, one draw call each, no shader rebuild when a figure appears. Poses (walk, idle, wave, work) are pure functions of time, unit-tested. The EVA suit stays a part (ADR 0028): its generator lays the same pieces into material slots; it gains three fixed slots, `skin`, `hair` and `eye`, in the shared material library. The helmet is an open shell (white, with a rim and a lamp) so the face shows; the part's `glass` slot is nearly black and would hide it.
5. **Portraits** are painted on a 2D canvas from the same spec (head shape, hair, eyes, mouth by expression, outfit collar), cached as data URLs per (appearance, outfit, expression, size). No WebGL context is opened for a face: the world keeps one renderer (plan 340). Happy by default; sad for a lost or missing member; sleepy is offered for long warps.
6. **Where each outfit is used.** Crew in pods: Flight. EVA suit: EVA. Hangar walkers: Engineer, Scientist, Mechanic, Researcher. Space Center people: Engineer, Scientist, Flight Control, Doctor, Field Worker. IVA and Tourist are in the line-up for later use (inside stations, tourist contracts).

## Consequences

- People look the same everywhere and share one generator; adding an outfit is a data entry.
- The EVA figure shows one face for every member (the part model is shared by all suits); a per-member skin on EVA needs a per-vessel palette and is left for later.
- Nobody is drawn inside pods' windows yet (no interior rendering exists); `Flight` is the outfit a pod's crew wears in portraits and the line-up.
- The walkers cost one draw call each (8 in the Hangar, 6 at the Space Center) instead of 7 instanced calls for the whole Hangar crew.
