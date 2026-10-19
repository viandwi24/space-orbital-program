# 233 — Base layout, Flight and Space Center: match the v2 design package exactly

**Plan:** [plans/233-base-layout-fidelity-to-refs-v2.md](../plans/233-base-layout-fidelity-to-refs-v2.md) · **Session:** Worker B (M5), 2026-10-19 · **ADRs:** [0222](../decisions/0222-ui-fidelity-build-menu-branch-centers-deep-space-dish.md) point 1, 0201, 0107, 0205 · **Design:** `refs/space-orbital-program-ui-v2/docs/BASE_LAYOUT.md`, `source/v2/Base.dc.html`, `FlightV2.dc.html`, `SpaceCenterV2.dc.html`

## What was done

| Where | What |
|---|---|
| `lib/layout/shell-model.ts` | the Base layout as data: sizes (bars 44, margins 24, status 32, safe area 80/24/56, bell 26/14/8), the §6 icon paths and the page-action and status icons of `Base.dc.html`, the warp segments (6 px for the four physics levels, 10 for rails; past white, now accent, the rest 12 % white, all dim while paused), `T+ 2y 70d 26:32`, the fixed group and the status zones in order |
| `TimeBar.svelte` | top left at 24: play/pause 36 (`#F4F4F5`, ink icon), the eight segments as buttons ("Time warp 2×", locked above the world's limit), the multiple 12/600 min-width 34 (`—` paused), a 1 × 18 rule, T+ 12/500 with the world date as its tooltip; the clock's chip (plan 205) and "Catch up to now" (plan 087) after the time |
| `MenuBar.svelte` | top right at 24: page actions, a rule (only with page actions), Vessel · Map · Space Center · VAB with a white icon and a 4 px dot on the active one (`#8B8B93` otherwise), a rule, Menu; 36 px round buttons, icon 18, stroke 1.7. Menu opens Settings and Main menu, or Flight's pause menu |
| `StatusBar.svelte` | 32 px with a 1 px top border, 10 px `#A1A1AA`: world 11/700, the mode chip 8/700, the system; the connection dot (accent, `#FF5A5F` offline) with "Connected" and the network; the location with its icon; Funds · Science · Reputation · Contracts "N active" in the middle, values 600 white; autosave, mods, the bell 26 × 26 with the §6 path, icon 14 and a `#F4F4F5` badge 8/700 |
| `WorldShell.svelte`, the world layout | the top navbar is gone. Flight and the Space Center fill the window under the bars; the other pages sit in the safe area. `pageShell` (`page-actions.svelte.ts`) carries what a page puts in the bars |
| Flight | the world capsule, the time capsule, the situation bar and the toolbar are gone; page actions Panels · Vessel info · Navball · Crew · Change camera (disabled: plan 226); T+ is the mission time; picking a segment steps the warp; the vessel and its situation are the status bar's location; Map in the fixed group switches the map view; dock at top 80, staging, crew and the navball at bottom 56, the side column at top 80 |
| Space Center | no title over the site; the right column at top 80, right 24, 320 wide, with the selected building first; the build dock at bottom 52; Mission Center is the page action |
| tokens | `--bar-filter: blur(28px) saturate(160%)` (none for the solid and high-contrast modes) |
| tests | vitest `shell-model` (sizes, segments, T+, fixed group, zones), `status-bar` (contracts, connection), `TimeBar` (date tooltip, catch up, limits, pause, nine Sol levels; ported from the time control's test); e2e `base-layout.e2e.ts` |

## Side by side

Ours on the left, the design on the right. The design frames were drawn from the `.dc.html` sources with their own `renderVals()` and default props (the package has no images and its canvas runtime is not in it): a small Playwright script expands the `{{holes}}`, `<sc-for>` and `<sc-if>` and screenshots the 1920 × 1080 canvas. The 1440 × 900 rows put our 1440 shot next to the same 1920 frame.

- The bars, 1920 × 1080 (Flight with no panel open; the design is `Base.dc.html` with its vessel-page example): `assets/233-base-1920.jpg`
- Flight, 1920 × 1080 and 1440 × 900 (in orbit, the vessel panel open; `FlightV2.dc.html`): `assets/233-flight-1920.jpg`, `assets/233-flight-1440.jpg`
- Space Center, 1920 × 1080 and 1440 × 900 (`SpaceCenterV2.dc.html`): `assets/233-space-center-1920.jpg`, `assets/233-space-center-1440.jpg`

The before state for comparison is plan 215's shot with the old top navbar: `assets/215-flight-1440x900.jpg`.

## Remaining differences

In this plan's scope (the three bars, the safe area, the Flight and Space Center offsets of BASE_LAYOUT §5): none. Every measurement of the plan's Log checklist is in the code, and the boxes are measured by `e2e/base-layout.e2e.ts`.

Outside this plan's scope, and seen in the pairs:

- The Space Center's bottom dock is still the build dock with text buttons; the design's dock of building icons and the build menu are plan 235. Its right column keeps our panels (Buildings, Needs attention, Market) in the design's place and width, not the design's cards.
- The panels inside the safe area (staging, crew, the vessel panel, the navball deck, the dock's panels) are the components of plans 088, 214 and 215, not redrawn here.
- `Base.dc.html` draws Vessel info as an info circle in its example; Flight uses `FlightV2.dc.html`'s rocket, as the plan says Flight follows FlightV2.

## What surprised me

- **The design package cannot be opened in a browser** (its README says so): the `.dc.html` files need the canvas runtime. Their markup is simple enough (holes, `sc-for`, `sc-if`, a `renderVals()` class) that a 60-line expander in a Playwright page draws them faithfully; that is how the side-by-side frames were made.
- **A black strip along the top of the Flight shots** appears only in the headless e2e renderer: in the dev build on the GPU the canvas's top rows are drawn (read back right after a frame). The canvas itself fills the window (measured 0, 0, 1440 × 900).
- **Tests leaned on the old bars:** the smoke test's warp buttons, the script panel's toolbar button, `header.bar h1` for the vessel's name, the Mission Center in the top nav. The warp is now one button per level ("Time warp 2×"), the script editor is its dock tab, the vessel's name is the status bar's `status-place`, and the Mission Center is the Space Center's page action.
- **SvelteKit's route announcer** is a 1 × 1 div at 0, 0: the "nothing above the bars" check skips elements of 1 px and less.

## Decisions made (link ADRs)

- No new ADR. Choices the design leaves open, in the plan's Log: what the old bars held that the design has no place for (the place's pause toggle is in Settings → Time; Staging, Script and Controls left the flight toolbar: staging is always shown, the script editor is a dock panel, Controls is F1 and in the pause menu); the connection text from the comms snapshot.

## Open questions / follow-ups

- The Hangar, Mission Center and the other buildings keep their own page tops inside the safe area until their v2 designs (BASE_LAYOUT §7).

## Verification output

```
VERIFY
```
