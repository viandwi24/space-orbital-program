/**
 * The `Renderer` facade on three's `WebGPURenderer` (plan 261 Phase 1, ADR 0249), picked by
 * `?renderer=webgpu` (or `webgpu-fallback`: the same renderer on its WebGL2 backend).
 *
 * The same `SceneModel` as the WebGL facade, drawn by the node renderer:
 * - the post chain is a TSL `RenderPipeline`: the scene pass (MSAA as the preset says), bloom,
 *   then tone mapping and sRGB as the pipeline's output transform;
 * - GPU time from timestamp queries where the browser has them, the GPU's name from the adapter;
 * - warm-up with `compileAsync`, which no longer blocks drawing on WebGPU;
 * - a lost device or context builds a new renderer on the same canvas.
 *
 * The planet pass is `tsl/planet-pass.ts` (Phase 2), drawn in the GLSL pass's place from the
 * uniforms the GLSL pass keeps. Meshes still on GLSL (moons, effects; Phases 2–4) are hidden each frame
 * (`webgpu-compat.ts`) and listed in Debug → Info, so the scene draws what is ported and the
 * hemisphere light stands in for the sky light until the planet pass is.
 */
import { HALF_PLANET_SCALE } from './half-res.ts';
import { ACESFilmicToneMapping, PCFShadowMap, type Camera, type Scene } from 'three';
import type { RenderPipeline, WebGPURenderer } from 'three/webgpu';
import type { RendererBackend } from './backend.ts';
import { FEATURE_NAMES, FeatureSwitches, type FeatureName } from './feature-switches.ts';
import { PrecompileTracker, type PrecompileProgress } from './precompile-progress.ts';
import { CompileReport } from './compile-report.ts';
import {
	GRAPHICS_PRESETS,
	PRESETS,
	msaaSamples,
	settingsFor,
	type GraphicsPreset,
	type PresetSettings
} from './presets.ts';
import type { Renderer, RendererConfig, RendererDebug } from './renderer.ts';
import { MIN_RENDER_SCALE, debugFacade, sceneFacade, withShared } from './renderer-facade.ts';
import { SceneModel } from './scene.ts';
import { PlanetPassTSL } from './tsl/planet-pass.ts';
import { hideUnported } from './webgpu-compat.ts';
import { Twins } from './tsl/twins.ts';
import { MoonTSL } from './tsl/moon.ts';
import type { MoonPass } from './moon.ts';

const deferred = (): { promise: Promise<void>; resolve: () => void } => {
	let resolve: () => void = () => {};
	const promise = new Promise<void>((r) => (resolve = r));
	return { promise, resolve };
};

type GetForRender = (
	renderObject: { object?: unknown },
	promises?: Promise<unknown>[] | null
) => unknown;

