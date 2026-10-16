# 0057 — Mod package format, trust model and runtime loading

**Status:** accepted
**Date:** 2026-10-17
**Plan:** plans/046-runtime-mod-loading.md
**Builds on:** ADR 0005 (plugins), 0013 (define API and loader), 0038 (script sandbox), 0048 (v1 scope), 0050 (saves record mods).

## Context

Moddability is the product's headline (spec section 1, Phase 2 success criterion: a mod living outside the repo adds a part and a script that are usable in the web client). Today the web client boots exactly `[Stock]`, imported at build time. A mod is code (hooks run every step in the sim Worker); the page also needs the same definitions (VAB catalogue, stage maths read module `store`/`describe`, the renderer reads part visuals). Research: `research/mod-loading.md`.

## Decision

1. **Package = one JSON file, `*.orbital-mod.json`:** `{ format: "orbital-mod", formatVersion: 1, manifest, code, sha256 }`. `code` is a single ES module text whose default export is a `Plugin`. `manifest` is `{ id, version, api, title?, description?, author?, homepage?, dependencies? }` (`dependencies`: plugin id to version range; `api`: range of the mod API). `sha256` is the hex SHA-256 of `code`. The manifest is readable **without executing the code**, which is what makes an honest trust prompt possible. No zip (needs a parser or dependency, cannot be read in an editor); assets (glTF) are out of scope.
2. **Build:** `bun run tools/mod-build/build-mod.ts <mod folder>` bundles `src/index.ts` with `Bun.build` into one ESM text, replaces `@orbital/sdk` by a shim that reads the host's SDK (below), reads `mod.json` as the manifest, checks the bundled plugin's `meta` against it and writes `dist/<id>-<version>.orbital-mod.json`.
3. **One SDK copy, supplied by the host.** The host puts `@orbital/sdk` on `globalThis[Symbol.for("orbital.mod-sdk")]` (`installModSdk`) before importing a bundle; the shim re-exports from it. A bare `import "@orbital/sdk"` cannot resolve from a blob URL, and bundling the SDK into each mod would give every mod its own zod and `define*` copy. Types come from the real SDK at build time as for stock.
4. **Loading:** `importModBundle(code)` (core) imports the text through a `blob:` URL; `resolveMods(bundles, { builtin, importModule })` (core, pure of I/O) validates and orders them: duplicate plugin id (naming both), mod API range, manifest dependencies against built-ins and accepted mods, the import itself, the default export's shape, the manifest matching `meta`, and finally a trial `loadPlugins([...builtin, ...accepted, candidate])` that catches throwing `setup`, duplicate part/module ids (the registry error names both plugins), invalid part definitions. A rejected mod is reported with its reason and **does not boot**; one bad mod never stops the game or the other mods. The page and the Worker run the same function on the same bundles, so they agree.
5. **Where mods run.** The page reads installed, enabled bundles from IndexedDB (database `orbital-mods`) before any route renders (root layout `load`), resolves them, and uses the resulting plugins for the catalogue (VAB, flight HUD, renderer part list). It sends the accepted bundles' `{ id, code }` in the Worker's `init` message; the Worker runs `resolveMods` and boots `[Stock, ...mods]`. Part visuals use the renderer's existing generators (`visual.kind` plus palette and params); a mod cannot ship new geometry code yet (draft plan 051).
6. **Trust model: mods are code and run with the page's privileges** (same origin: they can read saves and storage, and use the network). They are **not sandboxed**, unlike player scripts (ADR 0038): their hooks must run in the sim's own loop with direct access to the world and physics, and a sandbox with that bandwidth would be a different product; the 0038 sandbox exists because a script is typed or pasted casually by a player, a mod is installed deliberately. Therefore: nothing from a package is executed before the player confirms a prompt that shows the id, version, author, API range, dependencies, source (file name or URL), size and fingerprint, and says in plain words that the mod can do anything this page can. The prompt is shown again if the fingerprint of an installed mod changes (update or replacement). The mod manager lists every installed mod with its state and lets the player disable and remove it at any time. A mod that fails to load is disabled for the session and says why.
7. **Enable, disable, reload.** The set of mods is fixed per page load. The manager records the change and offers "Reload to apply" (full page load; it lives on the start page, never in a flight). Load order is install order; dependencies are honoured by the loader.
8. **Saves.** `bootedMods()` returns the built-ins plus the mods that actually booted. A save that needs a missing mod is refused with a message that names it and says whether it is installed but disabled, failed, or not installed, with a link to the manager (ADR 0050 point 7). Mods must keep all state in the world (ADR 0010): closures are not saved.
9. **URL install** is supported by `fetch` of the same JSON file (the server needs CORS); it goes through the same prompt. No hosted repository.
10. **Mod API 0.1.15** (additive): `modManifestSchema`, `modPackageSchema`, `parseModPackage`, `resolveMods`, `installModSdk`, `importModBundle`, `modCodeHash` exported from core (and the schema/types from the SDK).
11. **Layout:** a new top-level `examples/*` workspace holds the sample external mod (`examples/mod-sample`, outside `mods/stock`), added to the root workspaces, `typecheck` and `test` scripts. It follows the mod rule (imports only `@orbital/sdk`).

## Alternatives considered

- **Sandbox mods in a Worker/iframe** — rejected: see point 6; hooks need the world.
- **Bundle the SDK into every mod** — rejected: duplicated zod and SDK, larger files, no single API version enforcement.
- **Import map / `importScripts`** — blob modules cannot use import maps portably across Workers; the shim needs none.
- **Zip or folder packages** — rejected: dependency or hand-written container parser, nothing to inspect before trust.
- **Execute first, ask later** (read `meta` from the running code) — rejected: the prompt would be after the code ran.
- **Hot enable/disable** — rejected: the registries are shared by the VAB, renderer and Worker; a reload is exact and cheap.

## Consequences

- A malicious mod can harm the player's data; the prompt is the protection, documented in the guide and the manager.
- `loadCatalog`/`loadContent` read the resolved mods from a module-level runtime, initialised by the root layout.
- Content ids from a mod in a save keep resolving as long as the mod and its ids stay stable (guide).
