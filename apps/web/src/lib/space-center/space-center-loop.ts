/**
 * The Space Center's runtime (plan 091, ADR 0117): a sim Worker with no vessel (it runs the world's
 * sites), the renderer in site mode with the site view camera, drag to orbit and wheel to zoom, and
 * each frame the label positions of the buildings for the overlay. Build mode's ghost is drawn
 * from what the page decides; the pointer's site point comes from `pick`.
 */
import type { Command, CommandResult, SimSave, Snapshot, WorldInfo } from '@orbital/core';
import { createRenderer, type Renderer, type SiteBuildingView } from '@orbital/renderer';
import { partShapesOf } from '../catalog';
import { initialGraphicsPreset, rendererBackend } from '../graphics';
import { startSimWorker } from '../sim-client';

export interface SpaceCenterOptions {
	canvas: HTMLCanvasElement;
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
	setBuildings(list: readonly SiteBuildingView[], roads: readonly { i: number; j: number }[]): void;
	setGhost(ghost: Parameters<Renderer['setSiteGhost']>[0]): void;
	/** The renderer, once the sim is up (screenshots and measurements). */
	readonly renderer: Renderer | null;
	dispose(): void;
}

export function startSpaceCenter(options: SpaceCenterOptions): SpaceCenter {
	const { canvas } = options;
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
	let pending: {
		list: readonly SiteBuildingView[];
		roads: readonly { i: number; j: number }[];
	} | null = null;
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

	function frame(): void {
		if (disposed) return;
		raf = requestAnimationFrame(frame);
		if (!renderer) return;
		if (snap && dirty) {
			renderer.update(snap);
			dirty = false;
		}
		renderer.render();
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

	client.ready.then(
		(c) => {
			if (disposed) return;
			renderer = createRenderer({
				backend: rendererBackend(),
				canvas,
				// the home body has the planet pass (plan 122, ADR 0119)
				...(c.home ? { home: c.home } : {}),
				...(c.bodyTerrain ? { bodyTerrain: c.bodyTerrain } : {}),
				bodies: [...c.bodies]
					.sort((x, y) => Number(x.parent !== undefined) - Number(y.parent !== undefined))
					.map((b) => ({
						id: b.id,
						radius: b.radius,
						mass: b.mass,
						atmosphere: b.atmosphere,
						...(b.terrain ? { terrain: b.terrain } : {}),
						...(b.star ? { star: true } : {}),
						...(b.parent !== undefined && b.orbit ? { parent: b.parent, orbit: b.orbit } : {})
					})),
				partShapes: partShapesOf(c),
				preset: initialGraphicsPreset(),
				siteBuildings: true,
				...(c.terrain ? { terrain: c.terrain } : {}),
				...(c.launchSite ? { launchSite: c.launchSite } : {})
			});
			renderer.setSiteView(true);
			if (pending) renderer.setSiteBuildings(pending.list, pending.roads);
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
		setBuildings(list, roads) {
			pending = { list, roads };
			renderer?.setSiteBuildings(list, roads);
		},
		setGhost(g) {
			ghost = g;
			renderer?.setSiteGhost(g);
		},
		get renderer() {
			return renderer;
		},
		dispose() {
			disposed = true;
			cancelAnimationFrame(raf);
			observer.disconnect();
			offSnapshot();
			canvas.removeEventListener('pointerdown', onDown);
			canvas.removeEventListener('pointermove', onMove);
			canvas.removeEventListener('pointerup', onUp);
			canvas.removeEventListener('wheel', onWheel);
			renderer?.dispose();
			offError();
			if (ownsClient) client.dispose();
		}
	};
}
