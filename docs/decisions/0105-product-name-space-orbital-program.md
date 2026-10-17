# 0105 — Product name: Space Orbital Program

**Status:** accepted
**Date:** 2026-10-17
**Plan:** none (owner decision "product-name", 2026-10-17); delivered by plan 074

## Context

"Orbital" was a working title (`product/spec.md` §8). The name appears in menus, the credits page, page metadata and, later, a hosting domain. The refs UI concept uses **Space Orbital Program**. The research noted that the name follows the pattern of "Kerbal Space Program"; KSP's trademarks must not be used (`product/visual-direction.md`, ADR 0025).

## Decision

1. The product is named **Space Orbital Program** in everything the player or the public sees: page titles and meta, menus, the Home logo text, the credits and roadmap pages, the README, the browser notice and social images. A short form "SOP" is not used in the UI.
2. **Identifiers stay.** Package scope `@orbital/*`, file formats and their markers (`orbital-sim-save`, `orbital-game-save`, `orbital-world`, `.orbital-mod.json`, `.orbital-save.json`), the IndexedDB database `orbital`, `localStorage` keys and the repository path keep "orbital", so existing saves, settings, mods and links keep working. The npm scope for publishing is still an open question (STATUS known issues) and needs its own ADR before any publish.
3. Docs say "Space Orbital Program" for the product and keep "Orbital" only where they mean the code or historical plans; `done` plans and accepted ADRs are not edited.

## Alternatives considered

- **Keep "Orbital"** — rejected by the owner: generic and hard to find.
- **Rename every identifier** — rejected: breaks saves, mods and settings for no player benefit.

## Consequences

- Risk: the name resembles "Kerbal Space Program". No trademark search was done by this project; the owner should check before registering a domain or publishing (STATUS known issues).
- Follow-up: plan 074 (rename in the client and the docs that describe the product).
