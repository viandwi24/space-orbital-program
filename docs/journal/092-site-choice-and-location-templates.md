# 092 — Site choice at world creation and location templates

**Plan:** plans/092-site-choice-and-location-templates.md · **Session:** Agent 3 (Dev C, Linux Mint, 2026-10-17), three-agent team mode · **ADRs:** [0177](../decisions/0177-site-templates-resolver-consequences-and-founding.md) (new), [0097](../decisions/0097-sites-space-center-in-3d-free-grid-bases-and-range-safety.md), [0142](../decisions/0142-sites-terrain-seed-zones-and-placement.md) · **Research:** none

**Status when written: criteria met here, handed over as `ready/092`.**

## What was done

| Where | What |
| --- | --- |
| `packages/core/src/site-templates.ts` (new) | `SiteTemplateDefinition`, schema, `resolveSiteTemplate`, `siteConsequences`, `downrangeEast`, `siteDistance` |
| `packages/core` | registry `siteTemplates` (kind `site-template`), `ctx.siteTemplates`, `found-site`, `site:founded`; `API_VERSION` 0.1.39 |
| `mods/stock` | five templates: equatorial coast, mid-latitude coast, inland plateau, high latitude, island |
| `packages/sim/src/buildings.ts` | `foundSite` (base with the starter pad, overlap and zone-count checks), and a refusal of `site` placements at a site founded this run |
| `apps/web/src/lib/worlds` | catalog `siteTemplates`, `resolveSiteChoice`, `formatLatLon`, `createWorldInfo` site, the Site fieldset in `CreateWorld.svelte` |
| tests | `packages/sim/test/site-templates.test.ts` (20 seeds), `packages/core/test/site-templates.test.ts`, 3 new cases in `packages/sim/test/sites.test.ts`, 2 in `CreateWorld.test.ts` |
| docs | ADR 0177, `simulation.md`, guide "Site templates" |

## Numbers (this machine)

- Slowest resolve per template over 20 seeds: equatorial coast 1 225 ms (it runs first and builds the 1 024 px map of each seed), mid-latitude coast 109 ms, inland plateau 417 ms, high latitude 45 ms, island 159 ms.
- Relaxed: the inland plateau dropped `inland` on 6 of 20 seeds (8919, 16838, 32676, 48514, 72271, 103947). No other template relaxed anything.

## Decisions and deviations

- **The zone-free map** is the one the resolver reads: zones clear their spot to grass, which would hide coasts.
- **Globe picker**: a list of templates with the consequences panel, not a map projection (left to 089/091).
- **Transfer between sites** moved to 128 (site membership, ADR 0097 point 7).
- **Founded sites** shape the terrain from the next load; a `site` placement there is refused until then.
- The 20-seed test lives in `packages/sim/test` (`mods/stock` cannot import `@orbital/core`).

## What surprised me

- The first version of the 20-seed test built a terrain field for each seed and template (100 fields of a 1 024 px map) and added two minutes to `bun run test`. One field per seed with all five zones checks the same thing: each zone is flattened on its own (ADR 0142 point 3).

## Follow-ups

- The resolver runs on the page thread when a template is chosen (about a second the first time for a seed). A Worker or a smaller map could hide that if the menus plan (089) asks for it.
- 096: cost and build time of a founded site. 127: range safety from the same geography.

## Verification output

```text
bun test packages/sim/test/site-templates.test.ts   2 pass (20 seeds × 5 templates; 52 s, one terrain field per seed)
bun test packages/core/test/site-templates.test.ts  pass
bun test packages/sim/test/sites.test.ts            6 pass (3 new for found-site)
bunx vitest run src/lib/worlds                      Tests 20 passed
bun run docs:check                                  docs-check: OK
bun run test                                        1476 pass, 0 fail (325 s before the per-seed field change; the 20-seed test went from ~125 s to 52 s)
bun run typecheck                                   exit 0 (65 s)
bun run build                                       exit 0
bun run --filter @orbital/web test                  902 passed; 3 env-only import suites here (no Node)
```
