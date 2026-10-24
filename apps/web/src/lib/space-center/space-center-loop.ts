/**
 * The Space Center's runtime (plan 091, ADR 0117): a sim Worker with no vessel (it runs the world's
 * sites), the renderer in site mode with the site view camera, drag to orbit and wheel to zoom, and
 * each frame the label positions of the buildings for the overlay. Build mode's ghost is drawn
 * from what the page decides; the pointer's site point comes from `pick`.
 */
import {
	frameCapFps,
	loadFrameCap,
	onGraphicsChange,
	probeCapabilities,
	startPreset
} from '../graphics';
import type { Command, CommandResult, SimSave, Snapshot, WorldInfo } from '@orbital/core';
import { FramePacer, type Renderer, type SitePlace } from '@orbital/renderer';
import type { SiteDraw } from './site-views';
import { worldRenderer } from '../world-renderer.svelte';
import { startSimWorker } from '../sim-client';
import { PerfSource, type PerfSample } from '../perf/perf-stats';

export interface SpaceCenterOptions {
	/** Where the world's canvas goes while the Space Center shows (plan 340, ADR 0290). */
	host: HTMLElement;
	world?: WorldInfo;
	/** The world's newest save, resumed so its funds, day and crew are the world's (plan 096, ADR 0123). */
	resume?: SimSave;
	/** The world's running sim (plan 204): used instead of a Worker of its own, and left running. */
	client?: import('../sim-client').SimClient;
	/** A new snapshot (the page derives the rows and the renderer list from its `sites`). */
	onSnapshot: (snapshot: Snapshot) => void;
	/** Every frame: where each label anchor lands on screen. */
	onFrame: (
		project: (p: { east: number; north: number; up?: number }) => { x: number; y: number } | null
	) => void;
	/** A click (not a drag) on the canvas at a site point. */
	onClick: (at: { east: number; north: number } | null) => void;
	/** The pointer moved over the site (for build mode's ghost). */
	onHover: (at: { east: number; north: number } | null) => void;
	onError: (message: string) => void;
}

export interface SpaceCenter {
	dispatch(command: Command): Promise<CommandResult>;
	/** The sim's state now, to write back as the world's newest save (plan 096). */
	save(): Promise<SimSave>;
	/** Every home site's buildings at its place, and the site the view is on (plan 384, ADR 0321). */
	setBuildings(draws: readonly SiteDraw[], view?: SitePlace): void;
	setGhost(ghost: Parameters<Renderer['setSiteGhost']>[0]): void;
	/** The renderer, once the sim is up (screenshots and measurements). */
	readonly renderer: Renderer | null;
	/** The performance overlay's sample (plan 294); no governor here, so full resolution. */
	perfSample(): PerfSample;
	dispose(): void;
}

