# 06 — Achievements, milestones and meta

> Design proposal, research only. Sources `[ID]` are in [`00-sources.md`](00-sources.md).

## 0. Idea

Three layers, different purposes:

| Layer | Scope | Purpose |
|---|---|---|
| **Milestones / world firsts** | per world | progression and story inside a save (feeds reputation, contracts, the news feed) |
| **Achievements** | per player, across worlds | long-term goals, teaching mechanics, bragging |
| **Challenges and sharing** | community | replayability: scored scenarios, replays, crafts, systems |

All of it must work **offline and client-side** (`docs/product/spec.md`: no backend for the core loop). Online features are optional extras that never gate play.

## 1. Prior art

- **KSP1**: reputation-gated contract tiers and progress through "firsts" per body (first orbit, landing, flag, escape) that also drive crew experience [G-KSP-CON][G-KSP-XP]. A community career mod structures progress as per-body "conquest" milestones plus optional feats [G-CAREER-REIMAGINED].
- **KSP2 For Science!**: primary and secondary missions in a mission tracker [G-KSP2-FS].
- **Mars Horizon**: public firsts raced against rival agencies, with press reactions [G-MH].
- **Opus Magnum** (Zachtronics): every solution is scored on several axes (cycles, cost, area); the game shows **histograms** of where your score falls among all players and friends' scores; solutions export as **GIFs** that players share [G-OPUS]. *Lesson:* multi-axis scoring plus a distribution beats a single leaderboard: everyone is "good at something".
- **Trackmania**: leaderboard **ghosts** are files you can download and race against in-game [G-TM-GHOST]. *Lesson:* a replay file is a social object even without live multiplayer.
- **Achievement design advice**: tie achievements to meaningful play, not grind or filler [G-ACH-101].
- **Elite Dangerous**: "first discovered by" credit for the first player to turn in data [G-ED-EXPL].

## 2. Milestones and world firsts (per world)

- **Records** tracked automatically per body and globally: first launch, first orbit, first flyby/orbit/landing/return per body, first crewed versions, first EVA, first docking, first station, first relay network covering a body, first sample return, first publication about a body, highest/fastest/farthest, longest crewed mission.
- **Shared with rivals** (`03`): a first can be taken by an AI agency; the world remembers who did it and when. The **history book**: a timeline page for the world ("Day 341: Agency Aster lands the first probe on the Moon. Day 352: you land the first crew.").
- **Effects**: reputation and public-interest jumps, new contract types, crew XP (as KSP), and the news feed.
- **Live bonus**: a first that is broadcast live over the network (`01` tier 6) is worth more.

## 3. Achievements (per player)

Design rules (following the advice to reward meaningful play [G-ACH-101]):

1. **Teach a mechanic**: "Use a gravity assist", "Return data via store-and-forward", "Fly a probe through a 10-minute signal delay with a script", "Deploy 3 relays from one launch with a resonant orbit".
2. **Celebrate mastery**: "Orbit with under 3 000 m/s total Δv on the pad", "Land within 50 m of a target", "Re-enter without a heat shield".
3. **Reward each role** (`02`): engineer (an engine model reaching 99% reliability), scientist (a confirmed hypothesis with high confidence), director (profit in five consecutive years), operator (ten vessels in flight with no lost contact for 30 days), explorer (map 100% of a body).
4. **Universe mode** (`05`): "Make a moon ring by Roche breakup", "Build a stable system with two habitable planets".
5. **No grind** (no "launch 1 000 rockets"), and **no missables** that need a new world.
6. **Mods** can register achievements (registry entry with id, title, condition over events), shown in their own group.

Storage: a local profile file (achievements, stats), exportable/importable. Optional platform integration (e.g. a storefront's achievement API) later through an adapter.

## 4. Challenges, scoring and leaderboards (offline-friendly)

- **Challenge file** = a scenario (system, starting vessels or a fixed part budget, objectives, world rules, scoring axes) as JSON, shareable like a mod package. Community challenges in KSP forums are a long tradition; this gives them a format.
- **Multi-axis score** (Opus Magnum's lesson [G-OPUS]): e.g. cost, mass on pad, mission time, Δv margin, part count. The result screen shows your point on each axis against **local history** and, if a community file is imported, against that distribution.
- **Verifiable replays**: the sim is deterministic on the same build (`simulation.md`), so a run can be stored as **initial save + command log** (a few kB). Anyone with the same build and mods can re-simulate it to check the score. Cross-machine floating-point differences may break exact replay on other machines (cross-machine determinism is not a goal), so the replay also stores periodic **state checkpoints**: a verifier can re-simulate from each checkpoint and accept small drift. This is "honest enough" for community leaderboards without a server.
- **Ghosts** (Trackmania's idea [G-TM-GHOST]): load someone's replay and see their vessel as a ghost trail in the map and flight view while you fly the same challenge.
- **Optional online board**: a static site (or a git repository of submitted replay files) that a community maintains, re-verifying replays in a headless Bun runner (the sim already runs headless in tests). The game itself needs none of it.

## 5. Sharing

| Object | Format | Notes |
|---|---|---|
| Craft | `VesselDesign` JSON (exists, ADR 0016) | add thumbnail, required mods, stats |
| Script | text (exists) | with the craft it expects |
| Star system | body-only mod package (`05`) | uses the mod-loading flow |
| Challenge | JSON scenario | system ref + rules + scoring |
| Replay | save + command log + checkpoints | re-simulable |
| Moment | image/GIF/video export of a replay segment | the most shared thing in practice ([G-OPUS] GIFs) |
| World history | the history book as HTML/Markdown export | story-sharing for "let's play" players |

A **replay viewer** (scrub, change camera, export clip) gives players a reason to share without any online service.

## 5b. Mission patches and agency identity

Low-cost pride features: an agency logo and colours, procedurally generated mission patches (shape, colours, body icon, crew initials) on each first, shown in the history book and on craft. They make screenshots feel personal.

## 6. Open decisions

1. Any online feature at all (even an optional static leaderboard), or purely local plus file sharing?
2. Achievements per player profile across worlds, or per world only?
3. Replay format priority (needed for challenges and ghosts; it constrains save format work).
