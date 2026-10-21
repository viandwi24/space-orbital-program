# 332 — Guidance Computer panel with tabs

**Plan:** [plans/332-guidance-panel-tabs.md](../plans/332-guidance-panel-tabs.md) · **Session:** rendezvous session (Claude) · **Date:** 2026-10-22 · **ADR:** 0287

## What was done

- **Panel nodes (ADR 0287, API 0.1.104):** `tabs`, `progress`, `number`, `notice`, button `tone`, section `columns` in `packages/core/src/panels.ts` (types and schema); the web host evaluates them (`apps/web/src/lib/dock/evaluate.ts`: every tab, paths `<tabs>.<tab>.<child>`, `clampEntry` for number fields) and draws them (`PanelView.svelte`, new `PanelTabs.svelte`: the v3 segmented tab strip, the open tab is component state, the `active` tab opens when it changes, an accent dot and an ON badge). Selects and switches now show their label; toned buttons take one column.
- **Guidance Computer panel** (`mods/guidance/src/panel.ts`): one panel, tabs Ascent / Orbit / Rendezvous / Landing / Log; the separate Rendezvous panel of plan 331 is folded in. Each tab: a status line (the program flying, the sim's refusal, why it cannot start, or the last run), a progress bar while it flies, settings stored with `autopilot-settings`, read-outs, Engage and Abort.
- **Autopilot settings behind the tabs:** ascent `inclination` (launch azimuth from the latitude plus a closed-loop correction on the inclination error above 800 m/s), landing `touchdown` speed, a `Burn done` read-out in the node executor; the rendezvous reports the vessel's delta-v as "Delta-v left" and the node's as "Burn left".
- Lesson text and the guides follow.

## What surprised me

- **The ascent to 30° ended at 33.6°** with the open-loop launch azimuth; steering out the inclination error (2 × the error, at most 20°) brings it within 3°.
- **Readout keys collide.** The rendezvous merged the node executor's read-outs over its own, so "Delta-v left" showed the burn (38 m/s) instead of the vessel (3 392 m/s). Found only in the browser.
- **Server render has no effects**, so the open tab falls back to the active tab, not only the chosen one; otherwise the engaged program's tab would not show first.
- The in-app browser pane was hidden for the screenshots; they were taken with Playwright's Chromium against the dev server (script kept in the session notes, `screens-332/shot-script.ts`).

## Verification output

```
bun test mods/guidance mods/autodock packages/core/test/panels.test.ts: 31 pass, 0 fail
web vitest (CI=true) src/lib/dock src/lib/mods: 49 pass
svelte-check: 0 errors
bun run test: 2223 pass, 0 fail
bun run build: done (after fixing an apostrophe in the lesson hint, which only the build caught)
web vitest onboarding: 28 pass
bun run docs:check: OK
screenshots: Ascent, Orbit (no node: "No maneuver node: add one on the map."), Rendezvous idle and engaged (ON badge, "Rendezvous: Transfer: Burn in 2737 s", step 2 of 5), Landing blocked ("Rendezvous is flying: abort it first."), Log
```

## Open questions

- Idle tabs show `[—]` for read-outs that need the sim's facts (delta-v, burn time); a panel has no facts (ADR 0277).
- Number fields follow the browser's locale for the decimal mark (Chromium headless showed "1,2").
