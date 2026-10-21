---
id: 341
title: "Stylised crew character (NOVA) at true scale: EVA, Hangar walkers, Space Center people, portraits and /dev/crew"
status: done
owner: "crew character session (Claude)"
depends: [109, 029]
phase: 0
created: 2026-10-22
updated: 2026-10-22
---

# 341 — Stylised crew character

## Goal

Every person in the game is the owner's chibi astronaut (`refs/crew-character-nova.jpg`): a rounded head with big eyes and tousled hair on a small body, in an outfit that fits the place, about 1.7 m tall in world metres beside the parts. The Astronaut Complex shows each member's face.

## Context

- Owner's request (2026-10-22, relayed): replace the boxy people with the character sheet, normalise their size against the rockets, use the outfits (EVA, IVA, …), engineers and scientists walking in the Hangar.
- ADR 0120 (EVA), ADR 0028 (part visuals and material slots), plan 029 (Hangar crew), new **ADR 0291**.
- Code: `packages/renderer/src/parts/generators/eva.ts`, `packages/renderer/src/vab/hangar-movers.ts`, `packages/renderer/src/site-meshes.ts`, `apps/web/src/routes/(world)/astronauts/+page.svelte`.

## Scope

**In:** `packages/renderer/src/crew/` (outfits as data, appearance from an id, the character builder, poses, walkers, portraits); the EVA suit generator; Hangar walkers; Space Center walkers on the launch site; portraits in the Astronaut Complex; `/dev/crew` line-up page; unit tests.
**Out:** people inside pod windows (no interiors exist), a per-member face on EVA, e2e.

## Design notes

See ADR 0291.

## Steps

1. ADR 0291 and this plan; commit.
2. `crew/` data, builder, poses and the height test; EVA generator on it (slots `skin`, `hair`, `eye`); commit and push.
3. Hangar walkers and Space Center walkers on the shared skinned character; commit and push.
4. Portraits in the Astronaut Complex; `/dev/crew`; commit and push.
5. Screenshots (line-up, EVA by a pod, Hangar), STATUS, journal; `docs(plan-341): complete`.

## Acceptance criteria

- [x] `bun test packages/renderer`: every outfit's figure is 1.6–1.85 m tall; poses are pure functions of time; `appearanceOf` is stable per id.
- [x] The EVA suit part is the character in the EVA outfit, under the part's 1.8 m box.
- [x] The Hangar shows engineers, scientists, mechanics and researchers walking, at human scale beside the platform.
- [x] The launch site (Space Center and pad) shows a few people near the buildings.
- [x] The Astronaut Complex shows a portrait per member (happy; sad for lost or missing).
- [x] `/dev/crew` shows every outfit and expression side by side.
- [x] `bun run typecheck`, `bun test`, `bun run docs:check`, `bun run build` pass.

## Docs checklist

- [x] `docs/STATUS.md` board row.
- [x] `docs/journal/341-stylised-crew-character.md`.

## Log

- 2026-10-22 — Done: crew module, EVA, Hangar (10 people), launch site (6 staff), portraits, `/dev/crew`. People are 1.7 m and taller than the 1 m stock pod; see journal 341.
- 2026-10-22 — Drafted and started by the crew character session on the owner's request (relayed by the session that started it).
