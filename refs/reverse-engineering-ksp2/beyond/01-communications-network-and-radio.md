# 01 — Communications network and radio

> Design proposal, research only. Sources are cited as `[ID]` and listed in [`00-sources.md`](00-sources.md). Nothing here is decided; the menu of choices is in [`07-recommendations.md`](07-recommendations.md).

## 0. Summary

KSP1's CommNet answers one question: *is this probe connected, yes or no?* RemoteTech adds light delay and pointing. Kerbalism adds data rates and queues. None of them lets the player **operate a network**: choose routes, share capacity between missions, sell service, or plan a constellation with real tools. The proposal is one model that answers three questions with one set of numbers:

1. **Can I talk?** (a link exists: line of sight plus enough signal)
2. **How fast?** (data rate from a link budget, not a fixed range)
3. **How late?** (light time plus queueing at every hop)

and then makes the *network itself* a thing the player builds, routes, maintains and sells. It is built in tiers so that tier 1 alone is already better than KSP1 CommNet and every later tier is optional.

**Strongest ideas** (detail below):

- **The link budget is the range.** Received power from transmit power, antenna gains and distance (the Friis relation [C-LB]) gives a data rate that falls smoothly with distance squared. No hard range number; a small dish far away is slow, not dead.
- **Routing is a game, not a hidden calculation.** Auto routes by default, Manual routes the player pins through chosen relays, and a contact timeline that shows when each link will exist over the next hours or days.
- **Store-and-forward with data queues.** Science and telemetry are data with a size; relays buffer it while no path exists, the way NASA's Delay/Disruption Tolerant Networking does [C-DTN].
- **Signal delay makes scripting matter.** Orbital already has a sandboxed script runner (`docs/architecture/scripting.md`). Under light delay, the on-board script is the "flight computer": an upload is a data transfer over the network.
- **The network is a business.** Ground stations and relays have capacity; AI agencies and contracts buy time on them; the player can also rent from others. NASA itself now buys ground-station time from commercial providers [C-NSN].

## 1. Prior art

The KSP wiki and forum were behind bot protection during this research, so KSP1 CommNet numbers come from search summaries quoting them (marked *summary* in `00-sources.md`); the companion KSP documents in `refs/reverse-engineering-ksp2/` are the authority for exact KSP behaviour.

### KSP1 CommNet (stock) [C-KSP-CN][C-KSP-CNF]

- **Range is a single number per antenna** ("power"). Two nodes connect if their distance is below √(P₁·P₂). Several antennas on one vessel combine with a diminishing exponent (most antennas 0.75), so n identical antennas give roughly n^0.75 of one.
- **Signal strength** is a smoothstep of how far inside the range the link is; strengths multiply along relay hops. Strength affects science transmission efficiency, not data rate in a physical sense.
- **Relay vs direct antennas**: only relay antennas forward other vessels' signals.
- **Ground**: the space-centre tracking station has three upgrade levels (very large power ratings); extra ground stations around the planet are a difficulty option.
- **Occlusion** by bodies breaks links; an unmanned probe without a path to a control source loses most control.
- **Signal delay** is not part of stock CommNet as far as could be confirmed.
- **What it does well:** dead simple, readable, and it made relay constellations a recognised early-game goal for players [C-STEAM-RELAY]. **What it lacks:** rates, queues, routing choices, capacity, cost, any reason to care *which* relay carries traffic.

### KSP2

No stock communications system beyond basic connection could be confirmed; the only KSP2 comms work found is a community mod (CommNext) that adds a configurable home range and a comms report window [C-COMMNEXT]. For KSP2 detail defer to the companion documents.

### RemoteTech (KSP1 mod) [C-RT][C-RT-OV]

