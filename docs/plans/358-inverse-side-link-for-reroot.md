---
id: 358
title: "An inverse side link, so a booster on a radial decoupler can become the root"
status: draft
owner: ""
depends: [357]
phase: 7
created: 2026-10-22
updated: 2026-10-22
---

# 358 — Inverse side link for the re-root

## Goal

Plan 357 (ADR 0301 point 4) re-roots through side links by writing them as surface links on the old child. It refuses a booster on a radial decoupler: the decoupler separates at its `radial` node, and a surface link would host the core tank on the decoupler's `surface` instead, so staging would no longer let the booster go; and the core tank usually has no free node to hang by.

## Context

- ADR 0301, ADR 0034 (radial links), ADR 0235 (surface links); `packages/core/src/design.ts`, `packages/sim/src/vessel.ts` (`splitVessel` by node name), `apps/web/src/lib/editor/reroot.ts`

## Scope

**In:** a link kind where the child touches the parent's node with its own surface (`parentNode` a real node, `node` `"surface"`, the point and normal in the child's frame, a tilt for the twist): validation, placement, a design format bump, the sim attachments (the decoupler keeps `radial`), the editor code that reads `attach[link.node]`; `reroot` uses it for side links.
**Out:** anything else in the Root tool.

## Steps

1. ADR for the link kind and the format version.
2. Core: validation and `placeInverse`; tests.
3. Sim: separation of a booster rocket re-rooted on a booster, headless.
4. Editor: `reroot` and every reader of the child's node; tests.

## Acceptance criteria

- [ ] `bun test packages/core` passes a test placing a part on an inverse link at the pose a radial link gives the other way round.
- [ ] `bun test packages/sim` passes: the booster rocket re-rooted on a booster stages, and the core separates from the booster.
- [ ] `cd apps/web && bunx vitest run src/lib/editor/reroot.test.ts` passes with a booster on a radial decoupler as the new root.
- [ ] `bun run typecheck`, `bun run docs:check`, `bun run build` pass.

## Docs checklist

- [ ] ADR, STATUS row, journal.

## Log

- 2026-10-22: drafted from plan 357.
