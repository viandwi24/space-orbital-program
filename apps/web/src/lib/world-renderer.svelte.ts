/**
 * The world's one renderer (plan 340, ADR 0290): one canvas and one `Renderer` for Flight, the
 * Mission Center and the Space Center, from the world's first page until the player leaves it. The
 * `(world)` layout owns it; a page takes it with `acquire` (the canvas moves into the page's host
 * element, which keeps its context) and gives it back with `release`. Nothing is rebuilt between
 * pages: the device, the terrain bakes and every shader stay.
 *
 * The renderer warms up once, when the world loads (`precompile` with its `warm` stage): until it has
 * drawn a frame after the warm-up the layout shows the loading screen, and the renderer draws in
 * the layout's hidden holder when no page holds it.
 */
import {
	createRenderer,
	type Renderer,
	type RendererBackend,
	type RendererConfig
} from '@orbital/renderer';
import type { PrecompileProgress } from '@orbital/renderer/precompile-progress';
import { partShapesOf } from './catalog';
import {
	emitGraphicsChange,
	graphicsStart,
	loadBrightness,
	loadRendererFallback,
	onGraphicsChange,
	rendererBackend,
	saveGraphicsPreset,
	saveRendererFallback
} from './graphics';
import { rendererBackendFrom } from '@orbital/renderer/backend';
import { setLookChoices } from '@orbital/renderer/presets';
import { effectiveLooks, loadProfile } from './graphics-profile';
import type { Catalog } from './messages';
import { modelProviders } from './mods/asset-models';
import type { SimClient } from './sim-client';
import { primePlanetMaps, storePlanetMaps } from './planet-map-cache';
import {
	bootPresetFor,
	pipelineList,
	readLoadLogs,
	writeLoadLog,
	type LoadOutcome
} from './load-log';
import { activeWorldId } from './worlds/worlds';
import {
	changedSince,
	formatLoadReport,
	loadMemory,
	moduleKey,
	readEnvironment,
	remember,
	saveMemory,
	stepTimes,
	type LoadReportData,
	type LoadStepName
} from './load-report';

/** Where the world's loading stands, in order; `ready` once a frame was drawn after the warm-up. */
export type WorldLoadStep = 'sim' | 'device' | 'programs' | 'views' | 'frame' | 'ready';

export const WORLD_LOAD_STEPS: ReadonlyArray<{
	step: Exclude<WorldLoadStep, 'ready'>;
	label: string;
}> = [
	{ step: 'sim', label: 'Starting the world' },
	{ step: 'device', label: 'Starting the graphics' },
	{ step: 'programs', label: 'Compiling graphics programs' },
	{ step: 'views', label: 'Preparing the views' },
	{ step: 'frame', label: 'Drawing the first frame' }
];

/**
 * How long the graphics may stay on "Starting the graphics" before the game gives up on the backend
 * (plan 388): WebGPU then reloads the page on WebGL, and WebGL says the graphics are unavailable.
 */
export const DEVICE_TIMEOUT_MS = 20_000;

/** What the loading screen suggests when neither WebGPU nor WebGL started (plan 388). */
export const GRAPHICS_TIPS: readonly string[] = [
	'Turn on hardware acceleration in the browser settings (Chrome and Edge: System → "Use graphics acceleration when available"), then restart the browser.',
	'Update the browser and the graphics driver.',
	'Try another browser: Chrome, Edge, Firefox or Safari.',
	'Close other tabs or apps that use the graphics card, then reload.'
];

/**
 * What to do when the graphics did not start on `backend` (plan 388): reload on WebGL once, or say
 * they are unavailable (already on WebGL, the fallback was tried, or the address asks for a backend).
 */
export function afterDeviceFailure(
	backend: RendererBackend | null,
	fallbackTried: boolean,
	addressAsks: boolean
): 'reload-webgl' | 'unavailable' {
	if (backend === 'webgl' || fallbackTried || addressAsks) return 'unavailable';
	return 'reload-webgl';
}

