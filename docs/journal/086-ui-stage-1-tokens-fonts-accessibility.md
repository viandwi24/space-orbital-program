# 086 — UI stage 1: refs tokens, Manrope and the accessibility floor

**Plan:** [plans/086-ui-stage-1-tokens-fonts-accessibility.md](../plans/086-ui-stage-1-tokens-fonts-accessibility.md) · **Session:** Agent 2 (Dev B, MacBook Pro M2 13"), 2026-10-17 · **ADRs:** [0140](../decisions/0140-refs-tokens-glass-contrast-ui-scale-and-legacy-names.md) (new), [0107](../decisions/0107-ui-adopts-the-refs-visual-language-in-stages.md), [0109](../decisions/0109-control-needs-a-command-source-like-ksp-career-crew-preset-and-10px-text.md), [0026](../decisions/0026-design-system-and-hud-architecture.md) · **Research:** `stack-versions.md` (`@fontsource/manrope`), `web-client.md` (fonts)

**Status when written: criteria met except the M5 blur measurement**, which is Agent 1's at merge (method below).

## What was done

| Where | What |
|---|---|
| `apps/web/package.json`, `routes/+layout.svelte` | `bun add --exact @fontsource/manrope@5.3.0` (weights 300 to 700, Latin subset, 70,696 bytes of woff2); `bun remove @fontsource/barlow-semi-condensed`; IBM Plex Mono kept for code and version numbers |
| `lib/ui/tokens.css` | the refs tokens (`refs/space-orbital-program-ui/tokens/tokens.css`) without the `--sop-` prefix, sizes in rem, a type scale with a 10 px floor, `--accent-text`, `--on-accent`, `--surface-chip`/`--surface-track`/`--accent-mixed` for the literals the refs components used; the ADR 0026 names as aliases; `data-glass='solid'` and `data-contrast='more'` override blocks |
| `lib/ui/tokens.test.ts` | every ADR 0107 point 1 token exists; refs values kept; every `--t-*` is rem and at least 10 px; size tokens are rem; contrast over a white backdrop through the dimmed glass, on solid and dialog (4.5:1 body, 3:1 subtle and offline), fills, high contrast, solid fallback; the old legacy and syntax pairs; reduced motion (82 tests) |
| `lib/ui/base.css` | `html { font-size: calc(var(--ui-scale, 1) * 100%) }`; the text size moved from `html, body` to `body` |
| `lib/ui/*.svelte` | new `Capsule`, `Switch` (on, off, mixed), `Chip`, `StatCell` (`[—]` for an unknown value), `ListRow`, `SignalBars`, `BackButton`; `Panel`, `Button`, `Segmented`, `Dialog`, `Meter` restyled to the refs with the same props |
| `lib/ui/components.test.ts` | server-side render tests of the new components (13 tests) |
| `lib/settings/settings.ts`, `settings.svelte.ts` | settings format 3: `interface: { scale, highContrast }`, scale one of 0.8, 0.9, 1, 1.1, 1.25, 1.5 (off-range values reset, others snap); format 2 and 1 migrate |
| `lib/ui/root-theme.ts` | `applyInterface` (`--ui-scale`, `data-contrast`) and `setGlassFallback` (`data-glass`) on the document root |
| `lib/ui/SettingsDialog.svelte` | an Interface tab: size as a segmented control, high contrast as the new `Switch` |
| `lib/flight-loop.ts` | `syncGlass()`: solid glass whenever the renderer's preset is `low` (the player's choice or the governor's lowest rungs), cleared on dispose; dev hook `__orbital.glass(mode)` and `__orbital.frameIntervals(n)` for the blur measurement |
| `lib/hud/navball-draw.ts`, `lib/public/credits.ts` | the navball labels and the credits name Manrope instead of Barlow |
| `e2e/ui-scale.e2e.ts` | at 1024 x 768 and UI scale 150 %, every flight HUD region and panel (`.ui > div`, `.ui > div > *`) is inside the viewport; the solid fallback on `low` |

## What surprised me

- **The rem was 15 px.** `base.css` set `font-size: var(--t-md)` on `html, body`; on the root that makes 1 rem = 15 px, so every `rem` token was 6.7 % smaller than written and a `0.625rem` "10 px" label would have been 9.4 px. The text size now sits on `body` only, so 1 rem is 16 px (the browser default) and all type grows by that 6.7 %.
- **The refs glass cannot carry grey text over a bright scene.** `rgba(22,23,26,0.6)` over white composites to grey 115: muted `#A1A1AA` reaches 1.9:1, and only pure white passes 4.5:1. Raising the alpha until muted text passes needs 0.85. A backdrop `brightness(0.4)` inside the glass filter keeps the refs alpha and still gives 4.67:1 over white (ADR 0140 point 1). Over black space it changes nothing.
- **The accent is not a text colour.** `#3E6AE1` is 2.5:1 on the glass; the old `--c-accent` was used as text in about 90 places, so the alias points at `--accent-text` (`#8FA9F0`, 5.2:1) and the accent itself is only a fill (white on it 4.8:1).
- **`--ball-*` looked unused** (no `var()` use) but `navball-draw.ts` reads them through `getComputedStyle`; they stay.
- **The `switch` role has no mixed state** (ARIA 1.2: `aria-checked="mixed"` on a switch is read as false). A mixed `Switch` renders `role="checkbox" aria-checked="mixed"`, which assistive tech reads as a partly checked control; the two-state switch keeps `role="switch"`.
- `svelte/server` trims the leading space in `<span> {unit}</span>`; the unit is written as `{' '}<span>…`.
- The Playwright 1.64.1 Chromium (revision 1248) was not installed on the M2; installed with the owner's go-ahead.

## Decisions made

- [ADR 0140](../decisions/0140-refs-tokens-glass-contrast-ui-scale-and-legacy-names.md): glass with backdrop dimming and `--accent-text`; UI scale is the root font size (rem tokens, no CSS `zoom`); new semantic names with the ADR 0026 names as aliases; IBM Plex Mono kept as `--font-mono` (ADR 0107 left JetBrains Mono or Plex to this plan); high contrast and the solid fallback as root attributes.

## Blur measurement (M5, Agent 1 at merge)

Not measured here: Agent 2 owns no frame-budget numbers except plan 066's M2 row. Method for the M5, journal 054 setup (production build with `NODE_ENV=development`, `apps/web/scripts/serve.ts`, the fronted pane alone, 1920 x 1080, governor off, second page load), in the flight view on the pad with the HUD showing, for `high` and for `medium`:

```js
__orbital.glass('blur');  const blur  = await __orbital.frameIntervals(600);
__orbital.glass('solid'); const solid = await __orbital.frameIntervals(600);
__orbital.glass(null);    // back to the preset's choice
```

`frameIntervals` samples whole-page rAF intervals (the compositor's blur included; `renderer.benchmark` measures WebGL only), so the difference shows only when a frame misses vsync: if both read the display interval, take the GPU process time from a Chrome performance trace instead. The fallback itself is verified: on `low` the root carries `data-glass="solid"` and panels draw `--surface-solid` with no backdrop filter (e2e below).

## Open questions / follow-ups

- Most HUD and screen widgets still size themselves with `px` literals, so at 150 % their text grows and their boxes do not. Stages 2 to 5 (088, 089, 093 and the screens of 087, 091, 113) replace the literals with rem tokens and move each screen to the new names; ADR 0140 point 3 says an alias goes with its last use.
- Literal `backdrop-filter: blur(10px)` remains in `MenuButton`, `Toasts` and four VAB components; they keep their blur on `low` until their stage restyles them.
- The UI scale applies when `settings.start()` runs (layout `onMount`), so the first paint of a page is at 100 %; an inline script in `app.html` could apply it before paint if the flash shows.

## Verification output

See the plan's Log.
