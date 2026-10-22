# 333 — Rendezvous readiness and the next step

**Plan:** [plans/333-rendezvous-readiness-and-next-step.md](../plans/333-rendezvous-readiness-and-next-step.md) · **Session:** rendezvous session (Claude) · **Date:** 2026-10-22 · **ADR:** 0288

## What was done

- `readiness(own, target, targetVessel, body)` in `mods/guidance/src/rendezvous.ts`, used by the autopilot's `start` and by the panel: target kind, control, spheres of influence, on the ground, own periapsis against the top of the air (with the numbers, and "Circularize at the apoapsis" or "Fly Ascent"), target on the ground or not in a stable orbit. `targetOf` compares the spheres of influence instead of reading `approach`.
- `PanelInput.body` and `.deltaV` (core type; web `panel-input.ts` from the catalogue's body and `hud.model.stages.total`); `notice.action` drawn as a button that opens a tab (`OPEN_TAB` context from `PanelTabs.svelte`).
- Rendezvous tab: the reason in the status line, "Open Ascent" or "Open Orbit", delta-v left from the HUD and an estimate while off.

## What surprised me

- The sim's `approach` is null for three different reasons; the rendezvous had taken it for one.
- A climbing vessel and its target share a body, so the true message is about the vessel's own orbit, not the target.

## Verification output

```
bun test mods/guidance mods/autodock packages/core/test: 408 pass, 0 fail
web vitest (CI=true) dock, mods, onboarding: 78 pass
svelte-check: 0 errors
sim: engage at 40 km circular → { ok: false, reason: "Reach a stable orbit first: periapsis 40 km, needs 70 km+. Fly Ascent." }
```

## Open questions

- No "engine running" hint: the snapshot carries no throttle; the time bar already says why the warp is limited.

## Follow-up: phasing low over the air (same day)

The owner hit "No phasing orbit stays clear of the ground." `phasingBurn` only caught up from behind (a lower, faster orbit), and a vessel just above the floor (top of the air + 10 km) has no room to drop. It now also tries the other way (a higher, slower orbit for k turns while the target laps round: period `(2π(k+1) − lead) / (k·nT)`), k up to 20 within 10 days, and takes the first cheap one, else the cheapest. When nothing fits (the vessel itself below the floor) the abort says "Too low to phase: raise your orbit above X km first (Orbit tab)" and the Rendezvous tab offers "Open Orbit". Tests: 1 km above the floor with the target 30° ahead raises; 5 km above stays above the floor; 30° behind raises; below the floor, the words. `bun test mods/guidance`: 29 pass.
