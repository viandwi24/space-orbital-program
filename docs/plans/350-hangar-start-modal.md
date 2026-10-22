---
id: 350
title: "Hangar: a \"Start a vessel\" modal with recommended blueprints and Build my own"
status: done
owner: "ui-v3 session (Claude, 2026-10-22)"
depends: [285, 346]
phase: 7
created: 2026-10-22
updated: 2026-10-22
---

# 350 — Start a vessel

## Goal

The owner's feedback of 2026-10-22: players who see the empty Hangar's template tiles think a template is required. They do not see that they can drag parts and build their own. The empty Hangar should open with a clear choice: a recommended blueprint, or **Build my own**.

## Context

- ADR 0299 (this plan's decisions)
- Plan 285 (the blueprint library and the featured tiles), plan 344 (the "Building in the Hangar" lesson targets `vab-open-library` in the empty Hangar)

## Scope

**In:**
- The `StartVessel` modal: the title "Start a vessel", a subtitle, the four featured blueprints marked "Recommended" with their thumbnails, "Open the Library", "Open a saved vessel" when there is one, a white **Build my own**, and "Don't show this again".
- Escape and a click outside close the modal as Build my own.
- Build my own closes the modal and shows a coach mark beside the parts list. The first part, or a loaded design, ends the coach mark; "Got it" closes it.
- The modal opens with an empty Hangar and again after New. It does not open when a design is loaded or in a lesson; the lesson keeps its inline card.
- With "Don't show this again" checked, an empty Hangar goes straight to the coach mark.
- The e2e suite turns the modal off in `playwright.config.ts`. `hangar-start.e2e.ts` covers it.

**Out:**
- Hangar placement itself (plan 348).

## Steps

1. `StartVessel.svelte` and the coach mark in the Hangar page.
2. The Playwright storage state and the spec.
3. Screenshots, docs, push.

## Acceptance criteria

- [x] An empty Hangar opens "Start a vessel" with four Recommended blueprints, Open the Library, Build my own and Don't show this again.
- [x] Build my own, Escape and a click outside close it, and the coach mark points at the parts list.
- [x] It does not open with a design loaded or in a lesson. New opens it again. The hide flag is remembered (`orbital.vab.hideStart`).
- [x] svelte-check is clean. e2e was not run, at the owner's request; the spec is written.

## Docs checklist

- [x] `docs/STATUS.md`
- [x] ADR 0299 and its index row
- [x] Journal `350-hangar-start-modal.md`

## Log

- 2026-10-22: Written from the owner's feedback (relayed by the main session) and done the same day.
