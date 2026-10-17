# 09 — Communications network

How a vessel stays in touch with home: antennas and their power, the link-range and signal-strength math, relays and ground stations, what a probe can do without a link, and how science data travels home as radio packets. KSP1's CommNet (added in 1.2, Oct 2016) is the baseline, because it is a complete, documented, small model. KSP2 shipped a simpler version of it, and several mods (RemoteTech, CommNet Constellation, RealAntennas) show where the design space goes next. Orbital's UI concept already has a **Network** layer in the Mission Center, a **Comms** tab on the vessel panel (Auto/Manual routing, endpoints, radio channels, on-board transmitters including suit radios) and radio-signal chips on crew. This document is the input for that design.

> **Status note.** KSP2 Early Access launched 24 Feb 2023. *For Science!* (v0.2.0.0) shipped 19 Dec 2023, and the last patch (v0.2.2.0) shipped June 2024 after the Intercept Games layoffs (28 Jun 2024) [S10]. Nothing about comms in KSP2 changed after For Science!. A fan continuation, KSP2 Redux, exists but has no comms features on its roadmap [S16].

> **Source caveat.** The official KSP wiki (wiki.kerbalspaceprogram.com) blocks automated fetches, and the Fandom wiki asks for payment. Wiki facts below were read from search-engine excerpts of those pages. Values marked *(from memory, unverified)* are widely repeated community values that I could not re-check in this pass.

---

## 1. How it works

### 1.1 KSP1 CommNet in one paragraph

**[KSP1]** CommNet is a difficulty toggle ("Enable Comm Network", on by default). When it is on, every antenna has a **power rating** in metres. Two nodes can link if they are within **range = √(powerA × powerB)** of each other and no celestial body blocks the straight line between them. A vessel is "connected" if a chain of such links reaches a **control point**: a ground station on Kerbin (the Deep Space Network, DSN) or a crewed vessel that can act as a remote control station. The link quality is a **signal strength** from 0 to 100 %, which is the product of the per-hop strengths along the chosen path [S1][S2]. Connection gates two things: full control of uncrewed probes, and transmitting science.

### 1.2 Antenna types

**[KSP1]** Each antenna is **direct** or **relay**, and **combinable** or not [S1][S3].

- **Direct** antennas can talk to a relay or to the DSN, but they cannot pass other vessels' traffic.
- **Relay** antennas can do everything a direct antenna does, *and* let other vessels route through them. When a vessel acts as a relay hop, only its relay antennas count toward that hop's power. A forum guide also claims that direct and relay antennas never combine with each other. The wiki describes them as combining for the vessel's own uplink. Treat the exact rule as uncertain [S2].
- **Combinable** antennas on one vessel add up (with diminishing returns). A non-combinable antenna only counts on its own.

Stock antenna set **[KSP1]** (power ratings: G = 10⁹ m, M = 10⁶ m, k = 10³ m):

| Antenna | Type | Power | Combinability exp. | Data rate / cost |
|---|---|---|---|---|
| Probe cores and command pods (built-in) | Direct | 5 k *(from memory, unverified)* | 0.75 default | — |
| Communotron 16 | Direct | 500 k | 1.0 | 2 Mit/packet, 0.6 s, 12 EC/packet → 3.33 Mit/s, 6 EC/Mit [S3] |
| Communotron 16-S | Direct | 500 k | 0.0 (does not combine) [S3] | as above |
| Comms DTS-M1 | Direct | 2 G | 0.75 | 5.71 Mit/s, 6 EC/Mit [S3] |
| Communotron HG-55 | Direct | 15 G | 0.75 | 3 Mit/packet, 20 Mit/s, 6.67 EC/Mit [S3] |
| Communotron 88-88 | Direct | 100 G | 0.75 | 20 Mit/s, 10 EC/Mit [S3] |
| HG-5 High Gain | Relay | 5 G *(from memory)* | 0.75 | — |
| RA-2 Relay | Relay | 2 G | 0.75 | 1 Mit/packet [S3] |
| RA-15 Relay | Relay | 15 G | 0.75 | about ¼ of the HG-55's speed at about 2× the EC per Mit [S4] |
| RA-100 Relay | Relay | 100 G | 0.75 | about 11.4 Mit/s (table row hard to parse) [S3] |

