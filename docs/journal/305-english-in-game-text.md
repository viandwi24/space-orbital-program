# 305 — English in-game text

**Plan:** [plans/305-english-in-game-text.md](../plans/305-english-in-game-text.md) · **Session:** part visuals session (Claude), 2026-10-21

## What was done

- **Part nicknames:** 74 distinct Indonesian nicknames became English words, for example "Kuncup" → "Bud", "Tong" → "Barrel", "Lonceng" → "Bell", "Rajawali" → "Hawk" and "Penyelamat" → "Guardian". The ids are unchanged.
- **Blueprints:**
  - Ulang-Alik → Wayfarer Shuttle
  - Stasiun Cakrawala → Horizon Station
  - Pengorbit → Moonwatch Orbiter
  - Teleskop Cakrawala → Horizon Telescope
  - Satelit Peneliti → Aurora Research Satellite
  - Kronos V + Selene stays.
- **Guard tests:** `mods/stock/test/english.test.ts` and a blueprint check (ADR 0268).

## Verification output

```
bun test mods/stock/test/english.test.ts: 2 pass (more than 500 strings scanned)
apps/web vitest missions.test.ts: 8 pass
```
