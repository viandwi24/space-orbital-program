# 07 — Economy and career

The economy turns "can I build it?" into "can I *afford* it, and is it worth it?". **[KSP1]** Career runs on three currencies: **Funds** (money for parts, launches, upgrades, crew), **Reputation** (standing, which shapes contract quality) and **Science** (tech-tree progress), with conversions between them through Administration strategies. **[KSP2]** dropped money entirely. Exploration mode has **Science as its only currency**, and the developers' plan for a deeper economy was resource-based (colonies), not funds-based, and it never shipped. For Orbital, whose goal includes making players feel like *investors*, this is the system where KSP1 gives the most to learn from, both good and bad.

> KSP2 status: EA Feb 2023, For Science! Dec 2023, last patch v0.2.2.0 Jun 2024. The studio was wound down in mid-2024 (see 01).

---

## 1. How it works

### 1.1 [KSP1] The three currencies

| Currency | Earned from | Spent on | Notes |
|---|---|---|---|
| **Funds** | Contract advances and rewards, milestone ("world first") rewards, vessel recovery, strategies (e.g. Patents Licensing) | Parts and propellant on every launch, facility upgrades and repairs, crew hiring, strategy setup costs, contract penalties | Starting funds by preset: 250,000 / 25,000 / 15,000 / 10,000 (Easy / Normal / Moderate / Hard) [S1] |
| **Reputation** | Contract and milestone rewards | Lost on contract failure, crew deaths, some strategies (e.g. Aggressive Negotiations costs reputation per launch) | Upper cap 1000. Contract gains shrink exponentially as reputation nears the cap, so the cap is never reached [S2][S3]. Community code reading gives a lower clamp of −1000 [S3] |
| **Science** | Experiments, recovered data, contracts | Tech-tree nodes in R&D | The only currency in Science mode. See 05 |

Difficulty multipliers (fixed at creation): funds and science rewards 200/100/90/60%, funds and reputation penalties 50/100/150/200% for Easy/Normal/Moderate/Hard, with an allowed range of 10–1000% [S1].

**Reputation's role:** higher reputation brings better contract offers (more three-star, higher-paying contracts) and is a requirement for some strategies [S3][S6]. I could not find a verified formula for how reward size scales with reputation. **Reputation decay:** no public source I reached documents a stock decay mechanic, so treat it as unverified.

### 1.2 [KSP1] Launch costs and recovery

- **Part cost includes contained resources.** A part's listed cost is its dry cost plus the value of its default propellant load. The launch cost is the sum over all parts at launch. Propellant is cheap compared to engines and structure, which is why recovering hardware matters more than saving fuel.
- **Recovery** (from the Tracking Station or by the "Recover" button after landing): the refund covers part dry value plus remaining resources, times a **distance factor** [S4][S5]:

| Landing location | Refund factor | Confidence |
|---|---|---|
| On the Launch Pad or Runway | 100% | Widely reported |
| Near KSC | ~98% | Community derivation |
| Farther away | Linear fall-off with great-circle distance from KSC | Community derivation |
| Opposite side of Kerbin | ~10% (floor) | Community derivation [S5]. A rival forum fit (0.98 − d/2150 km) conflicts with it [S4] |

  Stages dropped in the atmosphere are destroyed when they unload (beyond about 22.5 km physics range) and refund nothing. The popular **StageRecovery** mod refunds them with parachutes modelled, using the same linear model [S5].
- **Crew recovery** used to give reputation but no longer does [S2].

### 1.3 [KSP1] Contracts as income

Each contract has an **advance** (paid on accept), a **reward** (on completion) and a **penalty** (on failure or cancellation), each in funds, reputation and/or science. All are scaled by the difficulty multipliers and by the target body's difficulty [S1]. The number of active contracts is gated by the Mission Control level (see 02 and 06). Milestone ("world first") records pay once per achievement.

### 1.4 [KSP1] Facility upgrades as the main money sink

