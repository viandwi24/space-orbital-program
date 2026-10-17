# 04 — Science beyond KSP

> Design proposal, research only. Sources `[ID]` are in [`00-sources.md`](00-sources.md).

## 0. Idea

In KSP, science is points: run an experiment in a new biome/situation, collect a number, spend it in the tech tree. Repeats are worth less until the subject is exhausted [G-KSP-SCI]. KSP2 For Science! keeps this shape, adding data vs samples and situation requirements [G-KSP2-SCI]. It is a **collection** loop, not a **discovery** loop. The player never learns anything about the world; the world never had anything to learn.

Proposal: **the world has hidden facts; instruments produce data about them; analysis turns data into knowledge; knowledge is published for reputation and unlocks.** Tech-tree points still exist (as "research funding" earned by publications and contracts), but the reward of science is *finding out*.

## 1. Prior art

- **KSP1**: value = base × situation/biome multiplier × a decaying factor per repeat; a cap per subject; transmitting is worth less than returning [G-KSP-SCI].
- **KSP2 For Science!**: data vs samples, transmission size per experiment, situation requirements, recovery awards everything onboard [G-KSP2-SCI][G-KSP2-FS].
- **Kerbalism**: data as files with sizes, transmitted over time, also in the background; samples must return or be processed in a lab into transmittable data [G-KBM-SCI].
- **NASA processing levels**: raw (level 0) → calibrated (1) → geophysical parameters (2) → mapped on grids (3); the older CODMAC scale (raw, edited, calibrated, resampled, derived); PDS4 now names them raw / processed / calibrated / derived [R-PDS][R-CODMAC].
- **Citizen science** (Galaxy Zoo / Zooniverse): many independent classifications combined into a confidence; consensus after a handful of volunteers for simple tasks, around 40 for Galaxy Zoo images [R-GZ][R-BITBYBIT].
- **Elite Dangerous**: scanning yields sellable data; better scans (mapping) are worth more; first to sell gets "discovered by" [G-ED-EXPL].
- **Outer Wilds**: progress is knowledge; the ship log shows the web of clues and the unexplored [G-OW].
- **Return of the Obra Dinn**: the player's deductions are confirmed in batches, preventing brute force [G-OBRA].

## 2. The model

### 2.1 Hidden world facts

Each body (stock or mod or Universe mode) has a set of **facts** generated from its definition and the world seed: core size, magnetic field strength, ice at the poles (where, how much), atmosphere composition, ancient crater ages, a buried anomaly, a subsurface ocean, ring particle composition, volcanic activity. Facts have **true values** the player never sees directly.

### 2.2 Instruments → observations

An instrument is a part module with:

- **what it measures** (fact kinds), **how** (remote vs in situ), **resolution vs distance** (an orbital camera's ground resolution scales with altitude), **coverage rate** (swath width × ground speed), **data rate** (MB/s produced), **noise** (measurement error), **constraints** (lighting, temperature, attitude, needs landed).

Running it produces **observations**: measured values with error bars, tagged with where, when and how. Observations are **data packets** (with size) that must get home through the network (`01`) or be recovered physically.

### 2.3 Data products and analysis

Mirroring real processing levels [R-PDS]:

| Level | What | Produced by |
|---|---|---|
| Raw | packets as received | the instrument |
| Calibrated | errors corrected, uncertainty quantified | ground analysis (time, a lab building upgrade) or an on-board lab |
| Derived | maps, profiles, models (a polar ice map, a gravity field) | combining many calibrated observations; coverage matters |
| Result | a claim with confidence ("ice at the south pole, 2–5%, 90% confidence") | analysis desk, the player's choice of claim |

**Analysis mini-games** (short, optional, auto-solvable by a hired chief scientist at lower quality):

1. **Spectrum fit**: drag reference lines (element signatures) onto a measured spectrum to identify composition.
2. **Map stitching / coverage**: see coverage gaps on a body map; plan another pass. (A planning tool more than a puzzle.)
3. **Signal from noise**: stack repeated observations to beat noise; the more data, the clearer the plot (makes bandwidth matter).
4. **Anomaly spotting**: a derived map shows something odd (a gravity spike, a thermal hotspot); mark it to create a **point of interest**.

### 2.4 Hypotheses and publishing

- **Hypothesis board**: open questions, from three sources: seeded per body ("Is there water ice?"), from anomalies the player marked, and from customers/contracts ("Institute X wants the moon's heat flow").
- **Claim**: the player picks a claim and a confidence; the claim's value depends on how strongly the data supports it. Overclaiming is possible; an overclaim later contradicted costs reputation. Underclaiming is safe but worth less. This creates a real scientific judgement call.
- **Peer review**: a published claim is checked by the world against the hidden truth with noise; a review outcome arrives after some days. Independent confirmation (a second instrument type, a second mission, or a rival's data) raises confidence. Batch validation in the Obra Dinn style [G-OBRA] avoids brute-forcing.
- **Priority**: the first to publish a result gets most of the reputation (rivals in `03` publish too). Holding data back to get a better result risks being scooped; an unsecured comms link may leak (`01` tier 5).
- **Rewards**: reputation, research funding (tech points), unlocks (a confirmed ice deposit enables mining contracts), public interest.

### 2.5 Data value over time

- **Decay**: commercial data (weather, imagery for a customer) loses value fast; latency matters (ties to comms priority).
- **Growth**: long baselines become more valuable over time (a 10-year climate record of a planet, magnetic field changes, a comet before and after perihelion).
- **Context growth**: old data gains value when a new discovery makes it relevant (re-analysis of an archive).
- **Exclusivity**: data sold exclusively to one customer is worth more but cannot be published.

### 2.6 Observation campaigns

A **campaign** is a planned set of observations with a goal: "map the moon's south pole at 10 m resolution", "measure the planet's gravity field to degree 10", "monitor the sun for 90 days". The campaign tool shows required coverage, which vessels/instruments can contribute, the expected data volume, and the comms capacity needed. Campaigns are the bridge between scientist, operator and engineer roles.

Natural ties:

- **Radio science**: the comms link itself is an instrument. Tracking the distance between two spacecraft maps a gravity field (NASA's GRAIL twins mapped the Moon this way with a Ka-band ranging link [R-GRAIL]); the bending of a radio signal passing through an atmosphere gives its temperature and pressure profile (radio occultation [R-RO]). A free instrument on every probe that rewards a good network, and a natural reason to fly two satellites in formation.
- **Radio astronomy** from big ground dishes (01, tier 6).
- **Sample return** remains the highest-quality path (labs at home can do all analysis levels).

### 2.7 Keeping KSP's simple layer

For players who do not want depth: experiments still give immediate "science points" on the first run in a situation (like KSP), and the derived/claim layer is optional. A world rule "science depth: classic / discovery" chooses the default.

## 3. Determinism and cost

- Hidden facts and measurement noise come from the world seed and the observation's parameters (hash-based noise), so the same observation in the same world gives the same data.
- Data products are small numeric arrays (coverage grids per body, e.g. 64×32 cells per layer); analysis is UI-side math on snapshots, not in `step`.
- Mods register fact kinds, instruments, analysis views and claim types.

## 4. Open decisions

1. Default science depth for Science and Career modes (classic points vs discovery).
2. Do rivals publish science (scooping) in v1 of the system?
3. How many analysis mini-games ship at first (suggest: spectrum fit and coverage only)?
4. Are hidden facts fixed by body definition (same in every world) or seeded per world (replayability)?
