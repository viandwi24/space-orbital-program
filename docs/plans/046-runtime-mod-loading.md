---
id: 046
title: "Runtime mod loading and mod manager"
status: done
owner: "mods session (Claude, 2026-10-17)"
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

Package format, trust model and loading: [ADR 0057](../decisions/0057-mod-package-and-runtime-loading.md). Research: `research/mod-loading.md`.

- [x] **Loader tests (core, `packages/core/test/mods.test.ts`):** external bundles through the blob-URL path: a bad manifest (not JSON, wrong format, bad id, bad version, unknown key, hash mismatch), API range mismatch, duplicate plugin id naming both, a part id duplicated by two mods naming both plugins, missing and version-mismatched dependency, a throwing `setup`, a manifest that disagrees with `meta`, a default export that is not a plugin; a good mod is accepted and one bad mod does not stop the others.
- [x] **Sample external mod (`examples/mod-sample`)**: a new part with its own look, a new module (state in the world) and a sample script; built with the documented command (`bun run tools/mod-build/build-mod.ts examples/mod-sample`); a test builds it, loads it through the same importer the browser uses, flies it in the sim (action ping, state in the snapshot, save/resume with the mod), and the script text passes the scripting sandbox's validation.
- [x] **Web vitest:** the mod store (install, trust record, enable/disable, remove, fingerprint change, failure states, IndexedDB-less memory store), the mod runtime (resolved plugins, booted list, `bootedMods`), the manager's view model and every UI state (empty, prompt, installed list, error, reload banner), save-needs-mod messages (disabled, failed, not installed), Worker `init` carrying mods.
- [x] `[manual]` browser (built-in browser, port 5208): install the sample mod from a file, see the trust prompt, see its part in the VAB with its own look, build and fly it, disable it (reload), a save that needs it shows a clear message, enable and the save loads. Screenshots `docs/journal/assets/046-*.png`.
- [x] Docs: `guides/writing-a-mod.md` gains "Ship your mod"; `plugin-system.md`; `boundaries.md` (examples); AGENTS.md map; ADR 0057; research; journal 046.
- [x] `bun run test`, web vitest, `bun run typecheck`, `bun run build`, `bun run docs:check`, prettier on touched files.

Results: `packages/core/test/mods.test.ts` 10 tests (bad packages, API mismatch, duplicate ids, part id clash, dependencies, throwing setup, bad code); `examples/mod-sample/test/sample.test.ts` 5 tests; web vitest 470 tests (mods store/runtime/manager 20 new, save and worker routing); browser run in journal 046 with `docs/journal/assets/046-*.jpg` (JPEG as in plan 043; the plan said png). The manager's UI states are checked in the browser and through the view model, not by a component test (no harness in the repo). `bun run test` now uses `./packages ./mods ./examples` because bun's bare filters also matched `apps/web/src/lib/mods`.

## Docs checklist

- [x] STATUS, journal 046, ADR 0057, research `mod-loading.md`, `writing-a-mod.md`, `plugin-system.md`, `boundaries.md`, AGENTS.md.

## Log

- 2026-10-17 — Created as draft (ADR 0048, v1 scope).
- 2026-10-17 — Refined draft → ready at the human's request (session: mods session). Started the same day: status in-progress.
- 2026-10-17 — Done. Draft 051 (mod geometry/assets) split off.
