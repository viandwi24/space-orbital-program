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

DESIGN_PAIRS

## Remaining differences

None.

## What surprised me

SURPRISES

## Decisions made (link ADRs)

- No new ADR. Choices the design leaves open, in the plan's Log: what the old bars held that the design has no place for (the place's pause toggle is in Settings → Time; Staging, Script and Controls left the flight toolbar: staging is always shown, the script editor is a dock panel, Controls is F1 and in the pause menu); the connection text from the comms snapshot.

## Open questions / follow-ups

- The Hangar, Mission Center and the other buildings keep their own page tops inside the safe area until their v2 designs (BASE_LAYOUT §7).

## Verification output

```
VERIFY
```
