# 0360 — The base flow: the sim says what is on offer, the HUD and the Space Center act on it

**Status:** accepted
**Date:** 2026-10-24
**Plan:** plans/386-off-world-bases-player-flow.md
**Builds on:** ADR 0125 (bases), ADR 0352 (refuelling from site storage), ADR 0321 (one site mesh per site)

## Decision

1. **The sim names the offers.** `VesselSnapshot.baseOffer` is present while a vessel is landed at rest (the recovery rule) and one of three things is possible: `found { body, latitude, longitude, refusal? }` (a base kit aboard, another body than the root's; `refusal` is the site rules' own reason, `siteRefusal`), `join { site, name }` (inside a base's flat radius and not yet a member), `refuel { site, name, stored }` (a member of a site whose storage holds a commodity that names a resource). The web does not recompute positions or rules; a refusal shown on a button is the sim's.
2. **The Flight HUD card** (`BaseCard`) turns them into buttons (`hud/base-model.ts`): "Found a base here…" asks for a name (the id is made from it, never one in use), "Join <site>", "Refuel from <site>". A refused command's reason shows under the card. The commands are the existing `deploy-base`, `join-site` and `refuel`.
3. **Routes in the Flows panel.** With the economy on and two sites, the panel lists the chosen site's routes with a Delete and a form: from, to, what it carries (the traded commodities), the amount a window. The fee line is the launch service's price; the window and the first delivery show in the route's line once made, as before. The sim's refusals (no flight has landed there yet, an unknown site) show under the form.
4. **A base on its body.** `SitePlace.body` names the body a base stands on; the scene builds its `SiteBuildings` with the body's radius plus the ground height at the site's place (the flat zone), under the scene root with the home site's materials, and carries it with its body every frame (hidden while the body's moon pass sleeps). The web sends the bases' draws next to the home ones (`offWorldSiteDraws`).
5. **The parts are back**: `stock.base-kit` and `stock.drill` leave the hidden set and join the Surface operations node; the off-world buildings show again in the build menu (disabled at home with their reason, as before the audit).
6. **Mod API 0.1.130**: additive (`VesselSnapshot.baseOffer`, `SitePlace.body`).

## Left open

The Space Center's own 3D view of an off-world site (the camera frames home sites; the base is drawn in Flight); the lesson "A base on the Moon" (it needs an observation for a founded base and a landed lesson scene); a cost line on "Found a base here" (the sim has no fee for it); the window days in the route form before it is sent.
