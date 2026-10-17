# 00 — Sources

All sources were checked on **2026-10-17**. Facts are summarised in our own words; no text or art is copied.

**How to read the "Access" column**

- **read**: the page itself was fetched and read (through a fetch tool that returns a summary of the page; quotes are therefore second-hand).
- **summary**: only seen through search-engine result summaries quoting the page. Treat as weaker; verify before turning into an ADR.
- The KSP wiki (wiki.kerbalspaceprogram.com) and KSP forum blocked automated access during this research; every KSP1 fact below is **summary** level. The companion KSP documents in `refs/reverse-engineering-ksp2/` are the authority for KSP behaviour.

## Communications (`01`)

| ID | Source | URL | Access |
|---|---|---|---|
| C-KSP-CN | KSP wiki, CommNet | https://wiki.kerbalspaceprogram.com/wiki/CommNet | summary |
| C-KSP-CNF | KSP forum, CommNet signal strength calculator / range threads | https://forum.kerbalspaceprogram.com/topic/149099-commnet-signal-strength-calculator-antenna-selector/ ; https://forum.kerbalspaceprogram.com/topic/171167-commnet-range | summary |
| C-STEAM-RELAY | Steam discussion, KSP relay constellations | https://steamcommunity.com/app/220200/discussions/0/1696043806577687660 | summary |
| C-COMMNEXT | KSP forum, CommNext mod for KSP2 | https://forum.kerbalspaceprogram.com/topic/223732-commnext-v070-for-ksp2-v020 | summary |
| C-RT | RemoteTech documentation, home | https://remotetechnologiesgroup.github.io/RemoteTech/ | read |
| C-RT-OV | RemoteTech guide, overview | https://remotetechnologiesgroup.github.io/RemoteTech/guide/overview/ | read |
| C-KBM-SIG | Kerbalism docs, signal | https://kerbalism.readthedocs.io/en/latest/signal.html | read |
| C-KBM-WIKI | Kerbalism wiki, PlayGuide ~ Signal | https://github.com/Kerbalism/Kerbalism/wiki/PlayGuide-~-Signal | read |
| C-KBM-SCI | Kerbalism wiki, PlayGuide ~ Science | https://github.com/Kerbalism/Kerbalism/wiki/PlayGuide-~-Science | read |
| C-DSN | Wikipedia, NASA Deep Space Network (incl. OIG oversubscription) | https://en.wikipedia.org/wiki/Deep_Space_Network | read |
| C-DSN-NASA | NASA, What is the Deep Space Network? | https://www.nasa.gov/directorates/somd/space-communications-navigation-program/what-is-the-deep-space-network/ | read |
| C-VOY | Voyager data rates (lecture slides, secondary) | https://oe3.oevsv.at/export/shared/.content/.galleries/pdf-Downloads/Astronomie-Funktechnik_2015.pdf | summary |
| C-TDRS | Wikipedia, Tracking and Data Relay Satellite System | https://en.wikipedia.org/wiki/Tracking_and_Data_Relay_Satellite_System | read |
| C-NSN | NASA Near Space Network commercial awards (Jan 2025) and TDRS service end (Nov 2024) | https://www.militaryaerospace.com/communications/article/55252573/nasa-announces-commercial-companies-selected-to-support-near-space-network ; https://satnews.com/2025/01/01/nasa-selects-four-commercial-companies-to-support-near-space-network/ ; https://www.nationalacademies.org/cdn/materials/a067dbaa-a014-4514-8106-77976612cfc0 | summary |
| C-LB | Wikipedia, Link budget | https://en.wikipedia.org/wiki/Link_budget | read |
| C-LB-PAPER | arXiv 2305.04590 (link budget equations) | https://arxiv.org/pdf/2305.04590 | summary |
| C-ESA-LT | ESA, Adventures in time and space (light time to Mars) | https://www.esa.int/Enabling_Support/Operations/Adventures_in_time_and_space | summary |
| C-SC | Wikipedia, Solar conjunction | https://en.wikipedia.org/wiki/Solar_conjunction | read |
| C-MCJ | Universe Today, Mars solar conjunction 2023 (two-week command pause) | https://www.universetoday.com/articles/communication-with-mars-is-about-to-become-impossible-for-two-weeks | summary |
| C-DTN | NASA NTRS, Delay/Disruption Tolerant Networking (Bundle Protocol, custody transfer) | https://ntrs.nasa.gov/api/citations/20140016713/downloads/20140016713.pdf | summary |
| C-CGR | Caini et al., Contact Graph Routing (IEEE Comm. Mag. 2015) | https://www.scnl.dist.unige.it/publications/CommMag-2015-ContactGraph.pdf | summary |
| C-STARLINK | Starlink laser links (secondary reports) | https://newspaceeconomy.ca/2026/05/29/how-does-starlink-use-satellite-laser-communications/ | summary |
| C-LUNANET | ESA Moonlight / LunaNet framework; NASA LunaNet presentation | https://esa.int/Applications/Connectivity_and_Secure_Communications/Moonlight/Moonlight_services_seeking_feedback_for_updated_LunaNet_framework ; https://ntrs.nasa.gov/api/citations/20250001223/downloads/LunaNet%20for%20ICG-IOAG%20CisLun%20PNT%2011-13Feb2025v2.pdf | summary |
| C-ITU | ITU-R Space Services (MIFR, coordination, interference) | https://www.itu.int/en/ITU-R/space/Pages/default.aspx | read |
| C-SE-ANT | Space Engineers wiki, Antenna | https://spaceengineers.wiki.gg/wiki/Antenna | read |
| C-SE-LASER | Space Engineers wiki, Laser Antenna | https://spaceengineers.wiki.gg/wiki/Laser_Antenna | read |
| C-FAC-LOG | Factorio wiki, Logistic network | https://wiki.factorio.com/Logistic_network | read |
| C-SAT-POWER | Satisfactory wiki, Power Line | https://satisfactory.wiki.gg/wiki/Power_Line | read |
| C-MM | Wikipedia, Mini Metro | https://en.wikipedia.org/wiki/Mini_Metro_(video_game) | read |
| C-NETWORKING | NASA, NetworKing space communications game | https://www.nasa.gov/stem-content/networking-space-communications-game | read |

