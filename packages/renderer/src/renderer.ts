/**
 * The browser-facing facade: a `WebGLRenderer` (logarithmic depth buffer, ADR 0007) driving a
 * `SceneModel`, the post chain and image-based light (ADR 0027). Needs a canvas, so it is
 * exercised by the manual runs in the journals, not by Bun tests. `?renderer=webgpu` hands the
 * same facade to three's `WebGPURenderer` instead (`renderer-webgpu.ts`, plan 261, ADR 0249).
 */
import type { SiteBuildingView } from './site-list.ts';
import type { EntityId, RegionWorld, Snapshot } from '@orbital/core';
import type { RegionBody } from './region-overlay.ts';
import type { WorldTerrainSpec } from './terrain-zones.ts';
import {
	ACESFilmicToneMapping,
	HalfFloatType,
	Mesh,
	PCFShadowMap,
	Scene,
	WebGLRenderTarget,
	WebGLRenderer,
	type ShaderMaterial
} from 'three';
import { rendererBackendFrom, type RendererBackend } from './backend.ts';
import { EnvironmentLight } from './environment-light.ts';
import { PostChain } from './post.ts';
import { MIN_RENDER_SCALE, debugFacade, sceneFacade, withShared } from './renderer-facade.ts';
import { createWebGPURenderer } from './renderer-webgpu.ts';
import { PrecompileTracker, type PrecompileProgress } from './precompile-progress.ts';
import { FEATURE_NAMES, FeatureSwitches, type FeatureName } from './feature-switches.ts';
import {
	GRAPHICS_PRESETS,
	PRESETS,
	canvasAntialias,
	type GraphicsPreset,
	type PresetSettings
} from './presets.ts';
import type { ScreenPoint } from './project.ts';
import { SceneModel, type MapPathSegment, type MapScope, type SceneConfig } from './scene.ts';
import type { Vec3 } from '@orbital/core';
import type { CameraMode } from './camera-modes.ts';

/** Steps `LaunchSite.warmVegetation` takes for the three presets' sets (measured), for the progress bar only. */
const VEGETATION_STEPS = 34;
/** Time one idle period spends on vegetation steps before it hands the thread back: at least, at most, ms. */
const VEGETATION_SLICE_MS = 6;
const VEGETATION_SLICE_MAX_MS = 12;

export { MIN_RENDER_SCALE } from './renderer-facade.ts';
export type { RendererBackend } from './backend.ts';

export interface RendererConfig extends SceneConfig {
	canvas: HTMLCanvasElement;
	/** Defaults to `window.devicePixelRatio`, capped by the preset. */
	pixelRatio?: number;
	/** Defaults to what the page's `?renderer=` asks for (plan 261), else WebGL. */
	backend?: RendererBackend;
}

