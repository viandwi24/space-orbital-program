# 0006 — SvelteKit static client, Svelte 5, no SSR for the game

**Status:** accepted
**Date:** 2026-10-16
**Plan:** plans/001-repo-bootstrap.md

## Context

The web client needs a fast, simple UI layer for chrome (HUD, assembly editor, map overlays). The game itself runs client-side; there is no server computation (product spec). Verified 2026-10-16: Svelte 5.57, SvelteKit 3.1 (configuration now lives in `vite.config.ts`; there is no `svelte.config.js`), `sv` CLI 1.1.

## Decision

`apps/web` is a SvelteKit app scaffolded with `sv create --template minimal --types ts`, using `@sveltejs/adapter-static` with `fallback: '200.html'` and `prerender = true` in the root layout. Svelte 5 runes mode. Svelte owns UI chrome only: the render loop, sim stepping, and input polling run outside Svelte reactivity.

## Alternatives considered

- **Plain Vite + Svelte (no Kit)** — slightly less machinery, but Kit's routing/static adapter cost nothing and give structure for VAB/flight/map routes. Chosen Kit.
- **React/Next** — heavier runtime, SSR focus we do not need. Rejected.
- **No framework** — HUD/VAB UI would be hand-rolled DOM; poor DX. Rejected.

## Consequences

- Any static host serves the build (`apps/web/build`).
- `svelte-check` pins the TypeScript version for `apps/web` (6.x today; TS 7 when supported).
- Routes planned: `/` (menu), `/vab`, `/flight`, `/map` (may be a flight overlay).