/** What decides whether a new client can keep the renderer: the world it draws. */
export function catalogKey(c: Catalog): string {
	return JSON.stringify([
		c.home ?? null,
		c.bodies.map((b) => [
			b.id,
			b.radius,
			b.terrain ?? null,
			b.parent ?? null,
			b.star ?? false,
			b.appearance ?? null,
			b.plasma ?? null
		]),
		c.bodyTerrain ?? null,
		c.terrain ?? null,
		c.launchSite ?? null,
		c.parts.map((p) => p.id),
		c.postProfiles ?? null
	]);
}

/** The renderer's config for a world: every place's needs (Flight's part visuals, the site's buildings). */
function configOf(c: Catalog, canvas: HTMLCanvasElement, backend: RendererBackend): RendererConfig {
	return {
		backend,
		canvas,
		// the home body has the planet pass (plan 122, ADR 0119)
		...(c.home ? { home: c.home } : {}),
		...(c.bodyTerrain ? { bodyTerrain: c.bodyTerrain } : {}),
		// The root body first (the tree's order; `home` names the body with the planet pass);
		// a moon's `parent` and `orbit` let the map view draw its orbit and sphere (plan 044).
		bodies: [...c.bodies]
			.sort((x, y) => Number(x.parent !== undefined) - Number(y.parent !== undefined))
			.map((b) => ({
				id: b.id,
				radius: b.radius,
				mass: b.mass,
				atmosphere: b.atmosphere,
				// the kind of ground each body is drawn with (plan 052, ADR 0067)
				...(b.terrain ? { terrain: b.terrain } : {}),
				...(b.star ? { star: true } : {}),
				// how it looks (plan 381, ADR 0318)
				...(b.appearance ? { appearance: b.appearance } : {}),
				...(b.plasma ? { plasma: b.plasma } : {}),
				...(b.parent !== undefined && b.orbit ? { parent: b.parent, orbit: b.orbit } : {})
			})),
		// a mod's post-processing profile: the last registered (plan 405, ADR 0345)
		...(c.postProfiles && c.postProfiles.length > 0
			? { postProfile: c.postProfiles[c.postProfiles.length - 1]! }
			: {}),
		partShapes: partShapesOf(c),
		partVisuals: new Map(c.parts.flatMap((p) => (p.visual ? [[p.id, p.visual] as const] : []))),
		partAttach: new Map(c.parts.flatMap((p) => (p.attach ? [[p.id, p.attach] as const] : []))),
		partProviders: modelProviders(),
		// the start preset and the one the governor would move to first, warmed at load (plan 362)
		...graphicsStart(backend),
		// the world's terrain and Space Center (plan 084, ADR 0142)
		...(c.terrain ? { terrain: c.terrain } : {}),
		...(c.launchSite ? { launchSite: c.launchSite } : {}),
		// the player's own buildings at the site (ADR 0117): Flight and the Space Center set them
		siteBuildings: true
	};
}

class WorldRenderer {
	/** Where the loading stands (the layout's loading screen). */
	step = $state<WorldLoadStep>('sim');
	/** The precompile's progress while it compiles (the loading screen's bar). */
	progress = $state.raw<PrecompileProgress | null>(null);
	/** Why the graphics could not start, or null. */
	error = $state<string | null>(null);
	/** Pipelines built and asked for so far, and the oldest still compiling (plan 370): the loading screen's count. */
	pipelines = $state.raw<{ ready: number; total: number; current: string }>({
		ready: 0,
		total: 0,
		current: ''
	});
	/** When this load began (`performance.now()`), for the loading screen's elapsed time; null when none. */
	startedAt = $state<number | null>(null);
	/** The player chose "Continue with lower quality" during this load. */
	lowered = $state(false);
	/** Suggestions shown under `error` when the graphics could not start at all (plan 388). */
	errorTips = $state.raw<readonly string[]>([]);
	/** The backend this load draws with, once chosen. */
	private backend: RendererBackend | null = null;
	private deviceTimer: ReturnType<typeof setTimeout> | null = null;

	/** This load's entry in the stored load logs (plan 370). */
	private logId = '';
	private logWrittenAt = 0;