## Games, roles, economy, achievements (`02`, `03`, `06`)

| ID | Source | URL | Access |
|---|---|---|---|
| G-KSP-CON | KSP wiki, Contract; forum, balancing contract rewards | https://wiki.kerbalspaceprogram.com/wiki/Contract ; https://forum.kerbalspaceprogram.com/topic/99961-balancing-contract-rewards | summary |
| G-KSP-STRAT | KSP forum, Administration strategies | https://forum.kerbalspaceprogram.com/topic/86670-funds-to-science-admin-strategy-is-really-overpowered/page/4 | summary |
| G-KSP-024 | KSP 0.24 "First Contract" changelog | https://forum.kerbalspaceprogram.com/developerarticles.html/ksp-first-contract-v0240-complete-changelog-r131 | summary |
| G-KSP-SCI | KSP forum / wiki talk, science formula | https://forum.kerbalspaceprogram.com/topic/56973-understanding-science-points | summary |
| G-KSP-XP | KSP wiki, Experience | https://wiki.kerbalspaceprogram.com/wiki/XP | summary |
| G-KSP2-FS | kerbal.wiki, For Science! | https://kerbal.wiki/For_Science! | read |
| G-KSP2-SCI | kerbal.wiki, Science (KSP2) | https://kerbal.wiki/Science | read |
| G-CAREER-REIMAGINED | SpaceDock, Career Reimagined mod | https://spacedock.info/mod/4249/Career%20Reimagined | summary |
| G-KBM-REL | Kerbalism wiki (ShotgunNinja), Reliability | https://github.com/ShotgunNinja/Kerbalism/wiki/Reliability | read |
| G-KBM-SCI | Kerbalism wiki (ShotgunNinja), Science | https://github.com/ShotgunNinja/Kerbalism/wiki/Science | read |
| G-KBM-BG | Kerbalism wiki (ShotgunNinja), Background Simulation | https://github.com/ShotgunNinja/Kerbalism/wiki/Background-Simulation | read |
| G-MH | Space.com, Mars Horizon review | https://www.space.com/mars-horizon-space-game-review | summary |
| G-MH-ESA | ESA, ESA and Auroch Digital launch Mars Horizon | https://esa.int/About_Us/Partnerships/ESA_and_Auroch_Digital_launch_Mars_Horizon_game | summary |
| G-JUNO | Steam, Juno: New Origins | https://store.steampowered.com/app/870200/Juno_New_Origins/ | summary |
| G-JUNO-REV | Review aggregator (vaporlens.app) on Juno career repetitiveness | https://vaporlens.app (Juno: New Origins page) | summary, secondhand |
| G-ED-BGS | Frontier dev update on the background simulation (2016) | https://community.elitedangerous.com/en/node/362 | summary |
| G-ED-BGS-GUIDE | Community BGS guide | https://dpss.space/bgs | summary |
| G-ED-EXPL | Steam discussion, Elite exploration and first discovery | https://steamcommunity.com/app/359320/discussions/0/1630790506925739517 | summary |
| G-X4 | Steam, X4: Foundations | https://store.steampowered.com/app/392160/X4_Foundations/ | summary |
| G-EVE-MER | EVE Online Monthly Economic Report, Feb 2026 | https://www.eveonline.com/news/view/monthly-economic-report-february-2026 | summary |
| G-FAC-RES | Factorio wiki, Research | https://wiki.factorio.com/Research | summary |
| G-STAT-IC10 | Stationeers wiki, Integrated circuit (IC10) | https://stationeers-wiki.com/Integrated_circuit | summary |
| G-OPUS | Wikipedia, Opus Magnum (histograms, GIF export) | https://en.wikipedia.org/wiki/Opus_Magnum | summary |
| G-TM-GHOST | Trackmania docs, Watch replays | https://doc.trackmania.com/play/watch-replays/ | summary |
| G-ACH-101 | Game Developer, Achievement design 101 | https://www.gamedeveloper.com/design/achievement-design-101 | summary |
| G-OW | Edge review of Outer Wilds (via PressReader) | https://www.pressreader.com/australia/edge/20190620/282278141843961 | summary |
| G-OBRA | Return of the Obra Dinn deduction confirmations | https://unwinnable.com/2018/12/05/obra-dinn/ ; https://filmstories.co.uk/?p=83249 | summary |