/** Steps `LaunchSite.warmVegetation` takes for the three presets' sets (as in renderer.ts). */
const VEGETATION_STEPS = 34;
/** Time a task may spend building new node graphs while the world loads (plan 370), ms. */
const BUILD_BUDGET_MS = 50;
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
	const model = new SceneModel(
		config.bootPreset && config.bootPreset !== (config.preset ?? 'high')
			? { ...config, preset: config.bootPreset }
			: config
	);
	const env = model.environment;
	/** The preset the host asked for (`setPreset`, the governor); `preset` is the one drawn. */
	let requested: GraphicsPreset = config.preset ?? 'high';
	/**
	 * Plan 370: a first load on a slow shader compiler (Windows) draws `config.bootPreset`'s small
	 * pipelines first and swaps to the requested preset once its pipelines are built in the background.
	 */
	let booting = config.bootPreset !== undefined && config.bootPreset !== requested;
	let preset: GraphicsPreset = booting ? config.bootPreset! : requested;
	/** The preset whose map, terrain, part detail and shadow sizes the world keeps (`setPreset`'s `governed`, ADR 0310). */
	let resources: GraphicsPreset = preset;
	const bootInfo: {
		preset: GraphicsPreset | null;
		swappedAfterMs: number | null;
		lowered: boolean;
	} = {
		preset: booting ? preset : null,
		swappedAfterMs: null,
		lowered: false
	};
	const onBootSwap = config.onBootSwap;
	// the moons' bakes and layers in TSL (Phase 4), one per moon pass of the scene
	const moons = new Map<MoonPass, MoonTSL>();
	const moonOf = (pass: MoonPass): MoonTSL => {
		let m = moons.get(pass);
		if (!m) {
			m = new MoonTSL(pass, { sun: env.sunLight, hemisphere: env.hemisphere });
			moons.set(pass, m);
		}
		return m;
	};
	// TSL twins of the scene's GLSL materials (Phase 4), swapped in for each draw
	const twins = new Twins((info) => moonOf(info.pass).twin(info));
	const twinOf = (m: Parameters<Twins['twinOf']>[0], o: Parameters<Twins['twinOf']>[1]) =>
		twins.twinOf(m, o);
	// the TSL planet pass beside the GLSL one, which stays in the scene for its CPU side and is hidden
	const planet = new PlanetPassTSL(env.planet, env.atmosphere, PRESETS[preset]);
	for (const m of planet.meshes) env.planet.mesh.parent?.add(m);
	let width = 1;
	let height = 1;
	let pixelRatio = 1;
	let forcedRatio: number | null = null;
	let renderScale = 1;
	let last = performance.now();

	let modules: Modules | null = null;
	let gpu: WebGPURenderer | null = null;
	let pipeline: RenderPipeline | null = null;
	const pipelines = new Map<string, RenderPipeline>();
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
	/** A benchmark reads the timestamp pool itself; the live meter waits meanwhile. */
	let benchmarking = false;

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
		pipeline = null;
		pipelineKey = key;
		if (!settings.post || !gpu || !modules) return;
		// one post chain per sample count and bloom scale, kept: a new one rebuilt its scene pass's
		// shaders for every material at each preset change (plan 261)
		const kept = pipelines.get(key);
		if (kept) {
			pipeline = kept;
			return;
		}
		const scenePass = modules.pass(model.scene, model.camera, { samples });
		const colour = scenePass.getTextureNode('output');
		const glow = modules.bloom(colour, BLOOM.strength, BLOOM.radius, BLOOM.threshold);
		glow.setResolutionScale(settings.bloomScale);
		const p = new modules.RenderPipeline(gpu);
		// tone mapping (ACES, the renderer's exposure) and sRGB come last, as the WebGL OutputPass
		p.outputNode = colour.add(glow);
		pipeline = p;
		pipelines.set(key, p);
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
		const b = r.backend as { device?: GPUDevice; gl?: WebGL2RenderingContext };
		if (b.device) compiles.watchWebGPU(b.device);
		else if (b.gl) compiles.watchWebGL(b.gl);
		hookPipelines(r);
		hookBuildBudget(r);
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

	/** `governed`: a governor step or a warm-up frame keeps the world's resource sizes (plan 373, ADR 0310). */
	function applyPreset(next: GraphicsPreset, governed = false): void {
		if (!governed) resources = next;
		preset = next;
		model.setPreset(next, resources, governed);
		planet.setSettings(settingsFor(next, resources));
		applySize();
	}

	const lose = (why: string): void => {
		for (const p of pipelines.values()) p.dispose();
		pipelines.clear();
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
		const u = hideUnported(model.scene, twinOf);
		// the GLSL planet pass is hidden on purpose: its TSL twin draws in its place
		unported = u.glsl.filter((name) => name !== env.planet.mesh.name);
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
		// the frames the pool holds are the ones drawn before this read; those drawn while it resolves
		// belong to the next (counting them here under-read the time per frame, plan 362)
		const frames = framesSinceResolve;
		framesSinceResolve = 0;
		r.resolveTimestampsAsync('render')
			.then((ms) => {
				if (typeof ms === 'number' && ms > 0) gpuMs = ms / frames;
			})
			.catch(() => {})
			.finally(() => {
				resolving = false;
			});
	};

	function drawFrame(dt: number): void {
		const r = gpu;
		if (!r) return;
		model.prepareFrame(dt);
		// three r186's WebGPU shadow node throws its map away when castShadow goes off and then reads
		// it (null.depthTexture, then a pass that binds its own target): the sun always keeps casting,
		// on every preset (the governor's move to low and back crashed the page), and the planet pass
		// ignores the map when the environment says it is off
		env.sunLight.castShadow = true;
		planet.update(
			r,
			model.camera,
			Math.max(1, Math.round(width * pixelRatio)),
			Math.max(1, Math.round(height * pixelRatio))
		);
		for (const pass of model.moonPasses) moonOf(pass).update(r);
		r.toneMappingExposure = env.state.exposure;
		withPorted(() => (pipeline ? pipeline.render() : r.render(model.scene, model.camera)));
		drawn = { calls: r.info.render.drawCalls, triangles: r.info.render.triangles };
		if (!benchmarking && (r.backend as { trackTimestamp?: boolean }).trackTimestamp) measureGpu(r);
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

	/** The GPU's name as WebGL reports it, from a throwaway context, asked once; null where hidden. */
	let glName: string | null | undefined;
	const glRendererName = (): string | null => {
		if (glName !== undefined) return glName;
		glName = null;
		try {
			const gl = document.createElement('canvas').getContext('webgl2');
			const ext = gl?.getExtension('WEBGL_debug_renderer_info');
			if (gl && ext) glName = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL));
			gl?.getExtension('WEBGL_lose_context')?.loseContext();
		} catch {
			glName = null;
		}
		return glName;
	};

	const gpuName = (): string => {
		const b = gpu?.backend as
			| { device?: GPUDevice & { adapterInfo?: GPUAdapterInfo }; gl?: WebGL2RenderingContext }
			| undefined;
		const info = b?.device?.adapterInfo;
		if (info) {
			const name = [info.vendor, info.architecture, info.description].filter(Boolean).join(' ');
			// Chrome leaves the adapter's fields empty unless a flag is set: the GPU's name from WebGL then
			return `WebGPU: ${name || (glRendererName() ?? 'adapter name hidden by the browser')}`;
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
	/** Every module and pipeline built, with sizes and async compile times (plan 370). */
	const compiles = new CompileReport();
	compiles.keepSources = globalThis.localStorage?.getItem?.('orbital.debug.shaderSources') === '1';
	/** While true, new pipelines of the scene's meshes are built async and their draws skipped until ready. */
	let asyncPipelines = false;
	const pendingCompiles = new Set<Promise<unknown>>();
	/** Resolves when the player's preset changes (`setPreset`): the warm-up stops waiting for the old one's pipelines. */
	let presetChanged: { promise: Promise<void>; resolve: () => void } = deferred();
	/**
	 * Routes three's pipeline requests through its async path while `asyncPipelines` is on (ADR 0308):
	 * `Pipelines.getForRender` with a collecting array calls `createRenderPipelineAsync` (WebGPU) or
	 * polls `KHR_parallel_shader_compile` (WebGL2), and `isReady` skips the draw until it is built.
	 * Full-screen quads stay sync but the planet's per-frame ones: a one-shot bake must not be skipped.
	 */
	/** Objects drawn once while loading: their node graphs are built (the page's CPU cost of a shader). */
	const builtObjects = new Set<string>();
	/** New objects passed over by the build budget since the warm-up's round began. */
	let deferredBuilds = 0;
	let budgetOpen = false;
	let budgetEnds = 0;
	/**
	 * While loading, a task builds node graphs for at most `BUILD_BUDGET_MS` (plan 370): three turns a
	 * material into WGSL on the page's thread the first time it draws it, about 3 s in all on the M2
	 * and up to 1.4 s in one frame. An object it has not drawn yet waits for the next task once the
	 * budget is spent, so the loading screen keeps running. One-shot bakes are never passed over.
	 */
	const hookBuildBudget = (r: WebGPURenderer): void => {
		const rr = r as unknown as { _renderObjectDirect?: (...a: unknown[]) => unknown };
		const direct = rr._renderObjectDirect;
		if (typeof direct !== 'function') return;
		rr._renderObjectDirect = function (this: unknown, ...a: unknown[]) {
			const object = a[0] as { id: number; isQuadMesh?: boolean };
			const material = a[1] as { id: number };
			if (asyncPipelines && !(object.isQuadMesh && !planet.isFrameQuad(object))) {
				const key = `${material.id}:${object.id}`;
				if (!builtObjects.has(key)) {
					const now = performance.now();
					if (!budgetOpen) {
						budgetOpen = true;
						budgetEnds = now + BUILD_BUDGET_MS;
						setTimeout(() => (budgetOpen = false), 0);
					} else if (now > budgetEnds) {
						deferredBuilds++;
						return;
					}
					builtObjects.add(key);
				}
			}
			return direct.apply(this, a);
		};
	};

	const hookPipelines = (r: WebGPURenderer): void => {
		const pipes = (r as unknown as { _pipelines?: { getForRender: GetForRender } })._pipelines;
		if (!pipes || typeof pipes.getForRender !== 'function') return;
		const own = pipes.getForRender.bind(pipes);
		pipes.getForRender = (ro, promises = null) => {
			const o = ro.object as { isQuadMesh?: boolean } | undefined;
			if (promises !== null || !asyncPipelines || (o?.isQuadMesh && !planet.isFrameQuad(o)))
				return own(ro, promises);
			const list: Promise<unknown>[] = [];
			const out = own(ro, list);
			for (const p of list) {
				pendingCompiles.add(p);
				void p.finally(() => pendingCompiles.delete(p));
			}
			return out;
		};
	};
	/** How long each other preset's warm-up frames took at load, ms (plan 362; Debug, the measure script). */
	const presetWarmMs: Partial<Record<GraphicsPreset, number>> = {};
	/**
	 * Draws with a warm scene's part models in the flight scene, unculled, then gives them back: their
	 * pipelines are built for the scene's own targets (\`compileAsync\` into other targets does not carry over).
	 */
	const withParts = (parts: Scene, draw: () => void): void => {
		const kids = [...parts.children];
		const culled: { o: { frustumCulled: boolean }; was: boolean }[] = [];
		for (const k of kids) {
			k.traverse((o) => {
				culled.push({ o, was: o.frustumCulled });
				o.frustumCulled = false;
			});
			model.scene.add(k);
		}
		try {
			draw();
		} finally {
			for (const k of kids) parts.add(k);
			for (const c of culled) c.o.frustumCulled = c.was;
		}
	};
	const tracker = new PrecompileTracker();
	let precompiling: Promise<void> | null = null;
	/**
	 * Asks for pipelines without waiting for them (plan 370, ADR 0308): repeats `frames` in async
	 * mode until a round asks for no new pipeline and none is pending. Dawn builds async pipelines on
	 * worker threads, side by side; the loading screen counts them down.
	 */
	const settle = async (frames: () => void): Promise<void> => {
		for (let round = 0; round < 30; round++) {
			await idle();
			if (!gpu) return;
			const before = compiles.pipelines.length;
			deferredBuilds = 0;
			const was = asyncPipelines;
			asyncPipelines = true;
			try {
				frames();
			} finally {
				asyncPipelines = was;
			}
			const pending = [...pendingCompiles];
			if (pending.length === 0 && compiles.pipelines.length === before && deferredBuilds === 0)
				return;
			// a preset change ("continue with lower quality") asks for the new preset's pipelines next
			// round; the old ones finish in the background
			await Promise.race([Promise.all(pending), presetChanged.promise]);
		}
	};
	/**
	 * Draws as if the sun were up (plan 373, ADR 0310): the shadow is fitted around the vessel, so the
	 * casters' shadow pipelines are built whatever the time of day at load. Without it a world loaded at
	 * night or over the dark side built them at the first sunrise.
	 */
	const sunlit = (draw: () => void): void => {
		env.forceShadow = true;
		try {
			draw();
		} finally {
			env.forceShadow = false;
		}
	};
	/** The planet on its full and its half path (a governor rung or the pixel budget finds both built), sunlit and as it is. */
	const planetFrames = (): void => {
		try {
			for (const s of [1, HALF_PLANET_SCALE]) {
				planet.forceScale = s;
				sunlit(() => drawFrame(0));
				drawFrame(0);
			}
		} finally {
			planet.forceScale = null;
		}
	};
	/** A frame and every view, sunlit and as they are (plan 373). */
	const viewFrames = (): void => {
		sunlit(() => {
			drawFrame(0);
			model.warmViews(() => drawFrame(0));
		});
		drawFrame(0);
		model.warmViews(() => drawFrame(0));
	};
	/**
	 * Builds `name`'s pipelines for `frames` in the background while the world is shown (ADR 0308
	 * point 4): each round draws `frames` at `name` with async pipelines (the parts of `name` in view
	 * when given), then a frame of the preset drawn now in the same task, so the canvas never shows
	 * the half-built one. Done when a round asks for nothing new; false when the drawn preset changed.
	 */
	const warmRounds = async (
		name: GraphicsPreset,
		frames: () => void,
		parts?: Scene
	): Promise<boolean> => {
		const own = preset;
		for (let round = 0; round < 30; round++) {
			await idle();
			if (!gpu || preset !== own) return false;
			const before = compiles.pipelines.length;
			deferredBuilds = 0;
			asyncPipelines = true;
			try {
				if (name !== own) applyPreset(name, true);
				if (parts) withParts(parts, frames);
				else frames();
			} finally {
				asyncPipelines = false;
				planet.forceScale = null;
				if (name !== own) applyPreset(own, true);
			}
			drawFrame(0);
			const pending = [...pendingCompiles];
			if (pending.length === 0 && compiles.pipelines.length === before && deferredBuilds === 0)
				return true;
			await Promise.race([Promise.all(pending), presetChanged.promise]);
		}
		return false;
	};
	/** The planet at the scale it does not draw now (the governor's half rung, or back to full). */
	const otherScaleFrame = (): void => {
		planet.forceScale = planet.scale < 1 ? 1 : HALF_PLANET_SCALE;
		sunlit(() => drawFrame(0));
		drawFrame(0);
	};
	const precompile = (onProgress?: (p: PrecompileProgress) => void): Promise<void> => {
		if (onProgress) tracker.subscribe(onProgress);
		// until the world is ready, every new pipeline of the scene is built async: the holder's frames
		// and the warm-up only ask for them (a draw whose pipeline is pending is skipped)
		if (!precompiling) asyncPipelines = true;
		precompiling ??= (async () => {
			await started;
			compiles.phase = 'programs';
			tracker.expect(1);
			for (let i = 0; i < 200 && !planet.built; i++) await idle();
			// plan 261 / 340 / 370: the planet at the scale it draws now and one frame of each view the
			// world moves between (flight with its effects, map in vessel and system scope, the site),
			// drawn until every pipeline they need is built for the targets they draw into. The other
			// planet scale waits until after the loading screen: on D3D each planet variant is 10 to 15 s.
			await settle(viewFrames);
			tracker.finish();
			// the same frames on the sync path: everything is built, and what only draws once draws now
			tracker.setStage('warm');
			compiles.phase = 'warm';
			tracker.expect(1);
			await idle();
			asyncPipelines = false;
			if (gpu) viewFrames();
			tracker.finish();
			// After the loading screen (ADR 0308 point 4, amending 0304), in the background:
			tracker.setStage('presets');
			compiles.phase = 'background';
			// 1. booting on a cheap preset (plan 370): the player's preset, its parts and its views, then swapped in
			for (let attempt = 0; booting && gpu; attempt++) {
				const target = requested;
				const t0 = performance.now();
				tracker.expect(1);
				const parts = model.warmPartScene(target);
				variants.push(parts);
				const done = await warmRounds(target, viewFrames, parts);
				tracker.finish();
				// after a few tries that never settle, swap anyway: what is left builds on first use
				if ((done || attempt >= 3) && booting && target === requested) {
					booting = false;
					applyPreset(target);
					bootInfo.swappedAfterMs = Math.round(performance.now() - t0);
					onBootSwap?.(target);
				}
			}
			// 2. the other planet scale of the preset drawn now
			tracker.expect(1);
			await warmRounds(preset, otherScaleFrame);
			tracker.finish();
			// 3. the presets the host names (`warmPresets`, where the governor goes first), both scales,
			// with their part models in view; a preset the player changed while loading warms nothing more
			const own = preset;
			const asked = own === (config.preset ?? 'high') && !bootInfo.lowered;
			for (const name of asked ? (config.warmPresets ?? []) : []) {
				if (name === own) continue;
				const parts = model.warmPartScene(name);
				variants.push(parts);
				tracker.expect(1);
				const t0 = performance.now();
				// the planet's paths alone, then the part models in their own frames: drawn together, the
				// parts used up each task's build budget and the half path was never built (plan 373)
				await warmRounds(name, planetFrames);
				await warmRounds(name, () => sunlit(() => drawFrame(0)), parts);
				presetWarmMs[name] = Math.round(performance.now() - t0);
				tracker.finish();
			}
			compiles.phase = 'play';
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
			model.setPreset(preset, resources);
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
				const r = gpu;
				if (!r) return 0;
				// the GPU's own time where it has timestamp queries: waiting for the queue undercounts
				// on WebGPU (it returned about 1 ms for frames the timestamps put at 3)
				// the WebGPU backend's timestamps; the WebGL2 fallback's timer queries are not read back here
				const b = r.backend as { trackTimestamp?: boolean; isWebGPUBackend?: boolean };
				const timed = b.trackTimestamp === true && b.isWebGPUBackend === true;
				benchmarking = true;
				try {
					drawFrame(1 / 60);
					await waitForGpu();
					if (timed) await r.resolveTimestampsAsync('render').catch(() => undefined);
					const t0 = performance.now();
					for (let i = 0; i < frames; i++) drawFrame(1 / 60);
					await waitForGpu();
					const wall = (performance.now() - t0) / frames;
					if (!timed) return wall;
					const ms = await r.resolveTimestampsAsync('render').catch(() => undefined);
					return typeof ms === 'number' && ms > 0 ? ms / frames : wall;
				} finally {
					benchmarking = false;
				}
			},
			counters: () => ({ renderer: backend, drawCalls: drawn.calls, triangles: drawn.triangles }),
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
				gpu: gpuName(),
				presetWarmMs: { ...presetWarmMs },
				presetDrawn: preset,
				boot: { ...bootInfo, booting },
				renderScale
			})
		},
		debugFacade(model)
	);
	// the bake measurement reaches the TSL bakes as well as the GLSL pass's flags (set after the shared half)
	debugApi.bakeMode = (rebake, gradient) => {
		env.planet.debugBakeMode(rebake, gradient);
		planet.debugBakeMode(rebake, gradient);
	};

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
			setPreset: (next: GraphicsPreset, options?: { governed?: boolean }) => {
				requested = next;
				if (booting) {
					// still drawing the boot preset: the background builds the new one (or, asked for the
					// boot preset itself, "lower quality", the boot is over)
					if (next === preset) {
						booting = false;
						bootInfo.lowered = true;
					}
					presetChanged.resolve();
					presetChanged = deferred();
					return;
				}
				if (next === preset && (options?.governed || resources === next)) return;
				applyPreset(next, options?.governed);
				pendingCompiles.clear();
				presetChanged.resolve();
				presetChanged = deferred();
			},
			get preset() {
				return requested;
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
			// the half-size planet pass (plan 050, ADR 0061): the governor's rung and the pixel budget
			setPlanetScale(scale: number) {
				planet.setScale(scale);
			},
			get planetScale() {
				return planet.scale;
			},
			get halfPlanetAvailable() {
				return true;
			},
			// every preset's frames are drawn at load (plan 362, ADR 0304): a step costs no shader build
			governorPresetSteps: true,
			get gpuFrameMs() {
				return gpuMs;
			},
			capabilities() {
				const b = gpu?.backend as { device?: GPUDevice; gl?: WebGL2RenderingContext } | undefined;
				const max =
					b?.device?.limits.maxTextureDimension2D ??
					(b?.gl ? Number(b.gl.getParameter(b.gl.MAX_TEXTURE_SIZE)) : 8192);
				return { gpu: gpuName(), maxTextureSize: max };
			},
			compiles,
			debug: debugApi,
			dispose() {
				for (const v of variants) v.clear();
				variants = [];
				for (const p of pipelines.values()) p.dispose();
				pipelines.clear();
				for (const m of planet.meshes) m.removeFromParent();
				planet.dispose();
				for (const m of moons.values()) m.dispose();
				model.dispose();
				gpu?.dispose();
				gpu = null;
			}
		},
		sceneFacade(model)
	);
}
