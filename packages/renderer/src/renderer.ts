/**
 * The browser-facing facade: a `WebGLRenderer` (logarithmic depth buffer, ADR 0007) driving a
 * `SceneModel`, the post chain and image-based light (ADR 0027). Needs a canvas, so it is
 * exercised by the manual runs in the journals, not by Bun tests.
 */
import type { EntityId, Snapshot } from '@orbital/core';
import { ACESFilmicToneMapping, PCFShadowMap, WebGLRenderer, type Scene } from 'three';
import { findPreset } from './camera-presets.ts';
import { EnvironmentLight } from './environment-light.ts';
import { PostChain } from './post.ts';
import { PRESETS, type GraphicsPreset } from './presets.ts';
import { SceneModel, type SceneConfig } from './scene.ts';
import type { Vec3 } from '@orbital/core';

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
	toggleMapView(): boolean;
	readonly isMapView: boolean;
	setActiveVessel(id: EntityId | null): void;
	orbitCamera(input: { dYaw?: number; dPitch?: number; zoomFactor?: number }): void;
	/** Switch the graphics preset at runtime (shadows, post chain, sample counts, vegetation). */
	setPreset(preset: GraphicsPreset): void;
	readonly preset: GraphicsPreset;
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
	const ratio = (): number =>
		forcedRatio ??
		Math.min(config.pixelRatio ?? globalThis.devicePixelRatio ?? 1, PRESETS[preset].pixelRatioCap);
	const applySize = (): void => {
		pixelRatio = ratio();
		gl.setPixelRatio(pixelRatio);
		gl.setSize(width, height, false);
		model.setPixelRatio(pixelRatio);
		post.setSize(width, height, pixelRatio);
	};

	function drawFrame(dt: number): void {
		model.prepareFrame(dt);
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
		scene: model.scene,
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
		toggleMapView: () => model.toggleMapView(),
		get isMapView() {
			return model.isMapView;
		},
		setActiveVessel: (id) => model.setActiveVessel(id),
		orbitCamera: (input) => model.orbitCamera(input),
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
		capabilities() {
			return { gpu: gpuName(), maxTextureSize: gl.capabilities.maxTextureSize };
		},
		debug: debugApi,
		dispose() {
			envLight.dispose();
			post.dispose();
			model.dispose();
			gl.dispose();
		}
	};
}
