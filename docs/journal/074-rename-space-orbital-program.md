# 074 — Rename the product to Space Orbital Program

**Plan:** [plans/074-rename-space-orbital-program.md](../plans/074-rename-space-orbital-program.md) · **Session:** Agent 2 (Dev B, MacBook Pro M2 13"), 2026-10-17 · **ADRs:** [0105](../decisions/0105-product-name-space-orbital-program.md) · **Research:** none (nothing looked up)

**Status when written: criteria met** (verification in the plan's Log).

## What was done

The name lives in one constant, `GAME_NAME` in `apps/web/src/lib/public/about.ts` (the existing meta module, so no new `product.ts`), now `'Space Orbital Program'`; `PageMeta`, the menu, Home, the loading screen, the browser notice, credits and roadmap already read it. Every other player-facing string now reads it or says the new name.

## Inventory (`grep -rn "Orbital" apps/web/src apps/web/static apps/web/e2e`)

| Hit | Class | Change |
|---|---|---|
| `lib/public/about.ts` `GAME_NAME`, `GAME_DESCRIPTION` | player-facing | new name |
| `routes/+error`, `mods`, `flight`, `vab` page titles (`· Orbital`) | player-facing | `· {GAME_NAME}` |
| `routes/mods`, `roadmap`, `credits` descriptions | player-facing (meta) | `{GAME_NAME}` |
| `routes/+layout.svelte` noscript, `routes/vab` WebGL 2 notice, `lib/ui/SmallScreenNotice.svelte` | player-facing | `{GAME_NAME}` |
| `lib/assets/favicon.svg` `<title>`, `static/sandbox/script-sandbox.html` `<title>` | player-facing (tooltip, devtools) | literal new name (no import in SVG/static HTML) |
| `lib/save/game-save.ts`, `world-record.ts`, `lib/script-share.ts` error messages | player-facing (shown in notes and dialogs) | new name; `saves.test.ts`, `browser-support.test.ts` follow |
| `OrbitalElements`, `OrbitalAxes` types, "Orbital elements/eccentricity/readouts/frame" | identifier or physics term | kept |
| `@orbital/*` imports, `orbital.*` storage keys, `orbital-*` format markers | identifier (ADR 0105 point 2) | kept |
| `static/social-preview.jpg` | image without text | nothing to change |

Docs: `README.md` title and intro, `AGENTS.md` first line, `docs/README.md` intro, `product/spec.md` (the one prose use); `product/glossary.md` already had the entry. `architecture/overview.md` and `hosting.md` say "Orbital is a Bun workspace…/a static site" about the code and keep it (ADR 0105 point 3).

## What surprised me

- The plan's acceptance grep (`>Orbital<\|title.*Orbital\b`) also matches the new test's own regex in `about.test.ts`; that is the only hit and it is the guard, not a use.
- The edits to `lib/save` and `lib/script-share.ts` are outside the plan's Touches list but are only message strings (no format, key or contract).

## Decisions made

None beyond ADR 0105.

## Open questions / follow-ups

- None. The npm scope question stays in STATUS (ADR 0105 point 2).

## Verification output

See the plan's Log.
