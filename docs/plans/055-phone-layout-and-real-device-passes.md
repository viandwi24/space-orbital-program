---
id: 055
title: "Phone layout and real-device passes"
status: done
owner: "phone session (Claude, 2026-10-17)"
depends: [053]
phase: 3
created: 2026-10-17
updated: 2026-10-17
---

# 055 — Phone layout and real-device passes

## Goal

Decide, by ADR, whether phones become supported in v1.x, and fix what can be fixed and proven without a device: the small-screen layout defects of the supported tablet sizes, safe areas, the notice for the screens we do not support, and the audio interruption of mobile Safari. Everything that needs a physical phone or tablet is written as a checklist for the human, unticked.

## Context

- ADR 0063 (tablets in landscape at 1024x768 and up are supported, phones get a notice), journal 053 (emulation only), `product/browser-support.md`.
- Known defects from journals 035, 053, 057, 058 and plan 072: the maneuver and orbit strip and the script panel under the instrument deck at 1024x768, the touch overlay taking taps meant for the script panel, the Target card cut off.
- ADR 0091 (this plan): phones stay unsupported; why. `research/phones-and-real-devices.md` (checked 2026-10-17).

## Scope

**In:** the decision (ADR 0091); layout clearances measured from the deck (`lib/layout/layout-model.ts`, flight page); touch controls clear of the script panel; the notice by screen class; `viewport-fit=cover` and safe-area tokens; `interrupted` audio contexts resume; a Playwright mobile-emulation suite; JPG screenshots; the human device checklist; `browser-support.md`.

**Out:** a compact phone HUD and a portrait VAB (draft plan 073, needs a device), gamepad, a native app, the script editor human pass (plan 072).

## Steps

1. Refine: ADR 0091, research note, this plan (done at the start).
2. `layout-model.ts` (pure, tested): deck clearance, script width, throttle anchor, screen classes and advice.
3. Flight page: measured `--deck-h`, `--above-deck`, `--script-w`; `.tl` and `.tr` limited above the deck; `.bl` above the deck below 1280 px; `.tl` above the touch overlay; safe-area margins; `TouchControls` takes an anchor.
4. Notice by class; `viewport-fit=cover`; `--safe-*` tokens; `dvh` line on dialogs.
5. Audio: `statechange` publishing and resume of `interrupted`.
6. `e2e/mobile.e2e.ts`; screenshots; the guard proven to fail on the old layout.
7. Docs: `browser-support.md`, journal with the device checklist, roadmap, STATUS, draft plan 073.

## Acceptance criteria

- [x] ADR 0091 records whether phones are supported, which screens, the minimum size, the performance preset and audio interruptions, with the reasons and what cannot be verified.
- [x] Vitest: `layout-model` (clearances, anchor, classes agree with `isSmallScreen`), the audio engine resumes an `interrupted` context and follows `statechange`.
- [x] Playwright (Chromium, touch, `workers: 1`): at 1024x768 and 1180x820 with the script panel open and touch controls on, no overlap of the script panel, the orbit strip or the right column with the instrument deck, the throttle clear of the script panel and deck, the Run button receives taps; the right column's Target card is reachable by scrolling; no horizontal scroll in the menu and VAB at 1024x768, 1180x820, 1366x1024; the notice names phone portrait, phone landscape and tablet portrait; the meta has `viewport-fit=cover`.
- [x] The overlap guard fails against the old layout (proof it catches the defect).
- [x] JPG screenshots at the supported sizes and at the notice sizes in `docs/journal/assets/055-*.jpg`.
- [x] `product/browser-support.md` updated; the roadmap page and its test consistent.
- [x] A "human device checklist" with exact steps is in journal 055.
- [x] `bun run test`, web vitest, `bun run typecheck`, `bun run build`, `bun run docs:check`, prettier clean on the touched files.
- [ ] (device only, human) The checklist run on a real iPad, Android tablet and phone: not done, no device; results go to plan 073's Log.

## Docs checklist

- [x] `STATUS.md`, journal, `product/browser-support.md`, ADR 0091, research, roadmap, plan 072 note, draft plan 073.

## Log

- 2026-10-17 — Created as draft by plan 053 (audio session): phones and real devices were out of its reach.
- 2026-10-17 — Refined draft → ready at the human's request (session: phone session). Decision: phones unsupported (ADR 0091); the device items stay on the checklist.
- 2026-10-17 — Done (session: phone session). Decision ADR 0091. Evidence: `bun run test` 1269 pass / 0 fail; web vitest 821 pass (layout model 12, audio engine 2 new interruption cases); `bun run typecheck` all packages 0, svelte-check 1540 files 0 errors; `bun run build` ok; `bun run docs:check` OK; prettier clean; Playwright Chromium (touch, `workers: 1`, `E2E_HEADERS=1`) 14 passed (`mobile.e2e.ts` 12, `touch.e2e.ts` 2). The overlap guard failed ("script panel overlaps the instrument deck") against the old `+page.svelte` and passes with the fix. Screenshots `docs/journal/assets/055-*.jpg`. The last criterion (the checklist on real devices) is unticked on purpose: no device; the checklist is in journal 055 and its results start plan 073. Firefox and WebKit not run for the new e2e file.