/** Dev/screenshot tooling (plan 019): deterministic sun and camera, frame timing. Never used by gameplay. */
export interface RendererDebug {
	/** Fix the sun at `elevation`/`azimuth` degrees at the launch site, or `null` for the real sun. */
	setSun(value: { elevation: number; azimuth: number } | null): void;
	setCamera(rig: { yaw: number; pitch: number; distance: number }): void;
	/** Apply a named `ENVIRONMENT_PRESETS` entry (sun and camera); false when the name is unknown. */
	applyPreset(name: string): boolean;
	/** Force the device pixel ratio (frame-time measurements at exactly 1920x1080), or `null` for the default. */
	setPixelRatio(ratio: number | null): void;
	/** Force the skin temperature of every part (K) for glow screenshots, or `null` for the snapshot values. */
	setPartTemperature(kelvin: number | null): void;
	/** Aim the flight camera at the n-th part with this definition id (`null` = the root part). */
	focusPart(definition: string | null, occurrence?: number): void;
	/** Advance particles, explosions and animations by `seconds` in 1/60 s steps without drawing. */
	stepEffects(seconds: number): void;
	/**
	 * The world's home terrain (plan 084, ADR 0142): its seed and the flat zones of its sites. The bakes,
	 * the biome map and the camera's ground follow; usually given once as `RendererConfig.terrain`.
	 */
	setTerrain(terrain: WorldTerrainSpec): void;
	/** Height of the home terrain (m above the sphere) at a body-fixed unit direction, as the camera reads it (parity checks). */
	terrainHeightAt(direction: Vec3): number;
	/** Baked terrain patch read back from the GPU as heights in metres (plan 031's parity check); null before the first bake. */
	/**
	 * Plan 068: `rebake` bakes the cube and both patches every frame (benchmark it against off for the
	 * bake cost); `gradient` picks the bake program (`analytic`, the old `fd`, or `none`). Development only.
	 */
	bakeMode(rebake: boolean, gradient: 'analytic' | 'fd' | 'none'): void;
	/** Plan 133: the planet pass's silhouette coverage on or off (before/after screenshots). */
	silhouetteAA(on: boolean): void;
	readPatch(which: 'fine' | 'mid'): {
		frame: { centre: Vec3; east: Vec3; north: Vec3; halfTan: number };
		size: number;
		heights: Float32Array;
	} | null;
	/** Set the regolith colour of the moons (linear RGB), for look development. */
	setMoonTint(r: number, g: number, b: number): void;
	/** Terrain shadows and instanced stones on the moons on or off (ADR 0068), for A/B measurements and screenshots. */
	setMoonDetail(shadows: boolean, stones: boolean): void;
	/** Baked height patch of a moon read back from the GPU in metres (ADR 0054's parity check); null before the first bake. */
	readMoonPatch(
		body: string,
		which: 'fine' | 'mid'
	): {
		frame: { centre: Vec3; east: Vec3; north: Vec3; halfTan: number };
		size: number;
		heights: Float32Array;
	} | null;
	/** Where the site's deep-space dishes point (plan 234), radians, azimuth from north. */
	dishAims(): Array<{ azimuth: number; elevation: number }>;
	/** The scene graph, for inspection in the browser console. */
	readonly scene: Scene;
	/**
	 * Measurement switches (plan 251): `setFeature` takes one `high` extra down to what `medium` draws
	 * (or off) on the preset drawn now, so its cost is the difference of two benchmarks; `on` is false
	 * to put the preset's own values back. `features()` lists the switches that are on; `resetFeatures()`
	 * puts every preset's table back. Never used by gameplay.
	 */
	setFeature(name: FeatureName, on: boolean): void;
	features(): FeatureName[];
	resetFeatures(): void;
	readonly featureNames: readonly FeatureName[];
	/**
	 * Renders `frames` frames back to back and waits for the GPU; returns milliseconds per frame. On
	 * WebGPU it cannot wait inside a call: the time is the CPU's, use `benchmarkAsync`.
	 */
	benchmark(frames: number): number;
	/** `benchmark` on every backend: the GPU timestamps where WebGPU has them, else the time to the GPU queue or a pixel read. */
	benchmarkAsync(frames: number): Promise<number>;
	/**
	 * The backend and the last frame's draw counters without `info()`'s GPU name, whose WebGL query
	 * stalls the pipeline (tens of ms): cheap enough for the performance overlay (plan 294).
	 */
	counters(): { renderer: RendererBackend; drawCalls: number; triangles: number };
	info(): {
		/** The renderer drawing (plan 261). */
		renderer: RendererBackend;
		/** GPU time of the last measured frame from timestamp queries, ms; null where the browser has none. */
		gpuMs: number | null;
		/** Materials the WebGPU renderer cannot draw yet and hides (plan 261); empty on WebGL. */
		unported: string[];
		/** Materials it draws without their `onBeforeCompile` patch; empty on WebGL. */
		patched: string[];
		preset: GraphicsPreset;
		altitude: number;
		sunElevationDeg: number;
		exposure: number;
		drawCalls: number;
		triangles: number;
		pixelRatio: number;
		size: [number, number];
		gpu: string;
	};
}