The design point is that relay dishes are **slow and power-hungry data pipes**, and direct dishes are **fast science uplinks**. A science probe and a relay satellite are therefore different vessels.

### 1.3 The formulas

**[KSP1]** All from the wiki CommNet page and part configs [S1][S2][S3]:

1. **Combined vessel power.** For the combinable antennas on one vessel:
   `P_vessel = P_strongest × (ΣP / P_strongest) ^ e_avg`
   where `e_avg` is the power-weighted average of each antenna's `antennaCombinableExponent`. The default is **0.75** if a part does not set it [S2]. Two equal antennas therefore give 2^0.75 ≈ 1.68×, not 2×.
2. **Link range.** `R = √(P_a × P_b)`. A 500 k whip talking to a 2 G ground station reaches √(5e5 × 2e9) ≈ 31.6 Mm. That covers Kerbin orbit and the Mun, but not Minmus.
3. **Single-hop signal strength.** With `x = 1 − d / R` clamped to [0, 1]:
   `s = 3x² − 2x³`
   This is a smoothstep, and the wiki describes it as a Bézier curve with keys `0 0 0 0` and `1 1 0 0`. It is 100 % at d = 0, 50 % at d = R/2 and 0 % at d = R. It is flat near both ends, so a link at 30 % of range still reads close to full [S2].
4. **Multi-hop strength.** `s_path = Π s_hop`. Three hops at 80 % give 51 %. The game picks a path to a control point, and the worked example on the wiki multiplies the hop strengths in exactly this way [S2].
5. **Science transmission.** An antenna sends data in **packets** of N Mits every T seconds, and each packet costs E electric charge. A transfer stalls (it does not fail) if EC runs out. Each experiment also has a **transmission scalar** (the fraction of its science value you get by transmitting instead of returning it). Physical samples cannot be transmitted at all. A science lab can raise the transmitted value. *(Per-experiment scalars not re-verified in this pass.)*

### 1.4 Ground stations and the Tracking Station

**[KSP1]** The DSN's power depends on the Tracking Station upgrade level: **2 G → 50 G → 250 G** [S2][S4]. At level 3, a 100 G dish reaches √(1e11 × 2.5e11) ≈ 158 Gm, which is enough to reach Kerbin from anywhere in the stock system [S4]. With **"Enable Extra Groundstations"** (difficulty option, on by default), there are several DSN dishes around Kerbin, so a craft in low orbit is almost always in view. With it off, KSC is the only ground station. The planet then blocks the link for about half of every orbit, and low relays become necessary early [S5].

