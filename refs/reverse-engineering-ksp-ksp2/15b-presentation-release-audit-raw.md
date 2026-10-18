# 15b — Presentation, onboarding and release-readiness audit (raw, read-only)

Raw output of a read-only audit (2026-10-18), for sections 6 and 7 of [15-orbital-today-inventory-2.md](15-orbital-today-inventory-2.md).
- Status: I = implemented, P = partial, M = missing.
- Paths are relative to the repo root unless noted. Bare file names in the effects table are under `packages/renderer/src/effects/`, and in the audio notes under `apps/web/src/lib/audio/`.

**Bottom line:** the repo is a static-hosted v1 release candidate (`GAME_VERSION = '1.0.0-rc.1'`, `apps/web/src/lib/public/about.ts:4`) with no TODO or FIXME markers. Compared with a public KSP-grade release, it lacks:
- camera modes other than the free orbit camera, and IVA;
- most sounds: there are 3 continuous layers and 5 one-shots, with no music and no explosion sound;
- crash reporting and analytics;
- PWA and offline support;
- a deploy pipeline;
- tutorials past the first orbit.

## 1a. Flight camera

| Feature | Status | Evidence |
|---|---|---|
| Orbit camera around the active vessel (yaw, pitch, log zoom 2 m – 5 km) | I | `packages/renderer/src/camera-rig.ts:24,31-46`; `renderer.ts:150` |
| Mouse, one-finger orbit and pinch zoom | I | `apps/web/src/lib/flight-loop.ts:496-557` |
| Map view (focus body, system scope, highlight, layers) | I | `renderer.ts:122-145`; key M (`keybindings.ts:96`) |
| Camera follows the EVA suit | I | `flight-loop.ts:110,573-579` |
| Site view, and framing around HUD insets | I | `renderer.ts:155-160`, `116-121` |
| `camera-presets.ts` | dev tooling only | screenshot poses, not modes for the player (`camera-presets.ts:1-5,14-32`) |
| Chase, locked, free or cinematic modes, and a key to switch modes | M | the only camera action is Map (`keybindings.ts:96`); `Renderer` has no mode API (`renderer.ts:109-160`) |
| IVA or cockpit view | M | "IVA" appears only as a crew status chip (`CrewPanel.svelte:75`, `roster-model.ts:71`) |

## 1b. Visual effects (`packages/renderer/src/effects/`)

| Effect | Status | Files |
|---|---|---|
| Plume (throttle and pressure, shock diamonds, multi-nozzle) | I | `plume.ts`, `plume-mesh.ts` |
| Plume light on the ground | I | `ground-glow.ts` |
| Liftoff smoke and dust, separation gas | I | `particles.ts`, `system.ts`, `smoke-noise.ts` |
| Exhaust trail that drifts with the wind | I | `trail.ts`, `trail-ribbon.ts` |
| Re-entry plasma, heat glow | I | `reentry.ts`, `plasma-shape.ts`, `plasma-mesh.ts`, `glow.ts`, `look.ts` |
| Explosion (fireball, flash, mesh shards) | I | `explosion.ts`, `shards.ts` |
| Wreckage that stays on the ground | I | `wreckage.ts`, `wreck-field.ts` |
| Water ripples and splashes | I | `waterline.ts` |
| Pad steam | I | `packages/renderer/src/site-steam.ts` |
| Touchdown dust, RCS puffs, parachute visuals | M | — |

## 1c. Audio (`apps/web/src/lib/audio/`, plan 053, ADR 0062: synthesised with Web Audio, no files)

**Continuous layers** (updated every 50 ms by `director.ts:21,39-60`):
- Engine roar: noise through a lowpass 250–2850 Hz, gain = throttle × √pressure (`params.ts:80-81`, `engine.ts:137-142`). ADR 0062 says `throttle*(0.25+0.75*p)`, so code and ADR disagree.
- Rumble at 38–70 Hz, also in vacuum (`engine.ts:144-158`).
- Wind above 30 m/s (`engine.ts:160-168`).

**One-shots:**
- `click` on any button or link (`+layout.svelte:52-60`);
- `sasOn` and `sasOff` (`flight-loop.ts:564`);
- `stage` (`flight-loop.ts:802`);
- `warning`: when heat is at least 0.8, on flameout and on damage (`params.ts:90-96`, `director.ts:54-57`, `flight-loop.ts:823`).

**Mixing and settings:**
- Master, effects and UI buses feed a compressor. Audio starts after the first gesture, suspends while the tab is hidden, and recovers after a Safari interruption (`engine.ts:118-125,184-215`).
- The settings Audio tab has volume and mute controls, and the global key N mutes.

**Missing:**
- music (none by ADR 0062);
- explosion or crash sound;
- sounds for decoupling, parachutes, landing, docking, RCS and EVA, and ambience;
- UI cues for map and warp;
- spatial and doppler audio.

## 1d. Tutorials, help and first run