## Real science process (`04`)

| ID | Source | URL | Access |
|---|---|---|---|
| R-PDS | NASA PDS, Policy on processing levels | https://pds.nasa.gov/datastandards/documents/policy/PolicyOnProcessingLevels03112013.pdf | summary |
| R-CODMAC | PDS Small Bodies Node, CODMAC level definitions | https://pds-smallbodies.astro.umd.edu/ (codmac_level_definitions.pdf) | summary |
| R-GZ | Galaxy Zoo data reduction (arXiv 1801.08541) | https://arxiv.org/pdf/1801.08541 | summary |
| R-BITBYBIT | Salganik, Bit by Bit, Galaxy Zoo chapter | https://www.bitbybitbook.com/en/mass-collaboration/human-computation/galaxy-zoo/ | summary |
| R-GRAIL | Wikipedia, GRAIL | https://en.wikipedia.org/wiki/GRAIL | read |
| R-RO | Wikipedia, Radio occultation | https://en.wikipedia.org/wiki/Radio_occultation | read |

## Universe mode (`05`)

| ID | Source | URL | Access |
|---|---|---|---|
| U-US-HOME | Universe Sandbox home page | https://universesandbox.com/ | read |
| U-US-STEAM | Steam, Universe Sandbox | https://store.steampowered.com/app/230290/Universe_Sandbox/ | read |
| U-US-WIKI | Wikipedia, Universe Sandbox | https://en.wikipedia.org/wiki/Universe_Sandbox | read |
| U-US-BLOG | Universe Sandbox blog index | https://universesandbox.com/blog/ | read |
| U-US-36 | Update 36 "Pale Blue DOTS" (Mar 2026) | https://universesandbox.com/blog/2026/03/pale-blue-dots-update-36/ | via blog index |
| U-US-36-1 | Update 36.1 (Apr 2026) | https://universesandbox.com/blog/ (36.1 entry) | via blog index |
| U-US-36-2 | Update 36.2 (Jun 2026) | https://universesandbox.com/blog/ (36.2 entry) | via blog index |
| U-US-36-3 | Update 36.3 (Aug 2026) | https://universesandbox.com/blog/ (36.3 entry) | via blog index |
| U-US-DOTS | Pale Blue DOTS preview: physics simulation overhaul | https://universesandbox.com/blog/2025/12/pale-blue-dots-preview-physics-simulation-overhaul/ | read |
| U-US-SIMSET | Universe Sandbox wiki, Sim Settings menu | https://universesandbox.fandom.com/wiki/Sim_Settings_Menu | summary (may predate Update 36) |
| U-PRINCIPIA | Principia (GitHub) | https://github.com/mockingbirdnest/Principia | read |
| U-PRINCIPIA-CONCEPTS | Principia wiki, Concepts | https://github.com/mockingbirdnest/Principia/wiki/Concepts | read |
| U-SE | Wikipedia, SpaceEngine | https://en.wikipedia.org/wiki/SpaceEngine | read |
| U-JUNO-PS | Steam, Juno: New Origins (Planet Studio) | https://store.steampowered.com/app/870200/Juno_New_Origins/ | summary |
| U-KOPERNICUS | Kopernicus (GitHub org) | https://github.com/Kopernicus | summary |
| U-GRAVSIM | Gravity Simulator, about | https://gravitysimulator.org/version-2/about/ | summary |
| U-REBOUND | REBOUND (GitHub) | https://github.com/hannorein/rebound | read |
| U-IAS15 | Rein & Spiegel, IAS15 (arXiv 1409.4779) | https://arxiv.org/abs/1409.4779 | read |
| U-MDN-MATH | MDN, Math (implementation-dependent precision) | https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math | read |
| U-WEBGPU | Wikipedia, WebGPU (browser support) | https://en.wikipedia.org/wiki/WebGPU | read |
| U-ML | Wikipedia, Mass–luminosity relation | https://en.wikipedia.org/wiki/Mass%E2%80%93luminosity_relation | read |
| U-MS | Wikipedia, Main sequence (lifetime) | https://en.wikipedia.org/wiki/Main_sequence | read |
| U-HZ | Wikipedia, Circumstellar habitable zone | https://en.wikipedia.org/wiki/Circumstellar_habitable_zone | read |
| U-ROCHE | Wikipedia, Roche limit | https://en.wikipedia.org/wiki/Roche_limit | read |

