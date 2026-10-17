# 02 — Player roles and fantasies

> Design proposal, research only. Sources `[ID]` are in [`00-sources.md`](00-sources.md).

## 0. Idea

KSP gives one fantasy brilliantly: **the engineer-pilot** who builds a rocket and flies it. Everything else (science, money, crew) is a thin layer of currencies. The human wants a player who can *feel like* a scientist, an engineer, an investor/director, an operator and an explorer.

The proposal: **one world, five lenses.** The player is never forced to pick a class. Each role is a set of screens, decisions and rewards that touch the same shared world state (vessels, network, data, money, reputation). A player who loves design can let the auto-director handle money; a player who loves management can hire AI engineers and launch catalogue rockets. Each lens has:

- a **core decision** it owns,
- a **feedback loop** that makes the decision feel meaningful,
- an **automation fallback** so players who ignore it are not punished (a default policy or an NPC staffer),
- a **mastery ceiling** for players who dive in.

| Role | Core decision | Main screens | Fallback |
|---|---|---|---|
| Engineer | how to build it, how much margin | Hangar/VAB, test stand, reliability report | stock/catalogue designs |
| Scientist | what to measure, where, and what it means | Science archive, analysis desk, hypothesis board | auto-run experiments, auto-transmit |
| Director / investor | what to fund, which risks to take | Administration, markets, board meetings | balanced default strategy |
| Operator | when and how things happen | Mission Center, comms timeline, maneuver queue | auto-routing, auto-warp |
| Explorer | where to go next | Map, discovery log, survey layers | contracts point the way |
| Pilot (KSP's core, kept) | flying it | Flight HUD | autopilot scripts |

## 1. Prior art

- **KSP1 career**: funds, science and reputation since 0.24; contracts in three prestige tiers gated by reputation, with advances and penalties for declining or failing; **strategies** in the Administration building convert one currency into another, and some were notoriously exploitable [G-KSP-CON][G-KSP-STRAT][G-KSP-024]. Crew have three traits (pilot, engineer, scientist) and five levels earned through "firsts" at bodies [G-KSP-XP]. *Lesson:* role identity exists for crew but not for the player; currency conversion levers need caps.
- **KSP2 For Science!** (Dec 2023): science parts, primary/secondary **missions** instead of procedural contracts, a 4-tier tech tree, an R&D centre, discoverable points of interest; experiments produce **data** (transmittable) or **samples** (recovered) [G-KSP2-FS][G-KSP2-SCI].
- **Kerbalism**: reliability with MTBF per part, **quality** chosen in the editor (better MTBF, more cost and mass), malfunctions vs critical failures, inspection and repair by qualified crew, redundancy groups; science as files; background simulation of unloaded vessels by solving resource "recipes" order-independently [G-KBM-REL][G-KBM-SCI][G-KBM-BG]. *Lesson:* the engineer fantasy needs failures and margins, and they must work off-screen too.
- **Mars Horizon**: agency management in a historical space race against rival agencies; milestones as public "firsts"; success brings funding and good press, failure brings headlines; rewards testing uncrewed before crewed [G-MH][G-MH-ESA].
- **Juno: New Origins**: a career as an aerospace company earning money and tech; mixed hand-made and procedural contracts (reviews call them repetitive); Vizzy visual programming [G-JUNO][G-JUNO-REV].
- **Elite Dangerous**: exploration scanning that turns into sellable data, with a "first discovered by" tag credited to the first to *sell* the data [G-ED-EXPL]; a background simulation of factions [G-ED-BGS].
- **X4: Foundations**: player company with stations and trade rules inside a living NPC economy [G-X4].
- **EVE Online**: a player economy measured and published monthly (price indices, faucets and sinks) [G-EVE-MER].
- **Factorio**: labs consume produced science packs, so research becomes a logistics problem [G-FAC-RES]. (Dyson Sphere Program works similarly per community reports; not verified here.)
- **Stationeers**: an in-game MIPS-like chip scripts machines; automation as a craft [G-STAT-IC10].
- **NASA NetworKing**: the network manager as a whole game [C-NETWORKING].
- **Outer Wilds**: progress is knowledge only; the ship log maps what you know and what is still unexplored [G-OW].

## 2. The engineer

**Fantasy:** "I designed something that works, and I know *why* it works, and how close it was to not working."

Mechanics:

1. **Margins and tolerances.** Every part has rated limits (thrust, temperature, g-load, dynamic pressure, vibration later). The editor shows the design's predicted peak against each limit as a bar with margin (the current re-entry heating and `maxTemperature` already provide one). Flying near a limit is allowed; it raises failure probability.
2. **Reliability model** (Kerbalism-inspired, deterministic): each part model has a reliability that **improves with flight experience of that model** (flights flown, hours run, failures investigated). A new engine is 92% reliable; after 20 flights 99%. This is the most "real" engineering loop in spaceflight and nobody in the genre has done it as a core system. Failure draws use the seeded sim PRNG, so a replay repeats.
3. **Quality / build grade** per part instance: cost and mass vs reliability (Kerbalism's knob [G-KBM-REL]).
4. **Test campaigns.** A **test stand** at the space centre: static-fire an engine, shake-test a stage, thermal-vac a probe. Tests cost money and time, raise reliability data, and some contracts pay for tests (KSP1 had "test part X at situation Y" contracts; here the result feeds the model).
5. **Failure investigation.** After a failure, a short "anomaly report" screen: telemetry plot near the event, a probable cause from a short list, and a choice of fix (redesign = new model with reset experience but higher base; process fix = cost, keeps experience). This turns failure into story.
6. **Redundancy design**: group parts (two antennas, three engines), the editor computes mission success probability. Engine-out capability becomes visible.
7. **Design lineage**: designs have versions (Rocket A Mk1, Mk2); history shows changes and flight record. Ties to `06` (sharing).

## 3. The scientist

**Fantasy:** "I asked a question, chose the instrument, went to get the data, and found something no one knew." Full system in [`04-science-beyond-ksp.md`](04-science-beyond-ksp.md). Summary of the role:

- **Hypothesis board**: open questions about the world ("Does the moon have water ice at its poles?"), some seeded, some generated from data anomalies.
- **Instrument choice and observation planning** (coverage, resolution, timing, lighting).
- **Data products** at levels raw → calibrated → derived (mirroring NASA's processing levels [R-PDS]); analysis is done at the space centre or in a lab module.
- **Publication** for reputation, with priority (first to publish) and confirmation by independent data.
- Crew scientists improve on-site work; ground labs improve analysis speed.

## 4. The director / investor

**Fantasy:** "I run an agency (or a company), I bet on the right programs, and I outplay the market."

Mechanics (economy detail in [`03-world-and-economy-dynamics.md`](03-world-and-economy-dynamics.md)):

1. **Programs, not just contracts.** A program is a multi-year commitment ("Lunar surface program") with a budget line, milestones and a political/board deadline. Contracts are individual jobs within or outside programs.
2. **Funding sources by world type:** *government agency* (annual budget, depends on reputation and public interest; overspending is punished by the next budget), *commercial company* (revenue from launches, data, network leasing; investors want growth; you can raise capital by selling equity, which brings a board with demands), *hybrid*. The world creation dialog already has a mode and rules; agency type is a natural extra choice.
3. **Board / oversight events**: quarterly reviews with two or three questions and choices, consequences on budget and reputation. Cheap to build, strong role feeling.
4. **Portfolio of assets**: rockets in production (unit cost falls with production count, a learning curve), ground stations, relays, space stations, each with upkeep and revenue. A simple asset list with ROI.
5. **Markets**: launch market (your price vs AI competitors), data market (imagery, survey maps, science datasets), comms capacity market (leasing), later resources. Prices respond to supply and demand (`03`).
6. **Risk and insurance**: insure a launch (premium depends on the rocket's *track record*, linking the engineer's reliability work to the director's costs).
7. **Strategies with caps**: KSP1 strategies converted currencies and were exploitable [G-KSP-STRAT]; here strategies are *policies* (e.g. "reusable first", "science first", "cheap and many") that change multipliers within bounded ranges and cost upkeep.

## 5. The operator / mission control

**Fantasy:** "Ten things are in flight at once; I keep them all alive and on schedule."

- **Mission Center** (already in the UI concept) as the operator's home: tracking, upcoming events, contracts, crew.
- **Event timeline**: maneuvers, SOI changes, comms contacts, conjunctions, data deliveries, contract deadlines, crew rest. "Warp to next event" with safe stops; conflicts highlighted (two burns at once on different vessels).
- **Comms operations** (`01`): passes, queues, priorities, route pinning.
- **Scripts as procedures**: the existing QuickJS scripting becomes the operator's tool for *standard procedures* ("deorbit burn", "circularise", "deploy satellite N"), assignable to timeline events. With signal delay on, this is how far probes are flown.
- **Background operations**: unloaded vessels keep doing their jobs (Kerbalism's background simulation [G-KBM-BG]): experiments that run for days, transmitters emptying queues, solar power, life support later.
- **Crew operations**: rest, morale, EVA schedule (later; crew system is part of the companion foundation work).

## 6. The explorer

**Fantasy:** "I went somewhere nobody had been and saw something nobody had seen."

- **Fog of knowledge**: bodies start with coarse data (mass and orbit known from the ground; surface unknown). Surface maps, biome boundaries and points of interest appear as the player surveys them, at the resolution of the instruments used.
- **Discovery log** in the spirit of Outer Wilds' ship log: a web of things known, rumours (anomalies in data), and unexplored places marked [G-OW].
- **Naming rights and "first" credit** when a discovery is *published*, not when first seen (Elite's rule of crediting the first to turn in data creates a nice tension with comms and return) [G-ED-EXPL].
- **Procedural points of interest** (KSP2 has discoverables [G-KSP2-FS]): here they are tied to science (an anomaly in gravity data → a buried crater → a sample site).
- **Universe mode** (`05`) makes the explorer's world infinite: unknown systems, generated or shared.

## 7. How roles connect (the loop)

```
Director funds a program ──▶ Engineer designs & tests ──▶ Pilot/Operator flies
      ▲                                                        │
      │                                                        ▼
 Reputation, revenue ◀── Scientist publishes ◀── data over the network (Operator)
      ▲                         │
      └──── Explorer discovers ◀┘ (anomalies seed new questions & contracts)
```

Every arrow is a real data flow, not a currency conversion: money buys reliability and capacity; reliability lowers insurance and wins launch contracts; the network decides how fast data arrives; data quality decides publication value; discoveries create new markets and contracts.

## 8. Difficulty and role focus

- **World creation** offers a *focus* preset: "Agency director" (heavier economy, automated flight assistance), "Engineer" (reliability on, economy light), "Scientist" (science depth on), "Classic" (KSP-like). Presets just set rules; all can be changed.
- **Hire staff** to automate what you do not want to do: a flight director (auto-ops: auto routes, auto warp, auto procedures), a chief engineer (auto-design standard boosters from catalogue), a chief scientist (auto-analysis at slower speed). Staff are a money sink and a clean way to support different play styles.

## 9. Open decisions

1. Agency type at world creation (government / company / both)?
2. Reliability: stock and on by default in Career, or a world rule?
3. How much flight automation the director preset gives (fly-by-script launches from catalogue?).
4. Does the player have a persona (director character) or is the agency the identity?
