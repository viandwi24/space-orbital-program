---
id: 055
title: "Phone layout and real-device passes"
status: draft
owner: ""
depends: [053]
phase: 3
created: 2026-10-17
updated: 2026-10-17
---

# 055 — Phone layout and real-device passes

## Goal

What plan 053 and ADR 0063 left out: a compact interface for phones (portrait and landscape below 900x500 CSS px) and runs on real tablets and phones instead of desktop-engine emulation.

## Context

- ADR 0063 (tablets in landscape at 1024x768 and up are supported, phones get a notice), journal 053 (emulation only, screenshots at 390x844 and 1024x768), `product/browser-support.md`.

## Scope

**In (candidates, to be ordered at refinement):**

1. A compact flight HUD (navball, speed, stage and throttle in a few elements) and a VAB layout for portrait and for phone landscape; the touch controls of plan 053 reused.
2. A real iPad (Safari) and an Android tablet and phone: the smoke suite by hand or through a device farm, frame times on those GPUs (the quality governor has never run on a phone), thermal behaviour, browser chrome and safe areas (`viewport-fit`, notches).
3. Audio on mobile Safari: the unlock gesture, the silent-switch behaviour and an interruption (a call) while the context is running.
4. Pointer details: palm rejection near the pad, multi-touch on the throttle and steering together on real glass.

**Out:** gamepad support, a native app.

## Steps

1. Refine when the human has a device or a device-farm account; each candidate may become its own plan.

## Acceptance criteria

- [ ] To be written when refined.

## Docs checklist

- [ ] `STATUS.md`, journal, `product/browser-support.md`, an ADR superseding 0063 if phones become supported.

## Log

- 2026-10-17 — Created as draft by plan 053 (audio session): phones and real devices were out of its reach.