## Space center building, launch sites, colonies (`08`)

| ID | Source | URL | Access |
|---|---|---|---|
| B-CS2-PROG | Colossal Order, Cities: Skylines II dev diary 10: game progression | https://colossalorder.fi/news/development-diary-10-game-progression/ | read |
| B-CS1-DISTRICTS | Paradox forum, Cities: Skylines dev diary 8: districts and policies | https://forum.paradoxplaza.com/forum/developer-diary/cities-skylines-dev-diary-8-districts-and-policies.831059/ | summary |
| B-CS1-COVERAGE | Steam discussion and community guide on service coverage | https://steamcommunity.com/app/255710/discussions/0/610574827763683574 ; https://en.number13.de/cities-skylines-everything-about-healthcare-emergency-services-and-police | summary |
| B-ISLANDERS | Wikipedia, Islanders (video game) | https://en.wikipedia.org/wiki/Islanders_(video_game) | summary |
| B-MH-BASE | Xbox Wire, 7 tips to run your own space agency in Mars Horizon | https://news.xbox.com/en-us/2020/11/17/7-tips-run-your-own-space-agency-mars-horizon/ | summary |
| B-SM | Paradox, Surviving Mars: logistics and resources | https://www.paradoxinteractive.com/games/surviving-mars-relaunched/news/logistics-and-resources | summary |
| B-KSC | KSP wiki, KSC (facility levels) | https://wiki.kerbalspaceprogram.com/wiki/KSC | summary (prices differ between wiki pages) |
| B-KK | KSP forum, Kerbal Konstructs | https://forum.kerbalspaceprogram.com/topic/151818-181-kerbal-konstructs-18115-15dec2019 | summary |
| B-LSA | KSP forum, Launch Sites Appended | https://forum.kerbalspaceprogram.com/topic/216527-112xlaunch-sites-appended-a-kerbal-konstructs-scenery-pack | summary |
| B-KOSMO | KSP forum, Kosmodrome career edition (site open/close costs) | https://forum.kerbalspaceprogram.com/topic/85861-105-kosmodrome-space-centre-v10-career-edition-24022016 | summary |
| B-KSP2 | Wikipedia, Kerbal Space Program 2 (roadmap, development status) | https://en.wikipedia.org/wiki/Kerbal_Space_Program_2 | read |
| B-KSP2-COL | TechRaptor on KSP2 colonies; KSP forum, roadmap explained | https://techraptor.net/content/kerbal-space-program-2-colonies-interstellar-travel ; https://forum.kerbalspaceprogram.com/topic/210669-ksp2-ea-road-map-explained-by-nate | summary |
| B-KSP2-LAYOFF | Game Informer and PC Gamer on the 2024 layoffs | https://gameinformer.com/news/2024/05/02/take-two-closes-rollerdrome-and-kerbal-space-program-2-studios-while-majority-of ; https://pcgamer.com/gaming-industry/kerbal-space-program-developers-confirm-layoffs-are-coming-at-the-end-of-june | summary |
| B-JUNO-LL | Green Man Gaming store page, Juno: New Origins (custom launch locations) | https://www.greenmangaming.com/games/juno-new-origins-pc/ | summary |
| B-FAC-BP | Factorio wiki, Blueprint | https://wiki.factorio.com/Blueprint | read |
| B-KSR | KSP forum, Kerbin Side Remastered | https://forum.kerbalspaceprogram.com/topic/174336-kerbin-side-remastered-101-173 | summary |
| B-BAIKONUR | Wikipedia, Baikonur Cosmodrome | https://en.wikipedia.org/wiki/Baikonur_Cosmodrome | read |
| B-KOUROU | ESA, Europe's Spaceport | https://www.esa.int/Enabling_Support/Space_Transportation/Europe_s_Spaceport/Europe_s_Spaceport2 | read |
| B-GSC | Wikipedia, Guiana Space Centre; ESA, Where on Earth: Kourou | https://en.wikipedia.org/wiki/Guiana_Space_Centre ; https://www.esa.int/ESA_Multimedia/Images/2024/06/Where_on_Earth_Kourou | summary |
| B-AZIMUTH | Orbital Radar glossary, Launch azimuth | https://orbitalradar.com/glossary/launch-azimuth | read |
| B-VANDENBERG | Wikipedia, Vandenberg Space Force Base | https://en.wikipedia.org/wiki/Vandenberg_Space_Force_Base | read |
| B-WX-NASA | NASA, Falcon 9 / Crew Dragon launch weather criteria fact sheet | https://www.nasa.gov/wp-content/uploads/2021/07/falcon9_crewdragon_launch_weather_criteria_fact_sheet.pdf | summary |
| B-WX-NSF | NASASpaceflight, Why weather rules exist (2020) | https://www.nasaspaceflight.com/2020/05/why-weather-rules-exist/ | summary |
| B-ARTEMIS | NASA blog, Lunar living: Artemis Base Camp concept (2020) | https://www.nasa.gov/blogs/artemis/2020/10/28/lunar-living-nasas-artemis-base-camp-concept/ | read |
| B-MOXIE | JPL, Perseverance extracts first oxygen; Wikipedia, MOXIE | https://www.jpl.nasa.gov/news/nasas-perseverance-mars-rover-extracts-first-oxygen-from-red-planet/ ; https://en.wikipedia.org/wiki/MOXIE | summary |
| B-KILOPOWER | NASA NTRS, Kilopower/KRUSTY; Space.com report | https://ntrs.nasa.gov/citations/20180001487 ; https://www.space.com/40479-space-nuclear-reactor-kilopower-passes-big-test.html | summary |

