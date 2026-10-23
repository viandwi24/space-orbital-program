# 0312 — The Mods page is a mod manager of cards built from the loader's registries

**Status:** accepted
**Date:** 2026-10-23
**Plan:** plans/376-mods-page-mod-manager.md
**Supersedes in part:** ADR 0057 (the plain list layout of the mod manager; its install and trust rules stand)
**Builds on:** ADR 0057, ADR 0170 (patches), ADR 0311 (developer tools read everything from plugins)

## Context

The Mods page was a column of plain rows. It did not show what a mod adds, whether its dependencies are met, or whether it loaded with problems, and installing was a file button and an address field.

## Decision

1. **One card per mod, built-ins included.** Each card shows:
   - a monogram tile coloured from the mod id (the manifest has no icon);
   - the name, id, version and author, and the description;
   - a status chip;
   - what the mod adds, as counts;
   - badges for the API range, the dependencies, the licence, the source and the size;
   - a footer with the switch and the actions (Patches, Update, Remove).
   Built-ins come first, say "Built-in · always on", and have no switch and no Remove.
2. **The status chip.**
   - **Loaded** when the mod runs. **Loaded with warnings** when it runs but a patch did not apply or a dependency is not met; the reason is shown.
   - **Failed** or **Blocked** when it did not load, with the reason.
   - **Needs a reload** when it starts or stops on the next load.
   - **Off** when it is turned off.
3. **The counts come from the loader's registries.** Every registry knows which plugin registered each entry (`Registry.owner`). `countsByPlugin` groups the entries into parts, blueprints, crew content, programs, panels, overlays and world content. It is the same data the Developer page's viewers and loader log read (plan 375), not a second record. Each count links to `/developer?tab=<kind>&mod=<id>`.
4. **Dependencies and the API** are checked with `satisfies`. A dependency counts as met by a built-in or by an installed mod that is on.
5. **Install.**
   - A drop zone (also a button for choosing a file) and the address field sit in a side panel, with the three steps of the safety flow.
   - The trust prompt stays the gate, now as a review dialog with the mod's tile, the warning, the facts and the fingerprint.
   - Update downloads a mod installed from an address again, through the same dialog.
   - Remove asks first.
6. **Reload to apply** is a banner that saves a world in progress first (`saveAndReload`).
7. **Find and filter.** Search covers the name, id, author and description. The filter is All, On, Off or Problems. Sort is by load order, name, or recently installed.

## Consequences

- The smoke e2e's names and labels are kept.
- Stock blueprints are counted once the developer-tools work moves them into the stock mod.