| Item | Status | Evidence |
|---|---|---|
| First-flight guide, 9 steps (build, launch, throttle, stage, climb, turn, apoapsis, map, circularise) | I | `apps/web/src/lib/onboarding/tutorial.ts:1-5,72-150` |
| Guide card in the VAB and in flight, with skip | I | `routes/vab/+page.svelte:26,84`; `routes/flight/+page.svelte:655-659,770`; `TutorialCard.svelte:17,27` |
| Steps show the player's own keys and touch wording | I | `tutorial.ts:41-58` |
| Reset the guide in settings | I | `SettingsDialog.svelte:90-95,198-200` |
| Help overlay (F1 or ?) listing the controls | I | `HelpOverlay.svelte`; `flight/+page.svelte:517,827,1037` |
| Tooltips | P | native `title=` only (147 uses), plus key hints on `IconButton` (`IconButton.svelte:7,13`); no tooltip component |
| Tutorials past the first orbit (docking, landing, maneuver nodes, science, EVA, planes) | M | — |
| Manual or knowledge base | M | — |

## 1e. Achievements and milestones (plan 102, ADR 0147)

**Implemented:**
- milestones in the sim (`packages/core/src/milestones.ts:1-3,79`);
- 7 stock achievements (`mods/stock/src/achievements.ts:9-45`);
- an unlock tracker that never loses a flight (`achievements/tracker.ts:14-42`, wired in `flight-loop.ts:12,255-256,782`);
- a profile stored in IndexedDB (`achievements/store.ts:19-47`);
- the `AchievementsPanel` on Worlds, and toasts.

**Partial:** only 7 achievements, and no platform integration.

## 2. Release readiness

| Area | Status | Evidence |
|---|---|---|
| Adapter | I, static | `apps/web/vite.config.ts:2,15` (adapter-static, fallback `200.html`); `routes/+layout.ts:7` prerenders; ADR 0006 |
| Reference server | I, reference only | `apps/web/scripts/serve.ts:1-82`: CSP per page with inline-script hashes, gzip, immutable cache, SPA fallback |
| CSP and headers | P | `apps/web/src/lib/hosting-headers.ts:33-59`. No host config file (`_headers`, `netlify.toml`, `vercel.json`), so a host must compute the hashes (`docs/architecture/hosting.md:21`). No HSTS or COEP |
| Graphics presets | I | low, medium, high, with an automatic choice (`packages/renderer/src/presets.ts:5-6,69,182-197`; `apps/web/src/lib/graphics.ts:16-114`). No ultra preset |
| Quality governor | I | aims for 55 fps (`packages/renderer/src/quality-governor.ts`) |
| Browser support | I | WebGL2, Worker and WASM gate (`apps/web/src/lib/browser-support.ts:20-58`, `+layout.svelte:28-31,83-87`). ADR 0040: Chrome/Edge 97+, Firefox 114+, Safari 16+; ADR 0063 covers tablets; `SmallScreenNotice.svelte` |
| Error handling | P | `+error.svelte`, `<svelte:boundary>` (`+layout.svelte:89-98`), worker crash card (`sim-client.ts:149`, `flight/+page.svelte:719`). No `window.onerror` or `unhandledrejection` handler, and no `hooks.client.ts` |
| Crash reporting, analytics, telemetry | M | none (`hosting.md:3`: the game makes no requests of its own) |
| Save versioning and migration | I | `SIM_SAVE_VERSION = 8` with migration steps 1→8 (`packages/core/src/save.ts:31,341-420,441-491`). Envelope `GAME_SAVE_VERSION = 2` (`game-save.ts:17,148,203`); `WORLD_VERSION = 1`; Legacy world migration; autosave every 120 s, after events and on hide; mod mismatch report |
| Public pages | I | `/credits` (Apache-2.0, OFL) and `/roadmap` (about 45 items), plus the main menu. No About, privacy or licence page |
| Metadata | I | `PageMeta.svelte`, social preview, favicons, `robots.txt`, theme colour |
| PWA and offline | M | no manifest, no service worker. A 7.2 MB ephemeris file in `static/ephemeris/` is not cached |
| Package scripts | P | no deploy script; domain and CDN undecided (`hosting.md:56-58`) |
| CI | P | `.github/workflows/ci.yml`: the e2e smoke runs on Chromium only and does not block. No deploy or release job |
| E2E | I | 19 specs; 85 e2e pass on 3 engines locally (STATUS) |
| Release plan | done, human step pending | plan 023 done; the manual human test is still to do (STATUS "Next plan") |

**Markers:**
- No TODO, FIXME, XXX or HACK, and no "coming soon" text in `apps/web/src`.
- The 127 `disabled` uses are state-dependent, not stubs.
- Deferred work lives in `lib/public/roadmap.ts:43-365`. The roadmap does not mention camera modes, IVA, music or more tutorials.

## Main gaps

1. Camera modes and IVA
2. Audio breadth, and music
3. Tutorials past the first orbit, a tooltip system and a manual
4. Operations: a global error handler, opt-in crash reporting, PWA/offline, a host config file, a deploy job, and blocking e2e in more than one engine
5. An ultra graphics preset
6. More achievements
