# 076 — Public roadmap page: the foundation roadmap by phase

**Plan:** [plans/076-public-roadmap-foundation.md](../plans/076-public-roadmap-foundation.md) · **Session:** Agent 2 (Dev B, MacBook Pro M2 13"), 2026-10-17 · **ADRs:** [0108](../decisions/0108-release-scope-announce-the-big-roadmap-no-universe-mode.md), [0048](../decisions/0048-v1-public-release-scope.md) · **Research:** none

**Status when written: criteria met (one criterion relaxed, see below).**

## What was done

| Where | What |
|---|---|
| `lib/public/roadmap.ts` | `RoadmapItem` gets `phase` (Product, Foundation, Worlds and Space Center, Career, Network and control, Time and the real sky, Living world) and `exploring`; 45 player-facing items from the phase 3 drafts and phases 4–9; `SHIPPED` (curated, plans done since 1.0), `ROADMAP_NOTES` (date, item, change); `labelOf(item, status)` |
| `plan-status.ts`, `vite.config.ts`, `src/plan-status.d.ts` | `virtual:plan-status`: a Vite plugin that reads each plan's `status:` at build time, so the page shows only statuses and not the plans |
| `routes/roadmap/+page.svelte` | In version 1.0, Shipped since 1.0, a section per phase with a label on each card, Changes to the roadmap; the page keeps its style until 089 |
| `roadmap.test.ts` | plans exist with a known status; `SHIPPED` holds only done plans; unique plans, every phase used, a sentence each; the exploring set equals ADR 0108's (120, 121, 125, 126, 128, 129); the earlier drafts stay; label rules; dated notes |
| `e2e/smoke.e2e.ts` | `/roadmap` shows the phase headings in order |
| `README.md` | the roadmap paragraph names the phases |

## What surprised me

- **"Not done" would break on merge.** 085 and 088 are listed (Foundation; Worlds and Space Center) and are done on their own branches. A test that requires every item to be not done would fail the moment the Lead merges them. The test accepts `done`, and the page labels it **shipped** from the plan status; moving it to `SHIPPED` is a curation step for whoever writes the next note. Plan criterion 1 is relaxed to this.
- **Pure contract plans stay off the page.** 077, 078, 080, 082, 083, 079 and others give the player nothing to read. The page lists what a player would notice. Shipped plans that a player can see (rename, the new look, worlds, dates, the site choice) are in `SHIPPED`.
- **Labels from the plan files, not written by hand.** With three agents claiming plans all day, a hand-written "in progress" would be stale within the hour; the build reads the status instead.