export function startSpaceCenter(options: SpaceCenterOptions): SpaceCenter {
	const canvas = worldRenderer.canvas;
	// the world's one sim when the page has it (plan 204, ADR 0201), else a Worker of its own
	const ownsClient = options.client === undefined;
	const client =
		options.client ??
		startSimWorker(
			options.resume ? { resume: options.resume } : options.world ? { world: options.world } : {}
		);
	let renderer: Renderer | null = null;
	let snap: Snapshot | null = null;
	let dirty = false;
	let disposed = false;
	let raf = 0;
	/** The drawn frames since the performance overlay's last sample (plan 294). */
	const perf = new PerfSource();
	let pending: { draws: readonly SiteDraw[]; view: SitePlace | undefined } | null = null;
	let ghost: Parameters<Renderer['setSiteGhost']>[0] = null;

	const offError = client.onError((m) => options.onError(m));
	const offSnapshot = client.onSnapshot((s) => {
		snap = s;
		dirty = true;
		options.onSnapshot(s);
	});

	const project = (p: { east: number; north: number; up?: number }) => {
		const s = renderer?.projectSite(p);
		return s && !s.hidden ? { x: s.x, y: s.y } : null;
	};

	// the frame-rate limit (Settings → Graphics) holds on this page too (system audit: Flight only)
	const pacer = new FramePacer();
	pacer.setCap(frameCapFps(loadFrameCap()));

	function frame(now: number): void {
		if (disposed) return;
		raf = requestAnimationFrame(frame);
		if (!renderer || !pacer.due(now)) return;
		if (snap && dirty) {
			renderer.update(snap);
			dirty = false;
		}
		renderer.render();
		perf.frame(now, renderer);
		options.onFrame(project);
	}

	function resize(): void {
		const parent = canvas.parentElement ?? canvas;
		renderer?.resize(Math.max(1, parent.clientWidth), Math.max(1, parent.clientHeight));
	}
	const observer = new ResizeObserver(resize);

	// --- pointer: drag orbits, wheel zooms, a click without a drag picks -------------------------
	let down: { x: number; y: number; moved: number } | null = null;
	const local = (e: PointerEvent | MouseEvent) => {
		const r = canvas.getBoundingClientRect();
		return { x: e.clientX - r.left, y: e.clientY - r.top };
	};
	const onDown = (e: PointerEvent): void => {
		down = { x: e.clientX, y: e.clientY, moved: 0 };
		canvas.setPointerCapture(e.pointerId);
	};
	const onMove = (e: PointerEvent): void => {
		if (down) {
			const dx = e.clientX - down.x;
			const dy = e.clientY - down.y;
			down.x = e.clientX;
			down.y = e.clientY;
			down.moved += Math.abs(dx) + Math.abs(dy);
			if (down.moved > 4) renderer?.orbitCamera({ dYaw: -dx * 0.005, dPitch: dy * 0.005 });
		}
		const p = local(e);
		options.onHover(renderer?.pickSite(p.x, p.y) ?? null);
	};
	const onUp = (e: PointerEvent): void => {
		const wasClick = down !== null && down.moved <= 4;
		down = null;
		if (wasClick) {
			const p = local(e);
			options.onClick(renderer?.pickSite(p.x, p.y) ?? null);
		}
	};
	const onWheel = (e: WheelEvent): void => {
		e.preventDefault();
		renderer?.orbitCamera({ zoomFactor: Math.exp(e.deltaY * 0.001) });
	};
	canvas.addEventListener('pointerdown', onDown);
	canvas.addEventListener('pointermove', onMove);
	canvas.addEventListener('pointerup', onUp);
	canvas.addEventListener('wheel', onWheel, { passive: false });

	// the world's renderer (plan 340, ADR 0290): the canvas moves here now; no device, bake or
	// shader is built for this page
	const acquired = worldRenderer.acquire(options.host, client);
	// a preset chosen in Settings applies at once on this page too (owner, 2026-10-22)
	const offGraphics = onGraphicsChange((change) => {
		if (change.kind === 'frameCap') pacer.setCap(frameCapFps(change.choice));
		if (change.kind !== 'preset' || !renderer) return;
		renderer.setPreset(
			change.choice === 'auto' ? startPreset(null, null, probeCapabilities()) : change.choice
		);
	});
	client.ready.then(
		async () => {
			const shared = await acquired.catch(() => null);
			if (disposed || !shared) return;
			renderer = shared;
			renderer.setSiteView(true, pending?.view);
			for (const d of pending?.draws ?? []) renderer.setSiteBuildings(d.views, d.roads, d.place);
			renderer.setSiteGhost(ghost);
			observer.observe(canvas.parentElement ?? canvas);
			resize();
			if (import.meta.env.DEV) {
				(window as unknown as { __orbital: unknown }).__orbital = {
					renderer: () => renderer,
					snapshot: () => snap,
					send: (command: Command) => client.dispatch(command)
				};
			}
			raf = requestAnimationFrame(frame);
		},
		(e: unknown) => options.onError(e instanceof Error ? e.message : String(e))
	);

	return {
		dispatch: (command) => client.dispatch(command),
		save: () => client.save(),
		setBuildings(draws, view) {
			pending = { draws, view };
			if (!renderer) return;
			for (const d of draws) renderer.setSiteBuildings(d.views, d.roads, d.place);
			renderer.setSiteView(true, view);
		},
		setGhost(g) {
			ghost = g;
			renderer?.setSiteGhost(g);
		},
		get renderer() {
			return renderer;
		},
		perfSample: () => perf.sample(renderer, { simMs: client.stepMs, scale: 1, auto: null }),
		dispose() {
			disposed = true;
			cancelAnimationFrame(raf);
			observer.disconnect();
			offSnapshot();
			offGraphics();
			canvas.removeEventListener('pointerdown', onDown);
			canvas.removeEventListener('pointermove', onMove);
			canvas.removeEventListener('pointerup', onUp);
			canvas.removeEventListener('wheel', onWheel);
			worldRenderer.release(options.host);
			offError();
			if (ownsClient) client.dispose();
		}
	};
}