- A connection is an unbroken chain of valid links to the space centre or a crewed **command station**; with several chains, the **shortest (least delay)** is used.
- A link needs line of sight (bodies as perfect spheres), range, and for dishes, **targeting**. Dish targets: a vessel, mission control, the active vessel, or a **body (cone mode**, everything within the cone around the body).
- **Signal delay** by light time (optional) and a **flight computer** that queues timed commands to execute during delay or blackout.
- Range models: "standard" (the shorter antenna limits the link) and an optional "root" model similar to CommNet's.
- **Lesson:** targeting and delay add real planning; but manual dish targeting of every pair was tedious for many players, so targeting must have good defaults (auto-target "home" and "nearest relay").

### Kerbalism (KSP1 mod) [C-KBM-SIG][C-KBM-SCI][C-KBM-WIKI]

- **Data rate** depends on antenna and distance (fast near home, very slow deep space); combining antennas extends range more than rate.
- Science is **files on a drive**; flagged files transmit over time, **also while the vessel is unloaded**, taking seconds to months. Samples cannot be transmitted.
- Transmission costs electric charge; control loss is configurable (none / limited / full).
- **Lesson:** turning science into data volume makes *bandwidth* matter, which is what gives relays and big dishes a purpose beyond "on/off".

### Real networks

- **NASA Deep Space Network**: three complexes about 120° apart in longitude (Goldstone, Madrid, Canberra) so a spacecraft setting at one rises at the next; each has a 70 m dish and several 34 m dishes; S, X and Ka bands. NASA's Inspector General found it **oversubscribed**, and scheduling is laborious [C-DSN][C-DSN-NASA]. Antenna time as a contested resource is directly usable gameplay.
- **Voyager** returns science at about 160 b/s and needs a 70 m dish to do so (secondary sources) [C-VOY]: the extreme end of a link budget.
- **TDRS**: geostationary relays (three primaries plus spares) that raise contact time for low-orbit spacecraft such as Hubble and the ISS; a coverage gap was closed by adding a satellite and a ground station [C-TDRS]. NASA stopped offering TDRS in its Near Space Network catalogue in November 2024 and now buys commercial ground-station and relay services [C-NSN].
- **Link budgets**: received power = transmit power + gains − losses − free-space path loss (20·log₁₀(4πd/λ)) [C-LB][C-LB-PAPER]. This is the physics tier 2 uses.
- **Light time**: Mars is about 4 to 24 minutes one way depending on geometry [C-ESA-LT].
- **Solar conjunction**: the Sun's corona corrupts radio near the line of sight; Mars missions stop commanding for about two weeks and run autonomously, then orbiters relay the stored data [C-SC][C-MCJ].
- **Delay/Disruption Tolerant Networking**: the Bundle Protocol stores bundles at nodes until the next hop is available ("store-and-forward", with custody transfer so the sender can free its buffer); **Contact Graph Routing** runs a time-aware shortest-path over a plan of scheduled contacts to find the earliest delivery [C-DTN][C-CGR].
- **Starlink** uses thousands of optical inter-satellite links (reported at about 42 PB/day in early 2024; secondary sources) [C-STARLINK]: a reference for a late-game laser mesh.
- **LunaNet / Moonlight**: NASA, ESA and JAXA's "network of cooperating networks" for the Moon, with an interoperability spec so different agencies' relays can serve each other's users [C-LUNANET]. This is the real-world template for leasing and interconnecting player and AI networks.
- **Spectrum**: ITU-R records frequency assignments and coordinates interference between operators [C-ITU]; the template for tier 5.

### Other games

- **Space Engineers** [C-SE-ANT][C-SE-LASER]: radio antennas broadcast in a settable radius (power grows with radius, and a bigger radius makes you visible to others); overlapping friendly antennas relay automatically. **Laser antennas** need line of sight, are paired manually and cost power that grows with distance. Clean tradeoff: *radio = easy, visible, short; laser = precise, private, power-hungry.*
- **Factorio logistic network** [C-FAC-LOG]: networks form when coverage zones touch, and zones are drawn on the map, so connectivity is legible at a glance.
- **Satisfactory power lines** [C-SAT-POWER]: a hard cap of connections per pole is a simple planning constraint; but only grid totals are shown, not per-line flow, which is a readability gap to avoid.
- **Mini Metro** [C-MM]: network building under growing demand with scarce connectors; transit-map style visuals and pausing to edit make a complex network easy to read.
- **NASA NetworKing** [C-NETWORKING]: a free NASA game in which you manage a space communications network for science missions, balancing customer requirements, research, repairs and budget. Proof the "network operator" fantasy works as a whole game.

