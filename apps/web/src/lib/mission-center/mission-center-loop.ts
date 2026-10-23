/**
 * The Mission Center's runtime (plan 113, ADR 0118): a sim Worker from the world's save (or its
 * start info), the world's shared renderer (plan 340, ADR 0290) in map view with the system scope, drag to orbit, wheel to zoom, and
 * each frame a projection for the overlay's labels and network lines. A click is handed to the page,
 * which picks with `map-pick.ts`.
 */
import {
	frameCapFps,
	loadFrameCap,
	onGraphicsChange,
	probeCapabilities,
	startPreset
} from '../graphics';
import type {
	Command,
	CommandResult,
	EntityId,
	SimSave,
	Snapshot,
	Vec3,
	WorldInfo
} from '@orbital/core';
import { FramePacer, type Renderer } from '@orbital/renderer';
import type { Catalog } from '../messages';
import { worldRenderer } from '../world-renderer.svelte';
import { startSimWorker } from '../sim-client';
import { PerfSource, type PerfSample } from '../perf/perf-stats';

export interface MissionCenterOptions {
	/** Where the world's canvas goes while the Mission Center shows (plan 340). */
	host: HTMLElement;
	resume?: SimSave;
	world?: WorldInfo;
	/** The world's running sim (plan 204): used instead of a Worker of its own, and left running. */
	client?: import('../sim-client').SimClient;
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
	/** The performance overlay's sample (plan 294); no governor here, so full resolution. */
	perfSample(): PerfSample;
	dispose(): void;
}

export function startMissionCenter(options: MissionCenterOptions): MissionCenter {
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

	const offError = client.onError((m) => options.onError(m));
	const offSnapshot = client.onSnapshot((s, warp) => {
		snap = s;
		dirty = true;
		options.onSnapshot(s, warp);
	});

	const project = (world: Vec3) => {
		const s = renderer?.project(world);
		return s ? { x: s.x, y: s.y, hidden: s.hidden === true } : null;
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
		perf.frames.frame(now);
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
		async (c) => {
			const shared = await acquired.catch(() => null);
			if (disposed || !shared) return;
			renderer = shared;
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
