# 00 — Sources

All sources cited across this set, grouped by the document that cites them. Each document keeps its own `[S#]` numbering, so `[S3]` in `05-…` is the third entry under "05" below. Every source was checked on **2026-10-17**.

## How to weigh these sources

| Kind | Reliability | Notes |
|---|---|---|
| Official: kerbalspaceprogram.com, patch notes, dev diaries, Steam store/news | High for "what shipped / what was announced" | Announcements are intent, not delivery; KSP2 roadmap items never shipped. |
| Official KSP wiki (wiki.kerbalspaceprogram.com) | High for KSP1 numbers | Blocked automated fetches (bot protection) during this research; many entries were read from search-result excerpts and are marked so. |
| kerbal.wiki (KSP2 community wiki), Wikipedia | Medium–high | Fully readable; the main source for KSP2 For Science! numbers and dates. |
| Fandom wikis | Medium | Returned HTTP 402 to fetches; excerpts only. |
| Official forum (forum.kerbalspaceprogram.com) | Medium (dev posts high, player posts = player voice) | Returned HTTP 403; excerpts only. The forum went offline in Oct 2024 and later returned in archived form, so links may break. |
| Reviews / press (PC Gamer, RPS, Bloomberg, etc.) | Medium–high for events and reception | Opinions are labelled as such. |
| Reddit / Steam reviews | Player sentiment only | Never used as the only source for a mechanic. |
| Mod pages (GitHub, SpaceDock) | High for the mod's own behaviour | Prior art, not stock behaviour. |

Facts written "(snippet)", "(recalled)", "(from memory, unverified)" or "†" inside the documents were not re-checked against a full page this session — verify before using them as numbers in an ADR.

## Known corrections to common assumptions (found during research)

- KSP2's last patch, **v0.2.2.0, shipped 11 June 2024** (announced April 2024). Intercept Games layoffs took effect 28 June 2024.
- The 2024 review bomb of KSP2 was about the studio closure; the **launcher/EULA backlash was a KSP1 event (Nov 2022)**.
- Take-Two sold Private Division in **November 2024**; the label was renamed **Fictions** (June 2025). No KSP2 plans have been announced.
- KSP1's editor **did** have undo (Ctrl+Z); complaints were about bugs and discoverability.
- KSP2's onboarding is the **Training Center** (four lesson sets), not a "KSP Academy".
- Neither KSP1 (PC) nor KSP2 has Steam achievements; KSP1's console edition has 44.
- KSP2 shipped with **no line-of-sight occlusion** for comms and no ISRU, roles, XP or money.


- [S1] KSP Wiki — "Game Difficulty". https://wiki.kerbalspaceprogram.com/wiki/Game_Difficulty — checked 2026-10-17 — official community wiki. Read via search excerpts because direct fetch was blocked.
- [S2] KSP Wiki — "Tutorial: Game Manual". https://wiki.kerbalspaceprogram.com/wiki/Tutorial:Game_Manual — checked 2026-10-17 — official community wiki (via search excerpt).
- [S3] Critic.co.nz — "Kerbal Space Program" review. https://www.critic.co.nz/culture/article/5195/kerbal-space-program — checked 2026-10-17 — review.
- [S4] KSP Forum — "Settings explained" (KSP1 Tutorials). https://forum.kerbalspaceprogram.com/topic/158325-settings-explained/ — checked 2026-10-17 — forum post (older, ~2017). Seen via search excerpt.
- [S5] Wikipedia — "Kerbal Space Program 2". https://en.wikipedia.org/wiki/Kerbal_Space_Program_2 — checked 2026-10-17 — encyclopedia (secondary, well-cited).
- [S6] kerbal.wiki — "0.2.2.0". https://kerbal.wiki/0.2.2.0 — checked 2026-10-17 — community KSP2 wiki.
- [S7] changelog.gg — KSP2 update history. https://changelog.gg/games/kerbal-space-program-2-954850/updates — checked 2026-10-17 — aggregator of official Steam news.
- [S8] KSP Forum — "Is there a way to save the game" / save-file explanations (KSP1). https://forum.kerbalspaceprogram.com/topic/190942-is-there-a-way-to-save-the-game — checked 2026-10-17 — forum post (via search excerpt).
- [S9] GamePretty — "KSP2: How to Move Your Blueprints Between Campaign Save File". https://gamepretty.com/kerbal-space-program-2-how-to-move-your-blueprints-between-campaign-save-file/ — checked 2026-10-17 — community guide (Steam guide mirror).
- [S10] SpaceDock — "Savefile Pruner" (KSP2 mod). https://spacedock.info/mod/3348/Savefile%20Pruner — checked 2026-10-17 — mod page (community).
- [S11] KSP Forum — "How do I load autosaves". https://forum.kerbalspaceprogram.com/topic/26134-how-do-i-load-autosaves/ — checked 2026-10-17 — forum post.
- [S12] KSP Forum — "v0.2.0.0 'For Science!' Release Notes". https://forum.kerbalspaceprogram.com/ksp2-release-notes/v0200-for-science-r12/ — checked 2026-10-17 — official patch notes (via search excerpt).
- [S13] PCGamesN — "Kerbal Space Program 2's For Science update adds new Exploration mode". https://www.pcgamesn.com/kerbal-space-program-2/for-science — checked 2026-10-17 — games press.
- [S14] PC Gamer — "Kerbal Space Program director explains why 'colonies are going to change everything'". https://www.pcgamer.com/kerbal-space-program-director-explains-why-colonies-are-going-to-change-everything-lays-out-early-access-plans/ — checked 2026-10-17 — games press interview (2023, via search excerpt).
- [S15] KSP Wiki — "Woomerang Launch Site". https://wiki.kerbalspaceprogram.com/wiki/Woomerang_Launch_Site — checked 2026-10-17 — official community wiki (via search excerpt); plus a Steam discussion on enabling sites mid-career (anecdotal).
- [S16] Steam Community — "Should I buy KSP 2?" discussion. https://steamcommunity.com/app/954850/discussions/0/4033601393691441189/ — checked 2026-10-17 — player forum post (low reliability).
- [S17] kerbal.wiki — "Training Center". https://kerbal.wiki/Training_Center — checked 2026-10-17 — community KSP2 wiki.
- [S18] kerbal.wiki — "Tutorials". https://kerbal.wiki/Tutorials — checked 2026-10-17 — community KSP2 wiki.

- [S1] KSP Wiki — "Vehicle Assembly Building". https://wiki.kerbalspaceprogram.com/wiki/Vehicle_Assembly_Building — checked 2026-10-17 — official community wiki (via search excerpt; direct fetch blocked).
- [S2] KSP Wiki — "Tutorial: Game Manual". https://wiki.kerbalspaceprogram.com/wiki/Tutorial:Game_Manual — checked 2026-10-17 — official community wiki (via search excerpt).
- [S3] KSP Forum — "Which KSC upgrade first?" and Komplexity mod page. https://forum.kerbalspaceprogram.com/topic/128493-which-ksc-upgrade-first/ ; https://spacedock.info/mod/2805/Komplexity — checked 2026-10-17 — forum post (2015) / mod page.
- [S4] KSP Wiki — "Spaceplane Hangar". https://wiki.kerbalspaceprogram.com/wiki/Spaceplane_Hangar — checked 2026-10-17 — official community wiki (via search listing; costs not read).
- [S5] KSP Wiki — "Runway" and "Launch Pad". https://wiki.kerbalspaceprogram.com/wiki/Runway ; https://wiki.kerbalspaceprogram.com/wiki/Launch_Pad — checked 2026-10-17 — official community wiki (via search excerpt).
- [S6] KSP Wiki — "Tracking Station". https://wiki.kerbalspaceprogram.com/wiki/Tracking_Station — checked 2026-10-17 — official community wiki (via search excerpt).
- [S7] KSP Wiki — "Administration Building"; KSP Forum — "Why can't I exceed 15 contracts with fully leveled-up Mission Control?". https://wiki.kerbalspaceprogram.com/wiki/Administration_Building ; https://forum.kerbalspaceprogram.com/topic/169453-why-cant-i-exceed-15-contracts-with-fully-leveled-up-mission-control/ — checked 2026-10-17 — official community wiki / forum post.
- [S8] KSP Wiki — "Astronaut Complex". https://wiki.kerbalspaceprogram.com/wiki/Astronaut_Complex — checked 2026-10-17 — official community wiki (via search excerpt).
- [S9] KSP Wiki — "0.90.0". https://wiki.kerbalspaceprogram.com/wiki/0.90.0 — checked 2026-10-17 — official community wiki (version history).
- [S10] KSP Wiki — "Technology tree"; Steam discussion "Can't get past some kind of level for research". https://wiki.kerbalspaceprogram.com/wiki/Technology_tree ; https://steamcommunity.com/app/220200/discussions/0/626329821155983346/ — checked 2026-10-17 — official community wiki / player forum (low reliability for costs).
- [S11] KSP Fandom — "Science". https://kerbalspaceprogram.fandom.com/wiki/Science — checked 2026-10-17 — community wiki (via search excerpt).
- [S12] KSP Wiki — "Game Difficulty" (Indestructible Facilities). https://wiki.kerbalspaceprogram.com/wiki/Game_Difficulty — checked 2026-10-17 — official community wiki (via search excerpt).
- [S13] KSP Wiki — "Woomerang Launch Site", "Dessert Launch Site", "Dessert Airfield". https://wiki.kerbalspaceprogram.com/wiki/Woomerang_Launch_Site ; https://wiki.kerbalspaceprogram.com/wiki/Dessert_Launch_Site ; https://wiki.kerbalspaceprogram.com/wiki/Dessert_Airfield — checked 2026-10-17 — official community wiki (stub pages, via search excerpt).
- [S14] kerbal.wiki — "Kerbal Space Center" (KSP2). https://kerbal.wiki/Kerbal_Space_Center — checked 2026-10-17 — community KSP2 wiki.
- [S15] PCGamesN — "KSP2's For Science update adds new Exploration mode". https://www.pcgamesn.com/kerbal-space-program-2/for-science — checked 2026-10-17 — games press.
- [S16] KSP Forum — "The Comprehensive Colony Communications Archive". https://forum.kerbalspaceprogram.com/topic/224423-the-comprehensive-colony-communications-archive/ — checked 2026-10-17 — forum compilation of official developer statements (via search excerpt).
- [S17] PC Gamer — "Kerbal Space Program director explains why 'colonies are going to change everything'". https://www.pcgamer.com/kerbal-space-program-director-explains-why-colonies-are-going-to-change-everything-lays-out-early-access-plans/ — checked 2026-10-17 — games press interview (2023, via search excerpt).
- [S18] AnandTech Forums — "The Kerbal Space Program (KSP) Thread" (career pacing comments). https://forums.anandtech.com/threads/the-kerbal-space-program-ksp-thread.2364657/post-37260471 — checked 2026-10-17 — forum post (anecdotal).