export interface Renderer {
	/** Apply a new snapshot (call whenever the sim delivers one, not necessarily every frame). */
	update(snapshot: Snapshot): void;
	/** Draw the current scene; call from `requestAnimationFrame`. */
	render(): void;
	resize(width: number, height: number): void;
	/**
	 * Pixels of the canvas that interface panels cover on each side (plan 023). The flight camera keeps
	 * looking at the vessel but draws it in the middle of what is left, so a panel at the bottom no
	 * longer hides the lower half of the rocket. Not applied in map view's projection maths: `project`
	 * reads the same camera, so markers stay on their points.
	 */
	setViewInsets(
		insets: { top: number; right: number; bottom: number; left: number },
		options?: { animate?: boolean }
	): void;
	setMapView(on: boolean): void;
	/**
	 * The predicted path of the active vessel across spheres of influence, drawn in map view (plan 044):
	 * one stretch per body, `null` clears it.
	 */
	setMapPath(segments: readonly MapPathSegment[] | null): void;
	/** Map view: look at this body, `null` for the body of the active vessel's sphere. */
	setMapFocus(body: string | null): void;
	readonly mapFocus: string | null;
	/** Map view scope (plan 113, ADR 0118): `system` looks at the root body and frames the moons' orbits. */
	setMapScope(scope: MapScope): void;
	/** Map view: this vessel or body (`vessel:<id>`, `body:<id>`) in the highlight colour, `null` none. */
	setMapHighlight(key: string | null): void;
	/** Map view layers: `orbits` false hides every orbit line. */
	setMapLayers(layers: {
		orbits: boolean;
		/** Vessels the map filters hide (plan 258). */
		hidden?: ReadonlySet<number>;
		/** The vessel whose orbit is drawn as the target's. */
		target?: number | null;
		/** Wireframe spheres of influence (default off, plan 293). */
		spheres?: boolean;
	}): void;
	/** Map view: tint these bodies by their science regions, `null` none (plan 192). */
	setRegionOverlay(
		bodies: ReadonlyArray<{ id: string; body: RegionBody; world?: RegionWorld }> | null
	): void;
	/** The body under a canvas point and the body-fixed direction of the hit, or `null` (plan 192). */
	bodyDirectionAt(x: number, y: number): { body: string; direction: Vec3 } | null;
	/** Ids of the bodies, root first. */
	readonly bodyIds: readonly string[];
	toggleMapView(): boolean;
	readonly isMapView: boolean;
	setActiveVessel(id: EntityId | null): void;
	/**
	 * Flight camera mode (plan 226, ADR 0226): Auto, Free (horizon up), Orbital (orbit normal up) or
	 * Locked (turns with the vessel). The view direction is kept across a change.
	 */
	setCameraMode(mode: CameraMode): void;
	readonly cameraMode: CameraMode;
	/** What the mode means now (Auto resolves to Free or Orbital); null before the first frame. */
	readonly resolvedCameraMode: Exclude<CameraMode, 'auto'> | null;
	/**
	 * Point the flight camera at one part of the active vessel (plan 226), or of another vessel in
	 * view (plan 310), `null` back to the vessel.
	 */
	focusPart(id: EntityId | null): void;
	readonly focusedPart: EntityId | null;
	/** Draw one frame and return it as a PNG (plan 226): the canvas only, never the HTML interface. */
	capture(): Promise<Blob>;
	/** Rim-light one part of any vessel, or none (plan 111, ADR 0153 point 5). */
	highlightPart(id: EntityId | null): void;
	/** The active vessel's part under a point of the canvas box (CSS px), or null (plan 214). */
	partAt(x: number, y: number): EntityId | null;
	/**
	 * Another vessel's part under a point of the canvas box (CSS px), with its vessel, or null
	 * (plan 310, ADR 0270): the Flight view's vessel menu. The active vessel is skipped.
	 */
	vesselAt(x: number, y: number): { vessel: EntityId; part: EntityId } | null;
	orbitCamera(input: { dYaw?: number; dPitch?: number; zoomFactor?: number }): void;
	/**
	 * Where the camera looks, a unit vector in the sim's inertial axes (plan 225: EVA keys move the
	 * suit relative to the view).
	 */
	viewDirection(): Vec3;
	/**
	 * Screen position of a point in the sim's inertial frame (a body's `position` plus a vessel's
	 * SOI-relative `position`) through the camera as drawn, in CSS pixels of the canvas box; `null`
	 * when behind the camera, `hidden` when a body is in the way (plan 024, ADR 0033).
	 */
	project(world: Vec3): ScreenPoint | null;
	/**
	 * Site view (plan 091, ADR 0117): the orbit camera looks at the site centre instead of a vessel.
	 * With `siteBuildings: true` in the config, the site's buildings come from `setSiteBuildings`.
	 */
	setSiteView(on: boolean): void;
	/** Site view (plan 259): look at a point of the site, or null for its centre; see `Scene.setSiteFocus`. */
	setSiteFocus(
		p: { east: number; north: number; up?: number } | null,
		options?: { distance?: number; animate?: boolean }
	): void;
	setSiteBuildings(
		list: readonly SiteBuildingView[],
		roads: readonly { i: number; j: number }[]
	): void;
	/** The translucent footprint of build mode, or null to hide it. */
	setSiteGhost(
		ghost: {
			size: { w: number; d: number };
			cell: { i: number; j: number };
			rotation: 0 | 90 | 180 | 270;
			valid: boolean;
		} | null
	): void;
	/** The site point (m east and north of the centre) under a CSS pixel, or null. */
	pickSite(x: number, y: number): { east: number; north: number } | null;
	/** CSS pixel of a site point (m east, north, up), or null behind the camera. */
	projectSite(p: { east: number; north: number; up?: number }): ScreenPoint | null;
	/** Switch the graphics preset at runtime (shadows, post chain, sample counts, vegetation). */
	setPreset(preset: GraphicsPreset): void;
	readonly preset: GraphicsPreset;
	/** Drop the bright flashes of explosions and separations (plan 246: prefers-reduced-motion). */
	setReducedMotion(on: boolean): void;
	/**
	 * The view state of a new scene again (plan 340, ADR 0290): map and site views off, the map's
	 * scope, focus, highlight, path, layers and region overlay, the ghost, the part focus, the camera
	 * mode and both rigs. A page that takes the world's shared renderer calls it before it sets its mode.
	 */
	resetView(): void;
	/**
	 * Fraction (0.4 to 1) of the preset's drawing-buffer size the scene renders at; the browser scales
	 * the canvas up. The quality governor's cheap knob (plan 039, ADR 0053): no shader recompile.
	 */
	setRenderScale(scale: number): void;
	readonly renderScale: number;
	/**
	 * `0.5` draws the planet pass (sky, ground, sea, clouds) at half the side of the scene target and
	 * upsamples it with a depth-aware filter, so the vessel and the HUD stay at full resolution; `1` is the
	 * ordinary pass (plan 050, ADR 0061). No shader recompiles. Without float render targets the request is
	 * ignored: `planetScale` reads what was drawn.
	 */
	setPlanetScale(scale: number): void;
	readonly planetScale: number;
	/** Whether this context can draw the half-resolution planet pass (the governor skips the rung when not). */
	readonly halfPlanetAvailable: boolean;
	/**
	 * The GPU's time per frame from timestamp queries, ms, or null where there are none (WebGL; plan 261
	 * Phase 8): the governor's evidence of headroom (ADR 0233).
	 */
	readonly gpuFrameMs: number | null;
	/**
	 * Whether the quality governor may lower the preset (WebGL), or only the resolution (WebGPU, plan
	 * 261: its cost follows the pixels, and a preset change rebuilds shaders for seconds).
	 */
	readonly governorPresetSteps: boolean;
	/**
	 * Compiles the shader programs of this preset's scene and, after the first frame, of every preset's
	 * scene state and its planet and march passes in the background (`compileAsync`), so the first frame
	 * and a later `setPreset` do not stall on the driver's shader compiler, then builds the biome maps and
	 * the instanced vegetation of the other presets one idle period at a time (plans 039 and 048).
	 * Resolves when the work is done; safe to ignore.
	 */
	precompile(onProgress?: (progress: PrecompileProgress) => void): Promise<void>;
	/** WebGL capability facts for `selectPreset`. */
	capabilities(): { gpu?: string; maxTextureSize: number };
	readonly debug: RendererDebug;
	dispose(): void;
}

