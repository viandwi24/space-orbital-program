# 00 — Sources

All checked on **2026-10-19**:
- **(V)**: read on the page or in the downloaded PDF;
- **(snippet)**: seen only in a search result;
- **(unverified)**: reported, not confirmed.

**Verify any (snippet) number before it goes into an ADR.**

## Internal

- **Code:** `packages/renderer/src` (renderer, presets, quality governor, planet, atmosphere, post), `apps/web/src/lib/flight-loop.ts` and `graphics.ts`, `apps/web/scripts/measure-devices.ts`.
- **ADRs:** 0027, 0053, 0055, 0064, 0070, 0086, 0087, 0157.
- **Journals:** 037, 039, 048, 050, 054, 056, 061, 062, 066, 068, 133.
- **Research:** `docs/research/three.md`, `atmosphere.md`.
- **Release plans:** 201 (shadow flicker, governor bounce) and 232 (release QA performance pass).
- **Measurements of this set:** [02](02-measurements.md), the MacBook Pro M2 13", 2026-10-18/19.
- **Teleoperator teardown:** https://teleoperator.mindblown.ai/, inspected 2026-10-19 in the built-in browser (network requests, the canvas, keyword counts in the public bundle).

## External

| # | Source | Status |
|---|---|---|
| S1 | Hillaire, "A Scalable and Production Ready Sky and Atmosphere Rendering Technique", EGSR 2020 — https://sebh.github.io/publications/egsr2020.pdf | V |
| S2 | Hillaire, SIGGRAPH 2020 Physically Based Shading course slides — https://blog.selfshadow.com/publications/s2020-shading-course/hillaire/s2020_pbs_hillaire_slides.pdf | V |
| S3 | UnrealEngineSkyAtmosphere reference code — https://github.com/sebh/UnrealEngineSkyAtmosphere | V |
| S4 | Bevy atmosphere defaults — https://raw.githubusercontent.com/bevyengine/bevy/main/crates/bevy_pbr/src/atmosphere/mod.rs | V |
| S5 | @takram/three-clouds README (measured fps) — https://cdn.jsdelivr.net/npm/@takram/three-clouds@0.7.4/README.md | V |
| S6 | takram three-geospatial — https://github.com/takram-design-engineering/three-geospatial | V |
| S7 | @takram/three-atmosphere README — https://cdn.jsdelivr.net/npm/@takram/three-atmosphere/README.md | V |
| S8 | Cinevva, "open world browser" part 22, clouds and meshlets — https://app.cinevva.com/blog/2026-05-07-open-world-browser-part-22-clouds-and-meshlets | V |
| S9 | Guerrilla, The real-time volumetric cloudscapes of Horizon Zero Dawn — https://www.guerrilla-games.com/read/the-real-time-volumetric-cloudscapes-of-horizon-zero-dawn | V |
| S10 | Guerrilla, Nubis Evolved — https://www.guerrilla-games.com/read/nubis-evolved | V |
| S11 | gamedev.net HZD cloud thread — https://gamedev.net/forums/topic/680832-horizonzero-dawn-cloud-system/5306076/ | snippet |
| S12 | Unreal forum, volumetric cloud reconstruction modes — https://forums.unrealengine.com/t/volumetriccloud/688516 | snippet |
| S13 | AMD FidelityFX Super Resolution 1 — https://gpuopen.com/fidelityfx-superresolution/ | V |
| S14 | Godot RCAS port — https://godotshaders.com/shader/amd-fsr-cas-contrast-adaptive-shapenening/ | snippet |
| S15 | three.js TAAUNode — https://threejs.org/docs/pages/TAAUNode.html | V |
| S16 | three.js TRAANode — https://threejs.org/docs/pages/TRAANode.html | V |
| S17 | three.js TAARenderPass source — https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/jsm/postprocessing/TAARenderPass.js | V |
| S18 | three.js releases — https://github.com/mrdoob/three.js/releases | V |
| S19 | Utsubo, WebGPU and three.js migration guide (updated 2026-09-24) — https://www.utsubo.com/blog/webgpu-threejs-migration-guide | V |
| S20 | three.js forum, WebGPURenderer slower than WebGLRenderer — https://discourse.threejs.org/t/why-webgpurenderer-performance-significantly-lower-than-webglrenderer/77629 | V |
| S21 | WebKit, features in Safari 26.0 — https://webkit.org/blog/17333/webkit-features-in-safari-26-0/ | V |
| S22 | Firefox 147 notes; macg.co on WebGPU for Apple Silicon — https://www.firefox.com/ia/firefox/notes, https://www.macg.co/logiciels/2026/01/firefox-active-webgpu-pour-les-mac-apple-silicon-les-intel-attendront-306161 | snippet |
| S23 | Chrome WebGPU release — https://developer.chrome.com/blog/webgpu-release | snippet |
| S24 | New in WebGPU 121 (timestamp quantisation) — https://developer.chrome.com/blog/new-in-webgpu-121 | snippet |
| S25 | Web3DSurvey, WebGPU timestamp-query — https://web3dsurvey.com/webgpu/features/timestamp-query | V |
| S26 | Web3DSurvey, EXT_disjoint_timer_query_webgl2 — https://web3dsurvey.com/webgl2/extensions/EXT_disjoint_timer_query_webgl2 | V |
| S27 | WebKit bug 273702 (timestamp support removed) — https://bugs.webkit.org/show_bug.cgi?id=273702 | snippet |
| S28 | Apple WWDC20, Harness Apple GPUs with Metal — https://developer.apple.com/videos/play/wwdc2020/10602/ | V |
| S29 | WebKit bug 215745 (Low Power Mode rAF at 30 fps) — https://bugs.webkit.org/show_bug.cgi?id=215745 | V |
| S30 | WebKit bug 290671 (rAF near 60 fps on ProMotion) — https://bugs.webkit.org/show_bug.cgi?id=290671 | snippet |
| S31 | Apple Silicon Games, Geekbench Metal for M2 / M4 / M5 — https://applesilicongames.com/chip/m2, /m5 (V), /m4 (snippet) | V / snippet |
| S32 | Apple newsroom, M2 (100 GB/s) — https://www.apple.com/newsroom/2022/06/apple-unveils-m2-with-breakthrough-performance-and-capabilities/ | snippet |
| S33 | 9to5Mac, M5 vs M4 (153 GB/s, +30 % graphics) — https://9to5mac.com/2025/10/15/m5-vs-m4/ | V |
| S34 | TechSpot, M5 Pro / Max — https://www.techspot.com/community/topics/apples-m5-pro-and-m5-max-pack-18-cpu-cores-up-to-40-gpu-cores-and-faster-unified-memory.296665/ | snippet |
| S35 | Babylon.js forum, Chrome on Mac slow; WebKit bug 222731 — https://forum.babylonjs.com/t/chrome-mac-extremely-slow/48492, https://bugs.webkit.org/show_bug.cgi?id=222731 | snippet |
| S36 | Apple WWDC20, Optimize Metal performance for Apple Silicon Macs — https://developer.apple.com/videos/play/wwdc2020/10632/ | snippet |
| S37a | Recompiled Games, GTA 5 recompiled — https://recompiledgames.com/gta-5-recompiled/ | V |
| S37b | World Cyber News, article 1442 — https://www.worldcybernews.com/articles/1442 | V |
| S37c | Business Upturn, GTA V in Chrome — https://businessupturn.com/technology/gta-v-is-suddenly-running-inside-chrome-viral-browser-port-shrinks-a-170gb-game-to-around-700mb-but-it-may-not-survive-for-long/ | V |
| S37d | Radiant Optimizer, GTA 5 in browser — https://radiantoptimizergames.com/gta-5-in-browser/ | V |
| S38 | web.dev, Google Earth and WebAssembly — https://web.dev/case-studies/earth-webassembly | snippet |
| S39 | 3D Tiles specification; Cesium forum on screen-space error — https://github.com/CesiumGS/3d-tiles/blob/main/specification | snippet |
| S40 | 80.lv, Generating the universe in Elite Dangerous — https://80.lv/articles/generating-the-universe-in-elite-dangerous/ | V |
| S41 | KSP2 Developer Insights 18, graphics of early access — https://forum.kerbalspaceprogram.com/topic/214806-developer-insights-18-graphics-of-early-access-ksp2 | snippet |
| S42 | SimFlight on Outerra — https://simflight.com/?p=5974 | snippet |
| S43 | Game Developer, floating-point depth buffers — https://www.gamedeveloper.com/programming/floating-point-depth-buffers | snippet |
| S44 | Valve, Scaling Great VR (adaptive quality), Steam Dev Days 2016 — https://cdn.fastly.steamstatic.com/apps/steamdevdays/slides2016/ScalingGreatVR.pdf | V |
| S44b | Frame-pacing explainers — https://evezone.evetech.co.za/build-lab/smooth-30-fps-handhelds-frame-pacing-settings-that | snippet |
| S45 | Chrome, desynchronized canvas — https://developer.chrome.com/blog/desynchronized | snippet |
| S46 | Hilo3d dynamic resolution options — https://hilo3d.js.org/docs/interfaces/Hilo3d.DynamicResolutionOptions.html | snippet |
| S47 | Awwwards, Bruno Simon portfolio case study — https://www.awwwards.com/brunos-portfolio-case-study.html | snippet |
| S48 | KSP2 Developer Insights 12, planet tech — https://forum.kerbalspaceprogram.com/topic/205930-developer-insights-12-%E2%80%93-planet-tech | snippet |

## Open gaps

- Cloud ms breakdowns from Frostbite 2016 and HZD 2015 (the PDF text could not be extracted).
- Whether Safari's WebGPU timestamp queries work today, and whether WebGPU is on by default in Safari 26 on macOS Sequoia/Sonoma.
- Controlled Chrome versus Safari WebGL benchmarks on M-series.
- MacBook Air thermal throttling figures.
- Any verified FSR1 WebGL/WGSL port.
- The M5 numbers of [02](02-measurements.md).
