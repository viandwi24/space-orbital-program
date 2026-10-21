# 291 — Part detail kit, liveries and honest catalogue icons

**Plan:** [plans/291-part-detail-kit-livery-and-icons.md](../plans/291-part-detail-kit-livery-and-icons.md) · **Session:** part visuals session (Claude), 2026-10-21, on `main` at b767aeb0

## What was done

| Where | What |
|---|---|
| `packages/renderer/src/parts/generators/kit.ts` | The detail kit (ADR 0257): `rim`, `band`, `raisedRing`, `boltCircle`, `stubPipe`, `bellProfiles` and `ribbedBell` (a hollow bell with raised rings, any direction), `hazardStripe`, `panelInset`, `louvres`, `cellGrid`, `hinge`; liveries `LIVERIES`, `liveryOf`, `barrelSlot`, `keepsStripe`, `paintLivery` |
| `builder.ts`, `materials.ts` | Slots `bronze` (RCS and vacuum bells to come), `foam` (an external tank), `tile` (shuttle heat tiles) |
| `generators/tank.ts`, `booster.ts` | `visual.params.livery`: barrel slot and overlays; without a livery the look is as before |
| `generators/decoupler.ts` | The groove's accent band is now a hazard band of yellow and black blocks |
| `mods/stock/src/parts/engines.ts` | The solid motors (`booster`, `srb-small`, `srb-large`) wear `bands` |
| `packages/renderer/src/vab/icons.ts`, `view.ts` | `visibleBounds` (meshes on a visible path) for the part icon and the vessel thumbnail; `ICON_VIEW_DIR` lowered from about 22° to about 15° above the side; neutral icon light (the blue hemisphere and rim light made every top joint a pale blue disc); a sample bar in the strut and fuel-line icons |
| `packages/renderer/test/parts-kit.test.ts` | 9 tests: kit bounds, bell winding and hollowness, hazard slots, liveries, foam and steel tanks, `visibleBounds`, icon fill of the RCS and parachute parts |

## What surprised me

- **Why small parts were dots.** `Box3.setFromObject` counts hidden meshes. Measured on the stock factory:

  | Part | Old box | Visible box |
  |---|---|---|
  | `rcs-block` | 0.34 × 2.28 × 2.28 m (its four hidden `plume-rcs` meshes) | 0.16 × 0.30 × 0.30 m |
  | `parachute` | 2.00 × 1.16 × 2.00 m (the packed `canopy`) | 0.63 × 0.32 × 0.63 m |

- **The blue discs were light, not paint.** The icon scene lit the parts with a blue sky hemisphere light and a blue rim light, so every upward metal face came out pale blue. Neutral light fixes it.
- **Lint and another session's file.** `bun run lint` fails on `.claude/launch.json`, which another session changed and has not committed. I did not touch it, and checked prettier on everything else.

## Decisions made

None new: ADR 0257 covers the kit and the liveries. Primitives that no part needs yet (hatch, foil panel, lamp) wait for the family plans that use them, so they are designed against a real part.

## Open questions / follow-ups

- Liveries on fairings and nose cones: plans 275 and 276.
- OrbitX titles: each family plan renames its parts (ADR 0255).
- Frame cost measured in a browser: not done (owner: no long runs). The triangle numbers below stand in for it.

## Verification output

Triangles per part, before (HEAD b767aeb0) and after:

| Part | high before → after | low before → after |
|---|---|---|
| `decoupler` | 1,024 → 1,020 | 320 → 348 |
| `decoupler-wide` | 1,024 → 1,080 | 320 → 408 |
| `booster`, `srb-small`, `srb-large` | 2,768 → 2,832 (+2.3 %) | 1,024 → 1,056 |
| `tank-small` (no livery) | 1,344 → 1,344 | 480 → 480 |

Icons: before in `refs/part-visuals-and-blueprints/img/icons/`, after in `icons-after/` (rendered through `VabView.renderIcon` from the dev server).

```
packages/renderer: parts-kit, parts, part-seams, shrouds, vab, parachute, vab-instancing
 62 pass, 0 fail
mods/stock + renderer parts/seams: 173 pass, 0 fail
```

Full checks, on the M5, under the shared heavy-job lock:

```
bun run lint      prettier clean except .claude/launch.json (another session's uncommitted file); web lint clean
bun run typecheck no errors
bun run test      2103 pass, 0 fail
apps/web: CI=true bun run test
                  Test Files 1 failed | 191 passed (192); Tests 2 failed | 1372 passed (1374)
```

The two failures are `src/lib/sim-host-script-worker.test.ts`: "runs a script end to end in another thread" times out at 5 s, and "a QuickJS builtin that ignores the interrupt budget…" fails its assertion. They are not caused by this plan: the same file fails the same two tests in a clean worktree of HEAD b767aeb0, without these changes. Reported in STATUS.md (Known issues).