export function createRenderer(config: RendererConfig): Renderer {
	const backend =
		config.backend ?? rendererBackendFrom(globalThis.location?.search ?? '') ?? 'webgl';
	if (backend !== 'webgl') return createWebGPURenderer(config, backend);
	const gl = new WebGLRenderer({
		canvas: config.canvas,
		// the canvas only receives the post chain's output quad on a dense screen (plan 252, ADR 0234)
		antialias: canvasAntialias(config.pixelRatio ?? globalThis.devicePixelRatio ?? 1),
		logarithmicDepthBuffer: true,
		powerPreference: 'high-performance'
	});
	gl.toneMapping = ACESFilmicToneMapping;
	gl.shadowMap.enabled = true;
	gl.shadowMap.type = PCFShadowMap;
	const model = new SceneModel(config);
	const env = model.environment;
	let preset: GraphicsPreset = config.preset ?? 'high';
	let width = 1;
	let height = 1;
	let pixelRatio = 1;
	let last = performance.now();
	const post = new PostChain(gl, model.scene, model.camera, PRESETS[preset]);
	const envLight = new EnvironmentLight(gl, env);

	let forcedRatio: number | null = null;
	let renderScale = 1;
	/** The preset's pixel ratio before the governor's render scale: what MSAA and the shadow map are sized for (plan 252). */
	const baseRatio = (): number =>
		forcedRatio ??
		Math.min(config.pixelRatio ?? globalThis.devicePixelRatio ?? 1, PRESETS[preset].pixelRatioCap);
	const ratio = (): number => baseRatio() * renderScale;
	const applySize = (): void => {
		pixelRatio = ratio();
		gl.setPixelRatio(pixelRatio);
		gl.setSize(width, height, false);
		model.setPixelRatio(pixelRatio);
		post.setSize(width, height, pixelRatio, baseRatio());
		env.setViewRatio(baseRatio());
		env.planet.setPixelBudget(PRESETS[preset].planetPixels);
		// the planet pass's march prepass matches the pixels of the target the scene is drawn into
		const target = post.active
			? post.targetSize
			: { width: gl.domElement.width, height: gl.domElement.height };
		env.planet.setTargetSize(target.width, target.height);
	};

	/** Resolves once a frame has been drawn with the sky light in place (`precompile` compiles in that state). */
	let frameDrawn: () => void = () => {};
	const firstFrame = new Promise<void>((resolve) => (frameDrawn = resolve));

	function drawFrame(dt: number): void {
		model.prepareFrame(dt);
		env.planet.beginFrame(gl);
		env.planet.bakeTerrain(gl);
		model.bakeMoons(gl);
		env.planet.marchPrepass(gl);
		env.planet.drawHalf(gl, model.camera);
		gl.toneMappingExposure = env.state.exposure;
		// at an airless body the light cube is taken around that body's vertical (ADR 0058)
		const up = env.state.airless
			? env.state.up
			: (env.planet.material.uniforms.uCamUp!.value as Vec3);
		const target = envLight.update(env, up, env.state.sun);
		if (target) {
			model.scene.environment = target.texture;
			env.hemisphere.visible = false;
			frameDrawn();
		}
		if (post.active) post.render(dt);
		else gl.render(model.scene, model.camera);
	}

	/** Resolves in the next idle period with the milliseconds that period has left (0 when it only came by its timeout). */
	const idle = (): Promise<number> =>
		new Promise((resolve) => {
			if (typeof requestIdleCallback === 'function')
				requestIdleCallback((deadline) => resolve(deadline.timeRemaining()), { timeout: 2000 });
			else setTimeout(() => resolve(8), 50);
		});

	/** Programs of the other presets' planet pass, kept alive so three's program cache keeps them. */
	let variants: (ShaderMaterial | Scene)[] = [];
	const tracker = new PrecompileTracker();
	let precompiling: Promise<void> | null = null;
	/** The presets in the order a quality change can reach them: this one, then downward, then upward. */
	const reachOrder = (): GraphicsPreset[] => {
		const at = GRAPHICS_PRESETS.indexOf(preset);
		return [preset, ...GRAPHICS_PRESETS.slice(0, at).reverse(), ...GRAPHICS_PRESETS.slice(at + 1)];
	};
	const precompile = (onProgress?: (p: PrecompileProgress) => void): Promise<void> => {
		if (onProgress) tracker.subscribe(onProgress);
		precompiling ??= (async () => {
			const compileTarget = new WebGLRenderTarget(1, 1, { type: HalfFloatType });
			// One compile: sets the state the program is keyed on (render target, shadow casting), starts
			// `compileAsync` (its program creation is synchronous) and puts the state back in the same turn,
			// so the frames drawn between jobs are not disturbed. three keys a program on tone mapping and
			// colour space, which depend on drawing to a target or to the canvas.
			const compile = (
				scene: Scene,
				toTarget: boolean,
				lights: Scene = model.scene,
				casts?: boolean,
				counted = true
			): Promise<unknown> => {
				const previousTarget = gl.getRenderTarget();
				const sunCasts = env.sunLight.castShadow;
				if (casts !== undefined) env.sunLight.castShadow = casts;
				gl.setRenderTarget(toTarget ? compileTarget : null);
				try {
					if (counted) tracker.expect(1);
					return gl.compileAsync(scene, model.camera, lights).finally(() => {
						if (counted) tracker.finish();
					});
				} finally {
					gl.setRenderTarget(previousTarget);
					env.sunLight.castShadow = sunCasts;
				}
			};
			// first the way it was: the programs of the first frame compile while the page is still loading
			// (not counted until the rest is planned: the badge would stand at 100 % until the first frame)
			const first = compile(model.scene, PRESETS[preset].post, model.scene, undefined, false);
			// A program is keyed on the lights, the environment map and the render target it is drawn with, so
			// compile in the state a frame is drawn in: after the first frame has put the sky light in place.
			await firstFrame;
			const jobs: (() => Promise<unknown>)[] = [];
			const states = new Set<string>();
			const halfAvailable = env.planet.halfAvailable(gl);
			for (const name of reachOrder()) {
				const settings = PRESETS[name];
				// Each preset's scene programs (tone mapping in the material or in the output pass, shadows on or
				// off) and the planet and march passes at its defines, compiled the way that preset draws them.
				const casts = settings.shadowMapSize > 0;
				const state = `${settings.post}:${casts}`;
				if (!states.has(state)) {
					states.add(state);
					jobs.push(() => compile(model.scene, settings.post, model.scene, casts));
				}
				if (name !== preset) {
					// the vessel's part materials at this preset's detail
					const parts = model.warmPartScene(name);
					variants.push(parts);
					jobs.push(() => compile(parts, settings.post, model.scene, casts));
					for (const material of [
						env.planet.variantFor(settings),
						env.planet.marchVariantFor(settings)
					]) {
						variants.push(material);
						const scene = new Scene();
						scene.add(new Mesh(env.planet.mesh.geometry, material));
						// the march prepass draws into a float target whatever the preset, in a scene without lights
						const march = material.name.startsWith('terrain-march');
						jobs.push(() =>
							compile(scene, settings.post || march, march ? scene : model.scene, casts)
						);
					}
				}
				// The half-resolution rung (plan 050): the planet pass drawn into a float target compiles in the
				// target's state, which a preset that draws to the canvas (tone mapping in the program) does not share.
				if (halfAvailable && !settings.post) {
					const half = new Scene();
					const material = env.planet.variantFor(settings);
					half.add(new Mesh(env.planet.mesh.geometry, material));
					variants.push(material);
					jobs.push(() => compile(half, true, half, casts));
				}
			}
			// the planet pass with the aurora march (compiled in only while the aurora is in reach, plan 061), so the first
			// night at a high latitude does not stall on the driver's compiler
			for (const name of reachOrder()) {
				const settings = PRESETS[name];
				const material = env.planet.auroraVariantFor(settings);
				if (!material) continue;
				const scene = new Scene();
				scene.add(new Mesh(env.planet.mesh.geometry, material));
				variants.push(material);
				jobs.push(() => compile(scene, settings.post, model.scene, settings.shadowMapSize > 0));
			}
			// the upsample stands in the planet pass's place in both target states
			if (halfAvailable) {
				for (const toTarget of [true, false]) {
					const scene = new Scene();
					scene.add(new Mesh(env.planet.mesh.geometry, env.planet.upsampleMaterial));
					variants.push(scene);
					jobs.push(() => compile(scene, toTarget, scene));
				}
			}
			// the first compile counts now that the whole plan is known
			tracker.expect(1);
			void first.finally(() => tracker.finish());
			// every job starts in this turn: the driver compiles the programs side by side (they all finish within
			// about 10 s of the first frame on the M5, journal 038), and each job's state is put back at once
			await Promise.all([first, ...jobs.map((job) => job())]);
			compileTarget.dispose();
			// plan 340 (ADR 0290): one frame of each view the world moves between (flight with its
			// effects, map in vessel and system scope, the site), so no switch compiles a program later
			tracker.setStage('warm');
			tracker.expect(1);
			await idle();
			model.warmViews(() => drawFrame(0));
			tracker.finish();
			// the biome maps of the other presets, one per idle period: each takes up to a second to build
			tracker.setStage('maps');
			const widths = new Set(GRAPHICS_PRESETS.map((name) => PRESETS[name].mapWidth));
			widths.delete(PRESETS[preset].mapWidth);
			for (const width of widths) {
				tracker.expect(1);
				await idle();
				env.planet.warmMaps([width]);
				tracker.finish();
			}
			// the instanced vegetation of the other presets, one mesh per idle period (ADR 0055)
			tracker.setStage('vegetation');
			const budgets = GRAPHICS_PRESETS.map((name) => ({
				trees: PRESETS[name].trees,
				tufts: PRESETS[name].tufts
			}));
			tracker.expect(VEGETATION_STEPS);
			// A step is a few tenths of a millisecond; the sets of all presets are 34 of them. One step per idle
			// period (the first version) took 70 s on a page whose idle periods come every 2 s (a hidden tab), so
			// run steps for a few milliseconds per period instead (plan 038, ADR 0074).
			for (let more = true; more;) {
				const left = await idle();
				// the idle period's own allowance, within bounds (a period that came by its timeout has none)
				const slice = Math.min(Math.max(left - 1, VEGETATION_SLICE_MS), VEGETATION_SLICE_MAX_MS);
				const start = performance.now();
				do {
					more = env.site.warmVegetation(budgets);
					tracker.finish();
				} while (more && performance.now() - start < slice);
			}
			tracker.complete();
		})();
		return precompiling;
	};

	const gpuName = (): string => {
		const ctx = gl.getContext();
		const ext = ctx.getExtension('WEBGL_debug_renderer_info');
		return ext ? String(ctx.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : 'unknown';
	};
	// Re-applies the drawn preset after a switch changed its table entry (the entry is read at every use)
	const switches = new FeatureSwitches(
		PRESETS as unknown as Record<GraphicsPreset, PresetSettings>,
		() => {
			model.setPreset(preset);
			post.setSettings(PRESETS[preset]);
			applySize();
		}
	);
	function benchmark(frames: number): number {
		const ctx = gl.getContext();
		const pixel = new Uint8Array(4);
		const start = performance.now();
		for (let i = 0; i < frames; i++) drawFrame(1 / 60);
		ctx.readPixels(0, 0, 1, 1, ctx.RGBA, ctx.UNSIGNED_BYTE, pixel);
		return (performance.now() - start) / frames;
	}
	const debugApi: RendererDebug = withShared(
		{
			setPixelRatio(ratio: number | null) {
				forcedRatio = ratio;
				applySize();
			},
			readMoonPatch: (body: string, which: 'fine' | 'mid') => model.debugMoonPatch(gl, body, which),
			readPatch: (which: 'fine' | 'mid') => env.planet.debugReadPatch(gl, which),
			setFeature: (name: FeatureName, on: boolean) => switches.set(preset, name, on),
			features: () => switches.active(preset),
			resetFeatures: () => switches.reset(),
			featureNames: FEATURE_NAMES,
			benchmark,
			benchmarkAsync: async (frames: number) => benchmark(frames),
			counters: () => ({
				renderer: 'webgl' as const,
				drawCalls: gl.info.render.calls,
				triangles: gl.info.render.triangles
			}),
			info: () => ({
				renderer: 'webgl' as const,
				gpuMs: null,
				unported: [] as string[],
				patched: [] as string[],
				preset,
				altitude: env.state.altitude,
				sunElevationDeg: env.state.sunElevationDeg,
				exposure: env.state.exposure,
				drawCalls: gl.info.render.calls,
				triangles: gl.info.render.triangles,
				pixelRatio,
				size: [width, height] as [number, number],
				gpu: gpuName()
			})
		},
		debugFacade(model)
	);

	return withShared(
		{
			render() {
				const now = performance.now();
				const dt = Math.min((now - last) / 1000, 0.1);
				last = now;
				drawFrame(dt);
			},
			resize(w: number, h: number) {
				width = w;
				height = h;
				applySize();
				model.resize(w, h);
			},
			capture(): Promise<Blob> {
				// Read the drawing buffer in the same task as the draw: without preserveDrawingBuffer the
				// browser clears it only after compositing, so the PNG costs nothing on other frames.
				drawFrame(0);
				return new Promise((resolve, reject) =>
					config.canvas.toBlob(
						(blob) => (blob ? resolve(blob) : reject(new Error('no image'))),
						'image/png'
					)
				);
			},
			setPreset(next: GraphicsPreset) {
				preset = next;
				model.setPreset(next);
				post.setSettings(PRESETS[next]);
				applySize();
			},
			get preset() {
				return preset;
			},
			precompile,
			setRenderScale(scale: number) {
				const next = Math.min(Math.max(Number.isFinite(scale) ? scale : 1, MIN_RENDER_SCALE), 1);
				if (next === renderScale) return;
				renderScale = next;
				applySize();
			},
			get renderScale() {
				return renderScale;
			},
			setPlanetScale(scale: number) {
				env.planet.setPlanetScale(scale);
			},
			get planetScale() {
				return env.planet.planetScale;
			},
			gpuFrameMs: null,
			governorPresetSteps: true,
			get halfPlanetAvailable() {
				return env.planet.halfAvailable(gl);
			},
			capabilities() {
				return { gpu: gpuName(), maxTextureSize: gl.capabilities.maxTextureSize };
			},
			debug: debugApi,
			dispose() {
				for (const v of variants) v.dispose();
				variants = [];
				envLight.dispose();
				post.dispose();
				model.dispose();
				gl.dispose();
			}
		},
		sceneFacade(model)
	);
}
