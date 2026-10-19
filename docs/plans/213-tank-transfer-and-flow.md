---
id: 213
title: Tank transfer, flow locks, rates
status: in-progress
owner: "Worker A"
depends: [208]
phase: 7
created: 2026-10-18
updated: 2026-10-19
---

# 213 — Tank transfer, flow locks, rates

## Goal

The player can move a resource from one container to another (source, target, start, stop) at a visible rate. Each container can lock the flow of each resource it holds. The snapshot carries, per container and per resource, the amount, capacity, current rate and time to empty, so the vessel panel (plan 214) can show them without computing anything.

## Context

- Rancangan §4.3 (tanks: transfer with source and target, stop button, visible rate; flow lock per resource; rate and time to empty), §7.6b (tank and battery row: amount, capacity, rate, time to empty, flow lock).
- ADRs: 0203 (KSP-grade parts pack: transfer and flow rules), 0015 (resource graph through module stores), 0071 (fuel lines), 0174 (part action descriptors).
- Research:
  - 15a §5: flow modes `none`, `vessel`, `stack` (`packages/sim/src/resources.ts:66-70`); stack flow is a breadth-first search stopping at `crossfeed: false` (`resources.ts:37-64`); "no user-set priorities and no per-tank flow toggles"; "MISSING: transfer between tanks. Only module-level `withdraw`/`deposit` exist".
  - 05 §3.3: fuel tanks have no flight controls (`withdraw`/`deposit` exist but have no descriptor, `mods/stock/src/modules.ts:122-133`).
  - 05 §3.4: `ResourcesPanel.svelte` is a read-only vessel-wide meter; no per-tank view.
  - 03 §2.6: fuel transfer in KSP1 and KSP2, side by side.
- Depends on 208 (batteries, monoprop and solid fuel exist; solid fuel is never transferable).

## Scope

**In:**
- `transfer` command: vessel, resource, source parts, target parts, rate (units/s, default from the resource), `stop`.
- Transfer rules: same vessel; resource flow mode is not `none`; solid fuel and ablator refuse with a reason; a locked container neither gives nor takes.
- `set-flow-lock` command per part and resource; the stack and vessel searches skip locked stores.
- Rates: the sim records net flow per store per step (engines, RCS, transfer, producers, consumers) and smooths it over 1 s.
- Snapshot `PartSnapshot.resources`: `{ resource, amount, capacity, rate, timeToEmpty, locked }[]`; vessel totals with the same fields.
- Descriptors on containers: flow lock per resource (toggle), "Transfer out" and "Transfer in" triggers that the panel turns into a picker.

**Out:**
- User-set flow priorities and per-tank drain order (P1, rancangan §4.3).
- The transfer picker UI and the Resources tab (plan 214).
- Transfers between docked vessels before docking exists (plan 222 reuses this command).

## Touches

- **Size:** S
- **Edits:**
  - `packages/sim/src/resources.ts` (lock check, rate book-keeping)
  - `packages/sim/src/commands.ts` (`transfer`, `set-flow-lock`)
  - `packages/core/src/protocol.ts` (two commands; `PartSnapshot.resources`)
  - `packages/core/src/protocol-schemas.ts` (command schemas)
  - `mods/stock/src/modules.ts` (container descriptors and `locked` state)
  - `packages/sim/src/snapshot.ts`
- **Shared contracts:** commands `transfer` and `set-flow-lock`; `PartSnapshot.resources` (additive). Container state gains `locked` (additive; saves without it read as unlocked, no version bump).

## Design notes

- A transfer is a running job in the vessel state, so it survives a save and stops on its own when the source is empty or the target full. It runs on rails too, in the same exact step as life support.
- Rate default: 20 u/s for fuel and monoprop, 50 EC/s for charge. KSP reference in research 03 §2.6.
- Time to empty uses the smoothed rate; a rate of zero or a gain gives `null`, shown as "—".
- Locks and transfers go through commands so scripts and replays see them.

## Steps

1. Lock state on containers; flow searches skip locked stores. Tests.
2. Rate book-keeping per store and the snapshot block.
3. `transfer` job and command with refusal reasons; stop conditions.
4. Descriptors on containers; script API `ship.transfer` passthrough if the scripting prelude exposes commands by name.
5. Update `ResourcesPanel.svelte` only to read the new totals (no layout change; 214 replaces it).

## Acceptance criteria

- [ ] `bun test packages/sim/test/transfer.test.ts` passes: 100 u of LF moves from tank A to tank B at 20 u/s in 5 s ± one step; stop halts it; a full target stops it; solid fuel refuses with "Solid fuel cannot be transferred"; a save mid-transfer resumes it.
- [ ] `bun test packages/sim/test/flow-lock.test.ts` passes: an engine fed by two tanks drains only the unlocked one; locking both flames it out with reason "no propellant".
- [ ] `bun test packages/sim/test/resource-rates.test.ts` passes: a battery drained at 1 EC/s reports rate −1 ± 0.05 and time to empty within 2 % of amount / 1.
- [ ] Chromium e2e `e2e/tank-transfer.e2e.ts`: `window.__orbitalDebug.setOrbit` and `debug.setResource` set up two half tanks; a `transfer` command sent through the debug API moves fuel and the snapshot read back through the page shows the new amounts.
- [ ] `bun run check:affected` passes.
- [ ] CI is green on the plan's ready tag (full suite, ADR 0126).

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row, next plan, open issues).
- [ ] `docs/journal/213-tank-transfer-and-flow.md` written.
- [ ] `docs/architecture/simulation.md` "Resources" updated (locks, transfers, rates).
- [ ] `docs/architecture/scripting.md` updated if the script API gains `transfer`.

## Log

- 2026-10-18 — Created from refs/rancangan-terpadu.md (release roadmap).
- 2026-10-19 — Worker A. Defaults, recorded here:
  - ADR 0220 holds the design: store hooks for the lock, transfers as vessel jobs, measured and smoothed rates, and `name:key` action ids for a lock per resource.
  - Step 4's script passthrough is skipped: the prelude exposes named functions, not commands by name (the plan's condition). It comes with plan 214's panel.
  - Flame-out on all tanks locked: the stock engine flames out as it does when dry (event `stock:engine-flameout`); its snapshot shows `flameout`.
  - Rates run in flight and rails steps; a vessel's totals are the sums of its parts' rows.