## Time and the real solar system (`09`)

| ID | Source | URL | Access |
|---|---|---|---|
| T-JPL-APPROX | JPL SSD, Approximate positions of the planets | https://ssd.jpl.nasa.gov/planets/approx_pos.html | read |
| T-DE440 | JPL SSD, Planetary and lunar ephemerides (DE440/DE441 export) | https://ssd.jpl.nasa.gov/planets/eph_export.html | read |
| T-HORIZONS | JPL Horizons system | https://ssd.jpl.nasa.gov/horizons/ | read |
| T-VSOP87 | Wikipedia, VSOP model | https://en.wikipedia.org/wiki/VSOP_model | read |
| T-ASTRO-ENGINE | Astronomy Engine (Don Cross), GitHub | https://github.com/cosinekitty/astronomy | read |
| T-IAU-WGCCRE | Archinal et al., Report of the IAU WGCCRE: 2015 (CMDA 130:22, 2018) | https://pubs.usgs.gov/publication/70212485 ; https://www.usgs.gov/centers/astrogeology-science-center/science/iau-wgccre | summary (abstract) |
| T-SIDEREAL | Wikipedia, Sidereal time (sidereal day, Earth Rotation Angle) | https://en.wikipedia.org/wiki/Sidereal_time | read |
| T-MOON-ORBIT | Wikipedia, Orbit of the Moon | https://en.wikipedia.org/wiki/Orbit_of_the_Moon | read |
| T-TT | Wikipedia, Terrestrial Time | https://en.wikipedia.org/wiki/Terrestrial_Time | read |
| T-TDB | Wikipedia, Barycentric Dynamical Time | https://en.wikipedia.org/wiki/Barycentric_Dynamical_Time | read |
| T-LEAP | Wikipedia, Leap second | https://en.wikipedia.org/wiki/Leap_second | read |
| T-EPOCH | Wikipedia, Epoch (astronomy) | https://en.wikipedia.org/wiki/Epoch_(astronomy) | read |
| T-JD | Wikipedia, Julian day | https://en.wikipedia.org/wiki/Julian_day | read |
| T-UNIX | Wikipedia, Unix time | https://en.wikipedia.org/wiki/Unix_time | read |
| T-FLOAT64 | Wikipedia, Double-precision floating-point format | https://en.wikipedia.org/wiki/Double-precision_floating-point_format | read |
| T-ORBITER | Wikipedia, Orbiter (simulator) | https://en.wikipedia.org/wiki/Orbiter_(simulator) | read |
| T-CELESTIA | Wikipedia, Celestia | https://en.wikipedia.org/wiki/Celestia | read |
| T-RSS | KSP-RO, Real Solar System (GitHub) | https://github.com/KSP-RO/RealSolarSystem | read |
| T-PRINCIPIA-WIKI | Principia wiki | https://github.com/mockingbirdnest/Principia/wiki | read |
| T-RP1 | KSP-RO, RP-1 (GitHub) | https://github.com/KSP-RO/RP-0 | read (start date: community reports only) |
| T-JNSQ | KSP forum, JNSQ | https://forum.kerbalspaceprogram.com/ (JNSQ release thread) | summary |
| T-KSRSS | KSP forum, KSRSS | https://forum.kerbalspaceprogram.com/ (KSRSS release thread) | summary |
| T-DV-LEO | Wikipedia, Delta-v budget | https://en.wikipedia.org/wiki/Delta-v_budget | read |
| T-MARS-TRANSFER | Wikipedia, Delta-v budget (Mars transfer ≈ 8.5 months); MIT trajectory page (258.6 d) | https://en.wikipedia.org/wiki/Delta-v_budget ; https://web.mit.edu/12.000/www/finalpresentation/traj/free.html | read / summary |
| T-SYNODIC | Wikipedia, Synodic period | https://en.wikipedia.org/wiki/Synodic_period | read |
| T-KSP-DV | r/KerbalAcademy guide (≈3 400 m/s to 80 km); KSP forum delta-v map thread (an older map shows 4 550) | https://forum.kerbalspaceprogram.com/topic/59179-how-to-calculate-a-deltav-map | summary, conflicting |

## Known gaps

- Exact KSP1 numbers (CommNet defaults, contract reward tables, strategy percentages, science multipliers): use the companion KSP documents or a local copy of the game data.
- Not researched: Mindustry, Dyson Sphere Program logistics, Space Agency 2138, Spaceflight Simulator career, Children of a Dead Earth, Celestia, Orbiter's propagation method.
- WebGPU dates differ between sources (Safari June vs September 2025); check MDN/caniuse before relying on them.
- `09`: exact IAU coefficients, Principia's initial epoch, RSS date handling, ELP/MPP02 accuracy, DE440 file size and a BIPM primary source for the 2026 UTC resolution were not verified. The JNSQ and KSRSS forum thread URLs were not recorded; search the KSP forum add-on releases.