## 01-game-structure-and-modes.md

- [S1] KSP Wiki — "Game Difficulty". https://wiki.kerbalspaceprogram.com/wiki/Game_Difficulty — checked 2026-10-17 — official community wiki. Read via search excerpts because direct fetch was blocked.
- [S2] KSP Wiki — "Tutorial: Game Manual". https://wiki.kerbalspaceprogram.com/wiki/Tutorial:Game_Manual — checked 2026-10-17 — official community wiki (via search excerpt).
- [S3] Critic.co.nz — "Kerbal Space Program" review. https://www.critic.co.nz/culture/article/5195/kerbal-space-program — checked 2026-10-17 — review.
- [S4] KSP Forum — "Settings explained" (KSP1 Tutorials). https://forum.kerbalspaceprogram.com/topic/158325-settings-explained/ — checked 2026-10-17 — forum post (older, ~2017). Seen via search excerpt.
- [S5] Wikipedia — "Kerbal Space Program 2". https://en.wikipedia.org/wiki/Kerbal_Space_Program_2 — checked 2026-10-17 — encyclopedia (secondary, well-cited).
- [S6] kerbal.wiki — "0.2.2.0". https://kerbal.wiki/0.2.2.0 — checked 2026-10-17 — community KSP2 wiki.
- [S7] changelog.gg — KSP2 update history. https://changelog.gg/games/kerbal-space-program-2-954850/updates — checked 2026-10-17 — aggregator of official Steam news.
- [S8] KSP Forum — "Is there a way to save the game" / save-file explanations (KSP1). https://forum.kerbalspaceprogram.com/topic/190942-is-there-a-way-to-save-the-game — checked 2026-10-17 — forum post (via search excerpt).
- [S9] GamePretty — "KSP2: How to Move Your Blueprints Between Campaign Save File". https://gamepretty.com/kerbal-space-program-2-how-to-move-your-blueprints-between-campaign-save-file/ — checked 2026-10-17 — community guide (Steam guide mirror).
- [S10] SpaceDock — "Savefile Pruner" (KSP2 mod). https://spacedock.info/mod/3348/Savefile%20Pruner — checked 2026-10-17 — mod page (community).
- [S11] KSP Forum — "How do I load autosaves". https://forum.kerbalspaceprogram.com/topic/26134-how-do-i-load-autosaves/ — checked 2026-10-17 — forum post.
- [S12] KSP Forum — "v0.2.0.0 'For Science!' Release Notes". https://forum.kerbalspaceprogram.com/ksp2-release-notes/v0200-for-science-r12/ — checked 2026-10-17 — official patch notes (via search excerpt).
- [S13] PCGamesN — "Kerbal Space Program 2's For Science update adds new Exploration mode". https://www.pcgamesn.com/kerbal-space-program-2/for-science — checked 2026-10-17 — games press.
- [S14] PC Gamer — "Kerbal Space Program director explains why 'colonies are going to change everything'". https://www.pcgamer.com/kerbal-space-program-director-explains-why-colonies-are-going-to-change-everything-lays-out-early-access-plans/ — checked 2026-10-17 — games press interview (2023, via search excerpt).
- [S15] KSP Wiki — "Woomerang Launch Site". https://wiki.kerbalspaceprogram.com/wiki/Woomerang_Launch_Site — checked 2026-10-17 — official community wiki (via search excerpt); plus a Steam discussion on enabling sites mid-career (anecdotal).
- [S16] Steam Community — "Should I buy KSP 2?" discussion. https://steamcommunity.com/app/954850/discussions/0/4033601393691441189/ — checked 2026-10-17 — player forum post (low reliability).
- [S17] kerbal.wiki — "Training Center". https://kerbal.wiki/Training_Center — checked 2026-10-17 — community KSP2 wiki.
- [S18] kerbal.wiki — "Tutorials". https://kerbal.wiki/Tutorials — checked 2026-10-17 — community KSP2 wiki.

## 02-space-center-and-buildings.md

- [S1] KSP Wiki — "Vehicle Assembly Building". https://wiki.kerbalspaceprogram.com/wiki/Vehicle_Assembly_Building — checked 2026-10-17 — official community wiki (via search excerpt; direct fetch blocked).
- [S2] KSP Wiki — "Tutorial: Game Manual". https://wiki.kerbalspaceprogram.com/wiki/Tutorial:Game_Manual — checked 2026-10-17 — official community wiki (via search excerpt).
- [S3] KSP Forum — "Which KSC upgrade first?" and Komplexity mod page. https://forum.kerbalspaceprogram.com/topic/128493-which-ksc-upgrade-first/ ; https://spacedock.info/mod/2805/Komplexity — checked 2026-10-17 — forum post (2015) / mod page.
- [S4] KSP Wiki — "Spaceplane Hangar". https://wiki.kerbalspaceprogram.com/wiki/Spaceplane_Hangar — checked 2026-10-17 — official community wiki (via search listing; costs not read).
- [S5] KSP Wiki — "Runway" and "Launch Pad". https://wiki.kerbalspaceprogram.com/wiki/Runway ; https://wiki.kerbalspaceprogram.com/wiki/Launch_Pad — checked 2026-10-17 — official community wiki (via search excerpt).
- [S6] KSP Wiki — "Tracking Station". https://wiki.kerbalspaceprogram.com/wiki/Tracking_Station — checked 2026-10-17 — official community wiki (via search excerpt).
- [S7] KSP Wiki — "Administration Building"; KSP Forum — "Why can't I exceed 15 contracts with fully leveled-up Mission Control?". https://wiki.kerbalspaceprogram.com/wiki/Administration_Building ; https://forum.kerbalspaceprogram.com/topic/169453-why-cant-i-exceed-15-contracts-with-fully-leveled-up-mission-control/ — checked 2026-10-17 — official community wiki / forum post.
- [S8] KSP Wiki — "Astronaut Complex". https://wiki.kerbalspaceprogram.com/wiki/Astronaut_Complex — checked 2026-10-17 — official community wiki (via search excerpt).
- [S9] KSP Wiki — "0.90.0". https://wiki.kerbalspaceprogram.com/wiki/0.90.0 — checked 2026-10-17 — official community wiki (version history).
- [S10] KSP Wiki — "Technology tree"; Steam discussion "Can't get past some kind of level for research". https://wiki.kerbalspaceprogram.com/wiki/Technology_tree ; https://steamcommunity.com/app/220200/discussions/0/626329821155983346/ — checked 2026-10-17 — official community wiki / player forum (low reliability for costs).
- [S11] KSP Fandom — "Science". https://kerbalspaceprogram.fandom.com/wiki/Science — checked 2026-10-17 — community wiki (via search excerpt).
- [S12] KSP Wiki — "Game Difficulty" (Indestructible Facilities). https://wiki.kerbalspaceprogram.com/wiki/Game_Difficulty — checked 2026-10-17 — official community wiki (via search excerpt).
- [S13] KSP Wiki — "Woomerang Launch Site", "Dessert Launch Site", "Dessert Airfield". https://wiki.kerbalspaceprogram.com/wiki/Woomerang_Launch_Site ; https://wiki.kerbalspaceprogram.com/wiki/Dessert_Launch_Site ; https://wiki.kerbalspaceprogram.com/wiki/Dessert_Airfield — checked 2026-10-17 — official community wiki (stub pages, via search excerpt).
- [S14] kerbal.wiki — "Kerbal Space Center" (KSP2). https://kerbal.wiki/Kerbal_Space_Center — checked 2026-10-17 — community KSP2 wiki.
- [S15] PCGamesN — "KSP2's For Science update adds new Exploration mode". https://www.pcgamesn.com/kerbal-space-program-2/for-science — checked 2026-10-17 — games press.
- [S16] KSP Forum — "The Comprehensive Colony Communications Archive". https://forum.kerbalspaceprogram.com/topic/224423-the-comprehensive-colony-communications-archive/ — checked 2026-10-17 — forum compilation of official developer statements (via search excerpt).
- [S17] PC Gamer — "Kerbal Space Program director explains why 'colonies are going to change everything'". https://www.pcgamer.com/kerbal-space-program-director-explains-why-colonies-are-going-to-change-everything-lays-out-early-access-plans/ — checked 2026-10-17 — games press interview (2023, via search excerpt).
- [S18] AnandTech Forums — "The Kerbal Space Program (KSP) Thread" (career pacing comments). https://forums.anandtech.com/threads/the-kerbal-space-program-ksp-thread.2364657/post-37260471 — checked 2026-10-17 — forum post (anecdotal).