Building levels cost from about 75,000 (Launch Pad/Runway L2) up to more than a million (VAB L3 per one wiki excerpt), and the figures vary by version. See the table in 02-space-center-and-buildings.md.

### 1.5 [KSP1] Strategies (Administration building)

A strategy diverts a **commitment percentage** of income in one currency into another, or trades a cost for a bonus. Activating one needs a **setup cost** (funds, reputation and/or science) and, for most, a minimum reputation that scales with commitment. The exchange rates are lossy by design [S6][S7]. The Administration level caps the number of strategies and the commitment: **1 / 3 / 5 strategies at 25% / 60% / 100% max commitment** [S7].

As of 1.12 there are **11 strategies** [S7]. The well-known ones:

| Strategy | Effect (summarised) | Community verdict |
|---|---|---|
| **Unpaid Research Program** | Reputation gains → Science | Reported bug (2022): it subtracts reputation instead of only diverting gains [S8] |
| **Outsourced R&D** | Funds → Science | Called overpowered before 1.0; the 1.0 rebalance made its rate poor [S6] |
| **Patents Licensing** | Science → Funds | Often seen as the strongest money maker [S6] |
| **Aggressive Negotiations** | Cheaper launches (lower part costs) but reputation loss on every launch | Wiki example: about −438 reputation minimum at 5% commitment [S7] |
| **Fundraising Campaign / Appreciation Campaign** | Reputation ↔ funds conversions | — |
| **Bail-out Grant** | One-off funds for reputation | — |
| **Recovery Transponder Fitting**, **Open Source Tech Program**, **Research Rights Sell-Out**, **Leadership Initiative** | Recovery value, part-unlock cost, science→funds, crew XP variants | Exact numbers not verified |

*Names of the last group are from general knowledge of the stock list and were not checked against a fetched table. Effects are summarised, and the setup-cost table was not retrieved.*

### 1.6 [KSP1] Crew hiring costs

Hiring cost rises with every kerbal already employed. The wiki-cited formula **150·n² + 12,350·n** (n = number of hires, starting from the four default crew) has been **disputed by players whose observed prices did not match**. Players reported about 209k for the 50th kerbal on default settings. Values appear to have changed across versions [S9]. There are no salaries in stock (see 08).

### 1.7 [KSP2] No money: Science-only Exploration

- **Shipped:** Exploration mode (Dec 2023) has **Science** as its only currency. Science comes from experiment parts and, above all, from **missions**. Players reported experiments paying ~200–300 science against ~4,000 for missions, which makes missions the main source of progress [S11]. Science buys nodes in a 4-tier tech tree. A pre-release forum analysis estimated ~152,080 science to complete the tree, about 8× KSP1's, with geometric cost growth meant to push exploration over grinding one biome [S11].
- **No funds, no reputation, no part costs, no recovery value, no building upgrades, no hiring, no strategies.** Launching is free, and only the tech tree limits what you can build.
- **Designed:** creative director Nate Simpson said in 2023 that the career-equivalent would drop currency, with resources replacing it. The plan was that colonies extract and process resources, and new resources unlock new technology [S10].
- **[KSP2 roadmap — never shipped]:** resource gathering, colony logistics and resource-gated tech (see 11). Development ended before any of it was implemented.

---

## 2. Player experience

- **[KSP1] Early Career** is tight and tense: 25k funds, 18 t pads and cheap contracts force clever, cheap rockets and make recovery worth chasing. Many players remember this as the best part of Career.
- **Mid-game the economy breaks.** Players report a few flybys in the Kerbin system leaving them with over a million funds and every building maxed, without ever landing beyond the home system [S12]. After that, money stops mattering and Career becomes Science mode with extra paperwork.
- Contracts become a **chore list**: repeated part tests, rescues and tourist runs. Tourism contracts flood the offer list and push out interesting work [S12][S13].
- Strategies are opaque. Lossy conversions with unclear numbers mean most players ignore Administration or use one "exploit" strategy.
- **[KSP2]** Exploration feels like a guided tour: missions point you at destinations and the science payout is generous. With no costs, though, there is no tension in design choices. Reusability, cheapness and efficiency carry no weight, and many players named the missing career/money layer as a top complaint [S11].

