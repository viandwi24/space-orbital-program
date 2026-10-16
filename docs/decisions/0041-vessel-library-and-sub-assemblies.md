# 0041 — Vessel library and sub-assemblies: IndexedDB records of format-2 designs

**Status:** accepted
**Date:** 2026-10-17
**Plan:** plans/029-vab-follow-ups.md
**Builds on:** ADR 0016 (design format), ADR 0034 (format 2, symmetry, radial links), ADR 0029 (editor state).

## Context

The VAB keeps one design in `localStorage` (`orbital.design`, the hand-off to `/flight`) plus JSON files. Players need several named designs, thumbnails, duplicate and delete, and reusable sub-assemblies (a booster pack, an engine cluster) to place from the catalogue.

Limits checked 2026-10-17 (MDN, `research/vab-editor.md`): `localStorage` holds 5 MiB per origin as strings, synchronously; IndexedDB is quota-based (Chromium up to 60 % of the disk, Firefox min(10 % of disk, 10 GiB), Safari about 60 %), stores Blobs and strings, asynchronously. Data is best-effort and can be evicted under pressure unless `navigator.storage.persist()` is granted. A design is 1 to 4 KB of JSON; a 192 x 128 thumbnail is 8 to 25 KB, so 100 entries with thumbnails reach 2 to 3 MB: too close to 5 MiB, shared with the draft and every script text.

## Decision

1. **The library is IndexedDB** (database `orbital`, store `library`, `keyPath: id`). A record is `{ id, kind: 'vessel' | 'assembly', name, design, thumbnail, createdAt, updatedAt }`. `design` is a format-2 `VesselDesign` (the same JSON as the file export); `thumbnail` is a small PNG data URL taken from the 3D view or `null`. Sub-assemblies are records with `kind: 'assembly'`: a design with one root, no stages, and the radial links of its inside parts intact (the root's own `radial` is dropped, it belongs to the parent link, ADR 0034).
2. **A `LibraryStore` interface** (`list`, `get`, `put`, `delete`) is the only thing the logic touches; `lib/vab/library.ts` holds the pure operations (create, rename, duplicate, delete, import, export, migration, unique names) on top of it, tested with an in-memory store. `lib/vab/library-idb.ts` is the browser adapter (about 60 lines, verified in the browser). If IndexedDB is unavailable or throws (private modes), the library falls back to the in-memory store for the session and the UI says "not saved on this device".
3. **Everything read from storage or a file is untrusted**: `parseDesign` (schema, `migrateVesselDesign` for format 1, `resolveVesselDesign`) runs on every record at load; a record that fails is listed as "damaged" with its error and is never opened silently.
4. **`localStorage` keeps only the hand-off** (`orbital.design`) and the per-design script text. Opening a library entry writes the draft as before; `/flight` is unchanged. The page autosaves the working design into its library record (debounced 800 ms, and on leaving) so closing the tab loses nothing.
5. **Placing a sub-assembly** reuses the editor's attach machinery: the held assembly is re-indexed from `nextIndex` and joined at an `AttachTarget` like a carried subtree. With symmetry n on a radial target, `planAttach` makes n copies (new symmetry group each, one group per original part so a group move keeps them together).
6. **Catalogue**: a category "Sub-assemblies" lists the `assembly` records with their thumbnails; it needs no change to the SDK or part definitions.

## Alternatives considered

- **More `localStorage` keys.** Synchronous, 5 MiB shared, no Blobs; thumbnails would eat the quota. Kept only for the hand-off, whose reader (`/flight`) stays untouched.
- **A `fake-indexeddb` test dependency.** Adds a package for a 60-line adapter; the store interface gives the same coverage of the logic. The adapter is checked in a real browser.
- **Server or file-system storage.** Out of scope (static client, ADR 0006); the JSON export remains the portable form.
- **Sub-assemblies as parts in the mod registry.** Needs SDK work and ADRs; the library is per player and local.

## Consequences

- Designs are safe against `localStorage` quota errors; eviction under storage pressure is possible (the UI offers the JSON export and asks the browser for persistent storage on first save).
- The Open dialog replaces the file-picker button; file import and export stay inside it.
- A mod removed after a design was saved leaves a record that fails `resolveVesselDesign`; it is shown as damaged, not deleted.
