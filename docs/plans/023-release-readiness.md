---
id: 023
title: "Release readiness: menus, settings, performance, polish"
status: draft
owner: ""
depends: [019, 020, 021, 022, 039, 042, 043, 044, 045, 046]
phase: 2
created: 2026-10-16
updated: 2026-10-16
---

# 023 — Release readiness

## Goal

The game can be put in front of the public: main menu, settings (graphics preset, units, keybinding list, audio placeholder), pause/quit flows, loading screen, WebGL/Worker failure screens, automatic quality preset, performance within the budget on reference hardware, page metadata (title, description, favicon, social preview), accessibility pass, and a final cross-screen review against `docs/product/visual-direction.md` with every remaining "debug-looking" item fixed or tracked.

## Context

- Read: `docs/product/visual-direction.md`, journals 019–022, STATUS known issues (license is undecided — a public release needs it decided by the human; this plan must surface that, not decide it).

## Scope

**In:** the above; an end-to-end smoke test in a real browser if feasible (verify tooling online first, e.g. Playwright via `sv add`), bundle-size and load-time measurement, error boundary, persistence of settings.
**Out:** hosting/deployment, analytics, accounts, assets, audio content.

## Steps

1. Refine; ADRs as needed.
2. Implement; tests.
3. Full review pass with screenshots of every screen; journal.

## Acceptance criteria

- [ ] To be made measurable at refinement. Must include: screenshots of every screen at 1920×1080 and 1280×720; measured frame times per preset and load time/bundle sizes recorded; a release checklist in the journal with each item pass/fail (including "license decided by the human"); all repo checks pass.

## Docs checklist

- [ ] `docs/STATUS.md` (phase marker), journal, ADRs, README (how to run/play).

## Log

- 2026-10-16 — Created as draft at the human's request (visual overhaul, code-only).
- 2026-10-17 — Now the final v1 plan (ADR 0048): depends on 039 and 042–046; also owns onboarding/tutorial, the public roadmap page, and re-running every unticked `[manual]` criterion of earlier plans.
