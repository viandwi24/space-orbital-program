---
id: 120
title: "Comms tier 5: channels, frequency licences, interference, encryption"
status: draft
owner: ""
depends: [119]
phase: 7
created: 2026-10-17
updated: 2026-10-17
---

# 120 — Comms tier 5: channels, frequency licences, interference, encryption

## Goal

Bands are divided into channels; operating on a channel needs a licence bought per world (funds when the economy is on); links on the same channel in view of each other interfere and lose margin; encrypted links cost overhead and protect against agency interception (when agencies exist).

## Context

- ADRs: 0101
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

- [ ] `packages/sim` test: two links on one channel within view lose the stated margin; moving one to another channel restores it.
- [ ] `packages/sim` test: transmitting on an unlicensed channel is refused with a reason.
- [ ] `bun test`, `bun run typecheck`, `bun run build` and `bun run docs:check` pass.

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row, next plan, open issues).
- [ ] `docs/journal/120-comms-tier-5-channels-licences-interference.md` written.

- [ ] New ADRs for decisions made here; `docs/research/` for anything looked up.

## Log

- 2026-10-17 — Created as draft from the owner's Fondasi Orbital decisions (ADR 0101).
