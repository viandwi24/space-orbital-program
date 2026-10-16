---
id: 046
title: "Runtime mod loading and mod manager"
status: draft
owner: ""
depends: [043]
phase: 2
created: 2026-10-17
updated: 2026-10-17
---

# 046 — Runtime mod loading and mod manager

## Goal

A player installs a mod (a built JS bundle or a folder/zip of data + code) from a file or URL with an explicit trust prompt, enables/disables it in a mod manager, and its parts/modules/bodies appear in the VAB and flight; a sample external mod lives outside `mods/stock` and proves the spec's Phase 2 success criterion.

## Context

- ADR 0048, `product/spec.md` §6 Phase 2, ADRs 0005, 0013, 0028, 0033; `docs/guides/writing-a-mod.md`; the loader (plan 005). Security: mods are code — decide by ADR whether they run in the page (trusted, with a clear warning) or sandboxed; saves must record which mods they need.

## Scope

**In:** mod package format + manifest, load from file/URL, persistence (IndexedDB), mod manager UI, enable/disable with reload, version/api compatibility messages, saves listing required mods, a sample external mod (new part + module + a script) built with a documented command, modder docs.
**Out:** a hosted mod repository.

## Acceptance criteria

- [ ] To be made measurable at refinement. Must include: loader tests for external bundles (bad manifest, api mismatch, duplicate ids); e2e or manual: install the sample mod in the browser, build with its part, fly it, disable it, save that requires it shows a clear message; docs; all repo checks.

## Docs checklist

- [ ] STATUS, journal, ADR, `writing-a-mod.md`, `plugin-system.md`.

## Log

- 2026-10-17 — Created as draft (ADR 0048, v1 scope).