	/** When each loading step began (`performance.now()`), and when the world was ready (plan 370). */
	private marks: Partial<Record<LoadStepName, number>> = {};
	private readyAt: number | null = null;
	/** What the load knew at `ready`: first or cached, modules changed since the last load. */
	private loadFacts: Pick<LoadReportData, 'cache' | 'seenBefore' | 'changedModules'> | null = null;
	private offCompiles: (() => void) | null = null;
	private config: { preset: string; warmPresets: string[]; backend: string } | null = null;

	/** Every shader source the renderer kept (`orbital.debug.shaderSources` = 1), for the size analysis. */
	shaderSources(): { label: string; code: string }[] {
		return this.renderer?.compiles.sources() ?? [];
	}

	/** The step now; each change is timed for the load report. */
	private set stepNow(next: WorldLoadStep) {
		if (next === this.step) return;
		this.step = next;
		if (next === 'ready') this.finishLoad();
		else if (this.marks[next] === undefined) this.marks[next] = performance.now();
	}

	private canvasEl: HTMLCanvasElement | null = null;
	private renderer: Renderer | null = null;
	private building: Promise<Renderer> | null = null;
	private key = '';
	private client: SimClient | null = null;
	private holder: HTMLElement | null = null;
	private host: HTMLElement | null = null;
	private offSnapshot: (() => void) | null = null;
	private raf = 0;
	/** Counts `build`s, so a build that an `end` overtook does not install itself. */
	private generation = 0;
	private observer: ResizeObserver | null = null;
	private offBrightness: (() => void) | null = null;

	get ready(): boolean {
		return this.step === 'ready';
	}

	/** The one canvas; created on first use, styled to fill its host. */
	get canvas(): HTMLCanvasElement {
		if (!this.canvasEl) {
			const c = document.createElement('canvas');
			c.dataset.testid = 'world-canvas';
			c.style.cssText =
				'display:block;width:100%;height:100%;touch-action:none;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none';
			this.canvasEl = c;
			(this.host ?? this.holder)?.appendChild(c);
		}
		return this.canvasEl;
	}

	/** The layout's hidden full-viewport holder, where the canvas waits (and warms up) between pages. */
	setHolder(el: HTMLElement | null): void {
		this.holder = el;
		if (el && !this.host && this.canvasEl) el.appendChild(this.canvasEl);
		this.observeSize();
	}

