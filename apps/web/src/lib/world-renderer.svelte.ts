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
import { graphicsStart, rendererBackend } from './graphics';
import type { Catalog } from './messages';
import { modelProviders } from './mods/asset-models';
import type { SimClient } from './sim-client';

/** Where the world's loading stands, in order; `ready` once a frame was drawn after the warm-up. */
export type WorldLoadStep = 'sim' | 'device' | 'programs' | 'views' | 'frame' | 'ready';

export const WORLD_LOAD_STEPS: ReadonlyArray<{ step: Exclude<WorldLoadStep, 'ready'>; label: string }> =
	[
		{ step: 'sim', label: 'Starting the world' },
		{ step: 'device', label: 'Starting the graphics' },
		{ step: 'programs', label: 'Compiling graphics programs' },
		{ step: 'views', label: 'Preparing the views' },
		{ step: 'frame', label: 'Drawing the first frame' }
	];

/** What decides whether a new client can keep the renderer: the world it draws. */
export function catalogKey(c: Catalog): string {
	return JSON.stringify([
		c.home ?? null,
		c.bodies.map((b) => [b.id, b.radius, b.terrain ?? null, b.parent ?? null, b.star ?? false]),
		c.bodyTerrain ?? null,
		c.terrain ?? null,
		c.launchSite ?? null,
		c.parts.map((p) => p.id)
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
				...(b.parent !== undefined && b.orbit ? { parent: b.parent, orbit: b.orbit } : {})
			})),
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
			if (!this.renderer) this.step = 'sim';
			const c = await client.ready;
			if (generation !== this.generation) throw new Error('the world ended');
			const key = catalogKey(c);
			if (this.renderer && key === this.key) {
				this.follow(client);
				return this.renderer;
			}
			await previous?.catch(() => undefined);
			this.teardown();
			this.step = 'device';
			const backend = await rendererBackend();
			if (generation !== this.generation) throw new Error('the world ended');
			const r = createRenderer(configOf(c, this.canvas, backend));
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
				if (p.stage === 'programs') this.step = p.total > 0 ? 'programs' : 'device';
				else if (p.stage === 'warm') this.step = 'views';
				else {
					warmed = true;
					this.step = 'frame';
					// one frame drawn after the warm-up, by a page or by the holder's loop
					const drawnAfter = (n: number): void => {
						if (this.renderer !== r) return;
						if (n === 0) this.step = 'ready';
						else requestAnimationFrame(() => drawnAfter(n - 1));
					};
					drawnAfter(2);
				}
			};
			void r.precompile(onProgress).catch((e: unknown) => {
				this.error = e instanceof Error ? e.message : String(e);
			});
			this.loop();
			return r;
		})();
		this.building.catch((e: unknown) => {
			if (generation === this.generation) this.error = e instanceof Error ? e.message : String(e);
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
		this.teardown();
		this.client = null;
		this.building = null;
		this.step = 'sim';
		this.progress = null;
		this.error = null;
		this.canvasEl?.remove();
		this.canvasEl = null;
	}

	private teardown(): void {
		cancelAnimationFrame(this.raf);
		this.raf = 0;
		this.offSnapshot?.();
		this.offSnapshot = null;
		this.observer?.disconnect();
		this.observer = null;
		this.renderer?.dispose();
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

export const worldRenderer = new WorldRenderer();
