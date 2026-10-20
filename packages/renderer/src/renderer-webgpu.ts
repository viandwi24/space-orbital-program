/**
 * The `Renderer` facade on three's `WebGPURenderer` (plan 261 Phase 1, ADR 0242), picked by
 * `?renderer=webgpu` (or `webgpu-fallback`: the same renderer on its WebGL2 backend).
 *
 * The same `SceneModel` as the WebGL facade, drawn by the node renderer:
 * - the post chain is a TSL `RenderPipeline`: the scene pass (MSAA as the preset says), bloom,
 *   then tone mapping and sRGB as the pipeline's output transform;
 * - GPU time from timestamp queries where the browser has them, the GPU's name from the adapter;
 * - warm-up with `compileAsync`, which no longer blocks drawing on WebGPU;
 * - a lost device or context builds a new renderer on the same canvas.
 *
 * Meshes still on GLSL (the planet pass, moons, effects; Phases 2–4) are hidden each frame
 * (`webgpu-compat.ts`) and listed in Debug → Info, so the scene draws what is ported and the
 * hemisphere light stands in for the sky light until the planet pass is.
 */
import { ACESFilmicToneMapping, PCFShadowMap, type Camera, type Scene } from 'three';
import type { RenderPipeline, WebGPURenderer } from 'three/webgpu';
import type { RendererBackend } from './backend.ts';
import { FEATURE_NAMES, FeatureSwitches, type FeatureName } from './feature-switches.ts';
import { PrecompileTracker, type PrecompileProgress } from './precompile-progress.ts';
import {
	GRAPHICS_PRESETS,
	PRESETS,
	msaaSamples,
	type GraphicsPreset,
	type PresetSettings
} from './presets.ts';
import type { Renderer, RendererConfig, RendererDebug } from './renderer.ts';
import { MIN_RENDER_SCALE, debugFacade, sceneFacade, withShared } from './renderer-facade.ts';
import { SceneModel } from './scene.ts';
import { hideUnported } from './webgpu-compat.ts';

/** Steps `LaunchSite.warmVegetation` takes for the three presets' sets (as in renderer.ts). */
const VEGETATION_STEPS = 34;
/** A lost device builds a new renderer at most this often before the page has to be reloaded. */
const MAX_RESTARTS = 3;
/** UnrealBloomPass's strength, radius and threshold in the WebGL chain (post.ts). */
const BLOOM = { strength: 0.32, radius: 0.55, threshold: 3.0 };

type Modules = {
	WebGPURenderer: typeof import('three/webgpu').WebGPURenderer;
	RenderPipeline: typeof import('three/webgpu').RenderPipeline;
	pass: typeof import('three/tsl').pass;
	bloom: typeof import('three/addons/tsl/display/BloomNode.js').bloom;
};

const loadModules = async (): Promise<Modules> => {
	const [webgpu, tsl, bloomNode] = await Promise.all([
		import('three/webgpu'),
		import('three/tsl'),
		import('three/addons/tsl/display/BloomNode.js')
	]);
	return {
		WebGPURenderer: webgpu.WebGPURenderer,
		RenderPipeline: webgpu.RenderPipeline,
		pass: tsl.pass,
		bloom: bloomNode.bloom
	};
};