	/**
	 * The renderer of the world `client` runs, built once (the layout calls this when the world's sim
	 * starts or is replaced). A new client of the same world keeps it.
	 */
	prepare(client: SimClient): Promise<Renderer> {
		if (client === this.client && this.building) return this.building;
		this.client = client;
		const generation = ++this.generation;
		const previous = this.building;
		this.building = (async () => {
			if (!this.renderer) {
				this.marks = {};
				this.readyAt = null;
				this.loadFacts = null;
				this.lowered = false;
				this.startedAt = performance.now();
				this.logId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
				this.stepNow = 'sim';
			}
			const c = await client.ready;
			if (generation !== this.generation) throw new Error('the world ended');
			const key = catalogKey(c);
			if (this.renderer && key === this.key) {
				this.follow(client);
				return this.renderer;
			}
			await previous?.catch(() => undefined);
			this.teardown();
			this.stepNow = 'device';
			// a backend that never answers (software rendering) must not hold the load (plan 388)
			this.watchDevice(generation);
			const backend = await rendererBackend();
			this.backend = backend;
			// the biome maps this world's renderer made last time (plan 364): no noise on this thread
			const stored = await primePlanetMaps(key);
			if (generation !== this.generation) throw new Error('the world ended');
			const base = configOf(c, this.canvas, backend);
			const env = readEnvironment();
			const bootPreset = bootPresetFor({
				backend,
				preset: base.preset ?? 'high',
				userAgent: env.userAgent,
				platform: env.platform,
				build: env.build,
				logs: readLoadLogs(),
				override: readBootOverride()
			});
			const config: RendererConfig = bootPreset
				? { ...base, bootPreset, onBootSwap: () => this.writeLog('ready') }
				: base;
			// the looks the player pinned (plan 404) are in place before the scene is built
			setLookChoices(effectiveLooks(loadProfile()));
			let r: Renderer;
			try {
				r = createRenderer(config);
			} catch (e) {
				this.deviceFailed(e instanceof Error ? e.message : String(e));
				throw e;
			}
			this.config = {
				backend,
				preset: config.preset ?? 'high',
				warmPresets: [...(config.warmPresets ?? [])]
			};
			this.watchCompiles(r);
			if (stored === 0) void storePlanetMaps(key);
			// the player's Brightness (Settings), now and whenever it changes, on every page of the world
			r.setBrightness(loadBrightness());
			this.offBrightness?.();
			this.offBrightness = onGraphicsChange((change) => {
				if (change.kind === 'brightness') r.setBrightness(change.level);
				else if (change.kind === 'looks') {
					setLookChoices(change.looks);
					// the same preset again: the looks read their pins, the sea's shader rebuilds if its level moved
					r.setPreset(r.preset, { governed: true });
				}
			});
			this.renderer = r;
			this.key = key;
			this.follow(client);
			this.observeSize();
			this.resize();
			let warmed = false;
			const onProgress = (p: PrecompileProgress): void => {
				if (this.renderer !== r) return;
				this.progress = p;
				if (warmed) return;
				if (p.stage === 'programs') this.stepNow = p.total > 0 ? 'programs' : 'device';
				else if (p.stage === 'warm') this.stepNow = 'views';
				else {
					warmed = true;
					this.stepNow = 'frame';
					// one frame drawn after the warm-up, by a page or by the holder's loop
					const drawnAfter = (n: number): void => {
						if (this.renderer !== r) return;
						if (n === 0) this.stepNow = 'ready';
						else requestAnimationFrame(() => drawnAfter(n - 1));
					};
					drawnAfter(2);
				}
			};
			void r
				.precompile(onProgress)
				.then(() => {
					// the background presets are in: the stored log gets their pipelines too
					if (this.renderer === r && this.ready) this.writeLog('ready');
				})
				.catch((e: unknown) => this.fail(e));
			this.loop();
			return r;
		})();
		this.building.catch((e: unknown) => {
			if (generation === this.generation && this.errorTips.length === 0) this.fail(e);
		});
		return this.building;
	}

	/**
	 * A page takes the renderer: the canvas moves into `host` (its size follows the host) and the
	 * view state is a fresh scene's. Resolves once the renderer exists.
	 */
	async acquire(host: HTMLElement, client: SimClient): Promise<Renderer> {
		this.host = host;
		host.appendChild(this.canvas);
		this.observeSize();
		const r = await this.prepare(client);
		if (this.host === host) {
			r.resetView();
			r.setRenderScale(1);
			this.resize();
		}
		return r;
	}

	/** The page is done with it: the canvas goes back to the holder; nothing is disposed. */
	release(host: HTMLElement): void {
		if (this.host !== host) return;
		this.host = null;
		if (this.canvasEl && this.holder) this.holder.appendChild(this.canvasEl);
		this.observeSize();
		this.loop();
	}

	/** The player left the world (or another tab took it): the renderer and its device go. */
	end(): void {
		this.generation++;
		if (this.deviceTimer) clearTimeout(this.deviceTimer);
		this.deviceTimer = null;
		this.errorTips = [];
		this.backend = null;
		// leaving the world on its loading screen: the stored log says where it was
		this.onPageHide();
		this.teardown();
		this.client = null;
		this.building = null;
		this.step = 'sim';
		this.startedAt = null;
		this.marks = {};
		this.readyAt = null;
		this.loadFacts = null;
		this.progress = null;
		this.error = null;
		this.canvasEl?.remove();
		this.canvasEl = null;
	}

	/**
	 * The load report (plan 370, ADR 0308): steps, renderer, cache and compile summary; null before a
	 * renderer exists. The compile part keeps growing after `ready` (the background presets).
	 */
	report(): { data: LoadReportData; text: string } | null {
		const r = this.renderer;
		const cfg = this.config;
		if (!r || !cfg) return null;
		const compile = r.compiles.summary();
		const { steps, totalMs } = stepTimes(this.marks, this.readyAt);
		const facts = this.loadFacts ?? this.cacheFacts(r, cfg);
		const data: LoadReportData = {
			when: new Date().toISOString(),
			env: readEnvironment(),
			backend: cfg.backend,
			gpu: r.capabilities().gpu ?? '',
			preset: cfg.preset,
			presetNow: r.preset,
			boot: r.debug.info().boot ?? null,
			warmPresets: cfg.warmPresets,
			steps,
			totalMs,
			...facts,
			compile
		};
		return { data, text: formatLoadReport(data) };
	}