## 03-vehicle-assembly.md

- [S1] Vehicle Assembly Building — KSP Wiki (official community wiki), https://wiki.kerbalspaceprogram.com/wiki/VAB — checked 2026-10-17. Direct fetch was blocked by bot protection, so the content comes from search excerpts. Reliable for KSP1 career numbers.
- [S2] Kerbal Space Center — KSP Wiki, https://wiki.kerbalspaceprogram.com/wiki/KSC — checked 2026-10-17. Facility upgrade table, from search excerpts. Reliable, but the version is not stated.
- [S3] "Kerbal Space Program 1.6: To Vee or not To Vee is now available" — official news, https://kerbalspaceprogram.com/news/1-6-to-vee-or-not-to-vee-is-now-available — checked 2026-10-17, together with forum thread 182245 on the 1.6 Δv glitch. Official source plus community troubleshooting.
- [S4] Kerbal Space Program — Wikipedia, https://en.wikipedia.org/wiki/Kerbal_Space_Program — checked 2026-10-17. Secondary source for version dates and the 0.90 editor overhaul.
- [S5] "Kerbal Space Program 2 Pre-Release Notes" — official KSP forum, https://forum.kerbalspaceprogram.com/topic/212081-kerbal-space-program-2-pre-release-notes — checked 2026-10-17. Official feature description of KSP2 EA. Fetch returned 403, so the content comes from search excerpts.
- [S6] "Workspaces" — KSP forum thread 214050, https://forum.kerbalspaceprogram.com/topic/214050-workspaces — checked 2026-10-17. Mixes official wording and community discussion.
- [S7] 0.1.2.0 — kerbal.wiki (KSP2 community wiki), https://kerbal.wiki/0.1.2.0 — checked 2026-10-17. A transcription of the official patch notes. Reliable.
- [S8] "KSP2 v0.1.3.0 Patch Notes" (mirror), https://ui.lemm.ee/post/263724 — checked 2026-10-17. A mirror of the official notes, from search excerpts. Moderately reliable.
- [S9] "Bug status 10/23" and "Please no wobble" — KSP forum, https://forum.kerbalspaceprogram.com/topic/220179-bug-status-1023 and https://forum.kerbalspaceprogram.com/topic/214159-please-no-wobble — checked 2026-10-17. Developer posts and community reaction, from search excerpts.
- [S10] 0.2.2.0 — kerbal.wiki, https://kerbal.wiki/0.2.2.0 — checked 2026-10-17. The last KSP2 patch (11 June 2024). Reliable transcription.
- [S11] Kerbal Space Program 2 — Wikipedia, https://en.wikipedia.org/wiki/Kerbal_Space_Program_2 — checked 2026-10-17, together with the kerbal.wiki For Science! page (https://kerbal.wiki/For_Science!) for the 9 science parts and the 4-tier tree. Secondary sources; good for timeline.
- [S12] Redux: New features — kerbal.wiki, https://kerbal.wiki/Redux:New_features — checked 2026-10-17. A community fan project, last edited Sept 2025. Shows what players felt was missing; not stock.
- [S14] "Asparagus staging help" — KSP forum thread 222457, https://forum.kerbalspaceprogram.com/topic/222457-asparagus-staging-help — checked 2026-10-17. Community reports of inconsistent KSP2 Δv. Anecdotal.
- [S15] KSP2 Steam discussion on the UI, https://steamcommunity.com/app/954850/discussions/0/3772365358797995618 — checked 2026-10-17. Player opinions. Anecdotal.
- [S16] PCGamesN "Best Kerbal Space Program mods" and RP-1 wiki "Extra Mods to Consider", https://www.pcgamesn.com/kerbal-space-program/ksp-mods and https://github.com/KSP-RO/RP-1/wiki/Extra-Mods-to-Consider — checked 2026-10-17. Secondary mod descriptions. Fair.
- [S17] Kerbal Space Program 2 — Steam store page (developer FAQ and roadmap), https://store.steampowered.com/app/954850/Kerbal_Space_Program_2/ — checked 2026-10-17. Official, from search excerpts.

## 04-flight-and-controls.md

