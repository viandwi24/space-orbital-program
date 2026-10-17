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

## Follow-ups

- The resolver runs on the page thread when a template is chosen (about a second the first time for a seed). A Worker or a smaller map could hide that if the menus plan (089) asks for it.
- 096: cost and build time of a founded site. 127: range safety from the same geography.

## Verification output

See the `ready/092` tag message.
