/**
 * The browser-facing facade: a `WebGLRenderer` (logarithmic depth buffer, ADR 0007) driving a
 * `SceneModel`, the post chain and image-based light (ADR 0027). Needs a canvas, so it is
 * exercised by the manual runs in the journals, not by Bun tests.
 */
import type { EntityId, Snapshot } from '@orbital/core';
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
import { findPreset } from './camera-presets.ts';
import { EnvironmentLight } from './environment-light.ts';
import { PostChain } from './post.ts';
import { GRAPHICS_PRESETS, PRESETS, type GraphicsPreset } from './presets.ts';
import type { ScreenPoint } from './project.ts';
import { SceneModel, type MapPathSegment, type SceneConfig } from './scene.ts';
import type { Vec3 } from '@orbital/core';

/** Lowest render scale the governor may ask for; below this the picture is too soft to play. */
export const MIN_RENDER_SCALE = 0.4;

export interface RendererConfig extends SceneConfig {
	canvas: HTMLCanvasElement;
	/** Defaults to `window.devicePixelRatio`, capped by the preset. */
	pixelRatio?: number;
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
	/** Baked terrain patch read back from the GPU as heights in metres (plan 031's parity check); null before the first bake. */
	readPatch(which: 'fine' | 'mid'): {
		frame: { centre: Vec3; east: Vec3; north: Vec3; halfTan: number };
		size: number;
		heights: Float32Array;
	} | null;
	/** Set the regolith colour of the moons (linear RGB), for look development. */
	setMoonTint(r: number, g: number, b: number): void;
	/** Baked height patch of a moon read back from the GPU in metres (ADR 0054's parity check); null before the first bake. */
	readMoonPatch(
		body: string,
		which: 'fine' | 'mid'
	): {
		frame: { centre: Vec3; east: Vec3; north: Vec3; halfTan: number };
		size: number;
		heights: Float32Array;
	} | null;
	/** The scene graph, for inspection in the browser console. */
	readonly scene: Scene;
	/** Renders `frames` frames back to back and waits for the GPU; returns milliseconds per frame. */
	benchmark(frames: number): number;
	info(): {
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
	setMapView(on: boolean): void;
	/**
	 * The predicted path of the active vessel across spheres of influence, drawn in map view (plan 044):
	 * one stretch per body, `null` clears it.
	 */
	setMapPath(segments: readonly MapPathSegment[] | null): void;
	/** Map view: look at this body, `null` for the body of the active vessel's sphere. */
	setMapFocus(body: string | null): void;
	readonly mapFocus: string | null;
	/** Ids of the bodies, root first. */
	readonly bodyIds: readonly string[];
	toggleMapView(): boolean;
	readonly isMapView: boolean;
	setActiveVessel(id: EntityId | null): void;
	orbitCamera(input: { dYaw?: number; dPitch?: number; zoomFactor?: number }): void;
	/**
	 * Screen position of a point in the sim's inertial frame (a body's `position` plus a vessel's
	 * SOI-relative `position`) through the camera as drawn, in CSS pixels of the canvas box; `null`
	 * when behind the camera, `hidden` when a body is in the way (plan 024, ADR 0033).
	 */
	project(world: Vec3): ScreenPoint | null;
	/** Switch the graphics preset at runtime (shadows, post chain, sample counts, vegetation). */
	setPreset(preset: GraphicsPreset): void;
	readonly preset: GraphicsPreset;
	/**
	 * Fraction (0.4 to 1) of the preset's drawing-buffer size the scene renders at; the browser scales
	 * the canvas up. The quality governor's cheap knob (plan 039, ADR 0053): no shader recompile.
	 */
	setRenderScale(scale: number): void;
	readonly renderScale: number;
	/**
	 * Compiles the shader programs of this preset's scene and of the other presets' planet pass in the
	 * background (`compileAsync`), so the first frame and a later `setPreset` do not stall on the
	 * driver's shader compiler, then builds the biome maps of the other presets one idle period at a time
	 * (plan 039). Resolves when the programs are ready; safe to ignore.
	 */
	precompile(): Promise<void>;
	/** WebGL capability facts for `selectPreset`. */
	capabilities(): { gpu?: string; maxTextureSize: number };
	readonly debug: RendererDebug;
	dispose(): void;
}

export function createRenderer(config: RendererConfig): Renderer {
	const gl = new WebGLRenderer({
		canvas: config.canvas,
		antialias: true,
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
	const ratio = (): number =>
		(forcedRatio ??
			Math.min(
				config.pixelRatio ?? globalThis.devicePixelRatio ?? 1,
				PRESETS[preset].pixelRatioCap
			)) * renderScale;
	const applySize = (): void => {
		pixelRatio = ratio();
		gl.setPixelRatio(pixelRatio);
		gl.setSize(width, height, false);
		model.setPixelRatio(pixelRatio);
		post.setSize(width, height, pixelRatio);
		// the planet pass's march prepass matches the pixels of the target the scene is drawn into
		const target = post.active
			? post.targetSize
			: { width: gl.domElement.width, height: gl.domElement.height };
		env.planet.setTargetSize(target.width, target.height);
	};

	function drawFrame(dt: number): void {
		model.prepareFrame(dt);
		env.planet.bakeTerrain(gl);
		model.bakeMoons(gl);
		env.planet.marchPrepass(gl);
		gl.toneMappingExposure = env.state.exposure;
		const up = env.planet.material.uniforms.uCamUp!.value as Vec3;
		const target = envLight.update(env, up, env.state.sun);
		if (target) {
			model.scene.environment = target.texture;
			env.hemisphere.visible = false;
		}
		if (post.active) post.render(dt);
		else gl.render(model.scene, model.camera);
	}

	const idle = (): Promise<void> =>
		new Promise((resolve) => {
			if (typeof requestIdleCallback === 'function')
				requestIdleCallback(() => resolve(), { timeout: 2000 });
			else setTimeout(resolve, 50);
		});

	/** Programs of the other presets' planet pass, kept alive so three's program cache keeps them. */
	let variants: ShaderMaterial[] = [];
	let precompiling: Promise<void> | null = null;
	const precompile = (): Promise<void> => {
		precompiling ??= (async () => {
			const compileTarget = new WebGLRenderTarget(1, 1, { type: HalfFloatType });
			const previous = gl.getRenderTarget();
			const waits: Promise<unknown>[] = [];
			// three keys a program on tone mapping and colour space, which depend on drawing to a target or the canvas
			const compile = (scene: Scene, toTarget: boolean): void => {
				gl.setRenderTarget(toTarget ? compileTarget : null);
				waits.push(gl.compileAsync(scene, model.camera, model.scene));
			};
			compile(model.scene, PRESETS[preset].post);
			for (const name of GRAPHICS_PRESETS) {
				if (name === preset) continue;
				const settings = PRESETS[name];
				const material = env.planet.variantFor(settings);
				variants.push(material);
				const scene = new Scene();
				scene.add(new Mesh(env.planet.mesh.geometry, material));
				compile(scene, settings.post);
			}
			gl.setRenderTarget(previous);
			await Promise.all(waits);
			compileTarget.dispose();
			// the biome maps of the other presets, one per idle period: each takes up to a second to build
			const widths = new Set(GRAPHICS_PRESETS.map((name) => PRESETS[name].mapWidth));
			widths.delete(PRESETS[preset].mapWidth);
			for (const width of widths) {
				await idle();
				env.planet.warmMaps([width]);
			}
		})();
		return precompiling;
	};

	const gpuName = (): string => {
		const ctx = gl.getContext();
		const ext = ctx.getExtension('WEBGL_debug_renderer_info');
		return ext ? String(ctx.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : 'unknown';
	};
	const debugApi: RendererDebug = {
		setSun: (value) => env.setSunOverride(value),
		setCamera: (rig) => model.setFlightRig(rig),
		applyPreset(name) {
			const p = findPreset(name);
			if (!p) return false;
			env.setSunOverride(p.sun);
			model.setFlightRig(p.rig);
			return true;
		},
		setPixelRatio(ratio) {
			forcedRatio = ratio;
			applySize();
		},
		setPartTemperature: (kelvin) => model.setDebugTemperature(kelvin),
		focusPart: (definition, occurrence) => model.setDebugFocus(definition, occurrence),
		stepEffects(seconds) {
			const steps = Math.max(1, Math.round(seconds * 60));
			for (let i = 0; i < steps; i++) model.prepareFrame(1 / 60, true);
		},
		setMoonTint: (r, g, b) => model.setMoonTint(r, g, b),
		readMoonPatch: (body, which) => model.debugMoonPatch(gl, body, which),
		scene: model.scene,
		readPatch: (which) => env.planet.debugReadPatch(gl, which),
		benchmark(frames) {
			const ctx = gl.getContext();
			const pixel = new Uint8Array(4);
			const start = performance.now();
			for (let i = 0; i < frames; i++) drawFrame(1 / 60);
			ctx.readPixels(0, 0, 1, 1, ctx.RGBA, ctx.UNSIGNED_BYTE, pixel);
			return (performance.now() - start) / frames;
		},
		info: () => ({
			preset,
			altitude: env.state.altitude,
			sunElevationDeg: env.state.sunElevationDeg,
			exposure: env.state.exposure,
			drawCalls: gl.info.render.calls,
			triangles: gl.info.render.triangles,
			pixelRatio,
			size: [width, height],
			gpu: gpuName()
		})
	};

	return {
		update: (snapshot) => model.sync(snapshot),
		render() {
			const now = performance.now();
			const dt = Math.min((now - last) / 1000, 0.1);
			last = now;
			drawFrame(dt);
		},
		resize(w, h) {
			width = w;
			height = h;
			applySize();
			model.resize(w, h);
		},
		setMapView: (on) => model.setMapView(on),
		setMapPath: (segments) => model.setMapPath(segments),
		setMapFocus: (body) => model.setMapFocus(body),
		get mapFocus() {
			return model.mapFocusBody;
		},
		get bodyIds() {
			return model.bodyIds;
		},
		toggleMapView: () => model.toggleMapView(),
		get isMapView() {
			return model.isMapView;
		},
		setActiveVessel: (id) => model.setActiveVessel(id),
		orbitCamera: (input) => model.orbitCamera(input),
		project: (world) => model.project(world),
		setPreset(next) {
			preset = next;
			model.setPreset(next);
			post.setSettings(PRESETS[next]);
			envLight.invalidate();
			applySize();
		},
		get preset() {
			return preset;
		},
		precompile,
		setRenderScale(scale) {
			const next = Math.min(Math.max(Number.isFinite(scale) ? scale : 1, MIN_RENDER_SCALE), 1);
			if (next === renderScale) return;
			renderScale = next;
			applySize();
		},
		get renderScale() {
			return renderScale;
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
	};
}