## 3. Interactions with other systems

- Game mode decides whether funds and reputation exist; reward and penalty multipliers come from difficulty: 01-game-structure-and-modes.md.
- Upgrade and repair costs are the main sink: 02-space-center-and-buildings.md.
- Part cost and recovery shape design (reusability, cheap boosters): 03-vehicle-assembly.md, 04-flight-and-controls.md.
- Science as a currency, tech-node costs, and Outsourced R&D / Patents Licensing as cross-currency links: 05-science-and-research.md.
- Contracts and milestones are the income source: 06-missions-contracts-achievements.md.
- Hiring costs, crew death costing reputation: 08-crew.md.
- Relay networks as investments (in KSP1, CommNet contracts pay for relay placement): 09-communications-network.md.
- Resources as the planned KSP2 economy: 11-colonies-resources-interstellar.md.
- Economy mods (Strategia, Contract Configurator, KCT, RP-1): 12-modding.md.
- Overall reception: 14-strengths-weaknesses-and-player-feedback.md.

## 4. Known problems / criticism

1. **[KSP1] Runaway funds.** Income grows faster than costs, and once the buildings are maxed there is nothing to spend on [S12].
2. **[KSP1] Contract spam and repetition**: tourists, part tests, randomly generated busywork. Players asked for hand-made progression contracts modelled on the space race [S12][S13].
3. **[KSP1] Science reward imbalance**: tiny rewards for hard early contracts, while repeated biome-hopping pays a lot [S12].
4. **[KSP1] Strategies are lossy, opaque and buggy**: Unpaid Research bug, Outsourced R&D swinging from overpowered to useless [S6][S8].
5. **[KSP1] Reputation is vague**: the effect on contracts is not shown, gains diminish near the cap, and the role of decay is unclear [S2][S3].
6. **[KSP1] Recovery is all-or-nothing** for staged boosters without mods.
7. **[KSP2] No economy at all**, so no reason to be efficient or reuse hardware. The resource economy that was meant to replace money never shipped [S10].
8. **[KSP2] Mission-dominated science**: experiments pay so little next to missions that the free-exploration fantasy weakens [S11].

