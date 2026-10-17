# 03 — World and economy dynamics

> Design proposal, research only. Sources `[ID]` are in [`00-sources.md`](00-sources.md).

## 0. Idea

In KSP the world is static: the contract board refills, prices never move, nothing happens unless the player does it. A **living world** means things change while you play, and they change *because of* what you and others did. The design constraint is that Orbital is a **client-side, deterministic, single-player** game (`docs/product/spec.md`: no backend for the core loop). So the "world" is a small, seeded, deterministic simulation that runs alongside the flight sim, at a coarse tick (one world tick per in-game day), and is saved with the world.

## 1. Prior art

- **Elite Dangerous background simulation (BGS)**: factions in each system hold influence shares (summing to 100%); player actions shift influence; thresholds trigger states (war, election, expansion, retreat); updated once per server day [G-ED-BGS][G-ED-BGS-GUIDE]. *Lesson:* a few numbers per place, clear thresholds and named states produce a lot of emergent story.
- **X4: Foundations**: NPC factions trade, build and fight on their own; prices follow supply and demand; the player builds stations and sets trade rules [G-X4].
- **EVE Online**: a player-driven economy that the developer measures and publishes monthly (price indices, money faucets and sinks, production vs destruction) [G-EVE-MER]. *Lesson:* expose the economy as data; players love charts of a world that moves.
- **Mars Horizon**: rival agencies race for public firsts; press and funding react [G-MH].
- **KSP1**: reputation gates which contract tiers appear; contracts have advances and penalties [G-KSP-CON].
- **Juno: New Origins**: procedural contracts called repetitive by players [G-JUNO-REV]. *Lesson:* procedural jobs need world context to feel meaningful.
- **Real world**: NASA buys communications services from commercial ground-station companies (Near Space Network awards, up to $4.82 billion over several years) [C-NSN]; the DSN is oversubscribed [C-DSN]. Capacity is a real market.

## 2. Pieces of a living world

### 2.1 Actors

- **The player's agency/company.**
- **AI agencies** (3–6 per world): each with a home site, a personality (cautious / bold / commercial / scientific), a budget, a tech level and a fleet *simulated abstractly* (they do not fly physical rockets in the sim; their launches are rolls against their tech and reliability, and successful missions place **real on-rails objects** in the world: satellites, relays, stations you can see on the map, target, dock with, lease).
- **Customers**: satellite operators, science institutes, governments, tourists, mining consortia (later). Customers generate demand.
- **The public**: interest in space (a number per topic: Moon, Mars, science, tourism) that rises with spectacular events and falls with boredom or disasters; drives government budgets and tourism demand.

### 2.2 Markets (prices respond to supply and demand)

| Market | Sellers | Buyers | Price driver |
|---|---|---|---|
| Launch to orbit (per kg, per orbit class) | player, AI agencies | customers | number of providers, their reliability, recent failures |
| Comms capacity (per MB or per contact hour, per region of space) | owners of ground stations/relays | probes of all agencies, customers | coverage scarcity (01) |
| Data (imagery, survey maps, science datasets) | anyone with data | institutes, governments, companies | freshness, resolution, exclusivity (04) |
| Crew seats / tourism | crewed providers | tourists | public interest, safety record |
| Resources (later: propellant at a depot, ore, water) | miners, depots | anyone refuelling there | location; delivery Δv cost |
| Insurance | insurers (abstract) | launch customers | the vehicle's track record (02) |

