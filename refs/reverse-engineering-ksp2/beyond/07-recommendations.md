# 07 — Recommendations

> A menu to choose from, not a plan. Effort: **S** (days), **M** (one plan, 1–2 weeks of agent sessions), **L** (2–4 plans), **XL** (a phase). Estimates are rough and assume the current architecture (`docs/architecture/*`). "Incremental" means it ships value alone and later items build on it without rework.

## 0. Assumed foundation (from the companion work, not this folder)

The items below assume the post-v1 foundation the human already wants: **worlds** with Sandbox/Science/Career, a **Space Center**, career **currencies** (funds, science, reputation), **tech tree**, **contracts/missions**, **crew**. They are designed in the companion KSP documents (`refs/reverse-engineering-ksp2/`) and the UI concept (`refs/space-orbital-program-ui/`). Where an item here needs one of them, it says so.

Two small architectural pieces unlock most of this folder and should be decided early:

| Piece | Why | Effort |
|---|---|---|
| **World tick** (a deterministic, per-day step for world-level systems, in the sim Worker, saved with the world) | economy, AI agencies, contracts, events, science review, comms leasing | M |
| **Data packets** (a resource-like "data" with size and metadata, stored per vessel, moved by the network) | comms rates, science, contracts on data | M |

## 1. Must (do these first; they define the game's identity)

| # | Item | Doc | Effort | Depends on | Incremental |
|---|---|---|---|---|---|
| M1 | **Comms tier 1**: antenna modules, line of sight (bodies + terrain near surface), ground stations as body-fixed sites, three control states, plasma blackout (ADR 0079) becomes real | 01 | M | module config, a sim system, save bump, map Network layer | yes |
| M2 | **Comms tier 2**: link budget → data rate ladder, bands, comms scale factor, link inspector | 01 | M | M1 | yes |
| M3 | **Data packets + transmission queue** (no store-and-forward yet); science results have sizes | 01, 04 | M | M2, data packets | yes |
| M4 | **Milestones / world firsts + history book** | 06 | S | world save, events | yes |
| M5 | **System editor (U0) and freeze into a world (U2)** for rails-only systems; systems saved as body-only mod packages | 05 | M–L | world creation dialog, body registry (exists) | yes |
| M6 | **Space center on plots** (tier 1 of 08): building catalogue with 3 levels, cost/build time/upkeep, adjacency, site renderer generated from the placed-building list; dishes become comms nodes | 08 | M–L | world tick, Space Center screen, building registry | yes |
| M7 | **World epoch and calendar** (09): `epoch` in the world save, time scale, fictional or Gregorian-UTC calendar shown in the UI; start date picked at world creation ("today" read once by the host) | 09 | S | world save | yes |

Why these: M1–M3 deliver the human's headline wish (a player-built network) and make every later system (science, economy, operator role) richer. M4 is cheap story. M6 makes the Space Center a place the player builds. M5 is the cheapest, most valuable slice of "Universe mode" and reuses the mod format.

## 2. Should (the "richer than KSP2" layer)

| # | Item | Doc | Effort | Depends on |
|---|---|---|---|---|
| S1 | **Comms tier 3**: routing graph, Auto/Manual/Policy routes, capacity sharing, latency, delay modes (off/enforced/flight computer via scripts) | 01 | L | M2, scripting (exists) |
| S2 | **Comms planning tools**: contact timeline, coverage heatmap, constellation planner with resonant deploy orbit | 01 | M–L | M2 |
| S3 | **Store-and-forward** and contact-plan prediction (DTN-style) | 01 | M | S1, M3 |
| S4 | **Reliability with flight experience**, quality grades, test stand, anomaly reports | 02 | M–L | part data, seeded PRNG (exists) |
| S5 | **Reactive contracts from demand** + basic markets (launch, comms capacity leasing) | 03 | L | world tick, contracts foundation |
| S6 | **AI agencies** (abstract, launch real rails objects, race for firsts, leasable relays) | 03 | L | world tick, S5, M4 |
| S7 | **Science discovery layer**: hidden facts, instruments with resolution/coverage, raw→calibrated→derived, claims and review | 04 | L | M3, science foundation |
| S8 | **Achievements** (local profile, mod-registrable) | 06 | S | events |
| S9 | **Replays** as save + command log + checkpoints, replay viewer | 06 | M | save format (exists), determinism (exists) |
| S11 | **Choose the launch site on the planet + several sites** (tier 2 of 08): site picker with latitude/coast/coverage layers, range-safety azimuth fan and stage impact ellipses, recovery; terrain map seeded per world with a list of flat zones | 08 | L | M6, terrain change in core (ADR 0043 follow-up), debris arcs (exist) |
| S12 | **Sun as the root body, axial tilt, seasons** (09): body orientation = pole × spin; surface code, terrain and SAS use the body's pole; renderer sun from the Sun body. Identity tilt reproduces today | 09 | M–L | M7 |
| S13 | **Real solar system pack** (09): planets from JPL elements with rates, a dedicated Moon model, IAU-style rotation; scale chosen by the human (1:1 or rescaled); "catch up to now" command | 09 | L | S12, M7 |
| S10 | **Background operations**: unloaded vessels run experiments, transmit, generate power | 02 | M | M3, resource system |