- [S1] SAS/skill rules — KSP Wiki "Skill" page and KSP forum threads (95889, 187430), https://wiki.kerbalspaceprogram.com/wiki/Skill — checked 2026-10-17. From search excerpts. The sources disagree on probe levels, so treat those as approximate.
- [S2] "Kerbal 1.7 Room to Maneuver is now available" (official), https://kerbalspaceprogram.com/news/1-7-room-to-maneuver-release, plus KSP Wiki 1.7 (https://wiki.kerbalspaceprogram.com/wiki/1.7) and forum thread 183899 — checked 2026-10-17. Official plus community.
- [S3] "Kerbal Space Program 1.12: On Final Approach is now available" — KSP forum 203227, https://forum.kerbalspaceprogram.com/topic/203227-kerbal-space-program-112-on-final-approach-is-now-available — checked 2026-10-17. Official release notes, from search excerpts.
- [S4] KSP API docs "TimeWarp" (https://kerbalspaceprogram.com/ksp/api/class_time_warp.html) and "Time Control" mod thread (https://forum.kerbalspaceprogram.com/topic/143763-112-time-control-211) — checked 2026-10-17. The warp-rate list is standard KSP1 knowledge; the altitude limits were not verified.
- [S5] 0.1.2.0 — kerbal.wiki, https://kerbal.wiki/0.1.2.0 — checked 2026-10-17. A transcription of the official KSP2 patch notes (12 April 2023). Reliable.
- [S6] "Planned manoeuvres do not go as planned" — KSP forum 216534 (developer reply), https://forum.kerbalspaceprogram.com/topic/216534-planned-manoeuvres-do-not-go-as-planned — checked 2026-10-17. Developer statement, from search excerpts.
- [S7] "Acceleration during time warp doesn't work" (218717) and "KSP2 EA about the warp" (211470) — KSP forum, https://forum.kerbalspaceprogram.com/topic/218717-acceleration-during-time-warp-doesnt-work — checked 2026-10-17. Community reports. Anecdotal but consistent.
- [S8] KSP2 maneuver-node critique threads (222273, 219842, 223815 "One year of KSP2") — KSP forum, https://forum.kerbalspaceprogram.com/topic/222273-the-way-that-maneuver-nodes-seemingly-work-is-quite-silly — checked 2026-10-17. Community opinion.
- [S9] 0.2.2.0 — kerbal.wiki, https://kerbal.wiki/0.2.2.0 — checked 2026-10-17. The final KSP2 patch (11 June 2024). Reliable transcription.
- [S10] KSP2 Steam discussion on the UI, https://steamcommunity.com/app/954850/discussions/0/3772365358797995618 — checked 2026-10-17. Player opinion.
- [S11] "Kerbal Alarm Clock" forum thread (TriggerAu), https://forum.kerbalspaceprogram.com/topic/22809-112x-kerbal-alarm-clock-v31300-april-10 — checked 2026-10-17. Mod author thread.
- [S12] Maneuver Node Controller (https://spacedock.info/mod/3270/Maneuver%20Node%20Controller) and Flight Plan (https://spacedock.info/mod/3359/Flight%20Plan) — SpaceDock — checked 2026-10-17. Mod pages.
- [S13] Redux: New features — kerbal.wiki, https://kerbal.wiki/Redux:New_features — and the K2-D2 Redux listing, https://spacedock.info/mod/4508 — checked 2026-10-17. A community fan project; not stock.
- [S14] Kerbal Space Program 2 — Wikipedia, https://en.wikipedia.org/wiki/Kerbal_Space_Program_2 — checked 2026-10-17. Secondary source; timeline.
- [S15] "KSP 1.6: To Vee or not To Vee" (official), https://kerbalspaceprogram.com/news/1-6-to-vee-or-not-to-vee-is-now-available — checked 2026-10-17. Official.
- [S16] PCGamesN "Best KSP mods" (https://www.pcgamesn.com/kerbal-space-program/ksp-mods) and RP-1 wiki "Extra Mods to Consider" (https://github.com/KSP-RO/RP-1/wiki/Extra-Mods-to-Consider) — checked 2026-10-17. Secondary mod descriptions.
- [S17] "KSP2 v0.1.1.0 Patch Notes" (official), https://kerbalspaceprogram.com/news/ksp2-v0-1-1-0-patch-notes — checked 2026-10-17 (the page returned 404 on fetch; content from search excerpts and forum mirror 215108). Official.

## 05-science-and-research.md

- [S1] KSP Wiki, "Science", https://wiki.kerbalspaceprogram.com/wiki/Science, checked 2026-10-17. Community wiki (official-hosted); bot-blocked, used via search snippets.
- [S2] KSP Wiki, "Talk:Science", https://wiki.kerbalspaceprogram.com/wiki/Talk:Science, checked 2026-10-17. Community wiki talk page; speculative formula, snippets only.
- [S3] KSP Forum, "Understanding science points", https://forum.kerbalspaceprogram.com/topic/56973-understanding-science-points, checked 2026-10-17. Forum post (community explanation, older version).
- [S4] KSP Forum, "Kerbol orbit disappointing science return", https://forum.kerbalspaceprogram.com/topic/123699-kerbol-orbit-disappointing-science-return, checked 2026-10-17. Forum post.
- [S5] KSP Forum, "How to find the boundary between high space and near space", https://forum.kerbalspaceprogram.com/topic/123787-how-to-find-the-boundary-between-high-space-and-near-space, checked 2026-10-17. Forum post; conflicting answers.
- [S6] KSP Wiki, "Mobile Processing Lab MPL-LG-2", https://wiki.kerbalspaceprogram.com/wiki/Mobile_Processing_Lab_MPL-LG-2, checked 2026-10-17. Community wiki (snippets).
- [S7] KSP Forum, "Reducing data/science conversion rate in Mobile Processing Lab", https://forum.kerbalspaceprogram.com/topic/184716-reducing-data-science-conversion-rate-in-mobile-processing-lab, checked 2026-10-17. Forum post.
- [S8] KSP Wiki, "Technology tree", https://wiki.kerbalspaceprogram.com/wiki/Tech_tree, checked 2026-10-17. Community wiki (snippets).
- [S9] KSP Wiki, "Research and Development", https://wiki.kerbalspaceprogram.com/wiki/Research_and_Development, checked 2026-10-17. Community wiki (snippets).
- [S10] KSP Wiki "Breaking Ground", https://wiki.kerbalspaceprogram.com/wiki/Breaking_Ground, and official product page https://kerbalspaceprogram.com/games-breakingground, checked 2026-10-17. Wiki plus official marketing (snippets).
- [S11] Kerbal Wiki (KSP2), "Science", https://kerbal.wiki/Science, checked 2026-10-17. KSP2 community wiki, edited Sept 2024; fetched in full.
- [S12] Kerbal Wiki (KSP2), "Tech Tree" and "Missions", https://kerbal.wiki/Tech_Tree, https://kerbal.wiki/Missions, checked 2026-10-17. KSP2 community wiki; some internal inconsistencies.
- [S13] Kerbal Wiki (KSP2), "For Science!", https://kerbal.wiki/For_Science!, checked 2026-10-17. KSP2 community wiki (release-note summary).
- [S14] Steam news, KSP2 "For Science!" announcement/patch notes, https://store.steampowered.com/news/posts/?feed=steam_community_announcements&appids=954850, checked 2026-10-17. Official.
- [S15] PCGamesN, "…Kerbal Space Program 2…For Science", https://www.pcgamesn.com/kerbal-space-program-2/for-science, checked 2026-10-17. Press article with developer interviews.
- [S16] kontrolsystem2 docs, "ksp::science", https://kontrolsystem2.readthedocs.io/en/latest/reference/ksp/science.html, checked 2026-10-17. Public mod scripting API reference (shows KSP2 data model; not official).
- [S17] Wikipedia, "Kerbal Space Program 2", https://en.wikipedia.org/wiki/Kerbal_Space_Program_2, checked 2026-10-17. Encyclopedia (secondary).
- [S18] PC Gamer, "Kerbal Space Program developers confirm layoffs are coming at the end of June", https://pcgamer.com/gaming-industry/kerbal-space-program-developers-confirm-layoffs-are-coming-at-the-end-of-june, checked 2026-10-17. Press.
- [S19] Ludo.guide, "Scientific Instruments — KSP", https://www.ludo.guide/guide/kerbal-space-program/items-equipment/utility-science/scientific-instruments, checked 2026-10-17. Low-reliability guide site (only confirmed instrument names).
- [S20] KSP official news, "What's next: Early Access roadmap", https://kerbalspaceprogram.com/news/ksp-2-news-article-whats-next-early-access-roadmap-1, checked 2026-10-17. Official (via search summary).
- [S21] KSP Forum, "KSP2 science progress" (2022 design-wish thread), https://forum.kerbalspaceprogram.com/topic/210215-ksp2-science-progress, checked 2026-10-17. Forum post (community wishes, not documentation).

## 06-missions-contracts-achievements.md

- [S1] Kerbal Wiki (KSP2), "Missions", https://kerbal.wiki/Missions, checked 2026-10-17. KSP2 community wiki; fetched in full.
- [S2] Kerbal Wiki (KSP2), "Mission Control", https://kerbal.wiki/Mission_Control, checked 2026-10-17. KSP2 community wiki (via search snippet).
- [S3] Steam news, KSP2 "For Science!" announcement/patch notes, https://store.steampowered.com/news/posts/?feed=steam_community_announcements&appids=954850, checked 2026-10-17. Official.
- [S4] KSP Wiki, "Exploration mode", https://wiki.kerbalspaceprogram.com/wiki/Exploration_mode, checked 2026-10-17. Community wiki (snippet).
- [S5] KSP Wiki, "Contract", https://wiki.kerbalspaceprogram.com/wiki/Contract, checked 2026-10-17. Community wiki (snippets).
- [S6] KSP Forum dev article, "First Contract v0.24.0 complete changelog", https://forum.kerbalspaceprogram.com/developerarticles.html/ksp-first-contract-v0240-complete-changelog-r131, checked 2026-10-17. Official (snippet).
- [S7] KSP Forum dev article, "First Contract: the FAQ", https://forum.kerbalspaceprogram.com/developerarticles.html/kerbal-space-program-first-contract-the-faq-r129, checked 2026-10-17. Official (snippet).
- [S8] KSP Wiki, "Reputation", https://wiki.kerbalspaceprogram.com/wiki/Reputation, checked 2026-10-17. Community wiki (snippet).
- [S9] KSP Wiki, "Mission Builder Manual", https://wiki.kerbalspaceprogram.com/wiki/Mission_Builder_Manual, checked 2026-10-17. Official manual hosted on the wiki (table of contents via snippet).
- [S10] KSP Wiki, "Making History", https://wiki.kerbalspaceprogram.com/wiki/Making_history, checked 2026-10-17. Community wiki (snippet).
- [S11] Official product page, "Kerbal Space Program: Making History", https://www.kerbalspaceprogram.com/product/kerbal-space-program-making-history/, checked 2026-10-17. Official marketing (snippet).
- [S12] KSP bug tracker, issue 18571 (Vessel Mass node), https://bugs.kerbalspaceprogram.com/issues/18571, checked 2026-10-17. Official bug tracker (snippet).
- [S13] Contract Configurator GitHub wiki, "How To", https://github.com/jrossignol/ContractConfigurator/wiki/How-To, checked 2026-10-17. Mod documentation (snippet).
- [S14] KSP Forum, "Contract packs for Contract Configurator — general thread", https://forum.kerbalspaceprogram.com/topic/97031-contract-packs-for-contract-configurator-general-thread, checked 2026-10-17. Forum post.
- [S15] KSP Forum, "Contract Configurator" release thread (p.197), https://forum.kerbalspaceprogram.com/topic/91625-1101-contract-configurator-v1305-2020-10-05/page/197, checked 2026-10-17. Forum post.
- [S16] Entertainium, "Review: One year into Kerbal Space Program 2 Early Access", https://entertainium.co/2024/02/28/kerbal-space-program-2-review/, checked 2026-10-17. Review (snippet).
- [S17] KSP Forum, "For Science update — early feedback", https://forum.kerbalspaceprogram.com/topic/221642-for-science-update-early-feedback, checked 2026-10-17. Forum post (player report, snippet).
- [S18] KSP official news, "What's next: Early Access roadmap", https://kerbalspaceprogram.com/news/ksp-2-news-article-whats-next-early-access-roadmap-1, checked 2026-10-17. Official (snippet).
- [S19] Steam Community stats pages, https://steamcommunity.com/stats/220200/achievements and https://steamcommunity.com/stats/954850/achievements, checked 2026-10-17. Official platform pages ("No stats are available").
- [S20] TrueAchievements, "Kerbal Space Program achievements", https://www.trueachievements.com/game/Kerbal-Space-Program/achievements, checked 2026-10-17. Achievement tracker for the console edition (snippet).
- [S21] CurseForge, "KSP Achievements" mod, https://www.curseforge.com/kerbal/ksp-mods/ksp-achievements, checked 2026-10-17. Mod page (snippet).
- [S22] IsThereAnyDeal product entry for KSP2, https://isthereanydeal.com/product/01956b76-0935-733b-a767-0d8acfb555ba/, checked 2026-10-17. Third-party store tracker (low reliability).

## 07-economy-and-career.md

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

## 08-crew.md

- [S1] KSP Wiki, "Skill", https://wiki.kerbalspaceprogram.com/wiki/Skill, checked 2026-10-17. Community wiki (snippet).
- [S2] KSP Forum, tag "specializations", https://forum.kerbalspaceprogram.com/tags/specializations, checked 2026-10-17. Forum posts (snippet).
- [S3] KSP Forum, "New experience table" / "Kerbal leveling", https://forum.kerbalspaceprogram.com/topic/107851-new-expierence-table and https://forum.kerbalspaceprogram.com/topic/130929-kerbal-leveling, checked 2026-10-17. Forum posts (community-measured values, snippets).
- [S4] SpaceDock, "KerbalStats" / Field Experience mod description, https://spacedock.info/mod/3736/KerbalStats, checked 2026-10-17. Mod page (describes stock career-log rule; snippet).
- [S5] Steam Community discussion (KSP), https://steamcommunity.com/app/220200/discussions/0/627456486930588325, checked 2026-10-17. Player post, 2015 (snippet; anecdotal).
- [S6] KSP Wiki, "Astronaut Complex", https://wiki.kerbalspaceprogram.com/wiki/Astronaut_Complex, checked 2026-10-17. Community wiki (snippet: hire formula, roster caps, EVA gate). The 5% MIA figure is from a mod thread in the same search, https://forum.kerbalspaceprogram.com/topic/163315-112x-trp-hire-formerly-ksi-hiring.
- [S7] Kerbal Wiki (KSP2), "Science", https://kerbal.wiki/Science, checked 2026-10-17. KSP2 community wiki; fetched in full.
- [S8] Steam news, KSP2 "For Science!" announcement/patch notes, https://store.steampowered.com/news/posts/?feed=steam_community_announcements&appids=954850, checked 2026-10-17. Official.
- [S9] kontrolsystem2 docs, "ksp::science", https://kontrolsystem2.readthedocs.io/en/latest/reference/ksp/science.html, checked 2026-10-17. Public mod API reference (shows `crew_required`, INSUFFICIENTCREW).
- [S10] Kerbal Wiki (KSP2), "Kerbals", https://kerbal.wiki/Kerbals, checked 2026-10-17. KSP2 community wiki; lore-heavy, little on mechanics.
- [S11] Kerbal Wiki (KSP2), "For Science!", https://kerbal.wiki/For_Science!, checked 2026-10-17. KSP2 community wiki (release-note summary).
- [S12] KSP Wiki, "Exploration mode", https://wiki.kerbalspaceprogram.com/wiki/Exploration_mode, checked 2026-10-17. Community wiki (snippet: missions instead of contracts, science-only rewards).
- [S13] KSP official news, "What's next: Early Access roadmap", https://kerbalspaceprogram.com/news/ksp-2-news-article-whats-next-early-access-roadmap-1, checked 2026-10-17. Official (snippet).
- [S14] PC Gamer, "Kerbal Space Program developers confirm layoffs are coming at the end of June", https://pcgamer.com/gaming-industry/kerbal-space-program-developers-confirm-layoffs-are-coming-at-the-end-of-june, checked 2026-10-17. Press.

## 09-communications-network.md

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

## 10-celestial-bodies-and-world.md

- [S1] KSP Wiki — "Kerbol System". https://wiki.kerbalspaceprogram.com/wiki/Kerbol_System — checked 2026-10-17 — official community wiki, via search excerpts (direct fetch blocked).
- [S2] KSP Wiki — "Kerbin" and "Mün" pages (μ, rotation, orbital period, Mun SMA and period), plus the Fandom "Kerbin" page (21,600 s rotation discrepancy). https://wiki.kerbalspaceprogram.com/wiki/Kerbin ; https://wiki.kerbalspaceprogram.com/wiki/Mün ; https://kerbalspaceprogram.fandom.com/wiki/Kerbin — checked 2026-10-17 — community wikis, via search excerpts.
- [S3] KSP Wiki — "Kerbol" (radius, gravity, atmosphere height). https://wiki.kerbalspaceprogram.com/wiki/Sun — checked 2026-10-17 — official community wiki, via search excerpts.
- [S4] Search-excerpt compilation from KSP wiki "Planets and Moons" and "Solar systems" pages and avans.github.io KSP showcase pages. https://kerbalspaceprogram.fandom.com/wiki/Planets_and_Moons ; https://avans.github.io/Webdictaat/showcase/ksp/planets/jool.html — checked 2026-10-17 — community wikis and a fan page (medium; one table had a wrong Duna radius, which I excluded).
- [S5] GamePretty — "Kerbal Space Program: All Planets & Moons Guide". https://gamepretty.com/kerbal-space-program-all-planets-moons-guide/ — checked 2026-10-17 — community guide (Steam-guide mirror; qualitative facts only, low–medium).
- [S6] KSP Wiki — "KSP 2 Discoverables", and KSP Forum / Steam threads on KSP2 science regions. https://wiki.kerbalspaceprogram.com/wiki/KSP_2_Discoverables ; https://kerbal.wiki/Discoverables — checked 2026-10-17 — community wikis, via search excerpts (medium).
- [S7] KSP Wiki — "Rask", "Qeg System", "Tuun System", "KSP2"; PowerUp! Gaming "KSP2 ... Interstellar Travel" (2020). https://wiki.kerbalspaceprogram.com/wiki/Rask ; https://wiki.kerbalspaceprogram.com/wiki/Qeg_System ; https://powerup-gaming.com/2020/01/17/kerbal-space-program-2-is-going-to-take-you-to-new-places-with-interstellar-travel/ — checked 2026-10-17 — wikis (file-mined names are speculative) and games press.
- [S8] Wikipedia — "Kerbal Space Program 2". https://en.wikipedia.org/wiki/Kerbal_Space_Program_2 — checked 2026-10-17 — encyclopedia (secondary, well-cited).
- [S9] Reddit r/KerbalSpaceProgram "KSP 1 vs KSP 2" comments (save formats), via redlib mirror. https://redlib.hackliberty.org/r/KerbalSpaceProgram/comments/11g7wgz/ksp_1_vs_ksp_2/janqvlj/ — checked 2026-10-17 — player comments (low; used only for "KSP2 saves are JSON", which matches S12).
- [S10] kOS documentation — "Vessel Load Distance". https://ksp-kos.readthedocs.io/en/latest/structures/misc/loaddistance.html — checked 2026-10-17 — mod documentation (high for mechanism; gives no default numbers).
- [S11] KSP Forum — "KSP vessel lifecycle and related stuff". https://forum.kerbalspaceprogram.com/topic/88026-ksp-vessel-lifecycle-and-related-stuff — checked 2026-10-17 — player forum (author unsure of details; low–medium). Via search excerpt.
- [S12] SpaceDock — "Savefile Pruner" (KSP2), and GamePretty "KSP2: How to Move Your Blueprints Between Campaign Save File". https://spacedock.info/mod/3348 ; https://gamepretty.com/kerbal-space-program-2-how-to-move-your-blueprints-between-campaign-save-file/ — checked 2026-10-17 — mod page and community guide.
- [S13] Business Wire — "Kerbal Space Program 2 to Launch in Early Access on February 24 2023" (time warp under acceleration, fusion megaships), and KSP Forum "Orbit does not change with engine running in time warp". https://businesswire.com/news/home/20221021005039/en/Kerbal-Space-Program-2-to-Launch-in-Early-Access-on-February-24-2023/ ; https://forum.kerbalspaceprogram.com/topic/213724-orbit-does-not-change-with-engine-running-in-time-warp — checked 2026-10-17 — official press release (high) and bug report (medium).
- [S14] KSP2 Redux — Roadmap. https://ksp2redux.org/roadmap/ — checked 2026-10-17 — fan continuation project (describes its own plans).

## 11-colonies-resources-interstellar.md

- [S1] Wikipedia — "Kerbal Space Program 2". https://en.wikipedia.org/wiki/Kerbal_Space_Program_2 — checked 2026-10-17 — encyclopedia (well-cited secondary). Dates, planned features, Private Division sale, reception.
- [S2] KSP2 Redux — Roadmap. https://ksp2redux.org/roadmap/ — checked 2026-10-17 — independent fan continuation (describes its own plans; not official).
- [S3] Search compilation of EA-launch coverage: PC Gamer "Kerbal Space Program 2: Everything we know", GameSpot "KSP2's multiplayer will let you have full-on space races", Epic Games Store "KSP2 Early Access FAQ". https://www.pcgamer.com/kerbal-space-program-2-release-date-multiplayer-everything-we-know/ ; https://www.gamespot.com/articles/kerbal-space-program-2s-multiplayer-will-let-you-have-full-on-space-races/1100-6511655/ ; https://store.epicgames.com/en-US/p/kerbal-space-program-2--early-access-faq — checked 2026-10-17 — games press and official store FAQ, via search excerpts.
- [S4] PC Gamer — "Kerbal Space Program director explains why 'colonies are going to change everything,' lays out early access plans" (2023). https://www.pcgamer.com/kerbal-space-program-director-explains-why-colonies-are-going-to-change-everything-lays-out-early-access-plans/ — checked 2026-10-17 — games press interview (body not fetchable; via search excerpts).
- [S5] Steam Community — "KSP 2's Creative Director talks Colonies - Interview with Nate Simpson" (13 Mar 2024). https://steamcommunity.com/app/954850/discussions/0/4297069185835056858/ — checked 2026-10-17 — topic list plus player summaries (secondhand; low–medium).
- [S6] KSP Forum — "The Comprehensive Colony Communications Archive" and "Delivery Routes and Physics". https://forum.kerbalspaceprogram.com/topic/224423-the-comprehensive-colony-communications-archive/ ; https://forum.kerbalspaceprogram.com/topic/210678-delivery-routes-and-physics/ — checked 2026-10-17 — community archive quoting dev diaries and streams (medium–high), via search excerpts (direct fetch 403).
- [S7] KSP2 Fandom wiki — "Colonies", and KSP Wiki "KSP2" planned-parts list. https://kerbal-space-program-2.fandom.com/wiki/Colonies ; https://wiki.kerbalspaceprogram.com/wiki/KSP2 — checked 2026-10-17 — community wikis (secondhand), via search excerpts.
- [S8] KSP Wiki — "Convert-O-Tron 250" and "ISRU". https://wiki.kerbalspaceprogram.com/wiki/Convert-O-Tron_250 ; https://wiki.kerbalspaceprogram.com/wiki/ISRU — checked 2026-10-17 — official community wiki, via search excerpts. Engineer timing comes from a community guide quoted there (medium).
- [S9] KSP bug tracker — Bug #10099 (Convert-O-Tron 250 and radiator heat), plus KSP Forum "How does the Convert-O-Tron 250 work". https://bugs.kerbalspaceprogram.com/issues/10099 ; https://forum.kerbalspaceprogram.com/topic/158947-how-does-the-convert-o-tron-250-work — checked 2026-10-17 — bug report and forum (medium).
- [S10] kerbal.wiki — "0.2.0.0" (For Science! release notes summary). https://kerbal.wiki/0.2.0.0 — checked 2026-10-17 — community KSP2 wiki mirroring official notes (no ISRU, resource or colony items).
- [S11] Kerbal Space Program — "Dev Diaries: Developer Insights #13 – KSP2 Resource System" (URL now 404), plus KSP Forum threads "Questions/thoughts about late-game resources in KSP 2" and "KSP2 Resources open workshop". https://kerbalspaceprogram.com/news/dev-diaries-developer-insights-13-ksp2-resource-system ; https://forum.kerbalspaceprogram.com/topic/202817-questions-thoughts-about-late-game-resources-in-ksp-2 — checked 2026-10-17 — official dev diary (known only via search excerpt) and fan threads (low).
- [S12] Business Wire — "Kerbal Space Program 2 to Launch in Early Access on February 24 2023", plus KSP Forum "Orbit does not change with engine running in time warp" and "My low thrust probe in Jool orbit is cursed". https://businesswire.com/news/home/20221021005039/en/Kerbal-Space-Program-2-to-Launch-in-Early-Access-on-February-24-2023/ ; https://forum.kerbalspaceprogram.com/topic/213724-orbit-does-not-change-with-engine-running-in-time-warp ; https://forum.kerbalspaceprogram.com/topic/223661-my-low-thrust-probe-in-jool-orbit-is-cursed — checked 2026-10-17 — official press release (high) and player bug reports (medium).
- [S13] KSP Wiki — "KSP 2 parts" (planned engine classes), and Take-Two investor PDF (new part size class for interstellar). https://wiki.kerbalspaceprogram.com/wiki/KSP_2_parts ; https://ir.take2games.com/node/29461/pdf — checked 2026-10-17 — community wiki (planning list, partly file-mined) and official investor release, via search excerpts.
- [S14] KSP Forum — "[1.12.x] Modular Kolonization System (MKS)" thread pages, "MKS guide", and SpaceDock "RocketParts Logistics". https://forum.kerbalspaceprogram.com/topic/154587-112x-modular-kolonization-system-mks ; https://forum.kerbalspaceprogram.com/topic/196934-mks-guide ; https://spacedock.info/mod/4334/RocketParts%20Logistics — checked 2026-10-17 — mod threads and mod page (medium), via search excerpts.
- [S15] GitHub — Kerbalism/Kerbalism. https://github.com/Kerbalism/Kerbalism — checked 2026-10-17 — mod README (v3.43, KSP 1.12; high for the mod).
- [S16] KSP Forum — "[1.0.5] TAC Life Support" thread. https://forum.kerbalspaceprogram.com/topic/37449-105-tac-life-support-v01121-12dec — checked 2026-10-17 — mod thread (medium; old version), via search excerpt.
- [S17] GitHub — FractalUK/KSPInterstellar wiki, plus KSPIE development threads. https://github.com/FractalUK/KSPInterstellar/wiki ; https://forum.kerbalspaceprogram.com/topic/161531-ksp-interstellar-extended-continued-development-thread — checked 2026-10-17 — mod wiki and forum (medium), via search excerpts.

## 12-modding.md

- [S1] "Module Manager Syntax" — ModuleManager GitHub wiki, https://github.com/sarbian/ModuleManager/wiki/Module%20Manager%20Syntax — checked 2026-10-17. Primary documentation of the mod. Reliable.
- [S2] CKAN — project description (signpath.org/projects/ksp-ckan and github.com/KSP-CKAN), https://signpath.org/projects/ksp-ckan — checked 2026-10-17. From search excerpts. Reliable for what CKAN is.
- [S3] SpaceDock mod pages and PC Gamer "Best KSP mods", https://spacedock.info/ and https://www.pcgamer.com/the-best-kerbal-space-program-mods/ — checked 2026-10-17. The PC Gamer page body was paywalled, so its content comes from search excerpts. No authoritative download ranking was found.
- [S4] Kerbal Space Program — Wikipedia, https://en.wikipedia.org/wiki/Kerbal_Space_Program — checked 2026-10-17. Secondary source: mods moved into stock, Asteroid Day.
- [S5] "KSP 1.6: To Vee or not To Vee" (official), https://kerbalspaceprogram.com/news/1-6-to-vee-or-not-to-vee-is-now-available — checked 2026-10-17. Official.
- [S6] "KSP 1.12 On Final Approach is now available" — KSP forum 203227, https://forum.kerbalspaceprogram.com/topic/203227-kerbal-space-program-112-on-final-approach-is-now-available — and the Kerbal Alarm Clock thread 22809 — checked 2026-10-17. Official plus mod author.
- [S7] RP-1 wiki "Extra Mods to Consider" (https://github.com/KSP-RO/RP-1/wiki/Extra-Mods-to-Consider) and PCGamesN "Best KSP mods" (https://www.pcgamesn.com/kerbal-space-program/ksp-mods) — checked 2026-10-17. Secondary sources: descriptions of MechJeb, KER, kOS, RemoteTech, Kerbalism, Principia.
- [S8] KSP Wiki "List of mods", https://wiki.kerbalspaceprogram.com/wiki/Mods — checked 2026-10-17. From search excerpts. Fair.
- [S9] "BepInEx for KSP 2 — adding modding support to the game" — KSP forum 212355, https://forum.kerbalspaceprogram.com/topic/212355-bepinex-for-ksp-2-adding-modding-support-to-the-game — together with Attack of the Fanboy's "When will KSP2 have mods" — checked 2026-10-17. The loader author's opinion plus a secondhand report of Private Division's "day one" expectation.
- [S10] "Any word on mod pipeline for KSP 2" — KSP forum 211565, https://forum.kerbalspaceprogram.com/topic/211565-any-word-on-mod-pipeline-for-ksp-2 — checked 2026-10-17. Community summary of developer statements on C# and Lua. Hearsay; marked as unconfirmed.
- [S11] "Dev Blog: SpaceWarp 2.0 — help us shape the future of modding" — KSP forum 218513, https://forum.kerbalspaceprogram.com/topic/218513-dev-blog-spacewarp-20-help-us-shape-the-future-of-modding — checked 2026-10-17. Community mod team blog, from search excerpts.
- [S12] SpaceWarp GitHub repository, https://github.com/SpaceWarpDev/SpaceWarp — checked 2026-10-17. Primary source; archived 2026-10-12, moved to KSP2Redux/Redux.ModApi.
- [S13] Kerbal Space Program 2 — Wikipedia, https://en.wikipedia.org/wiki/Kerbal_Space_Program_2 — checked 2026-10-17. Secondary source: studio closure 2024, multiplayer and colonies never released.
- [S14] "BepInEx vs SpaceWarp" (forum 214072) and Lazy Orbit README (https://github.com/schlosrat/LazyOrbit) — checked 2026-10-17. Community; install confusion, CKAN support.
- [S15] Patch Manager — GitHub, https://github.com/KSP2Community/PatchManager — and forum thread 221179 — checked 2026-10-17. Primary source; archived Oct 2026.
- [S16] Maneuver Node Controller — SpaceDock, https://spacedock.info/mod/3270/Maneuver%20Node%20Controller — and Space Warp 1.9.5 thread (forum 218490) — checked 2026-10-17. Mod pages.
- [S17] "Migrating from SpaceWarp 1.x" — KSP2 Modding Wiki, https://modding.kerbal.wiki/Migrating_from_SpaceWarp_1.x — and K2-D2 Redux listing https://spacedock.info/mod/4508 — checked 2026-10-17. Community documentation.
- [S18] "KSP2 Redux" — KSP2 Modding Wiki, https://modding.kerbal.wiki/KSP2_Redux — checked 2026-10-17. Community project page, last edited Nov 2025. Reliable for the project's stated goals.
- [S19] "Redux: New features" — kerbal.wiki, https://kerbal.wiki/Redux:New_features — checked 2026-10-17. Community page.

## 13-ui-ux-patterns.md

- [S1] KSP Wiki, "1.6" and forum threads on the 1.6 Δv readout. https://wiki.kerbalspaceprogram.com/wiki/1.6 (also https://forum.kerbalspaceprogram.com/topic/182245-ksp-16-variant-and-deltav-glitch). Checked 2026-10-17. Community wiki changelog plus player threads; reliable for dates, anecdotal for quality.
- [S2] KSP Forums, "UI/UX Feedback Megathread" (KSP2). https://forum.kerbalspaceprogram.com/topic/221025-ui-ux-feedback-megathread. Checked 2026-10-17 (seen through search excerpts; direct fetch blocked with 403). Player feedback with developer acknowledgements; good player-voice evidence.
- [S3] KSP Forums, Intercept art/UI dev post "You can't spell user interface without U & I" and replies. https://forum.kerbalspaceprogram.com/topic/223204-you-can%E2%80%99t-spell-user-interface-without-u-i. Checked 2026-10-17 (search excerpts). Official dev blog; replies are player opinion.
- [S5] KSP Forums, "Please revert all VAB controls back to KSP1". https://forum.kerbalspaceprogram.com/topic/212501-please-revert-all-vab-controls-back-to-ksp1. Checked 2026-10-17 (title/excerpt only). A single player thread; shows a sentiment exists, not how widespread it is.
- [S6] KSP Forums, maneuver-node threads (KSP2): https://forum.kerbalspaceprogram.com/topic/222362-maneuver-nodes-for-interplanetary-burns ; https://forum.kerbalspaceprogram.com/topic/222291-maneuver-nods-with-no-fuel ; https://forum.kerbalspaceprogram.com/topic/212419-maneuver-nodes-are-really-really-bad/page/4. Checked 2026-10-17 (search excerpts). Player opinion plus one developer reply; dates not always visible.
- [S7] kerbal.wiki, "Tutorials" (KSP2). https://kerbal.wiki/Tutorials. Checked 2026-10-17. Community wiki; reliable for the lesson structure.
- [S8] Private Division press release (via Bastion/MyNewsdesk), "Here's how Kerbal Space Program 2 is making the series welcoming for newcomers". https://mynewsdesk.com/uk/bastion-uk/news/heres-how-kerbal-space-program-2-is-making-the-series-welcoming-for-newcomers-427244. Checked 2026-10-17. Publisher PR; states intent, not outcome.
- [S9] GODisageek, "Kerbal Space Program 2 is more ambitious than ever before — hands-on preview" (Feb 2023). https://www.godisageek.com/2023/02/kerbal-space-program-2-is-more-ambitious-than-ever-before-hands-on-preview/. Checked 2026-10-17. Press preview; a single reviewer's view.
- [S10] TechRaptor, "Kerbal Space Program 2 Preview". https://techraptor.net/gaming/previews/kerbal-space-program-2-preview. Checked 2026-10-17 (search excerpt). Press preview.
- [S11] PC Games (DE), KSP2 Early Access preview, "Zugänglichkeit im Vordergrund" page. https://www.pcgames.de/Kerbal-Space-Program-2-Spiel-72055/Specials/vorschau-preview-early-access-weltraum-simulation-sandbox-1414225/3/. Checked 2026-10-17 (search excerpt). Established German outlet; preview.
- [S12] KSP Wiki, "Key bindings" (Ctrl+Z undo since 0.08.5). https://wiki.kerbalspaceprogram.com/wiki/Keys ; and the KSP2 undo bug thread https://forum.kerbalspaceprogram.com/topic/214292-engine-mount-shroud-shrinks-when-undoing-changes-to-the-craft. Checked 2026-10-17. Community wiki (reliable for bindings); a single bug report.
- [S13] KSP bug tracker, issue #25865 (fairing PAW setting reset on undo). https://bugs.kerbalspaceprogram.com/issues/25865. Checked 2026-10-17 (search excerpt). Official tracker; confirmed, low severity.
- [S14] GODisageek, "Kerbal Space Program: Enhanced Edition Review". https://godisageek.com/reviews/kerbal-space-program-enhanced-edition-review/. Checked 2026-10-17 (search excerpt). Press review.
- [S15] XboxAddict, "Staff Review of Kerbal Space Program Enhanced Edition (Xbox One)". https://xboxaddict.com/Staff-Review/Xbox-One/14055/Kerbal-Space-Program-Enhanced-Edition.html. Checked 2026-10-17 (search excerpt). Enthusiast press, 2018.
- [S16] PlayStation Store, "Kerbal Space Program: Enhanced Edition". https://store.playstation.com/concept/217244. Checked 2026-10-17 (search excerpt). Official store description plus user reviews (anecdotal).
- [S17] Family Gaming Database, accessibility page for Kerbal Space Program. https://www.familygamingdatabase.com/accessibility/Kerbal+Space+Program. Checked 2026-10-17 (search excerpt). Third-party accessibility catalogue; "0 documented" may mean it was never audited.
- [S18] kerbal.wiki, "Redux: New features" (community KSP2 UI mod). https://kerbal.wiki/Redux:New_features. Checked 2026-10-17 (search excerpt). Community mod documentation.
- [S19] KSP official news, "Developer Insights #7 – KSP 2 UX Architects" (Levin Sadsad). https://kerbalspaceprogram.com/news/dev-diaries-developer-insights-7-ksp-2-ux-architects. Checked 2026-10-17 (returned 404; known from search listing and forum mirror https://forum.kerbalspaceprogram.com/topic/200599-developer-insights-7-%E2%80%93-ksp-2-ux-architects). Official dev diary; content not re-read.
- [S20] GameSpot, "Kerbal Space Program 2 Is Catching Fire For A Buggy Early Launch" (Feb 2023). https://gamespot.com/articles/kerbal-space-program-2-is-catching-fire-for-a-buggy-early-launch/1100-6511910/. Checked 2026-10-17 (search excerpt). Major outlet news.
- [S21] KSP official news, "Career mode guide for beginners" (Scott Manley tutorial series). https://kerbalspaceprogram.com/news/career-mode-guide-for-begineers. Checked 2026-10-17 (search excerpt). Official site.

*(Source ID S4 is intentionally unused.)*

## 14-strengths-weaknesses-and-player-feedback.md

- [S1] Wikipedia, "Kerbal Space Program 2". https://en.wikipedia.org/wiki/Kerbal_Space_Program_2. Checked 2026-10-17. Secondary summary with citations to Bloomberg, PC Gamer and others; good for the timeline.
- [S2] Wikipedia, "Kerbal Space Program". https://en.wikipedia.org/wiki/Kerbal_Space_Program. Checked 2026-10-17. Secondary summary; reception, education, NASA/ESA, 2026 resurgence.
- [S3] Steam store, "Kerbal Space Program". https://store.steampowered.com/app/220200/Kerbal_Space_Program/. Checked 2026-10-17. Primary review aggregates (live data).
- [S4] Steam store, "Kerbal Space Program 2". https://store.steampowered.com/app/954850/Kerbal_Space_Program_2/. Checked 2026-10-17. Primary review aggregates and update notice (live data).
- [S5] GameSpot, "Kerbal Space Program 2 Is Catching Fire For A Buggy Early Launch" (Feb 2023). https://gamespot.com/articles/kerbal-space-program-2-is-catching-fire-for-a-buggy-early-launch/1100-6511910/. Checked 2026-10-17 (search excerpt). Major outlet; launch-week snapshot.
- [S6] Video Games Chronicle, "Take-Two allegedly 'pulled KSP2 from its developer, then poached its staff'" (2020). https://www.videogameschronicle.com/news/2k-allegedly-pulled-ksp2-from-its-developer-then-poached-its-staff. Checked 2026-10-17 (search excerpt). Trade press summarising Bloomberg.
- [S7] TechRaptor, "Report: Kerbal Space Program 2 Disrupted Due To Corporate Intrigue" (2020). https://techraptor.net/gaming/news/report-kerbal-space-program-2-disrupted-due-to-corporate-intrigue. Checked 2026-10-17 (search excerpt). Secondary, summarises Bloomberg.
- [S8] Wikipedia, "Uber Entertainment" (Star Theory). https://en.wikipedia.org/wiki/Uber_Entertainment. Checked 2026-10-17 (search excerpt). Secondary, cites Schreier.
- [S9] TheSixthAxis, "Kerbal Space Program 2 studio reportedly shutting down, but Take-Two promises to support game" (1 May 2024). https://www.thesixthaxis.com/2024/05/01/kerbal-space-program-2-studio-reportedly-shutting-down-but-take-two-promises-to-support-game/. Checked 2026-10-17 (search excerpt). Trade press.
- [S10] PCGamesInsider, "Report: Intercept Games is closing in June". https://www.pcgamesinsider.biz/news/74489/report-intercept-games-is-closing-in-june/. Checked 2026-10-17 (search excerpt). Trade press citing the WARN filing.
- [S11] Video Games Chronicle, "Take-Two has sold its indie label Private Division" (Nov 2024). https://www.videogameschronicle.com/news/take-two-has-sold-its-indie-label-private-division/. Checked 2026-10-17 (search excerpt). Trade press citing Take-Two earnings.
- [S12] Video Games Chronicle, "Former Annapurna staff are reportedly taking over Private Division's portfolio" (Jan 2025). https://videogameschronicle.com/news/former-annapurna-staff-are-reportedly-taking-over-private-divisions-portfolio. Checked 2026-10-17 (search excerpt). Trade press citing Bloomberg.
- [S13] Wikipedia, "Fictions (company)". https://en.wikipedia.org/wiki/Fictions_(company). Checked 2026-10-17. Secondary; rename June 2025, KSP in catalogue.
- [S14] iXBT Games, "Kerbal Space Program 2 got the For Science update, its rating rose sharply" (22 Dec 2023). https://ixbt.games/en/news/2023/12/22/kerbal-space-program-2-polucila-obnovlenie-for-science-ocenka-igry-rezko-vyrosla.html. Checked 2026-10-17 (search excerpt). Russian-language trade press; review figures plausible.
- [S15] KSP Forums, KSP2 release notes hotfix v0.1.4.1 and "Bug Status" posts (2023). https://forum.kerbalspaceprogram.com/topic/219681-ksp2-release-notes-hotfix-v0141/page/2 ; https://forum.kerbalspaceprogram.com/topic/220179-bug-status-1023. Checked 2026-10-17 (search excerpts). Official developer posts plus player replies.
- [S16] TechRaptor, "New Kerbal Space Program Launcher Enrages Players" (Nov 2022). https://techraptor.net/gaming/news/new-kerbal-space-program-launcher-enrages-players. Checked 2026-10-17 (search excerpt; direct fetch 403). Trade press; privacy/DRM framing is player accusation.
- [S17] r/KerbalSpaceProgram, "Forum megathread" (23 Oct 2024). https://www.reddit.com/r/KerbalSpaceProgram/comments/1gannrg/forum_megathread/. Checked 2026-10-17 (via mirror excerpts). Community/moderator statements; not official.
- [S18] Mezha.ua, "After the Artemis II launch players returned to Kerbal Space Program" (2026). https://mezha.ua/en/news/pislya-startu-misiji-artemis-ii-gravci-povernulisya-u-kerbal-space-program-310091/amp/. Checked 2026-10-17 (search excerpt). Regional tech outlet; contains a factual error about KSP2's EA date, so treat its numbers cautiously.
- [S19] Neowin, "DayZ creator announces a new space sim to take on Kerbal Space Program". https://www.neowin.net/news/dayz-creator-announces-a-new-space-sim-to-take-on-kerbal-space-program/. Checked 2026-10-17 (search excerpt). Tech press; announcement claims.
- [S20] Space.com, "Kitten Space Agency is the spiritual successor to Kerbal Space Program… (interview)". https://space.com/entertainment/space-games/kitten-space-agency-is-the-spiritual-successor-to-kerbal-space-program-and-they-have-an-ex-spacex-engineer-on-the-team-interview. Checked 2026-10-17 (search excerpt). Mainstream outlet interview.
- [S21] Game Developer, press release "RocketWerkz's Kitten Space Agency First Game to Win the NZX Most Innovative Award" (23 Jul 2026). https://www.gamedeveloper.com/press-release/rocketwerkz-s-kitten-space-agency-first-game-to-win-the-nzx-most-innovative-award. Checked 2026-10-17 (search excerpt). Developer PR.
- [S22] Kitten Space Agency Wiki, "Frequently Asked Questions". https://kittenspaceagency.wiki.gg/wiki/Frequently_Asked_Questions. Checked 2026-10-17 (search excerpt). Community wiki; platform and mod-support status.
- [S23] Steam store, "Juno: New Origins". https://store.steampowered.com/app/870200/Juno_New_Origins/. Checked 2026-10-17. Primary features and review aggregates.
- [S24] Vaporlens, "Juno: New Origins review summary". https://vaporlens.app/app/870200/juno_new_origins. Checked 2026-10-17 (search excerpt). Automated review-summary site; indicative only.
- [S25] Entertainium, "Review: One year into Kerbal Space Program 2 Early Access, small steps towards greatness" (28 Feb 2024). https://entertainium.co/2024/02/28/kerbal-space-program-2-review/. Checked 2026-10-17 (search excerpt). Small outlet review.
- [S26] TapTap, "A sluggish Early Access lift-off | Full Review – Kerbal Space Program 2". https://www.taptap.io/post/4652700. Checked 2026-10-17 (search excerpt). Low-authority review; used only for the price complaint.
- [S27] Video Games Chronicle, "Fewer people are playing Kerbal Space Program 2 than the original game" (2023). https://www.videogameschronicle.com/news/fewer-people-are-playing-kerbal-space-program-2-than-the-original-game. Checked 2026-10-17 (search excerpt). Trade press using SteamDB data.
- [S28] Millenium (MGG), report on the KSP2 review bombing after Take-Two's decisions (May 2024). https://www.millenium.org/news/413598.html. Checked 2026-10-17 (search excerpt). French gaming press.
- [S29] NoobFeed, "Kerbal Space Program 2 Delayed Again, Now Releasing In 2022" (Nov 2020; quotes Nate Simpson's delay statement). https://www.noobfeed.com/news/kerbal-space-program-2-delayed-again-now-releasing-in-2022. Checked 2026-10-17 (search excerpt). Small outlet reproducing an official statement.
