# 0060 — Release: settings, onboarding, public pages and the descriptor hooks

**Status:** accepted
**Date:** 2026-10-17
**Plan:** plans/023-release-readiness.md
**Amends:** ADR 0033 (module descriptors gain three optional fields; API 0.1.15 to 0.1.16).

## Context

Plan 023 makes the game presentable to strangers (ADR 0048). Four decisions need recording because they are expensive to reverse or a later agent would re-ask them: where player settings live and how units work, what the tutorial is made of, how the HUD and the editor stop knowing stock module ids (journal 046), and what the public pages are.

## Decision

1. **Settings.** Graphics preset and automatic quality keep their own `localStorage` keys (plans 019 and 039), so earlier profiles keep their choices; everything else is one versioned JSON value `orbital.settings` (`lib/settings/settings.ts`: `{ v: 1, units, tutorial }`), parsed with zod on every read (invalid fields repair to defaults, unknown keys are dropped, a failing `localStorage` never throws). The reactive store is `settings.svelte.ts`; the settings dialog is one component used by the main menu and the pause menu, and changes to the preset, automatic quality and units apply live in a running flight.
2. **Units.** The simulation, saves, scripts and mods stay SI. A display layer (`units.svelte.ts` plus `format.ts`) converts for metric or imperial (feet and miles, ft/s, pounds and short tons, klbf, ft/s delta-v). The system is reactive state, so every number formatted through `format.ts` redraws on change; tests pass the system explicitly. No unit mixing: every unit label in the HUD and the VAB comes from `format.ts` or `speedUnit()`.
3. **Key bindings** are a read-only list (`lib/keybindings.ts`) that feeds the help overlay and the settings dialog; a test rejects a key used twice in a mode. Rebinding is on the roadmap (it would need the handlers in `flight-loop.ts` and the VAB controller to read a table instead of `switch` statements).
4. **Audio.** 1.0 has no sound. The settings dialog says so in one disabled row instead of offering a volume slider that does nothing.
5. **Tutorial.** A pure step machine (`lib/onboarding/tutorial.ts`): nine steps from the empty VAB to an orbit, each completing only on its own observable condition, at most one step per observation, skippable, persisted in the settings value, restartable from the settings dialog. The pages feed it observations (VAB: command, engine and tank present, by catalogue category; flight: throttle, stages fired, height, SAS, map, Ap and Pe). It never changes the game state.
6. **Descriptor hooks (API 0.1.16, additive).** `ModuleInfo.engine.throttle` (the commanded throttle, for the HUD gauge), `ModuleInfo.lift` (a lifting plate: area, lift slope, cross-flow, centre of pressure; for the stability read-out) and `ModuleInfo.category` (the catalogue category a module stands for). Stock modules describe themselves; `hud-model.ts`, `editor/categories.ts` and `editor/stability.ts` no longer import `@orbital/mod-stock`, so a mod's engine, wing or gadget is treated like stock ones. Defaults when a mod says nothing: no throttle (the page's own value), no lift, category from the engine/separator/store/control-source rules, else "Other".
7. **Public pages.** `/roadmap` and `/credits` are routes built from typed data (`lib/public/`), with a test that every roadmap plan exists as a draft plan file. Page metadata (title, description, Open Graph and Twitter card, theme colour, favicon, `social-preview.png` rendered from the game) is static in `app.html` and the routes, because the build is prerendered static HTML. The licence line in the credits stays "to be decided" until the human decides.
8. **Failure.** The layout wraps the app in `svelte:boundary` and the app has a `+error.svelte`: a thrown error shows the message with Reload and Main menu actions instead of a blank page.

## Alternatives considered

- **One settings blob including graphics:** would orphan the stored choices of earlier builds for no gain.
- **Unit conversion in the sim or in saves:** no; SI is a repo rule (`units-and-frames.md`).
- **A rebinding UI now:** needs a table-driven handler, larger than the rest of this plan, untestable without real users; the list is honest and the roadmap says so.
- **A tutorial that drives the game (autopilot hints):** hides the controls it should teach.
- **Fake audio slider:** a control that does nothing is a lie.

## Consequences

- Mod authors get three more descriptor fields (`guides/writing-a-mod.md`, `architecture/plugin-system.md`).
- The `format.ts` functions accept an optional system argument; code that formats numbers outside `format.ts` shows SI and must be moved there.
- The tutorial text is data; changing a step means changing `tutorial.ts` and its test table.