export function createWebGPURenderer(
	config: RendererConfig,
	backend: Exclude<RendererBackend, 'webgl'>
): Renderer {
	const model = new SceneModel(config);
	const env = model.environment;
	let preset: GraphicsPreset = config.preset ?? 'high';
	let width = 1;
	let height = 1;
	let pixelRatio = 1;
	let forcedRatio: number | null = null;
	let renderScale = 1;
	let last = performance.now();

	let modules: Modules | null = null;
	let gpu: WebGPURenderer | null = null;
	let pipeline: RenderPipeline | null = null;
	let pipelineKey = '';
	/** Why drawing stopped (a lost device past `MAX_RESTARTS`, or no adapter), or null. */
	let stopped: string | null = null;
	let restarts = 0;
	let unported: string[] = [];
	let patched: string[] = [];
	let gpuMs: number | null = null;
	/** The last frame's counts, read right after it (compiles reset the renderer's own). */
	let drawn = { calls: 0, triangles: 0 };
	let framesSinceResolve = 0;
	let resolving = false;

	const baseRatio = (): number =>
		forcedRatio ??
		Math.min(config.pixelRatio ?? globalThis.devicePixelRatio ?? 1, PRESETS[preset].pixelRatioCap);
	const ratio = (): number => baseRatio() * renderScale;

	/** The post chain for the preset, rebuilt only when its sample count or bloom scale changes. */
	const syncPipeline = (): void => {
		const settings = PRESETS[preset];
		const samples = msaaSamples(settings.msaa, baseRatio());
		const key = settings.post ? `${samples}:${settings.bloomScale}` : 'off';
		if (key === pipelineKey && (pipeline !== null) === settings.post) return;
		pipeline?.dispose();
		pipeline = null;
		pipelineKey = key;
		if (!settings.post || !gpu || !modules) return;
		const scenePass = modules.pass(model.scene, model.camera, { samples });
		const colour = scenePass.getTextureNode('output');
		const glow = modules.bloom(colour, BLOOM.strength, BLOOM.radius, BLOOM.threshold);
		glow.setResolutionScale(settings.bloomScale);
		const p = new modules.RenderPipeline(gpu);
		// tone mapping (ACES, the renderer's exposure) and sRGB come last, as the WebGL OutputPass
		p.outputNode = colour.add(glow);
		pipeline = p;
	};

	const applySize = (): void => {
		pixelRatio = ratio();
		model.setPixelRatio(pixelRatio);
		env.setViewRatio(baseRatio());
		if (!gpu) return;
		gpu.setPixelRatio(pixelRatio);
		gpu.setSize(width, height, false);
		syncPipeline();
	};

	let ready: () => void = () => {};
	const started = new Promise<void>((resolve) => (ready = resolve));

	const start = async (): Promise<void> => {
		modules ??= await loadModules();
		const r = new modules.WebGPURenderer({
			canvas: config.canvas,
			antialias: false,
			logarithmicDepthBuffer: true,
			powerPreference: 'high-performance',
			forceWebGL: backend === 'webgpu-fallback',
			trackTimestamp: true
		});
		await r.init();
		r.toneMapping = ACESFilmicToneMapping;
		r.shadowMap.enabled = true;
		r.shadowMap.type = PCFShadowMap;
		r.onDeviceLost = (info: { message?: string; reason?: string | null }) => {
			console.error(`renderer: ${backend} lost its device (${info.reason ?? info.message ?? '?'})`);
			lose(info.message ?? 'device lost');
		};
		gpu = r;
		pipelineKey = '';
		applySize();
		ready();
	};

	const lose = (why: string): void => {
		pipeline?.dispose();
		pipeline = null;
		gpu = null;
		if (restarts >= MAX_RESTARTS) {
			stopped = `${why}; reload the page`;
			return;
		}
		restarts++;
		const again = (): void => {
			start().catch((e: unknown) => (stopped = String(e)));
		};
		// a WebGL2 context comes back by itself (restored event); a WebGPU device is asked for anew
		if (backend === 'webgpu-fallback')
			config.canvas.addEventListener('webglcontextrestored', again, { once: true });
		else again();
	};

	start().catch((e: unknown) => {
		stopped = `no ${backend} renderer: ${String(e)}`;
		console.error(`renderer: ${stopped}`);
	});

	/** Draws with the GLSL meshes hidden; `draw` is the pipeline or a plain render. */
	const withPorted = <T>(draw: () => T): T => {
		const u = hideUnported(model.scene);
		unported = u.glsl;
		patched = u.patched;
		try {
			return draw();
		} finally {
			u.restore();
		}
	};

	/**
	 * GPU time a frame, about: three's query pool sums every pass up to when it is read, so the
	 * frames are counted from one finished read to the next, about half a second apart.
	 */
	const measureGpu = (r: WebGPURenderer): void => {
		framesSinceResolve++;
		if (resolving || framesSinceResolve < 30) return;
		resolving = true;
		r.resolveTimestampsAsync('render')
			.then((ms) => {
				if (typeof ms === 'number' && ms > 0) gpuMs = ms / framesSinceResolve;
			})
			.catch(() => {})
			.finally(() => {
				framesSinceResolve = 0;
				resolving = false;
			});
	};

	function drawFrame(dt: number): void {
		const r = gpu;
		if (!r) return;
		model.prepareFrame(dt);
		r.toneMappingExposure = env.state.exposure;
		withPorted(() => (pipeline ? pipeline.render() : r.render(model.scene, model.camera)));
		drawn = { calls: r.info.render.drawCalls, triangles: r.info.render.triangles };
		if ((r.backend as { trackTimestamp?: boolean }).trackTimestamp) measureGpu(r);
	}

	const waitForGpu = async (): Promise<void> => {
		const b = gpu?.backend as { device?: GPUDevice; gl?: WebGL2RenderingContext } | undefined;
		if (b?.device) await b.device.queue.onSubmittedWorkDone();
		else if (b?.gl) {
			const gl = b.gl;
			const bound = gl.getParameter(gl.READ_FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
			gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
			gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
			gl.bindFramebuffer(gl.READ_FRAMEBUFFER, bound);
		}
	};

	const gpuName = (): string => {
		const b = gpu?.backend as
			| { device?: GPUDevice & { adapterInfo?: GPUAdapterInfo }; gl?: WebGL2RenderingContext }
			| undefined;
		const info = b?.device?.adapterInfo;
		if (info) {
			const name = [info.vendor, info.architecture, info.description].filter(Boolean).join(' ');
			return `WebGPU: ${name || 'unnamed adapter'}`;
		}
		const gl = b?.gl;
		const ext = gl?.getExtension('WEBGL_debug_renderer_info');
		if (gl && ext)
			return `WebGPU renderer on WebGL2: ${String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL))}`;
		return stopped ?? 'starting…';
	};

	const idle = (): Promise<number> =>
		new Promise((resolve) => {
			if (typeof requestIdleCallback === 'function')
				requestIdleCallback((deadline) => resolve(deadline.timeRemaining()), { timeout: 2000 });
			else setTimeout(() => resolve(8), 50);
		});

	let variants: Scene[] = [];
	const tracker = new PrecompileTracker();
	let precompiling: Promise<void> | null = null;
	const precompile = (onProgress?: (p: PrecompileProgress) => void): Promise<void> => {
		if (onProgress) tracker.subscribe(onProgress);
		precompiling ??= (async () => {
			await started;
			const compile = (scene: Scene, camera: Camera, lights: Scene): Promise<unknown> => {
				const r = gpu;
				if (!r) return Promise.resolve();
				tracker.expect(1);
				// compileAsync collects the objects before its first await: hide around the call only
				const u = hideUnported(scene);
				try {
					return r.compileAsync(scene, camera, lights).finally(() => tracker.finish());
				} finally {
					u.restore();
				}
			};
			const jobs: Promise<unknown>[] = [compile(model.scene, model.camera, model.scene)];
			// the vessel's part materials at the other presets' detail
			for (const name of GRAPHICS_PRESETS) {
				if (name === preset) continue;
				const parts = model.warmPartScene(name);
				variants.push(parts);
				jobs.push(compile(parts, model.camera, model.scene));
			}
			await Promise.all(jobs);
			// the instanced vegetation of the other presets, a few milliseconds per idle period (ADR 0055)
			tracker.setStage('vegetation');
			const budgets = GRAPHICS_PRESETS.map((name) => ({
				trees: PRESETS[name].trees,
				tufts: PRESETS[name].tufts
			}));
			tracker.expect(VEGETATION_STEPS);
			for (let more = true; more;) {
				const left = await idle();
				const slice = Math.min(Math.max(left - 1, 6), 12);
				const t0 = performance.now();
				do {
					more = env.site.warmVegetation(budgets);
					tracker.finish();
				} while (more && performance.now() - t0 < slice);
			}
			tracker.complete();
		})();
		return precompiling;
	};

	const switches = new FeatureSwitches(
		PRESETS as unknown as Record<GraphicsPreset, PresetSettings>,
		() => {
			model.setPreset(preset);
			pipelineKey = '';
			applySize();
		}
	);

	const benchmarkCpu = (frames: number): number => {
		const t0 = performance.now();
		for (let i = 0; i < frames; i++) drawFrame(1 / 60);
		return (performance.now() - t0) / frames;
	};

	const debugApi: RendererDebug = withShared(
		{
			setPixelRatio(value: number | null) {
				forcedRatio = value;
				applySize();
			},
			// the GPU read-backs of the terrain bakes are WebGL programs (Phase 3 ports them)
			readPatch: () => null,
			readMoonPatch: () => null,
			setFeature: (name: FeatureName, on: boolean) => switches.set(preset, name, on),
			features: () => switches.active(preset),
			resetFeatures: () => switches.reset(),
			featureNames: FEATURE_NAMES,
			benchmark: benchmarkCpu,
			async benchmarkAsync(frames: number) {
				await started;
				drawFrame(1 / 60);
				await waitForGpu();
				const t0 = performance.now();
				for (let i = 0; i < frames; i++) drawFrame(1 / 60);
				await waitForGpu();
				return (performance.now() - t0) / frames;
			},
			info: () => ({
				renderer: backend,
				gpuMs,
				unported,
				patched,
				preset,
				altitude: env.state.altitude,
				sunElevationDeg: env.state.sunElevationDeg,
				exposure: env.state.exposure,
				drawCalls: drawn.calls,
				triangles: drawn.triangles,
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
			async capture(): Promise<Blob> {
				await started;
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
			// the half-resolution planet pass is a WebGL program; Phase 5's upscaler replaces it
			setPlanetScale() {},
			get planetScale() {
				return 1;
			},
			get halfPlanetAvailable() {
				return false;
			},
			capabilities() {
				const b = gpu?.backend as { device?: GPUDevice; gl?: WebGL2RenderingContext } | undefined;
				const max =
					b?.device?.limits.maxTextureDimension2D ??
					(b?.gl ? Number(b.gl.getParameter(b.gl.MAX_TEXTURE_SIZE)) : 8192);
				return { gpu: gpuName(), maxTextureSize: max };
			},
			debug: debugApi,
			dispose() {
				for (const v of variants) v.clear();
				variants = [];
				pipeline?.dispose();
				model.dispose();
				gpu?.dispose();
				gpu = null;
			}
		},
		sceneFacade(model)
	);
}
