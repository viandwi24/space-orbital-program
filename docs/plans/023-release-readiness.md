---
id: 023
title: "Release readiness: menus, settings, onboarding, performance, polish"
status: in-progress
owner: "release session (Claude, 2026-10-17)"
depends: [019, 020, 021, 022, 039, 042, 043, 044, 045, 046]
phase: 2
created: 2026-10-16
updated: 2026-10-17
---

# 023 — Release readiness

## Goal

The game can be put in front of the public (ADR 0048, the last v1 plan): a main menu (new game, continue, load, vessel library, mods, settings, credits), a consistent pause menu, a loading screen, friendly failure screens and an error boundary, settings that persist (graphics preset and automatic quality, units, a keybinding list, an audio placeholder), a skippable first-flight tutorial, mod-aware HUD/editor code, page metadata with a social preview image, a README that explains how to play, run and mod, a public roadmap page, a final review of every screen at 1920x1080 and 1280x720 against `product/visual-direction.md` with every "debug-looking" item fixed or justified, measured frame times, load time and bundle sizes, a cross-engine end-to-end smoke run, and a release checklist whose "licence decided by the human" line stays FAIL until the human decides.

## Context

- Bar: `product/visual-direction.md` (ADR 0025). Scope: ADR 0048. Design system: ADR 0026. Governor and presets: ADRs 0027, 0053. Browser policy: ADR 0040, `product/browser-support.md`. Mods: ADRs 0033, 0057. Saves: ADR 0050.
- Journals with notes for this plan: 018, 021 ("what still looks like a debug view", controls list should read bindings), 022 ("For plan 023"), 030/032 (hosting list in `architecture/scripting.md`), 039/048 (live governor run; method for frame times), 043 (unexercised: file import/export, corrupt-save screen, F9, `.`/`,` warp keys), 046 (`hud-model.ts` throttle, `editor/categories.ts`, `stability.ts` still know stock ids).
- Concurrency: plan 037 (clouds) owns renderer cloud/atmosphere/planet-pass files and `presets.ts` until it is done. The final screen review, the final frame-time table and the final e2e run happen after 037 shows `done` (037 is "should ship", not a dependency).
- The licence is the human's decision. This plan surfaces it; it does not choose one.

## Scope

**In:** the items in the Goal; ADR for the settings/onboarding/public-pages decisions; a mod-aware `throttle`, category and stability path (tests with a test mod); re-running earlier `[manual]` criteria that were left partial; measurements; release checklist; manual-test instructions for the human.
**Out:** hosting/deployment itself, analytics, accounts, new assets, audio content, rebindable keys (a list only), phone support (stated as unsupported, ADR 0040). Extra scope becomes draft plans and board rows (post-v1 roadmap).

## Steps

1. Refine (this document), ADR 0059.
2. Settings store (validated, versioned, persisted) with units, graphics, automatic quality, audio placeholder, onboarding state; keybinding data read by the help overlay and the settings dialog.
3. Menus: main menu, settings dialog, credits, pause menu consistency, loading screen, failure screens, error boundary.
4. Onboarding: pure step machine + tutorial card in the VAB and flight; skippable; persisted.
5. Moddability gap: throttle, categories, stability read module descriptors/data.
6. Metadata, social preview, README, roadmap page, hosting notes.
7. Re-run the unticked `[manual]` criteria; fix what is broken.
8. Review of every screen (after 037), fix, measure, e2e (one engine at a time), release checklist, journal, STATUS.

## Acceptance criteria

Unit criteria run with `bun run test` (packages) and `bun run --filter @orbital/web test` (vitest); `[manual]` ones in the built-in browser on a production build served on port 5213 or 5214.