Other CommNet difficulty knobs **[KSP1]** (names from the advanced difficulty screen; default values not re-verified): a **Range Modifier** and a **DSN Modifier** (scaling antenna and ground-station power), **Occlusion Modifiers** for bodies with and without atmosphere (how much of a body's radius blocks a line), **Require Signal for Control**, and **Enable Plasma Blackout** [S5].

### 1.5 Line of sight

**[KSP1]** Each body is treated as a sphere. If a straight line between two nodes passes through it (scaled by the occlusion modifier), there is no link [S1][S5]. Terrain does not count. This is the single rule that makes relays necessary: the far side of the Mun, Duna surface ops when Kerbin is below the horizon, and landers in craters near the poles all need relays. RemoteTech uses the same sphere model [S6].

### 1.6 Probe control and crew

**[KSP1]** [S5]

| Situation | Control |
|---|---|
| Probe core, connected | Full control |
| Probe core, no connection, default rules | **Partial control**: attitude (SAS and reaction wheels) and some throttle and staging use, according to forum reports. The exact list varies between versions, so treat it as approximate. |
| Probe core, no connection, "Require Signal for Control" on | No control |
| Crewed pod | Always full control. Crew never need a link. |
| Crewed vessel with a **Pilot** (or a remote-guidance probe unit with crew) | Acts as a **local control point**: probes linked to it get full control without a path to Kerbin *(mechanism widely described; exact crew requirements not re-verified)* |

Probe cores have a **hibernation** toggle (and "hibernate in warp") that cuts their EC draw while idle. Combined with the no-signal rules, this creates the classic "probe dies on the far side" problem if batteries and solar panels are sized poorly.

**Plasma blackout** **[KSP1]**: an optional rule (Enable Plasma Blackout) cuts the link during re-entry heating [S5].

### 1.7 Map overlay

**[KSP1]** The map view has a CommNet overlay with modes that show only the active path, all vessel links, or the whole network. Lines are coloured from green (strong) to red (weak). The flight HUD shows a signal-strength bar and a "no signal" state [S1].

### 1.8 What KSP2 shipped

- **[KSP2]** Antennas and a CommNet existed from Early Access day one (Feb 2023), with the KSP1 part family (Communotron 16, HG-5, RA-2/15/100, 88-88 and others) [S7]. Players confirmed that probes needed coverage and relays to be controlled far from Kerbin [S7].
- **[KSP2]** The 0.1.1.0 patch (16 Mar 2023) fixed probes spinning when they lost the CommNet connection [S8]. That is the only comms entry in the early patch notes I found.
- **[KSP2]** **No body occlusion in stock**. The CommNext mod's main feature is adding "line of sight" blocking by celestial bodies. Players reported that Kerbin has 360° coverage in stock [S9]. CommNext also reduces antenna ranges to KSP1 values and sets KSC's DSN to 2 G, which implies that stock KSP2 ranges were more generous [S9].
- **[KSP2]** **No network lines in map view in stock**. The Commlines mod exists specifically to bring the KSP1 lines back, with link colour by strength and several view modes [S11].
- **[KSP2]** For Science! added transmittable experiment data (plus samples that must be returned). A forum report describes a probe that could be *controlled* through relays but could not *transmit* to KSC over the same path. It is unclear whether that was a bug [S9].
- **[KSP2]** A developer acknowledged that players like KSP1's detailed line-of-sight and relay features and said the team wanted to revisit them, but this never happened [S9].
- **[KSP2 roadmap — never shipped]** Comms for colonies, other star systems and multiplayer was never specified publicly.

Net: KSP2's comms was a **regression** from KSP1. It kept the same parts, but the network was less legible and had fewer rules.

### 1.9 Prior-art mods (KSP1 unless stated)

- **[Mod: RemoteTech]** The "hard" comms model [S6]. **Omni** antennas link automatically. **Dishes** must be *targeted*: at a specific vessel, at Mission Control, at the "active vessel", or at a **body** (a **cone** that catches every satellite near that body inside the cone). Links need line of sight, range on *both* ends (standard model) or a √-style "root" model in settings, and correct targeting. KSC is a grounded satellite with a special omni antenna, and extra command stations can be added. **Signal delay** at light speed is shown as `D+ x s`, so a probe needs a **flight computer** that queues commands (hold attitude, burn at node, delayed actions) for execution after the delay. Antennas start retracted, and opening one is itself a command that needs a link or crew. An EVA kerbal can re-point a dish to rescue a probe [S6].
- **[Mod: CommNet Constellation]** Adds **radio frequencies** (up to 32,767) to stock CommNet. Vessels and ground stations are assigned to one or more frequencies, and only nodes that share one can link. Constellations get colours in the map view [S12]. This is the closest prior art to Orbital's "radio channels".
- **[Mod: RealAntennas]** Replaces the single power number with a **link budget**: `RxPower = TxPower + TxGain − FreeSpacePathLoss + RxGain`. SNR is that minus the receiver noise floor. **Modulation** (BPSK → QAM) is picked from the SNR, so **data rate falls smoothly with distance** instead of a link simply existing or not. There are bands and per-antenna transmit power, antennas do **not** combine, and each direction of a link can have a different rate [S13].
- **[Mod: Antenna Helper]** A VAB/map planner that computes ranges and signal from the stock formulas, which shows that the stock math was opaque enough to need a calculator [S14].
- **[Mod: Kerbalism]** Science data is produced over time and **transmitted over time** by a background simulation for all vessels, so bandwidth becomes a mission constraint [S15].
- **[Mod: kOS] interplay.** kOS exposes connection state to scripts, and with RemoteTech it respects signal delay. An autopilot script is the in-fiction answer to "the probe is 20 light-minutes away".
- **[KSP2 mods]** CommNext (occlusion, relay-only dishes, network report window that explains *why* a link is down) and Commlines (map lines, optional transmission slowdown by the weakest hop) [S9][S11].

---

## 2. Player experience

- **Early career [KSP1]:** You meet comms when the first probe beyond the Mun goes quiet. The fix is a bigger antenna or a Tracking Station upgrade, and this is one of the few places where a *building upgrade* visibly changes the flight.
- **Mid game [KSP1]:** Building a **relay constellation** (often three or four relays in a resonant orbit around Kerbin, then one around each target body) is satisfying infrastructure play. It is the one KSP1 activity that feels like building a network rather than a rocket.
- **Science runs [KSP1]:** Transmission turns science into an EC and time budget. You wait for packets, watch batteries, and decide whether to transmit for partial credit or fly the data home.
- **The far side [KSP1]:** Losing a link behind the Mun mid-burn is a memorable failure, and partial control softens it so it is rarely fatal.
- **RemoteTech players** describe probes as feeling truly remote: you plan a sequence, upload it and wait. Many players find this too punishing without a flight computer.
- **KSP2:** With no occlusion and no lines, the network is mostly invisible. Players mainly met comms as an extra checkbox on probes.

---

## 3. Interactions with other systems

- **Vehicle assembly** (`03-vehicle-assembly.md`): antenna choice, EC budget and relay versus direct roles. The VAB needs a range and signal preview (the gap Antenna Helper filled).
- **Flight and controls** (`04-flight-and-controls.md`): control levels, SAS when out of signal, plasma blackout, hibernation, and time warp with idle probes.
- **Science** (`05-science-and-research.md`): transmit-versus-return values, packet bandwidth and EC cost, and labs.
- **Space center** (`02-space-center-and-buildings.md`): the Tracking Station level sets DSN power, and the extra-ground-stations option.
- **Crew** (`08-crew.md`): a Pilot as a local control point. Orbital adds suit radios on EVA.
- **Missions and contracts** (`06-missions-contracts-achievements.md`): KSP1 "position a relay at X" / "build a network around Y" contracts.
- **Economy** (`07-economy-and-career.md`): relays as long-lived infrastructure investments. A network can be leased or have upkeep.
- **Celestial bodies** (`10-celestial-bodies-and-world.md`): occlusion by body radius, SOI-based relay placement, and resonant orbits.
- **Colonies** (`11-colonies-resources-interstellar.md`): colonies as new ground stations or control points, and interstellar latency.
- **Modding** (`12-modding.md`): all three big comms mods replaced the model wholesale, so the comms model must be swappable.
- **UI** (`13-ui-ux-patterns.md`): network overlay, signal indicator and "why is this link down" explanation.

---

## 4. Known problems / criticism

1. **Opaque math [KSP1].** Range = √(P·P), combinability exponents and the smoothstep were invisible in the UI. Players needed wiki tables or Antenna Helper [S14].
2. **Relay versus direct confusion [KSP1].** It is unclear which antennas count on a relay hop, and sources even disagree on whether direct and relay antennas combine [S2].
3. **No "why"** [KSP1/KSP2]. The UI says "no signal" but not whether the cause is occlusion, range or power. CommNext's report window exists because of this [S9].
4. **Signal strength barely matters [KSP1]**. It does not slow transmission in stock (Commlines adds this as an option for KSP2 [S11]). The percentage is mostly decoration.
5. **Binary links**: a link either exists or does not. RealAntennas' data-rate-by-SNR model is the community's answer [S13].
6. **KSP2 regression**: no occlusion and no map lines [S9][S11]. This removed the gameplay that justifies relays.
7. **RemoteTech difficulty**: signal delay without good tooling punishes players, and dish targeting is tedious [S6].
8. **Partial control rules changed between versions** and were poorly documented [S5].

---

## 5. Implications for Orbital

Orbital already has: a deterministic fixed-timestep sim, Kepler on-rails propagation with patched conics, body hierarchy and SOI frames (ADR 0051), targets in the sim (ADR 0065), a sandboxed kOS-like script runner (ADR 0020/0038), and a **plasma-blackout level displayed on the HUD with no gameplay effect yet** (ADR 0079: "a communications system … will read the same level").

1. **Adopt** the KSP1 core: power ratings, `R = √(Pa·Pb)`, smoothstep strength, multi-hop product, sphere occlusion. It is small, deterministic and pure (a function of positions plus a parts list), so it can be computed every N ticks in the sim worker and unit-tested.
2. **Improve** by turning signal strength into **bandwidth**: `rate = baseRate × s_path` (or a stepped RealAntennas-style modulation table). Strength then matters for science and telemetry without needing a full RF model. This is where engineers have fun.
3. **Improve** by keeping it moddable: `defineModule('antenna', { power, kind: 'direct'|'relay', combineExp, band?, packet })` and a stock `CommsModel` behind an SDK interface, so a mod can swap in RemoteTech-style or link-budget models (every big KSP comms mod replaced the model wholesale).
4. **Adopt** CommNet Constellation's frequencies as Orbital's **radio channels**. Each transmitter has a channel set, and links need a shared channel. Channels double as ownership or "private network" in a future multiplayer or investor context (lease a channel on someone's relay).
5. **Adopt** ground stations as **world data** (`defineGroundStation` per body, lat/lon, power, channels) instead of a hard-coded KSC. A "Ground stations: KSC only / Network" world rule then replaces KSP1's "extra ground stations" checkbox, and future sites or colonies register as stations.
6. **Improve** probe control with three explicit, documented levels (Full / Limited / None), plus a world rule "Require signal for control". Limited means SAS hold plus **running the already-uploaded script**. That makes scripting the in-fiction answer to losing the link.
7. **Adopt (as difficulty option) light-time signal delay**: `delay = Σ hop distance / c`. Commands (manual input, script uploads, action groups) are queued and execute at `t + delay` in sim time. This is deterministic because the queue is part of the sim state and is saved. Off by default, on for "hard" worlds, and the probe's script runner is the "flight computer".
8. **Improve** on RemoteTech's tedium: **Auto routing** by default (shortest delay or best bandwidth), with **Manual** routing in the Comms tab for players who want to pin a hop. Skip dish-targeting UI in v1. If dishes exist, auto-point them at the next hop.
9. **Adopt** the plasma blackout as a real link rule. ADR 0079's `blackoutLevel` multiplies the vessel's first-hop strength, so the badge finally means something.
10. **Improve** with a **"why" explainer**. Every broken link reports `{reason: 'occluded'|'range'|'power'|'channel'|'blackout', by: body/vessel}`, shown in the Comms tab and the Network layer. This is the top complaint in both games.
11. **Adopt** the VAB comms preview: show range against DSN levels, range to a chosen relay, and "reaches Mun / Minmus / interplanetary" bands (the gap Antenna Helper filled).
12. **Adopt** suit radios as low-power omni transmitters (around 5 k class) on crew. The crew chip shows signal, an EVA kerbal far from the lander loses voice comms, and that can gate EVA science transmission or "talk the kerbal home". This is cheap and characterful.
13. **Improve** with scriptability: expose `comms.status`, `comms.path`, `comms.delay`, `comms.bandwidth` and `comms.queue` to scripts, plus events for link-lost and link-restored. Scripts can then wait for a link before transmitting.
14. **Avoid** KSP2's invisible network. Ship the Network layer (lines coloured by strength, range spheres on demand) at the same time as the model, not after.
15. **Avoid** packet-level EC micro-costs that only produce stalls. Bill transmission as power × time at the link's bandwidth, which is simpler and still makes batteries matter.
16. **Improve for investors**: relays and ground stations are **assets** with build cost, upkeep and capacity. Bandwidth is a sellable or leasable resource (a contract "provide coverage over Duna for 200 days"), which turns comms into infrastructure economics rather than a checkbox.

---

## Sources

- [S1] KSP Wiki — "CommNet". https://wiki.kerbalspaceprogram.com/wiki/CommNet — checked 2026-10-17 — official community wiki. Read via search excerpts (direct fetch blocked by bot protection).
- [S2] KSP Wiki — "CommNet" (signal-strength, combinability and worked-example sections), plus KSP Forum "Directional relays" thread (√ formula, combination claims). https://wiki.kerbalspaceprogram.com/wiki/Commnet ; https://forum.kerbalspaceprogram.com/topic/164898-directional-relays — checked 2026-10-17 — wiki (high) and forum (medium). Via search excerpts.
- [S3] KSP Wiki — "Antenna" (comparison table, packet sizes, exponents). https://wiki.kerbalspaceprogram.com/wiki/Antenna — checked 2026-10-17 — official community wiki, via search excerpts. Some table rows were garbled.
- [S4] KSP Wiki — "RA-15 Relay Antenna" / "RA-100 Relay Antenna" / "Communotron HG-55". https://wiki.kerbalspaceprogram.com/wiki/RA-15_Relay_Antenna — checked 2026-10-17 — official community wiki, via search excerpts.
- [S5] KSP Forum — threads on probe control without signal ("I lost the ability to control probes", "Fly-by-wire nose cone needs a signal", "Communicating from deep space"). https://forum.kerbalspaceprogram.com/topic/175948-i-lost-the-ability-to-control-probes ; https://forum.kerbalspaceprogram.com/topic/149214-12-fly-by-wire-nose-cone-needs-a-signal — checked 2026-10-17 — player forum (medium; version-dependent). Via search excerpts.
- [S6] RemoteTech documentation — "Overview" guide. https://remotetechnologiesgroup.github.io/RemoteTech/guide/overview/ — checked 2026-10-17 — mod's own docs (high for the mod).
- [S7] Steam Community — "Does the commnet work and are there any science devices?" (KSP2, 24–25 Feb 2023). https://steamcommunity.com/app/954850/discussions/0/3772364949848543551/ — checked 2026-10-17 — player discussion at EA launch (low–medium).
- [S8] kerbal.wiki — "0.1.1.0" patch notes. https://kerbal.wiki/0.1.1.0 — checked 2026-10-17 — community KSP2 wiki mirroring official notes.
- [S9] KSP Forum — "CommNext v0.7.0 for KSP2 v0.2.0" and "CommNet for Science!" threads. https://forum.kerbalspaceprogram.com/topic/223732-commnext-v070-for-ksp2-v020 ; https://forum.kerbalspaceprogram.com/topic/221741-commnet-for-science — checked 2026-10-17 — mod thread plus player discussion (medium). Via search excerpts (direct fetch 403).
- [S10] Wikipedia — "Kerbal Space Program 2". https://en.wikipedia.org/wiki/Kerbal_Space_Program_2 — checked 2026-10-17 — encyclopedia, well-cited secondary.
- [S11] GitHub — gamendegamer321/Commlines (KSP2 mod). https://github.com/gamendegamer321/Commlines — checked 2026-10-17 — mod README (high for the mod).
- [S12] SpaceDock — "CommNet Constellation". https://spacedock.info/mod/1309/CommNet%20Constellation — checked 2026-10-17 — mod page.
- [S13] GitHub — DRVeyl/RealAntennas. https://github.com/DRVeyl/RealAntennas — checked 2026-10-17 — mod README (high for the mod).
- [S14] SpaceDock — "Antenna Helper". https://spacedock.info/mod/1730/Antenna%20Helper — checked 2026-10-17 — mod page (seen via search result).
- [S15] GitHub — Kerbalism/Kerbalism. https://github.com/Kerbalism/Kerbalism — checked 2026-10-17 — mod README (v3.43, KSP 1.12).
- [S16] KSP2 Redux — Roadmap. https://ksp2redux.org/roadmap/ — checked 2026-10-17 — fan project site (describes its own plans only).