A simple and robust model per market: a demand curve (quantity vs price) drifting with world state, AI suppliers with cost and capacity, and a clearing price each world tick. The player sets a price for their offer; the share they win depends on price and reputation. Show a **price history chart** per market (EVE's lesson).

### 2.3 Events

Seeded, mostly reactive rather than random:

- **Reactive**: an AI agency's rocket fails → launch prices rise, insurance on similar vehicles rises; you achieve a first → public interest in that body jumps, rivals announce competing programs; you leave debris in a crowded orbit → regulators propose a debris rule (pay or comply).
- **Natural**: solar storms (comms degradation, crew radiation warning, see 01); planetary conjunctions; meteor showers; launch windows opening (a transfer window to a planet is a real event the world can react to: everybody plans for it).
- **Political/economic**: budget cycles, a recession lowering commercial demand, a new customer sector appearing (e.g. "lunar tourism" appears after the first crewed landing).

Events read world state and write world state; there are no pure "you lose 10% funds" cards.

### 2.4 Procedural contracts that react to the world

Contracts are generated from **demand**, not from a template list:

1. A customer has a need (place a 2 t satellite in a sun-synchronous orbit; image a region weekly; relay a rover's data; rescue a stranded crew of a rival).
2. The need exists because of world state (that sector grew; a rival's relay failed; a public event happened).
3. The contract offers a price derived from the market (and from how many providers can do it).
4. The player can **bid** (price, deadline) against AI agencies for big contracts; small ones are first come, first served.
5. Completion changes the world (the customer's satellite now exists on the map, needs comms, may want a replacement in N years — **follow-on demand**).

This keeps KSP's "accept a job" simplicity while making each job a story with consequences. Hand-made **missions** (KSP2 style [G-KSP2-FS]) remain for the narrative backbone and tutorials.

### 2.5 Rival agencies

- They pursue programs (Moon, stations, network) with timelines that depend on their budgets and luck; they publish announcements ("Agency X targets a crewed lunar landing within 3 years").
- They compete for firsts (Mars Horizon's core loop [G-MH]); a first taken by a rival lowers the reputation reward for yours, but opens **cooperation** options.
- **Cooperation**: lease their relays, rent their launch slots, share a station, buy their data, rescue their crew (big reputation), join a LunaNet-like interoperable network (real precedent: cross-agency lunar comms standards [C-LUNANET]).
- Kept **cheap**: an AI agency is a state machine plus a few numbers per world tick; its spacecraft exist as on-rails objects only when they matter (targetable, leasable, visible).

### 2.6 Long-term progression

Phases that unlock naturally, each adding a new kind of decision:

1. **Sounding rockets and first orbit** (KSP's early game).
2. **Commercial orbit**: launch market, comms constellations, Earth-observation data.
3. **Moon**: relays, landers, a surface station; resource prospecting.
4. **Infrastructure**: depots, reusable vehicles, stations as businesses (labs, tourism).
5. **Planets**: transfer windows as major world events; long missions with delay.
6. **Colonies and logistics**: production chains, automated supply routes (KSP2 announced colonies and delivery routes as later milestones [G-KSP2-FS]; Kerbalism showed background resource simulation works off-screen [G-KBM-BG]).
7. **Interstellar / Universe mode** (`05`).

### 2.7 Colonies and logistics (later)

- **Sites** beyond the space centre (the UI concept's world hierarchy already allows more sites).
- **Production recipes** (ore → propellant) solved in background like Kerbalism's order-independent recipe solver [G-KBM-BG].
- **Supply routes**: record a successful delivery flight once, then repeat it automatically for a cost and time (KSP2's announced idea [G-KSP2-FS]); a route needs comms coverage for automated docking (ties to 01).
- **Δv as distance**: the trip planner's delta-v map (plan 034) becomes the logistics map; prices at a depot reflect the Δv to bring things there.

## 3. Simulation and determinism

- A **world tick** per in-game day (or per N hours) in the sim Worker, deterministic from the world seed and inputs. Warping 100 days = 100 world ticks, each a few microseconds to a millisecond: cheap.
- All world state is plain data in the save; events and contracts reference stable ids.
- AI agency decisions use the seeded PRNG; no wall clock.
- **Moddable**: markets, customers, event types and AI personalities are registry entries; a mod can add a mining economy or a political system without changing core.

## 4. Readability

- **News feed** in Mission Center (rivals' launches, market moves, events) with links to the map.
- **World dashboard**: price charts, market shares, public interest by topic, rival progress (like EVE's monthly report, in-game [G-EVE-MER]).
- Every number change has a cause shown on hover ("launch price +12%: Agency Y failure on day 340").

## 5. Open decisions

1. How many AI agencies, and do they launch visible objects into the shared world?
2. Bidding on contracts, or KSP-style accept-only?
3. Government vs commercial agency at world creation (see 02).
4. When do colonies/logistics enter the roadmap (they are XL)?
