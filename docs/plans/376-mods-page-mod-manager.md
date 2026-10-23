---
id: 376
title: "The Mods page as a mod manager: cards, status chips, what each mod adds, dependencies, drop-to-install with a review dialog"
status: done
owner: "ui-v3 session (Claude, 2026-10-23)"
depends: [320]
phase: 7
created: 2026-10-23
updated: 2026-10-23
---

# 376 — The Mods page as a mod manager

## Goal

The owner's request of 2026-10-23: redesign the Mods page so it looks good and mods are easy to manage.

## Context

- ADR 0312 (this plan's decisions), ADR 0057 (the mod manager and its trust prompt), ADR 0170 (data patches)
- Plan 375 (developer tools: the viewers filtered by mod, and the mod loader log)

## Scope

**In:**
- **One card per mod, built-in or installed:**
  - a monogram tile, name, id, version and author;
  - a status chip: Loaded, Loaded with warnings, Failed, Blocked, Needs a reload, or Off;
  - the description, and what the mod adds as counts per kind, each linking to the Developer viewer filtered by that mod;
  - API and dependency badges, red when not met;
  - licence, source and size;
  - an on/off switch;
  - Patches, Update (from an address) and Remove (with a confirm).
- **Built-ins** are marked "Built-in · always on" and have no Remove.
- **Search, filter, sort:** search by name, id, author or text; filter All, On, Off or Problems; sort by load order, name or recently installed.
- **Install:** a drop zone for `.orbital-mod.json` files that can also be clicked to choose one, and the address field, with the three steps of the safety flow. The trust prompt becomes a review dialog: a monogram header, the warning, the facts and the fingerprint.
- **Reload to apply:** a banner that uses `saveAndReload`.
- **Developer tools** is a compact link in the header.

**Out:**
- The mod loader log itself, and the viewers' filters (plan 375).

## Steps

1. `lib/mods/mod-cards.ts`: counts from the registries' owners, cards, chips, dependencies, search, filter, sort, and the monogram, with tests.
2. The page.
3. Screenshots, docs, push.

## Acceptance criteria

- [x] Every mod shows as a card with its chip, counts, badges and actions. Built-ins cannot be removed.
- [x] Search, the filter and sort work (`mod-cards.test.ts`).
- [x] Dropping a package or giving an address opens the review dialog. Trust and install shows "Needs a reload" and the Reload banner (screenshots).
- [x] The smoke e2e's names are kept: "Mod package file", "Install this mod?", "Trust and install", "Reload to apply", and `mods-developer`. svelte-check is clean. e2e was not run.

## Docs checklist

- [x] `docs/STATUS.md`
- [x] ADR 0312 and its index row
- [x] Journal `376-mods-page-mod-manager.md`

## Log

- 2026-10-23: Written from the owner's request (relayed by the main session) and done the same day.