### What nobody has combined

No space game found combines: physical link budgets → data rates, a routing graph the player can steer, data queues with store-and-forward, capacity as a scarce shared resource, and an economy in which networks are built, leased and sold. That combination is the opportunity.

## 2. Design goals

1. **Readable first.** The player must see *why* a link is good or bad: one tooltip with a link-budget "waterfall" (each term in dB), one colour per link quality on the map.
2. **One model, many uses.** The same link computation serves probe control, science transmission, crew voice, contracts, the economy and Universe mode.
3. **Physical but tunable.** Real formulas, with a per-world "comms realism" setting that scales distances and switches off delay, interference, weather.
4. **Cheap and deterministic.** A few hundred nodes, recomputed on a coarse cadence in the sim Worker, identical results for the same save.
5. **Moddable.** Antennas, bands, ground stations, routing policies and data products are registry entries a mod can add (`docs/architecture/plugin-system.md`).

## 3. The model in tiers

Each tier is shippable on its own. Tiers 1–3 are the core; 4–6 deepen it.

### Tier 1 — Antennas, line of sight, connection

**Nodes.** Anything with a comms module: vessels, ground stations (body-fixed sites, rotating with their planet like surface-rails vessels already do), and later surface bases and suits.

**Antenna data** (part module config, plain data):

| Field | Meaning | Example |
|---|---|---|
| `band` | frequency band id (registry) | `stock.s-band`, `stock.x-band`, `stock.ka-band`, `stock.uhf`, `stock.optical` |
| `power` | transmit power, W | 5–500 |
| `kind` | `omni` / `dish` / `phased` / `laser` | |
| `diameter` | for dishes, m (gain and beamwidth derive from it) | 0.5–3 on vessels, 10–70 on ground |
| `relay` | can forward traffic for others | bool |
| `storage` | buffer for store-and-forward, MB | 0 for none |
| `electric` | power draw while transmitting, W | |

**Visibility.** A link needs line of sight: the segment between two nodes must not cross any body sphere (plus, near the surface, the terrain height function the sim already shares with the renderer, ADR 0043). This is a segment–sphere test per body, cheap and exact. Planet rotation matters automatically because ground stations are body-fixed.

**Connected.** Tier 1 alone is "a path exists to a control centre with every link above the minimum rate". Probe control has three states, visible on the HUD: **full**, **partial** (low rate: SAS and staging only, no fine throttle; or scripts only), **none** (only the running on-board script continues). The existing plasma-blackout level (ADR 0079) becomes a real link loss in this tier.

### Tier 2 — Link budget and data rates

Each link computes, per direction:

- **Gain** of a dish from its diameter and wavelength, gain ≈ efficiency × (πD/λ)²; beamwidth ≈ 70 λ/D degrees. Omni antennas have about 0 dBi and no pointing. Bigger dish = more gain but narrower beam = must be pointed (tier 3).
- **Received power** by Friis: P_r = P_t G_t G_r (λ / 4πd)² [C-LB].
- **Noise** from the receiver's system temperature (a ground station's cryogenic receiver is quiet, a small probe's is not), plus the Sun when it is near the line of sight (solar conjunction, see failure modes) [C-SC][C-MCJ].
- **Data rate** from signal-to-noise, rounded down to a ladder of discrete rates (for example 10 b/s … 100 Mb/s) so numbers are stable and readable. A rate is roughly proportional to P_t G_t G_r / d²: double the distance, a quarter of the rate.

