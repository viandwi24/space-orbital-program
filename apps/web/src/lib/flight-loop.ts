/**
 * The flight screen's engine room, deliberately outside Svelte reactivity: the Worker client, the
 * renderer, the rAF loop and the keyboard live here as plain TypeScript. Svelte only receives a
 * ~10 Hz `FlightHud` copy through `onHud` and paints it.
 */
import type { Command, EntityId, Snapshot, VesselDesign } from '@orbital/core';
import { createRenderer, type PartShape, type Renderer } from '@orbital/renderer';
import type { Catalog } from './messages';
import { idleScript, reduceScript, type ScriptView } from './script-state';
import { startSimWorker, type SimClient } from './sim-client';
import { computeTelemetry, type Telemetry } from './telemetry';

export const WARP_STEPS = [1, 2, 5, 10, 50, 100, 1_000, 10_000, 100_000] as const;
/** Throttle change per second while Shift/Ctrl is held. */
const THROTTLE_RATE = 0.5;
const HUD_PERIOD_MS = 100;
const MESSAGE_MS = 4_000;

export interface FlightHud {
	status: 'booting' | 'flying' | 'lost' | 'error';
	/** Human-readable detail for `error`/`lost`, or the last refusal/notice. */
	message: string;
	vesselName: string;
	telemetry: Telemetry | null;
	throttle: number;
	/** Stage commands accepted so far / stages in the design. */
	stagesDone: number;
	stagesTotal: number;
	warp: number;
	map: boolean;
	autopilot: string | null;
}

export interface FlightOptions {
	canvas: HTMLCanvasElement;
	design: VesselDesign;
	onHud(hud: FlightHud): void;
	/** Script status and print output, at HUD rate and only when something changed. */
	onScript?(view: ScriptView): void;
}

export interface Flight {
	/** Run `source` against the active vessel in the sim Worker (replaces a running script). */
	runScript(source: string): void;
	stopScript(): void;
	dispose(): void;
}

export function partShapesOf(catalog: Catalog): Map<string, PartShape> {
	const shapes = new Map<string, PartShape>();
	for (const p of catalog.parts) {
		const s = p.shape;
		if (!s) continue;
		shapes.set(
			p.id,
			s.kind === 'box'
				? { kind: 'box', size: { x: s.size[0], y: s.size[1], z: s.size[2] } }
				: { kind: 'cylinder', radius: s.radius, height: s.height }
		);
	}
	return shapes;
}