	private cacheFacts(
		r: Renderer,
		cfg: { backend: string; preset: string }
	): Pick<LoadReportData, 'cache' | 'seenBefore' | 'changedModules'> {
		const memory = loadMemory();
		const set = r.compiles.summary(0).setHash;
		const seen = memory.sets[set] ?? null;
		return {
			cache: seen ? 'cached' : 'first',
			seenBefore: seen,
			changedModules: changedSince(
				r.compiles.modules,
				memory.modules[moduleKey(cfg.backend, cfg.preset)]
			)
		};
	}

	/** Gives up on the backend if the load is still on "Starting the graphics" after `DEVICE_TIMEOUT_MS`. */
	private watchDevice(generation: number, armedAt = performance.now()): void {
		if (this.deviceTimer) clearTimeout(this.deviceTimer);
		this.deviceTimer = setTimeout(() => {
			this.deviceTimer = null;
			if (generation !== this.generation || (this.step !== 'sim' && this.step !== 'device')) return;
			// a WebGL renderer that exists is starting, only slowly (software GL blocks the page while
			// it bakes); a timer that fired late means the page was busy, so it waits again
			if (this.renderer && this.backend === 'webgl') return;
			if (performance.now() - armedAt > DEVICE_TIMEOUT_MS + 2_000) {
				this.watchDevice(generation);
				return;
			}
			this.deviceFailed(`the graphics did not start in ${DEVICE_TIMEOUT_MS / 1000} s`);
		}, DEVICE_TIMEOUT_MS);
	}

	/** The graphics did not start: reload on WebGL once, else say they are unavailable (plan 388). */
	private deviceFailed(why: string): void {
		if (this.ready || this.errorTips.length > 0) return;
		const next = afterDeviceFailure(
			this.backend,
			loadRendererFallback() !== null,
			rendererBackendFrom(globalThis.location?.search ?? '') !== null
		);
		console.warn(`graphics: ${this.backend ?? 'the backend probe'}: ${why}; ${next}`);
		if (next === 'reload-webgl') {
			saveRendererFallback('webgl');
			this.writeLog('left');
			globalThis.location?.reload();
			return;
		}
		this.errorTips = GRAPHICS_TIPS;
		this.fail(new Error('Graphics unavailable: the browser could not start WebGPU or WebGL'));
	}

	/** The load failed: shown on the loading screen and kept in the load log. */
	private fail(e: unknown): void {
		this.error = e instanceof Error ? e.message : String(e);
		this.writeLog('error');
	}

	/**
	 * "Taking long? Continue with lower quality" (plan 370): the cheapest preset from now on (saved,
	 * so the next load starts there), the warm-up asks for its pipelines next.
	 */
	lowerQuality(): void {
		const r = this.renderer;
		if (this.ready || this.lowered) return;
		this.lowered = true;
		saveGraphicsPreset('low');
		// still starting the graphics (plan 388): the renderer takes the saved preset when it is
		// made; a WebGPU start that hangs is abandoned for WebGL now rather than at the timeout
		if (!r || this.step === 'device') {
			if (this.backend !== 'webgl') this.deviceFailed('the player chose lower quality');
			if (!r) return;
		}
		r.setPreset('low');
		// the page that holds the renderer (Flight's governor) takes it as the player's preset
		emitGraphicsChange({ kind: 'preset', choice: 'low' });
		this.writeLog('loading');
	}

	/** Writes this load's entry into the stored logs (the main menu's Developer page). */
	private writeLog(outcome: LoadOutcome): void {
		const r = this.renderer;
		const report = this.report();
		if (!r || !report || !this.logId) return;
		this.logWrittenAt = performance.now();
		writeLoadLog({
			id: this.logId,
			worldId: activeWorldId(),
			outcome,
			step: this.step,
			lowered: this.lowered,
			error: this.error,
			report: report.data,
			pipelines: pipelineList(r.compiles.pipelines)
		});
	}

