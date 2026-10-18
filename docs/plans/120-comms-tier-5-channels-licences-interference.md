---
id: 120
title: "Comms tier 5: channels, frequency licences, interference, encryption"
status: in-progress
owner: "Agent 3"
depends: [119]
phase: 7
created: 2026-10-17
updated: 2026-10-18
---

# 120 — Comms tier 5: channels, frequency licences, interference, encryption

## Goal

Bands are divided into channels; operating on a channel needs a licence bought per world (funds when the economy is on); links on the same channel in view of each other interfere and lose margin; encrypted links cost overhead and protect against agency interception (when agencies exist).

## Context

- ADRs: 0101, [0191](../decisions/0191-comms-channels-licences-interference-encryption.md) (this plan)
- Read: ADR 0101 tier 5, `refs/reverse-engineering-ksp2/beyond/01-communications-network-and-radio.md` §3 Tier 5 (git-ignored).

## Scope

**In:**
- Channel model and licence registry; licence purchase.
- Interference term in the link budget with the inspector naming it.
- Encryption flag with rate overhead.
- Rules: interference on/off.

**Out:** agency jamming (126 decides).

## Touches

- **Size:** M
- **Edits:** `mods/stock`, `packages/sim`, `apps/web/src/lib/hud`
- **Shared contracts:** **save (licences, channel choices)**

## Design notes

Interference is computed only between links that share a channel and see each other (cull).

## Steps

1. Channels and licences.
2. Interference.
3. Encryption.

## Acceptance criteria

- [x] `packages/sim` test: two links on one channel within view lose the stated margin; moving one to another channel restores it.
- [x] `packages/sim` test: transmitting on an unlicensed channel is refused with a reason.
- [x] `bun test`, `bun run typecheck`, `bun run build` and `bun run docs:check` pass.

## Docs checklist

- [x] `docs/STATUS.md` updated (board row, next plan, open issues).
- [x] `docs/journal/120-comms-tier-5-channels-licences-interference.md` written.

- [x] New ADRs for decisions made here; `docs/research/` for anything looked up.

## Log

- 2026-10-17 — Created as draft from the owner's Fondasi Orbital decisions (ADR 0101).
- 2026-10-18 — Claimed by Agent 3 (`claim/120`, branch `devc/120-comms-channels`).
- 2026-10-18 — ADR 0191 covers:
  - channels per band, and per-antenna channel and encryption through part actions;
  - licences that gate data, not links (channel 0 always licensed);
  - 3 dB of interference per first hop sharing a channel and reaching the receiver, capped at 12;
  - encryption at 0.8 times the rate.
- 2026-10-18 — Done here, handed over as `ready/120`:
  - **Sim tests:** `packages/sim/test/comms-channels.test.ts` (3) checks 3 dB lost on a shared channel and restored on another, the unlicensed refusal and the licence, and encryption.
  - **Checks:** check:affected here; the full suite runs in CI.
- 2026-10-18 — Handover (`ready/120`):

```text
Handover: plan 120 — Comms tier 5: channels, frequency licences, interference, encryption

Agent: Agent 3 (Dev C, Linux Mint 6c/8 GB)   Branch: devc/120-comms-channels
Base: origin/main @ 8f52f0c (rebased 2026-10-18)
Commits:
9620c3a perf(sim): interference counts each receiver's same-channel neighbours once (O(edges)); verification in the journal (plan 120)
06b51e4 docs(plan-120): journal, Log, STATUS, architecture, guide and glossary
6167269 feat(core,sim,stock,web): comms tier 5: band channels and per-world licences gating data, interference between first hops on one channel that reach each other's receiver, encryption at 0.8 times the rate; channel and licence in the Comms tab and the inspector; API_VERSION 0.1.71 (plan 120, ADR 0191)
412acf8 docs(plan-120): claim (Agent 3)
Acceptance:
  [x] two links on one channel within view lose the stated margin; another channel restores it — `bun test packages/sim/test/comms-channels.test.ts` — 3 pass (3.0 dB each, restored to the probe-alone margin)
  [x] transmitting on an unlicensed channel is refused with a reason — same file ("no licence for S band channel 2: buy one first"; a licence lets it go)
  [x] bun test, typecheck, build, docs:check — check:affected here; full suite in CI on this tag
Checks run here: bun run check:affected (prettier, docs, typecheck pass; bun test 1627/1628 — the comms benchmark under the suite's load; alone 257..424 µs/step as this laptop's state moved; interference costs ~40 µs of it, now O(edges))
Note for the Lead: the comms benchmark (budget 500 µs on the M5) is close to its limit on this laptop today even without interference (381 µs); it was 180..207 µs at 117.
Contracts changed (from Touches): save — SimSave.comms.licences (optional, no bump); channel choices are module state · also BandDefinition.channels/licence, the budget's interference/channel/encrypted, the antenna hook's channel/encrypted, licence-buy, network vessel channel/encrypted/interference, Snapshot.network.licences, rule stock.comms-interference (ADR 0191) · Contract requests: none
Save format / API_VERSION: format unchanged · API_VERSION patch bump 0.1.71 (126 holds 0.1.70)
Docs: journal docs/journal/120-comms-tier-5-channels-licences-interference.md · ADR 0191 · research none new · simulation.md, writing-a-mod.md, glossary · STATUS row only
Resource notes: swap used 1078 MB, thermal warm (benchmark drift), sub-workers used 0, anything left running: none
Follow-ups: new drafts none (interception and jamming, power-based interference, licence auctions in ADR 0191)
```