export function startFlight(options: FlightOptions): Flight {
	const { canvas, design } = options;
	const client: SimClient = startSimWorker();
	let renderer: Renderer | null = null;
	let catalog: Catalog | null = null;
	let vessel: EntityId | null = null;
	let snap: Snapshot | null = null;
	let dirty = false;
	let disposed = false;
	let raf = 0;
	let lastFrame = 0;
	let lastHud = 0;

	const hud: FlightHud = {
		status: 'booting',
		message: 'starting the simulation',
		vesselName: design.name,
		telemetry: null,
		throttle: 0,
		stagesDone: 0,
		stagesTotal: design.stages.length,
		warp: 1,
		map: false,
		autopilot: null
	};
	let script: ScriptView = idleScript();
	let scriptDirty = false;
	let messageUntil = 0;
	const notice = (text: string): void => {
		hud.message = text;
		messageUntil = performance.now() + MESSAGE_MS;
	};
	const publish = (): void =>
		options.onHud({ ...hud, telemetry: hud.telemetry && { ...hud.telemetry } });

	const send = (command: Command): Promise<boolean> =>
		client.dispatch(command).then((result) => {
			if (!result.ok) notice(`${command.type}: ${result.reason}`);
			return result.ok;
		});

	// --- input state -------------------------------------------------------------------------
	const held = new Set<string>();
	let throttle = 0;
	let sentThrottle = 0;
	let sentAttitude = '0,0,0';
	let warpIndex = 0;
	let auto: { update(s: Snapshot): unknown; phase: string; note: string } | null = null;

	const axis = (neg: string, pos: string): number =>
		(held.has(pos) ? 1 : 0) - (held.has(neg) ? 1 : 0);

	function sendInput(dt: number): void {
		if (vessel === null) return;
		const up = held.has('ShiftLeft') || held.has('ShiftRight');
		const down = held.has('ControlLeft') || held.has('ControlRight');
		throttle = Math.min(
			1,
			Math.max(0, throttle + ((up ? 1 : 0) - (down ? 1 : 0)) * THROTTLE_RATE * dt)
		);
		if (!auto && Math.abs(throttle - sentThrottle) > 0.004) {
			sentThrottle = throttle;
			void send({ type: 'throttle', vessel, value: throttle });
		}
		if (!auto) {
			const a = [axis('KeyS', 'KeyW'), axis('KeyA', 'KeyD'), axis('KeyQ', 'KeyE')];
			const key = a.join(',');
			if (key !== sentAttitude) {
				sentAttitude = key;
				void send({ type: 'attitude', vessel, pitch: a[0]!, yaw: a[1]!, roll: a[2]! });
			}
		}
	}

	function setWarp(index: number): void {
		const next = Math.min(WARP_STEPS.length - 1, Math.max(0, index));
		const factor = WARP_STEPS[next]!;
		void send({ type: 'warp', factor }).then((ok) => {
			if (ok) {
				warpIndex = next;
				hud.warp = factor;
			}
		});
	}

	/** Typing in the script panel must not fly the vessel (Space stages, WASD steers). */
	const typingInField = (e: KeyboardEvent): boolean => {
		const target = e.target;
		return (
			target instanceof HTMLTextAreaElement ||
			target instanceof HTMLInputElement ||
			(target instanceof HTMLElement && target.isContentEditable)
		);
	};

	function onKeyDown(e: KeyboardEvent): void {
		if (e.repeat || typingInField(e)) return;
		// Punctuation by character so it works on any layout; everything else by physical key.
		const code = e.key === ',' ? 'Comma' : e.key === '.' ? 'Period' : e.code;
		held.add(code);
		switch (code) {
			case 'KeyZ':
				throttle = 1;
				break;
			case 'KeyX':
				throttle = 0;
				break;
			case 'Space':
				e.preventDefault();
				if (vessel !== null) {
					void send({ type: 'stage', vessel }).then((ok) => {
						if (ok) hud.stagesDone++;
					});
				}
				break;
			case 'KeyM':
				hud.map = renderer?.toggleMapView() ?? false;
				break;
			case 'Comma':
				setWarp(warpIndex - 1);
				break;
			case 'Period':
				setWarp(warpIndex + 1);
				break;
			case 'KeyP':
				if (import.meta.env.DEV) void toggleAutopilot();
				break;
		}
	}
	const onKeyUp = (e: KeyboardEvent): void => {
		held.delete(e.code);
		held.delete(e.key === ',' ? 'Comma' : e.key === '.' ? 'Period' : e.code);
	};
	const onBlur = (): void => held.clear();

	let dragging = false;
	const onPointerDown = (e: PointerEvent): void => {
		dragging = true;
		canvas.setPointerCapture(e.pointerId);
	};
	const onPointerUp = (): void => void (dragging = false);
	const onPointerMove = (e: PointerEvent): void => {
		if (dragging)
			renderer?.orbitCamera({ dYaw: -e.movementX * 0.005, dPitch: e.movementY * 0.005 });
	};
	const onWheel = (e: WheelEvent): void => {
		e.preventDefault();
		renderer?.orbitCamera({ zoomFactor: Math.exp(e.deltaY * 0.001) });
	};

	async function toggleAutopilot(): Promise<void> {
		if (auto) {
			auto = null;
			hud.autopilot = null;
			return;
		}
		if (!catalog || vessel === null) return;
		const { createAutopilot } = await import('./autopilot');
		const body = catalog.bodies[0];
		if (!body) return;
		const id = vessel;
		const ap = createAutopilot({
			vessel: id,
			body,
			parts: catalog.parts,
			resources: catalog.resources,
			send: (c) => {
				// Keep the HUD's throttle and stage counter truthful for commands the autopilot sends.
				if (c.type === 'throttle') throttle = sentThrottle = c.value;
				void send(c).then((ok) => {
					if (ok && c.type === 'stage') hud.stagesDone++;
				});
			}
		});
		auto = ap;
		hud.autopilot = 'on';
	}

	// --- render loop -------------------------------------------------------------------------
	function frame(now: number): void {
		if (disposed) return;
		raf = requestAnimationFrame(frame);
		const dt = Math.min((now - lastFrame) / 1000, 0.1);
		lastFrame = now;
		sendInput(dt);
		if (renderer && snap && dirty) {
			renderer.update(snap);
			dirty = false;
		}
		renderer?.render();
		if (now - lastHud >= HUD_PERIOD_MS) {
			lastHud = now;
			if (catalog && vessel !== null && snap) {
				hud.telemetry = computeTelemetry(snap, vessel, catalog.bodies);
				if (!hud.telemetry && hud.status === 'flying') {
					hud.status = 'lost';
					hud.message = 'the vessel was destroyed';
				}
			}
			hud.throttle = throttle;
			if (auto) hud.autopilot = `${auto.phase}: ${auto.note}`;
			if (messageUntil && now > messageUntil && hud.status === 'flying') {
				hud.message = '';
				messageUntil = 0;
			}
			publish();
			if (scriptDirty) {
				scriptDirty = false;
				options.onScript?.(script);
			}
		}
	}

	function resize(): void {
		const parent = canvas.parentElement ?? canvas;
		renderer?.resize(Math.max(1, parent.clientWidth), Math.max(1, parent.clientHeight));
	}
	const observer = new ResizeObserver(resize);

	// --- boot --------------------------------------------------------------------------------
	client.onSnapshot((s) => {
		snap = s;
		dirty = true;
		auto?.update(s);
	});
	client.onScript((event) => {
		script = reduceScript(script, event);
		scriptDirty = true;
	});
	client.onError((message) => {
		hud.status = 'error';
		hud.message = message;
		publish();
	});
	client.ready.then(
		async (c) => {
			if (disposed) return;
			catalog = c;
			renderer = createRenderer({
				canvas,
				bodies: c.bodies.map((b) => ({ id: b.id, radius: b.radius })),
				partShapes: partShapesOf(c)
			});
			resize();
			const result = await client.dispatch({ type: 'load-vessel', design });
			if (!result.ok || result.vessel === undefined) {
				hud.status = 'error';
				hud.message = `launch refused: ${result.ok ? 'no vessel id returned' : result.reason}`;
				publish();
				return;
			}
			vessel = result.vessel;
			renderer.setActiveVessel(vessel);
			hud.status = 'flying';
			hud.message = '';
			publish();
		},
		(error: unknown) => {
			hud.status = 'error';
			hud.message = error instanceof Error ? error.message : String(error);
			publish();
		}
	);

	window.addEventListener('keydown', onKeyDown);
	window.addEventListener('keyup', onKeyUp);
	window.addEventListener('blur', onBlur);
	canvas.addEventListener('pointerdown', onPointerDown);
	canvas.addEventListener('pointerup', onPointerUp);
	canvas.addEventListener('pointermove', onPointerMove);
	canvas.addEventListener('wheel', onWheel, { passive: false });
	observer.observe(canvas.parentElement ?? canvas);
	lastFrame = performance.now();
	raf = requestAnimationFrame(frame);
	publish();

	if (import.meta.env.DEV) {
		// Debug hook for the manual run (journal 009): capture the canvas plus a text HUD overlay.
		(window as unknown as { __orbital: unknown }).__orbital = {
			hud: () => ({ ...hud }),
			snapshot: () => snap,
			send: (c: Command) => client.dispatch(c),
			screenshot: (lines: string[]) => {
				renderer?.render();
				const out = document.createElement('canvas');
				out.width = canvas.width;
				out.height = canvas.height;
				const ctx = out.getContext('2d')!;
				ctx.drawImage(canvas, 0, 0);
				ctx.font = '16px monospace';
				ctx.fillStyle = 'rgba(0,0,0,0.55)';
				ctx.fillRect(8, 8, 520, 22 * lines.length + 10);
				ctx.fillStyle = '#e8eef5';
				lines.forEach((l, i) => ctx.fillText(l, 16, 28 + i * 22));
				return out.toDataURL('image/png');
			}
		};
	}

	return {
		runScript(source) {
			if (vessel === null) return;
			client.startScript(source, Number(vessel));
		},
		stopScript() {
			client.stopScript();
		},
		dispose() {
			disposed = true;
			cancelAnimationFrame(raf);
			observer.disconnect();
			window.removeEventListener('keydown', onKeyDown);
			window.removeEventListener('keyup', onKeyUp);
			window.removeEventListener('blur', onBlur);
			canvas.removeEventListener('pointerdown', onPointerDown);
			canvas.removeEventListener('pointerup', onPointerUp);
			canvas.removeEventListener('pointermove', onPointerMove);
			canvas.removeEventListener('wheel', onWheel);
			renderer?.dispose();
			client.dispose();
		}
	};
}
