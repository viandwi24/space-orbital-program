/**
 * The Mission Center's runtime (plan 113, ADR 0118): a sim Worker from the world's save (or its
 * start info), the renderer in map view with the system scope, drag to orbit, wheel to zoom, and
 * each frame a projection for the overlay's labels and network lines. A click is handed to the page,
 * which picks with `map-pick.ts`.
 */
import type {
	Command,
	CommandResult,
	EntityId,
	SimSave,
	Snapshot,
	Vec3,
	WorldInfo
} from '@orbital/core';
import { createRenderer, type Renderer } from '@orbital/renderer';
import { partShapesOf } from '../catalog';
import type { Catalog } from '../messages';
import { initialGraphicsPreset } from '../graphics';
import { startSimWorker } from '../sim-client';

export interface MissionCenterOptions {
	canvas: HTMLCanvasElement;
	resume?: SimSave;
	world?: WorldInfo;
	/** The save's vessel in focus: the map's active vessel (its path and sphere). */
	focus: number | null;
	/** The sim booted: its bodies and parts. */
	onReady: (catalog: Catalog) => void;
	/** A new snapshot and the sim's time warp when it reports one. */
	onSnapshot: (snapshot: Snapshot, warp?: number) => void;
	/**
	 * Every frame: CSS pixel of a system-frame point, or null when behind the camera; `hidden` when a
	 * body is in the way (a body's own centre is always hidden by itself).
	 */
	onFrame: (project: (world: Vec3) => { x: number; y: number; hidden: boolean } | null) => void;
	/** A click (not a drag) at a CSS pixel of the canvas. */
	onClick: (x: number, y: number) => void;
	onError: (message: string) => void;
}

export interface MissionCenter {
	dispatch(command: Command): Promise<CommandResult>;
	/** The sim's state now, for the Fly autosave. */
	save(): Promise<SimSave>;
	readonly renderer: Renderer | null;
	dispose(): void;
}

export function startMissionCenter(options: MissionCenterOptions): MissionCenter {
	const { canvas } = options;
	const client = startSimWorker(
		options.resume ? { resume: options.resume } : options.world ? { world: options.world } : {}
	);
	let renderer: Renderer | null = null;
	let snap: Snapshot | null = null;
	let dirty = false;
	let disposed = false;
	let raf = 0;

	client.onError((m) => options.onError(m));
	const offSnapshot = client.onSnapshot((s, warp) => {
		snap = s;
		dirty = true;
		options.onSnapshot(s, warp);
	});

	const project = (world: Vec3) => {
		const s = renderer?.project(world);
		return s ? { x: s.x, y: s.y, hidden: s.hidden === true } : null;
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
	const onDown = (e: PointerEvent): void => {
		down = { x: e.clientX, y: e.clientY, moved: 0 };
		canvas.setPointerCapture(e.pointerId);
	};
	const onMove = (e: PointerEvent): void => {
		if (!down) return;
		const dx = e.clientX - down.x;
		const dy = e.clientY - down.y;
		down.x = e.clientX;
		down.y = e.clientY;
		down.moved += Math.abs(dx) + Math.abs(dy);
		if (down.moved > 4) renderer?.orbitCamera({ dYaw: -dx * 0.005, dPitch: dy * 0.005 });
	};
	const onUp = (e: PointerEvent): void => {
		const wasClick = down !== null && down.moved <= 4;
		down = null;
		if (wasClick) {
			const r = canvas.getBoundingClientRect();
			options.onClick(e.clientX - r.left, e.clientY - r.top);
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
				...(c.terrain ? { terrain: c.terrain } : {}),
				...(c.launchSite ? { launchSite: c.launchSite } : {})
			});
			renderer.setMapView(true);
			renderer.setMapScope('system');
			if (options.focus !== null) renderer.setActiveVessel(options.focus as EntityId);
			observer.observe(canvas.parentElement ?? canvas);
			resize();
			options.onReady(c);
			if (import.meta.env.DEV) {
				(window as unknown as { __orbital: unknown }).__orbital = {
					renderer: () => renderer,
					snapshot: () => snap,
					send: (command: Command) => client.dispatch(command),
					frameIntervals: (frames = 300) =>
						new Promise<{ meanMs: number; p50Ms: number; p95Ms: number }>((resolve) => {
							const out: number[] = [];
							let last = performance.now();
							const tick = (now: number): void => {
								out.push(now - last);
								last = now;
								if (out.length < frames) return void requestAnimationFrame(tick);
								const sorted = out.slice(1).sort((a, b) => a - b);
								const at = (q: number): number => sorted[Math.floor(q * (sorted.length - 1))]!;
								const meanMs = sorted.reduce((a, b) => a + b, 0) / sorted.length;
								resolve({ meanMs, p50Ms: at(0.5), p95Ms: at(0.95) });
							};
							requestAnimationFrame(tick);
						})
				};
			}
			raf = requestAnimationFrame(frame);
		},
		(e: unknown) => options.onError(e instanceof Error ? e.message : String(e))
	);

	return {
		dispatch: (command) => client.dispatch(command),
		save: () => client.save(),
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
			client.dispose();
		}
	};
}
