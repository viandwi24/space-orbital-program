# 0299 — An empty Hangar opens with "Start a vessel": recommended blueprints or Build my own

**Status:** accepted
**Date:** 2026-10-22
**Plan:** plans/350-hangar-start-modal.md
**Supersedes in part:** plan 285's welcome card in the empty Hangar (outside lessons)
**Builds on:** plan 285 (the featured blueprints), plan 344 (lessons)

## Context

The empty Hangar showed a card with four template tiles. New players read it as "pick a template", not as an offer, and did not see that the parts list on the left is the way to build their own.

## Decision

1. **A modal states the choice.** An empty Hangar opens "Start a vessel". It has a subtitle saying both ways are fine, and the four featured blueprints, each marked "Recommended" with its thumbnail. It also has Open the Library, Open a saved vessel (when there is one), and a white **Build my own**.
2. **Building your own is the default way out.** Build my own, Escape and a click outside all close the modal the same way. A coach mark then appears beside the parts list: pick a command pod, then click the glowing ring. The coach mark ends at the first part, when a design is loaded, or on "Got it".
3. **When it shows.** It shows on an empty Hangar when the page opens, and again after New. It does not show with a design loaded, when the page was opened to show the Library, or in a lesson. A lesson keeps the inline card that its steps point at (`vab-open-library`).
4. **Don't show this again** is a per-browser-profile flag, `orbital.vab.hideStart`, next to the Hangar's other view flags. With it on, an empty Hangar goes straight to the coach mark.
5. **Tests.** The e2e suite starts with the flag set (Playwright `storageState`), so the specs that build in an empty Hangar are not blocked. `hangar-start.e2e.ts` clears it and covers the modal.

## Consequences

- A new player sees one decision with a default, instead of four tiles that look mandatory.
- `vab-open-library` now names the modal's button outside lessons, and the inline card's button in a lesson.