	/** The tab closes on the loading screen: the log says where it was. */
	private readonly onPageHide = (): void => {
		if (this.renderer && !this.ready) this.writeLog('left');
	};

	/** At `ready`: what this load was (first or cached) is fixed and remembered for the next one. */
	private finishLoad(): void {
		this.readyAt = performance.now();
		const r = this.renderer;
		const cfg = this.config;
		if (!r || !cfg) return;
		this.loadFacts = this.cacheFacts(r, cfg);
		const start = Object.values(this.marks).reduce((a, b) => Math.min(a, b), this.readyAt);
		saveMemory(
			remember(
				loadMemory(),
				r.compiles.summary(0).setHash,
				Math.round(this.readyAt - start),
				moduleKey(cfg.backend, cfg.preset),
				r.compiles.modules
			)
		);
		const text = this.report()?.text;
		if (text) console.info(text);
		this.writeLog('ready');
	}

	private watchCompiles(r: Renderer): void {
		this.offCompiles?.();
		const count = (): void => {
			if (this.renderer !== r && this.renderer !== null) return;
			const total = r.compiles.pipelines.length;
			this.pipelines = { ready: total - r.compiles.pending, total, current: r.compiles.current() };
			// while loading, the stored log follows every few seconds (a tab killed mid-load keeps it)
			if (!this.ready && performance.now() - this.logWrittenAt > 3000) this.writeLog('loading');
		};
		this.offCompiles = r.compiles.subscribe(count);
		count();
		if (typeof window !== 'undefined') {
			window.removeEventListener('pagehide', this.onPageHide);
			window.addEventListener('pagehide', this.onPageHide);
		}
	}

	private teardown(): void {
		this.offCompiles?.();
		this.offCompiles = null;
		cancelAnimationFrame(this.raf);
		this.raf = 0;
		this.offSnapshot?.();
		this.offSnapshot = null;
		this.observer?.disconnect();
		this.observer = null;
		this.renderer?.dispose();
		this.offBrightness?.();
		this.offBrightness = null;
		this.renderer = null;
		this.key = '';
	}

	/** Snapshots reach the renderer from the holder's loop; a page's loop feeds it while it holds it. */
	private latest: Parameters<Renderer['update']>[0] | null = null;
	private follow(client: SimClient): void {
		this.offSnapshot?.();
		this.latest = client.latest;
		this.offSnapshot = client.onSnapshot((s) => (this.latest = s));
	}

	/** Draws in the holder while the world warms up and no page holds the canvas. */
	private loop(): void {
		if (this.raf !== 0) return;
		const tick = (): void => {
			this.raf = 0;
			const r = this.renderer;
			if (!r || this.host || this.ready) return;
			if (this.latest) r.update(this.latest);
			r.render();
			this.raf = requestAnimationFrame(tick);
		};
		this.raf = requestAnimationFrame(tick);
	}

	private resize(): void {
		const box = this.canvasEl?.parentElement;
		if (!box || !this.renderer) return;
		this.renderer.resize(Math.max(1, box.clientWidth), Math.max(1, box.clientHeight));
	}

	private observeSize(): void {
		this.observer?.disconnect();
		const box = this.host ?? this.holder;
		if (!box || typeof ResizeObserver === 'undefined') return;
		this.observer = new ResizeObserver(() => this.resize());
		this.observer.observe(box);
	}
}

/** `orbital.graphics.boot`: `low` boots on the cheap preset everywhere, `off` never (plan 370). */
function readBootOverride(): string | null {
	try {
		return localStorage.getItem('orbital.graphics.boot');
	} catch {
		return null;
	}
}

export const worldRenderer = new WorldRenderer();

// the load report for the measure script and for a player's console (plan 370)
if (typeof window !== 'undefined') {
	const w = window as unknown as Record<string, unknown>;
	w.__orbitalLoadReport = () => worldRenderer.report();
	w.__orbitalShaderSources = () => worldRenderer.shaderSources();
}