## 3. Could (depth for enthusiasts; good mod or later-stock candidates)

| # | Item | Doc | Effort |
|---|---|---|---|
| C1 | Comms tier 5: channels, licences, interference, encryption | 01 | M |
| C2 | Comms tier 6: suit radios, crew radio skill, live broadcast reputation bonus, radio astronomy | 01 | S–M |
| C3 | Radio science (gravity mapping by inter-satellite ranging, occultation) | 04 | M |
| C4 | Analysis mini-games (spectrum fit, stacking, anomaly marking) | 04 | M |
| C5 | Director layer: programs, board reviews, insurance, capped strategies, hired staff | 02, 03 | M–L |
| C6 | Universe n-body sandbox (U1) with layers: collisions, Roche rings, tides, star evolution, climate, graphs | 05 | L |
| C7 | Challenges with multi-axis scores, ghosts | 06 | M |
| C8 | News feed and world dashboard (price charts, rival progress) | 03 | S–M |
| C10 | Launch weather (commit criteria, cloud blocking optical links/telescopes) | 08 | M |
| C11 | Precomputed ephemeris pieces (DE440-derived) for high-fidelity real systems; historical career start dates and dated real milestones | 09 | M |
| C9 | Binary/multi-star support in the body tree (barycentre root) | 05 | M |

## 4. Later (big bets; only after the above prove fun)

| # | Item | Doc | Effort |
|---|---|---|---|
| L1 | Colonies (tier 3 of 08): off-world sites from base kits, power/life support, ISRU, production recipes, automated supply routes, launching from bases | 03, 08 | XL |
| L2 | Ephemeris flight (U3): bodies on n-body ephemerides, optional n-body vessel propagation with reference-frame picker | 05 | XL |
| L3 | Rival interception of unsecured data, scooping of publications | 01, 04 | M |
| L4 | Optional community leaderboard (static, replay-verified headlessly) | 06 | M |
| L5 | Interstellar exploration of generated systems | 05 | XL |

## 5. Suggested order (one possible path)

1. **Foundation** (companion work) + world tick + data packets.
2. **M1 → M2 → M3** (network you can see, rates that matter, data that flows) together with **M4**.
3. **S2** (planner tools; makes M1–M3 fun) and **S8** (cheap achievements).
4. **S1 + S3** (routing and store-and-forward) — the network becomes a game of its own.
5. **S4** (reliability) and **S7** (discovery science) — the engineer and scientist fantasies.
6. **S5 + S6** (living economy, rivals) — the director fantasy; network leasing appears here.
7. **M6** (space center on plots) can start right after the foundation's Space Center screen; **S11** (site choice) follows it and pays off once comms (M1–M2) makes ground-station geography matter.
8. **M5** can run in parallel at any time (it touches world creation and the body registry, not the flight sim).
9. **M7** (world epoch) is small and should land with the world/save foundation. **S12** (Sun root, tilt, seasons) improves the fictional system too and is a prerequisite for **S13** (real solar system).
10. Could/Later items by demand.

## 6. Architecture notes for whoever writes the ADRs

- **Comms as a stock plugin**, not core: antenna module(s), a `post-physics` system that updates the network on a cadence, typed events, a `comms` contribution (`ctx.provide`) so other mods (science, contracts) depend on it. Keeps the game moddable and a mod could replace it.
- **Network state in the world** (components or a singleton entity), saved; recomputation results are caches, not saved.
- **Link up/down times under warp** by bisection, like SOI crossings.
- **Snapshot** gets a compact `network` section (links with rate class, routes for the focused vessel) for the renderer and HUD; planning tools run in a separate Worker.
- **Scripting API**: `ship.comms` read-only, plus commands to queue/prioritise data; delay applied by the host.
- **Universe mode output** is a mod package: no new loading path.
- **Time** (09): keep `t` world-relative (precision) and add a two-part `epoch`; body orientation becomes a quaternion of pole times spin; frames stay translations only.
- **Sites and buildings** (08): the terrain map must stop being generated around one launch site (ADR 0043); a per-world seed plus a list of flat zones in the save. Buildings are a data registry (`defineBuilding`) like parts.
- **Determinism** rules unchanged: id order, seeded PRNG, no clock; world tick and comms both run in the sim Worker.

## 7. Key decisions for the human

1. **Comms ambition for the first release of the system**: tiers 1–3 (recommended) or 1–2 only?
2. **Signal delay default** per game mode (off / enforced / flight computer).
3. **Science depth**: KSP-like points with optional discovery layer, or discovery as the default in Science/Career?
4. **Living world**: do AI agencies exist, and do they put visible objects into the player's world?
5. **Agency type**: government, company, or a choice at world creation?
6. **Universe mode scope**: editor + freeze first (recommended), n-body sandbox later, ephemeris flight maybe never?
7. **Reliability/failures** in stock Career, or a world rule defaulting off?
8. **Online**: purely offline with file sharing, or an optional community leaderboard?
9. **Space center building**: plots (recommended) or free placement; site choice at world creation only or expandable; range safety as a rule, a cost, or off; same building system for off-world bases (recommended)?
10. **Real solar system**: 1:1 or rescaled (which factor)? Default start date (today, fixed, historical)? "Catch up to now" offered on load or as a button only? Elements + rates (tiny) or DE440 pieces (download)?