**Menus and failure screens**
- [ ] **Main menu**: `/` shows, in this order, Continue (the newest save or autosave; disabled with the reason "No saved flight yet" when there is none), New flight (to `/vab`), Load a flight, Vessel library, Mods, Settings, Credits and Roadmap, over a rendered game image, with version text; every item reachable by keyboard (Tab order = visual order) with a visible focus ring. `[manual]` screenshots at both sizes.
- [ ] **Pause menu** has the same buttons as the main menu where they apply (Resume, Save, Load, Settings, Controls, Vessel library via the VAB, Main menu) and the same look; `[manual]`.
- [ ] **Loading screen**: the first paint (static HTML) and the flight/VAB boot show a branded loading state with the step it waits for (never a blank canvas or the word "undefined"); `[manual]` screenshot of each.
- [ ] **Failure screens**: missing WebGL2 / Workers / WebAssembly show the ADR 0040 notice (unit test of the function, existing; plus a `[manual]` run with WebGL2 context creation stubbed to fail on a scratch page load); a thrown error in a page shows an error screen with the message, a Reload button and a link to the main menu (`+error.svelte` and a `svelte:boundary` in the layout; `[manual]` by throwing in a scratch route or by the page's own failure path); the sim Worker failing to start shows the existing "The simulation stopped" card with the cause.

**Settings**
- [ ] **Settings dialog** (from the main menu and the pause menu): graphics preset (low/medium/high/Auto from the device), automatic quality on/off (ADR 0053), units (metric / imperial), the keybinding list (the same data as the help overlay, one source `keybindings.ts`), an audio row that says plainly that 1.0 has no sound (disabled; no setting is faked). Changes apply live in the flight (preset, auto quality, units) and persist across a reload.
- [ ] **Unit tests**: `settings.ts` parse/serialise round trip, defaults, unknown keys dropped, corrupt JSON gives defaults, a failing `localStorage` does not throw; the unit system converts distance, speed, mass and force for both systems with known values (1 km = 0.621 mi, 100 m/s = 328.1 ft/s, 1 t = 2 204.6 lb) and `formatDeltaV` follows the system; `keybindings.ts` has no duplicate key combination within a mode; the help overlay renders from it.

**Onboarding**
- [ ] **Tutorial**: a pure step machine (`onboarding.ts`) covering build -> launch -> stage -> gravity turn -> SAS -> map -> orbit with a vitest table of observation sequences (advances only on its condition, never skips, "skip" and "done" persist, a finished or skipped tutorial never shows again, a reset in settings shows it again). The VAB shows the build hint on an empty design; the flight shows one hint card at a time with the key to press. `[manual]`: a fresh profile (cleared storage) is led from the empty VAB to an orbit by the cards alone with the dev autopilot off (or at least to the first three steps in the browser and the rest by the table, with the reason stated).

**Moddability**
- [ ] `hud-model.ts` `vesselThrottle` reads a module's throttle through data (no `@orbital/mod-stock` import in `hud-model.ts`), `editor/categories.ts` and `editor/stability.ts` take their module knowledge from the module descriptor/data (`describe` of ADR 0033 or a `category`/`aero` hint) with the stock ids not imported; vitest: a test mod's engine reports its throttle, a mod part with a declared category lands in it, a mod fin counts in the stability read-out, and the stock results are unchanged (existing tests untouched and green).

**Public face**
- [ ] **Metadata**: every page has a `<title>`, a meta description, `theme-color`, a favicon (SVG + PNG fallback), Open Graph and Twitter card tags with an absolute-path-safe image (`static/social-preview.png`, 1200x630, rendered from the game, committed with the capture note in the journal); `/roadmap` is a page (not a doc link) listing ADR 0048's post-v1 items with plan links and what each gives the player; `/credits` lists fonts (OFL), engine libraries and their licences from the lockfile/package metadata, and the licence line reads "to be decided" until the human decides; a vitest/bun test checks the roadmap data against the plan board (every listed plan file exists and is `draft`).
- [ ] **README**: how to play (controls, first flight), how to run (dev, build, preview, e2e), how to mod (build a mod package, install it in the Mods page, guides links), requirements (browsers), status/licence line; docs links resolve (`docs:check`).

**Earlier `[manual]` criteria re-run** (each recorded in the journal with the result; broken things fixed)
- [ ] Warp keys `.` and `,` with a real key event path (CDP key events through the browser tool or `dispatchEvent` with `code`/`key` as the handler reads them), F9 quickload, save file export and import, the corrupt-save screen (a hand-damaged file imported), the live visible-pane governor run (the pane visible, 1920x1080, `high` forced, a heavy view, expected: steps down and back, recorded rung/time trace), the sample ascent script and a native runaway script (plan 018's note).

**Review, measurements, release**
- [ ] **Screens**: `docs/journal/assets/023-*.png` of every screen at 1920x1080 and 1280x720: main menu, settings, credits, roadmap, mods, VAB (empty, built), library, flight (pad, ascent, orbit, map, maneuver, moon), pause, controls, load, save, tutorial card, loading, failure. The journal has a written review per screen against `visual-direction.md`: each "still looks like a debug view/prototype" item fixed or justified; flight camera framing, navball depth, empty/error states and panel consistency are named explicitly.
- [ ] **Frame times** per preset (low/medium/high) at the pad, 3 km, 12 km, orbit and the moon by the method of journal 039 (1920x1080 forced, ratio 1, sync read), on the machine used (stated), after plan 037 is done; load time (navigation start to flight playable, cold cache, production build) and bundle sizes per route (gzip) with budgets stated (initial JS of the main menu <= 150 KB gzip, flight route <= 2.5 MB gzip excluding WASM, first playable <= 6 s on the M5 build) and met or justified.
- [ ] **E2E**: `bun run e2e` (smoke) passes in Chromium, Firefox and WebKit, one engine at a time, `workers: 1`, against the production build; updated for the new main menu.
- [ ] **Release checklist** in the journal: each line pass/fail with evidence: licence decided by the human (FAIL until then), hosting headers (CSP, COOP, nosniff from `architecture/scripting.md`, written out as a sample config), browser matrix, known issues triaged v1-blocking or roadmap, bundle and frame budgets, accessibility basics (keyboard, focus, contrast tokens test, reduced motion), the manual-test instructions for the human.
- [ ] All repo checks: `bun run test`, web vitest, `bun run typecheck` (svelte-check 0 errors), `bun run build`, `bun run docs:check`, `bunx prettier --check .`.

## Docs checklist

- [ ] `docs/STATUS.md` (phase marker v1 release candidate, board row, current/next plan, known issues), journal `023-release-readiness.md`, ADR 0059, `product/spec.md` v1 list, `product/browser-support.md`, README, `architecture/overview.md` where the app structure changed, new draft plans for pushed-out scope with board rows.

## Log

- 2026-10-16 — Created as draft at the human's request (visual overhaul, code-only).
- 2026-10-17 — Now the final v1 plan (ADR 0048): depends on 039 and 042–046; also owns onboarding/tutorial, the public roadmap page, and re-running every unticked `[manual]` criterion of earlier plans.
- 2026-10-17 — Refined draft → ready at the human's request (session: release session).
- 2026-10-17 — ready → in-progress (release session). Plan 037 is still a draft/in progress in another session; it is "should ship" and not in `depends` (precedent: plan 043), so the final review waits for it.
