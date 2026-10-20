# 06 — Plan and cost

## Units

Hours are **agent hours**, from the roadmap's planning sizes (S ≈ 0.75 h, M ≈ 1.25 h, L ≈ 2.25 h, XL ≈ 4 h) plus about 0.3 h of Lead merge per plan.

Graphics work carries two extra costs: look development (screenshot comparisons) and measurement on the M5. The ranges below include them. Like the roadmap's numbers, they are planning numbers, not promises.

Human time is listed separately: the owner signing off the look, and Agent 1 or the owner measuring on the M5.

## Phases

| Phase | Content | Size | Agent hours | Human | Expected effect *(inferred unless measured)* |
|---|---|---|---|---|---|
| **0. Measure** | `measure-devices.ts` options (viewport, scale factor, pixel ratio); feature switches for ablation; a frame-time histogram (p50/p95/p99, % > 16.7 ms) in Debug | M | **1.5–2** | M5 baseline run, 0.5–1 h | Numbers that judge every later phase; splits `high`'s 4× over `medium` |
| **1. Quick wins** | (a) planet pixel budget, Retina starts on the budgeted rung: M. (b) `high` cloud shadows from the baked map: S. (c) MSAA 2 / non-MSAA ping-pong / no canvas MSAA at ratio ≥ 2: S. (d) 2048 shadows at Retina, PMREM recapture spread: S + S. (e) governor rules: pixel-ratio aware, Valve-style, locked 60/30, no timer retries, with plan 201: M | 2 × M + 4 × S | **6–8** | look check 0.5 h; M5 run 0.5 h | Retina `high` from about 3.6× to about 1.2–1.5× its 1080p cost: about **14–20 ms on the M5**. The half planet pass alone measured −65 % at ratio 2 on the M2. No retry stutter |
| **2. Sky LUTs (Hillaire)** | Multi-scattering, sky-view and aerial-perspective LUTs; the planet pass reads them; direct march kept from space; an ADR superseding ADR 0027's "no LUTs" | L + M + S | **4.5–6.5** | look sign-off 0.5 h | The 12-sample march leaves most pixels; sky cost nearly independent of resolution (paper: 0.14–0.31 ms on a GTX 1080) |
| **3. Noise texture** | A tiling 3D noise texture replacing hashed value noise in clouds, cirrus and cloud shadow (ground octaves if the look holds) | M–L | **2–3** | look sign-off 0.25 h | Fewer ALU operations per cloud pixel (8 hashes become 1 fetch per noise); cloud stage cheaper by an unmeasured factor |
| **4. Temporal clouds** | History buffer, frame-indexed jitter, camera reprojection; cumulus at 1/4–1/16 pixels; fallback on cuts, warp and fast motion; fade from orbit | XL × 1.5–2.5 | **6–10** | look sign-off 0.5 h (launch, warp, map) | Cloud cost ÷3 or more (takram: 31 → 92 fps at 4K on an M3 Max) |
| **5. Polish** | FSR1-style EASU + RCAS upsample (M); reversed-Z instead of log depth (M, after an `EXT_clip_control` check); terrain refine steps by footprint (S–M) | 2 × M + S–M | **4–5** | look check 0.25 h | Sharper budgeted planet pass; early-Z and HSR back for meshes; fewer distant terrain steps |
| **6. Ultra preset** | Spend the saved budget: more cloud steps and detail, shafts, 4096 shadows where cheap; re-tune `selectPreset` per device and pixel ratio; docs | M–L | **1.5–2.5** | look sign-off 0.5 h; M5 + M2 runs 1 h | An "ultra" that holds 60 fps on the M5 at Retina (the target of this research) |
| 7. WebGPU (after release) | Spike: sky LUTs in TSL on WebGPURenderer behind a flag (L–XL, 4–6 h). Full move: 40–80 h ([05](05-webgpu.md)) | | **4–6** spike, **40–80** full | | Compute and GPU timers; decided from the spike's numbers |

## Totals

| Scope | Agent hours | Wall-clock *(inferred)* | Human |
|---|---|---|---|
| Phases 0–1 (fixes "`high` feels heavy") | **≈ 8–10 h** | ≈ 6–8 h; mostly serial, the same renderer files | ≈ 1.5–2 h |
| Phases 0–3 | ≈ 14–19 h | ≈ 10–14 h | ≈ 2.5 h |
| Phases 0–6 (resolution-independent sky and clouds, an "ultra" preset) | **≈ 26–37 h** | **≈ 18–26 h**. Parallelism is limited: phases 2, 3 and 4 all edit `planet.glsl.ts` and `atmosphere.glsl.ts`. Only phase 0 tooling and phase 1(e) can run beside the shader work | ≈ 4–5 h |
| + WebGPU full move | + 40–80 h | + 25–50 h | + 3–5 h |

By the roadmap's assumption Agent 2 runs about 10 % slower than the M5 (thermal); the ranges above already lean high for that.

## Order and where it fits

1. **Phase 0 + 1 belong in the release.** They are small, they change no look on purpose, and they answer the playability problem directly. Phase 1(e) overlaps release plan 201 (shadow flicker and the governor bounce): fold it into 201, or make 201 a dependency.
2. **Phases 2–4 decide whether `high` can become "ultra".** They need ADRs (sky LUTs supersede part of ADR 0027; a history buffer changes ADR 0064's half rung). They can go in after the release, or before it if the owner ranks them P0.
3. **Phase 5** is independent polish.
4. **Phase 6** comes last, because it spends what 1–5 saved.
5. **Phase 7** is a separate decision after the release.

The roadmap gives draft numbers by lane (team roadmap §3.7: Agent 2 drafts 160–189). Agent 1 would place the plans; this research does not create them.

## Acceptance numbers to aim for (proposal)

On the MacBook Pro M5 built-in display at its default resolution, production build, plugged in, governor on:

| Measure | After phase 1 | After phase 6 |
|---|---|---|
| `high` p95 frame interval at pad, 3 km, 12 km, orbit | ≤ 16.7 ms | ≤ 16.7 ms, with "ultra" settings |
| Frames over 33.3 ms in a 2-minute free flight | < 1 % | < 0.5 % |
| Governor preset or rung changes | ≤ 1 per 30 s (plan 201) | same |
| Look | Screenshot set (pad, sunset, 12 km, orbit, Space Center) with no visible regression, owner sign-off | owner sign-off of the "ultra" look |

The same table on the M2 at Retina with `medium` (target: a locked 30 fps, p95 ≤ 33.3 ms) shows the floor.

## Risks

| Risk | Where | Mitigation |
|---|---|---|
| Look drift: horizon banding, tiled noise, temporal ghosting on launches and warp | Phases 2–4 | Screenshot sets per phase; temporal fallback on cuts; owner sign-off |
| Measurement noise | Seen on the M2 ([02](02-measurements.md) caveats) | Quiet machine, journal 054 method, ratios within one run, M5 as the reference |
| Safari differences: no GPU timer, 60 Hz rAF, ANGLE path | Phases 1, 5 | Frame-interval governor; test Safari each phase |
| `EXT_clip_control` missing on a target | Phase 5 reversed-Z | Keep log depth as the fallback |
| Overlap with plan 201 | Phase 1(e) | One owner for the governor |
| Scope creep into WebGPU | Phase 7 | Spike first, decide from numbers |