Worked example at real scale (X band, 8.4 GHz): a 1 m probe dish at 20 W talking to a 34 m ground dish at Mars's average distance gives on the order of 100 kb/s; the same probe at the Moon's distance would be thousands of times faster. That spread is the gameplay: *where you put relays changes what science you can return*.

**Game scale.** Orbital's home planet is Kerbin-scale (`docs/product/spec.md` §8). Real link budgets at those small distances are absurdly generous, so a world has a single **comms scale** factor applied to distance in the path-loss term (like KSP1's range modifier difficulty option). Mods that ship real-scale systems set it to 1.

**Bands** are registry entries with wavelength, typical noise, rain-fade sensitivity and the parts that can use them. A link requires both ends to share a band. Suggested stock set: UHF (proximity, suits, landers), S (general, wide beams), X (deep space), Ka (high rate, weather-sensitive at ground stations), optical (very high rate, needs precise pointing and clear sky).

### Tier 3 — Pointing, routing graph, latency

**Pointing.** Dishes point at a *target*: a body (covers everything in a cone around it, like RemoteTech's cone mode), a specific node, or "active vessel". The beamwidth decides whether a second node is also inside the cone. Phased arrays (later tech) can hold several links at once with less gain. Lasers point at one node, need tight attitude and are blocked by clouds at ground stations.

**Routing graph.** Nodes and links form a graph. Each link has a **rate** (tier 2) and a **latency** (distance / c plus a per-hop processing delay). Per traffic flow (a vessel to its control centre, a science upload, a contract customer) the router chooses a path:

- **Auto** — maximise the bottleneck rate, then minimise latency; ties broken by node id so results are deterministic.
- **Manual** — the player pins a path (A → relay 3 → relay 7 → ground station B). If a pinned link drops, the flow falls back to Auto or waits, by a per-route choice.
- **Policy** — a rule set instead of a path: "own network only", "avoid leased nodes", "lowest cost", "lowest latency".

**Capacity sharing.** A relay's rate is shared among the flows that cross it. With few flows, a proportional share is enough (fair share at each link, computed once per network update). This is the step that turns routing into a real decision: a big science dump through the only lunar relay slows the lander's control link unless priorities say otherwise (tier 4).

**Latency and delay.** Light time is shown everywhere a command is sent. A world setting chooses how delay applies to control:

- **Off** (default for Sandbox): delay shown but not enforced, like KSP1 CommNet's default.
- **Enforced**: manual inputs arrive after the round trip; the HUD shows "command in flight" ghosts.
- **Flight computer**: inputs become timed commands (`at T+…`); the on-board script runner (QuickJS, already exists) runs autonomously. Uploading a script is itself a data transfer over the route.

### Tier 4 — Data, queues, store-and-forward, priority

Today science in KSP is a number. Here every producer creates **data packets** (sizes in MB): experiment results, images, telemetry, crew voice, video. Each node has a queue and storage.

- **Queues per priority class**: `command` > `telemetry` > `voice` > `science` > `bulk`. The player can reorder; contracts may require a minimum class.
- **Store-and-forward.** If no complete path exists, a relay with storage keeps the bundle and forwards it when the next contact opens. This is exactly the Delay/Disruption Tolerant Networking idea (bundles held in custody at nodes) [C-DTN], and it lets a polar orbiter collect lander data on one pass and dump it over a ground station on another.
- **Contact plan.** Because rails orbits are deterministic, future link windows can be predicted (contact graph routing [C-CGR]). The UI shows a **contact timeline**: for each link, bars of when it will exist over the next N orbits, and an estimate of when a queued file will arrive.
- **Data value over time.** Some data loses value if late (weather imaging for a customer), some only needs to arrive eventually (survey maps). See `04-science-beyond-ksp.md`.

### Tier 5 — Channels, interference, encryption

Optional depth for players who want spectrum planning; off in Sandbox by default.

- **Channels.** Each band has a few channels. Two transmitters on the same channel whose beams both reach one receiver add noise for each other. A ground station can listen on a limited number of channels at once.
- **Licences.** In Career a band/channel at a ground station costs an allocation fee and has to be "filed" before use, a light echo of how the ITU records frequency assignments and coordinates interference between operators [C-ITU]. AI agencies hold channels too, so crowding near the home planet emerges over time.
- **Encryption and integrity.** A link can be marked *secure*: a few percent of rate overhead and a small power cost. Some customers (`03-world-and-economy-dynamics.md`) require it; unsecured links can be "listened to" by rival agencies, which leaks your discoveries before you publish (`04-science-beyond-ksp.md`).

### Tier 6 — Crew and suit radios, voice, broadcast

- **Suit radio** (UHF, very low power): an EVA crew member talks through the lander or rover, which relays. Walking behind a ridge (terrain occlusion) loses the link; the crew panel shows the signal bar (`refs/space-orbital-program-ui/docs/CONCEPT.md` §4 already sketches this).
- **Crew skill.** A "radio" stat (already in the UI concept's astronaut profile) reduces the minimum usable signal for voice and repairs antennas faster.
- **Broadcast.** A *live* event (first landing, first EVA on a new body) watched at home raises reputation more than a recorded one. Live needs a video-rate link at that moment. This ties the engineer's network to the director's reputation in a way players will remember.
- **Listening.** A large ground dish can be pointed at the sky for **radio astronomy** (science from natural sources) or to pick up signals from AI agencies' probes (and, in Universe mode or mod content, anomalies).

## 4. Failure modes

| Failure | Cause | Player response |
|---|---|---|
| Occlusion | body or terrain between nodes | more relays, higher orbits, ground stations elsewhere |
| Plasma blackout | re-entry heating flux (ADR 0079) | plan for it, pre-load timed commands |
| Solar conjunction | Sun near the line of sight raises noise; real Mars missions stop commanding for about two weeks [C-MCJ] | relay off the Sun line, accept a quiet period |
| Weather fade | rain/clouds on Ka/optical at a ground station | second station, lower band backup |
| Power | not enough electric charge to transmit | batteries, solar, schedule transmissions |
| Antenna damage | heat, impact, deploy failure (reliability model, `02-player-roles-and-fantasies.md`) | redundancy, repair EVA |
| Pointing loss | SAS off, tumbling, dish target lost | attitude hold, omni fallback |
| Congestion | too many flows through one relay | priorities, more capacity |
| Interference | channel overlap (tier 5) | re-plan channels |
| Ground station outage | maintenance, events, a lease ending | redundancy, contracts |
| Space weather | solar storm event degrades links for hours | warning from a solar monitor satellite, an actual reason to build one |

## 5. Gameplay ties

- **Probe control:** three control states (tier 1) and delay modes (tier 3).
- **Science:** data volume × rate = time; queues decide what arrives first. Recovering the physical sample is still the high-value path, transmission the fast one.
- **Contracts:** "provide 90% coverage of the Moon's south pole for 30 days", "relay a customer's lander data within 6 h of capture", "keep a channel free for a partner", "install a ground station at latitude X".
- **Economy:** ground stations and relays as assets with upkeep; **leasing** capacity to AI agencies and contract customers (income per MB or per contact hour); renting other agencies' networks before you have your own. The real world now works this way: NASA's Near Space Network buys direct-to-Earth service from commercial ground-station operators [C-NSN].
- **Roles:** the *operator* fantasy (`02`) lives here: scheduling passes, juggling queues, keeping the lander link alive during a science dump.
- **Universe mode:** link budgets work unchanged in any system the player builds; a wide binary star system has very different conjunction behaviour.

## 6. UI ideas

The UI concept already reserves a **Comms** tab in the vessel panel (route Auto/Manual, endpoints, channels, on-board transmitters) and a **Network** layer on the map and in Mission Center (`refs/space-orbital-program-ui/docs/{CONCEPT,SCREENS}.md`). Add:

1. **Network layer**: links as lines coloured by rate (log scale), dashed when predicted, animated packets sparsely along active routes (borrowing the readability of transit-map games such as Mini Metro: few colours, simple geometry, pause to edit [C-MM]).
2. **Link inspector**: the link-budget waterfall in dB (power, gains, path loss, noise, margin) with one "what would fix this" hint (bigger dish, closer relay, higher band).
3. **Route editor**: click nodes in order to pin a Manual route; drag a route onto another relay to reroute.
4. **Contact timeline**: Gantt bars per link and per flow for the next hours/orbits; queued files with predicted arrival times. Warp-to-next-contact button.
5. **Coverage map**: a heatmap over a body's surface of "fraction of time connected" and "average rate", for a planned or real constellation.
6. **Constellation planner**: choose body, N satellites, altitude, inclination; it shows coverage and gives the **resonant deploy orbit** (period (N−1)/N or (N+1)/N of the target, so one carrier drops one satellite per pass evenly spaced). This is the single most-requested tool in KSP relay play.
7. **Queue panel**: per node, the data waiting, by class, with drag to reprioritise.

## 7. Simulation cost and determinism (browser)

- **Size.** A heavy save may have 50–300 nodes. All-pairs visibility is N²/2 segment–sphere tests × bodies: 300 nodes, 10 bodies ≈ 450 000 cheap tests. At one network update per simulated second (not per physics step) that is a small fraction of the Worker's budget; with a spatial cull (only pairs whose band and range could close) far less.
- **Cadence.** Links change slowly. Recompute on a timer (e.g. every 1 s of sim time at warp 1) and on events (staging, antenna toggled, SOI change). Under time warp, sample at most every K seconds of sim time and **find link up/down times by bisection**, reusing the approach the sim already uses for SOI crossings (`kepler.findCrossing`, `docs/architecture/simulation.md`).
- **Routing.** Widest-path / shortest-path on a few hundred nodes is microseconds. Capacity sharing by a fixed number of rounds of proportional allocation keeps the cost bounded.
- **Determinism.** Plain float64 arithmetic in the sim Worker, nodes iterated in id order, ties broken by id, so the same save gives the same network. Cross-machine determinism is already not a goal (`simulation.md`), so trig differences between JS engines are acceptable.
- **Save.** Queues, pinned routes, licences and stored bundles are world state and go into `SimSave` with a format bump, as the save rules require.
- **Off-thread UI.** The coverage heatmap and contact timeline are planning tools; compute them in a separate Worker from snapshots, never inside `step`.

## 8. How mods extend it

- **Registries:** `bands`, `antennas` (as module configs), `ground-stations` (body + lat/lon + dishes), `data-kinds` (size, value curve, priority), `routing-policies` (a pure function over the graph; trusted mod code like any mod).
- **Events** (typed via `EventMap` augmentation): `comms:link-up`, `comms:link-down`, `comms:control-changed`, `comms:data-delivered`, `comms:interference`.
- **Hooks:** a module can add a loss term (e.g. a mod's ionosphere or an alien jammer) through a declared `linkModifier`, so the inspector can still show every term by name.
- **Scripts:** `ship.comms` (control state, delay, route, queue) and commands to queue/prioritise data; uploads respect delay.
- **Universe mode:** a mod star system ships its ground stations and default bands with it.

## 9. Open decisions for the human

1. Default delay mode per game mode (off / enforced / flight computer).
2. Comms scale factor for the stock system (how "big" space feels for radios).
3. Whether tier 5 (channels, licences, interference) belongs in stock or in a mod.
4. Whether data is always packets (tier 4) or KSP-style instant science stays as the default with packets as an option.
5. Whether rivals can intercept unsecured data (fun but adds an adversarial layer).
