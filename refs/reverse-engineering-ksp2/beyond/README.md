# Beyond KSP2 — design proposals for Orbital

> Research only, written 2026-10-17. Nothing here is decided. The human chooses which ideas become ADRs and plans. Companion to the KSP2/KSP1 system documents one level up (`refs/reverse-engineering-ksp2/`), which describe how KSP works; this folder proposes what goes beyond it.

## Index

| Doc | Topic |
|---|---|
| [00-sources.md](00-sources.md) | every source with URL, access level and date checked |
| [01-communications-network-and-radio.md](01-communications-network-and-radio.md) | **deep design**: link budgets, routing, latency, data queues, store-and-forward, channels, suit radios, failure modes, UI, cost, mods |
| [02-player-roles-and-fantasies.md](02-player-roles-and-fantasies.md) | engineer, scientist, director/investor, operator, explorer (and pilot) |
| [03-world-and-economy-dynamics.md](03-world-and-economy-dynamics.md) | living economy, markets, AI agencies, reactive events and contracts, progression, colonies |
| [04-science-beyond-ksp.md](04-science-beyond-ksp.md) | hidden world facts, instruments, data levels, analysis, hypotheses, publishing, data value over time |
| [05-universe-mode.md](05-universe-mode.md) | Universe Sandbox deep dive, system editor, n-body sandbox, freezing into a playable world, browser feasibility |
| [06-achievements-milestones-and-meta.md](06-achievements-milestones-and-meta.md) | world firsts, achievements, offline-friendly challenges, replays, sharing |
| [07-recommendations.md](07-recommendations.md) | prioritised menu (must/should/could/later), effort, dependencies, decisions |
| [08-space-center-building-and-colonies.md](08-space-center-building-and-colonies.md) | building the space center on plots, choosing launch sites on the planet with real consequences, bases on other bodies |
| [09-time-and-real-solar-system.md](09-time-and-real-solar-system.md) | world clock with a real calendar epoch, "catch up to now", real ephemerides and rotation models, axial tilt and seasons, scale options, impact on our code |

## Vision on one page

**KSP is a game about building a rocket and flying it. Orbital can be a game about running a space program** — where the rocket is still the heart, but every flight feeds a world that remembers it.

### Five fantasies, one world

- **Engineer** — "It works, and I know how close it was to failing." Margins, reliability that grows with flight experience, test campaigns, anomaly investigations.
- **Scientist** — "I found out something true." The world has hidden facts; instruments measure them with error; data flows home; the player makes a claim and is judged on it.
- **Director / investor** — "I bet on the right programs." Budgets or investors, markets that move, rival agencies, contracts born from real demand, a network you can lease out.
- **Operator** — "Ten things in flight, all alive and on schedule." Mission Center, the event timeline, comms passes and queues, scripts as procedures under light delay.
- **Explorer** — "I went where nobody had been." Fog of knowledge, discovery log, first-discovery credit, and with Universe mode, systems nobody has seen, including ones you made.

The player is never forced to pick one: each role is a lens on the same world with an automated fallback (hire a flight director, a chief engineer, a chief scientist).

### The loop

```
           ┌──────────── Director funds programs, sells services ◀────────────┐
           ▼                                                                   │
  Engineer designs & tests ──▶ Pilot/Operator flies ──▶ data over the network  │
                                                         (Operator routes it)  │
                                                                │              │
                    Explorer discovers anomalies ◀── Scientist analyses,       │
                    (new questions, new markets)     publishes ────────────────┘
                                                      (reputation, research, revenue)
```

Each arrow is a real flow of things (money, reliability, data, knowledge), not a currency conversion.

### A place the player builds

The Space Center is not a fixed menu: the player picks **where on the planet** to build it (latitude sets the rotation boost and which inclinations are cheap; the coast decides where stages fall and how boosters are recovered; geography decides ground-station coverage), then places and upgrades buildings on plots: pads, hangar, mission center, dishes that become network nodes, telescopes that discover and pre-map, labs, fuel plants. The same building system later founds outposts on the Moon and beyond, with power, life support, ISRU and supply routes ([08](08-space-center-building-and-colonies.md)). **In KSP the launch site is scenery; in Orbital it is the first engineering decision.**

### Real time, real sky

A world has a **calendar epoch**: it can start on today's real date (read once from the clock when the world is created) or on any historical date. Planets follow published ephemeris data, spin about tilted axes and have seasons. Game time still runs on time warp, because a deterministic, warpable sim cannot be locked to the wall clock, and **"catch up to now"** warps the world forward to the real date whenever nothing is in flight. Scale is a separate choice: real 1:1, rescaled real, or our fictional Kerbin-scale system ([09](09-time-and-real-solar-system.md)).

### Why the communications network is the spine

The network touches every role: the engineer sizes antennas and power, the operator schedules passes and routes, the scientist is limited by bandwidth, the director builds ground stations and leases capacity, the explorer needs relays to go far. One physical model (link budget → rate, light time → delay, capacity → contention) gives all of them real decisions. That is why `01` is the deepest document and why the recommendations start there.

### Universe mode, honestly

Universe Sandbox-style n-body physics and Orbital's exact, warpable patched conics want different engines. The proposal is **one editor, two engines and a hand-off**: build or simulate a system, then **freeze** it into the body tree Orbital already flies, saved as an ordinary mod package. The editor and the freeze are cheap and deliver most of the value; the n-body sandbox is a later "wow"; flying vessels in n-body is an XL option that may never be needed.

## The strongest ideas (short list)

1. **Link budget is the range** — rate falls smoothly with distance; no arbitrary range number (01).
2. **Routing you can see and steer** — Auto/Manual/Policy routes, capacity contention, contact timeline (01).
3. **Store-and-forward data** — relays carry data across gaps, as real deep-space networks do (01, 04).
4. **Signal delay makes scripting essential** — Orbital's existing script sandbox becomes the flight computer (01).
5. **Networks as a business** — lease capacity to rivals and customers, rent theirs (01, 03).
6. **Reliability that grows with flight experience** — the engineer's real loop (02).
7. **Science as discovery with claims and review** — hidden facts, error bars, overclaiming costs reputation (04).
8. **Contracts from demand** — each job exists because of something in the world, and changes it (03).
9. **System editor + freeze** — make a system, play a career in it, share it as a mod (05).
10. **Replays as save + command log** — challenges, ghosts and sharing without a server (06).
11. **Choose and build your space center** — site latitude, coast and terrain have real consequences in the sim; the same building system goes off-world (08).
12. **A real calendar with "catch up to now"** — real dates, real planet positions and seasons, without giving up time warp or determinism (09).

## Key decisions for the human

Listed with options in [`07-recommendations.md` §7](07-recommendations.md#7-key-decisions-for-the-human): comms ambition (tiers), signal-delay default, space-center building scope (plots, site choice, off-world), real-system scale and start date, science depth, AI agencies, agency type, Universe-mode scope, reliability default, online features.