**What the community built to fix KSP1 Career:**
- **Contract Configurator**: a framework, useless alone, that powers contract packs (e.g. Anomaly Surveyor, and even a pack recreating KSP2's For Science! missions in KSP1). It often breaks on game updates [S14].
- **Strategia** (nightingale): replaces every stock strategy with milestone-driven strategies that pay advance cash and bonuses for high-level objectives. ReStrategia is a later rewrite [S15].
- **Kerbal Construction Time (KCT)**: vessels take *time* to build; it also handles facility upgrades and research over time. That adds an "investment over time" dimension [S16].
- **RP-1** (Realism Overhaul career): programs with funding over time, Administration "program slots", hand-tuned contracts built on Contract Configurator [S17].
- **Contract Reward Modifier**, **StageRecovery**: rebalance payouts and refund dropped stages [S14][S5].

## 5. Implications for Orbital

Orbital's World already plans funds, science, reputation, tech, contracts and strategies. The aim is for players to feel like scientists, engineers *and investors*.

1. **Adopt** the three-currency model (Funds / Science / Reputation). Players understand it, and it maps onto the three fantasies: investor / scientist / public standing.
2. **Avoid** KSP2's zero-cost model in Career. Without costs, design efficiency, reuse and risk mean nothing. Keep Science mode as the "no money" option instead.
3. **Adopt** "part cost = dry + resources" and **launch cost = sum of parts**. They are simple and transparent. Show **cost per stage and cost per tonne to orbit** in the Hangar stats strip.
4. **Improve** recovery: use a *physically simulated* recovery (parachute or propulsive landing in a deterministic sim) so that any stage can be recovered, not only the active vessel. Refund = part condition × distance/logistics factor. Show the formula in the UI, and keep KSP1's 100% at the pad and runway.
5. **Improve** against runaway funds with **ongoing costs**: facility upkeep, crew salaries and contract deadlines, so income has to keep pace (as RP-1 does) instead of piling up. Make upkeep a difficulty multiplier.
6. **Improve** the investor fantasy with **investments that pay over time** instead of instant lossy conversions: fund a research program (science per day), sign a launch-services deal (funds per launch for a commitment), build a relay that leases bandwidth. Build these on the deterministic clock.
7. **Adopt** Administration strategies, but **avoid** opaque lossy rates. Every strategy shows its exact exchange rate, its cap and a projected effect over the next N days. Strategies should be data-defined in the mod SDK, as Strategia showed demand for.
8. **Improve** reputation: make it a visible meter with documented effects (contract tier unlocks, sponsor offers, crew applicant quality), mild **decay toward a baseline**, and diminishing gains near the cap, all with the numbers shown.
9. **Adopt** KSP1's difficulty multipliers (10–1000% for rewards and penalties, preset starting funds of 250k/25k/15k/10k as a reference) as World economy settings (see 01).
10. **Improve** contracts (see 06): generate fewer, better contracts, mix hand-authored *program arcs* with procedural filler, and cap repeat types like tourism so they cannot flood the board. Build a **contract DSL in the SDK**, as Contract Configurator proved demand for one.
11. **Adopt** optional **build time** (KCT-style) as a World rule. It turns money into money *and* time, adds pacing, and makes facility throughput upgrades worth buying.
12. **Improve** on KSP2's never-shipped plan by designing **resources as a second economic layer now**: in-situ resources at future Sites can replace funds-bought propellant and parts. This bridges into 11 without needing colonies on day one.
13. **Adopt** a transparent **hiring cost curve** with a published formula (KSP1's quadratic shape is fine), and **avoid** KSP1's undocumented and version-drifting values.
14. **Improve** with an **economy ledger** in the Mission Center: income and expenses by category over time, so the investor role has data to act on. This fits the concept's "numbers first" UI.

---

## Sources

- [S1] KSP Wiki — "Game Difficulty". https://wiki.kerbalspaceprogram.com/wiki/Game_Difficulty — checked 2026-10-17 — official community wiki (via search excerpt; direct fetch blocked).
- [S2] KSP Wiki — "Reputation". https://wiki.kerbalspaceprogram.com/wiki/Reputation — checked 2026-10-17 — official community wiki (via search excerpt).
- [S3] KSP Forum — "Reputation - What does it do?" / Steam "Reputation frustration". https://forum.kerbalspaceprogram.com/topic/86786-reputation-what-does-it-do/ ; https://steamcommunity.com/app/220200/discussions/0/537402115072571924/ — checked 2026-10-17 — forum posts (community analysis).
- [S4] KSP Forum — "Recovery Factor". https://forum.kerbalspaceprogram.com/topic/152368-recovery-factor/ — checked 2026-10-17 — forum post (2016 community derivation).
- [S5] KSP Forum — "Part Recovery Rates" (page 2); StageRecovery mod thread. https://forum.kerbalspaceprogram.com/topic/78051-part-recovery-rates/page/2/ ; https://forum.kerbalspaceprogram.com/topic/179306-112x-stagerecovery-recover-funds-from-dropped-stages/ — checked 2026-10-17 — forum posts / mod author.
- [S6] KSP Forum — "Isn't the outsource R&D ridiculously OP?"; Steam "Outsourced R&D". https://forum.kerbalspaceprogram.com/topic/87201-im-a-noob-but-isnt-the-outsource-rampd-ridiculously-op/ ; https://steamcommunity.com/app/220200/discussions/0/620712364023642983/ — checked 2026-10-17 — forum posts.
- [S7] KSP Wiki — "Strategies" and "Administration Building". https://wiki.kerbalspaceprogram.com/wiki/Strategies ; https://wiki.kerbalspaceprogram.com/wiki/Administration_Building — checked 2026-10-17 — official community wiki (via search excerpt).
- [S8] KSP Forum — "The 'Unpaid Research Program' strategy decreases reputation…". https://forum.kerbalspaceprogram.com/topic/206806-the-unpaid-research-program-strategy-decreases-reputation-instead-of-just-decreasing-reputation-gains-as-described/ — checked 2026-10-17 — forum bug report (2022).
- [S9] KSP Forum — "Kerbal hiring costs". https://forum.kerbalspaceprogram.com/topic/226209-kerbal-hiring-costs/ — checked 2026-10-17 — forum post (disputes the wiki formula).
- [S10] PC Gamer — "Kerbal Space Program director explains why 'colonies are going to change everything'". https://www.pcgamer.com/kerbal-space-program-director-explains-why-colonies-are-going-to-change-everything-lays-out-early-access-plans/ — checked 2026-10-17 — games press interview (2023, via search excerpt).
- [S11] KSP Forum — "KSP2 Tech tree and For Science! VAB (and analysis)"; Steam "Should I buy KSP 2?". https://forum.kerbalspaceprogram.com/topic/220160-ksp2-tech-tree-and-for-science-vab-and-analysis/ ; https://steamcommunity.com/app/954850/discussions/0/4033601393691441189/ — checked 2026-10-17 — forum analysis / player posts (anecdotal).
- [S12] AnandTech Forums — "The Kerbal Space Program (KSP) Thread"; Steam "Career Mode is Boring and Unbalanced". https://forums.anandtech.com/threads/the-kerbal-space-program-ksp-thread.2364657/post-37260471 ; https://steamcommunity.com/app/220200/discussions/0/215439774858561825/ — checked 2026-10-17 — forum posts (anecdotal).
- [S13] KSP Forum — "Overrun with space tourists - career mode lost!"; "Custom Contracts in Career Mode". https://forum.kerbalspaceprogram.com/topic/115818-overrun-with-space-tourists-career-mode-lost/ ; https://forum.kerbalspaceprogram.com/topic/181155-custom-contracts-in-career-mode/ — checked 2026-10-17 — forum posts.
- [S14] Contract Configurator forum thread; Contract Pack "KSP 2 For Science!" on SpaceDock; Contract Reward Modifier. https://forum.kerbalspaceprogram.com/topic/91625-1101-contract-configurator-v1305-2020-10-05/page/197 ; https://spacedock.info/mod/4398/Contract%20Pack:%20KSP%202%20'For%20Science!'%20(KSP%202%20Exploration%20Mode%20in%20KSP%201) ; https://spacedock.info/mod/132/Contract%20Reward%20Modifier — checked 2026-10-17 — mod author threads / mod pages.
- [S15] KSP Forum — "[1.8.x] Strategia"; CurseForge "ReStrategia". https://forum.kerbalspaceprogram.com/topic/131808-18x-strategia-v180-2019-10-22 ; https://www.curseforge.com/kerbal/ksp-mods/restrategia — checked 2026-10-17 — mod author thread / mod page.
- [S16] KSP Forum — "Kerbal Construction Time: Reconstructed" / "Is Kerbal Construction Time worth it?". https://forum.kerbalspaceprogram.com/topic/203641-wip-112-kerbal-construction-time-reconstructed-a-rewrite-of-kct ; https://forum.kerbalspaceprogram.com/topic/171169-is-kerbal-construction-time-worth-it — checked 2026-10-17 — mod author / forum posts.
- [S17] RP-1 Wiki — "Introduction and Overview". https://github.com/KSP-RO/RP-1/wiki/Introduction-and-Overview — checked 2026-10-17 — mod documentation (community).
