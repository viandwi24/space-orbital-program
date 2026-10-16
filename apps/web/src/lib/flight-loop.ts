/**
 * The flight screen's engine room, deliberately outside Svelte reactivity: the Worker client, the
 * renderer, the rAF loop and the keyboard live here as plain TypeScript. Svelte only receives a
 * ~10 Hz `FlightHud` copy through `onHud` and paints it.
 */
import type { Command, EntityId, Snapshot, VesselDesign } from '@orbital/core';
import { createRenderer, type GraphicsPreset, type Renderer } from '@orbital/renderer';
import { partShapesOf } from './catalog';
import { initialGraphicsPreset, saveGraphicsPreset } from './graphics';
import type { Catalog } from './messages';
import { idleScript, reduceScript, scriptIsActive, type ScriptView } from './script-state';
import type { ScriptSandbox } from './script-sandbox';
import { startSimWorker, type SimClient } from './sim-client';
import { computeTelemetry, type Telemetry } from './telemetry';
import { createVesselPresence } from './vessel-presence';
import type { ContentLookups } from './delta-v';
import { WARP_STEPS } from './warp';
import {
	createHudController,
	type FrameData,
	type HudController,
	type HudModel
} from './hud-controller';

/** Throttle change per second while Shift/Ctrl is held. */
const THROTTLE_RATE = 0.5;
const HUD_PERIOD_MS = 100;

export interface FlightHud {
	status: 'booting' | 'flying' | 'lost' | 'error';
	/** Human-readable detail for `booting`, `error` and `lost`. */
	message: string;
	vesselName: string;
	telemetry: Telemetry | null;
	throttle: number;
	/** Everything the HUD panels show (plan 021); null until the first snapshot of the vessel. */
	model: HudModel | null;
	/** The sim clock is frozen (pause menu). */
	paused: boolean;
	warp: number;
	map: boolean;
	autopilot: string | null;
}

export interface FlightOptions {
	canvas: HTMLCanvasElement;
	design: VesselDesign;
	/** Parts, modules and resources for the HUD's stage maths (plan 021). */
	content: ContentLookups;
	onHud(hud: FlightHud): void;
	/** Every render frame, with what the canvas widgets draw (navball, map markers); no Svelte here. */
	onFrame?(frame: FrameData): void;
	/** Esc (pause menu) and `?`/F1 (help overlay) were pressed. */
	onKey?(key: 'escape' | 'help'): void;
	/** Script status and print output, at HUD rate and only when something changed. */
	onScript?(view: ScriptView): void;
	/**
	 * Where scripts run (ADR 0038): a sandboxed iframe with the script Worker in it. Without one
	 * (tests, a browser that cannot provide it) Run reports a failed script.
	 */
	sandbox?: ScriptSandbox;
}

export interface Flight {
	/** Run `source` against the active vessel in the sim Worker (replaces a running script). */
	runScript(source: string): void;
	stopScript(): void;
	/** Step the time warp by `delta` entries of `WARP_STEPS` (the sim refuses it unless every vessel is on rails). */
	stepWarp(delta: number): void;
	/** Switch the graphics preset now and remember it (plan 019; the settings screen of plan 023 calls this). */
	setGraphicsPreset(preset: GraphicsPreset): void;
	/** Fire the next stage (the button next to the stage stack). */
	stage(): void;
	toggleMap(): void;
	cycleSpeedMode(): void;
	/** Freeze or resume the sim (pause menu). */
	setPaused(paused: boolean): void;
	/** While a dialog is open the flight keys do nothing. */
	setModal(open: boolean): void;
	dispose(): void;
}

export function startFlight(options: FlightOptions): Flight {
	const { canvas, design } = options;
	const client: SimClient = startSimWorker();
	let renderer: Renderer | null = null;
	let catalog: Catalog | null = null;
	let vessel: EntityId | null = null;
	let snap: Snapshot | null = null;
	/** Whether the vessel is still in the sim; only snapshots taken after the load count (plan 047). */
	const presence = createVesselPresence();
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
		model: null,
		paused: false,
		warp: 1,
		map: false,
		autopilot: null
	};
	// Dev-only cost counters for the HUD (journal 021): per-frame paint and 10 Hz model build.
	const stats = {
		n: { paint: 0, model: 0 },
		total: { paint: 0, model: 0 },
		max: { paint: 0, model: 0 },
		add(kind: 'paint' | 'model', ms: number): void {
			this.n[kind]++;
			this.total[kind] += ms;
			this.max[kind] = Math.max(this.max[kind], ms);
		}
	};
	let hudCtl: HudController | null = null;
	let modal = false;
	let script: ScriptView = idleScript();
	let scriptDirty = false;
	/** Counts Runs and Stops, so a sandbox that finishes starting after a newer action is dropped. */
	let scriptRun = 0;
	const publish = (): void =>
		options.onHud({ ...hud, telemetry: hud.telemetry && { ...hud.telemetry } });

	const send = (command: Command): Promise<boolean> =>
		client.dispatch(command).then((result) => {
			if (!result.ok) hudCtl?.refused(command.type, result.reason);
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
		if (e.key === 'Escape' && !e.repeat) {
			// The dialog closes itself on Escape; this only opens the menu.
			if (!modal) {
				// Without this the same keypress would also cancel the dialog it just opened.
				e.preventDefault();
				options.onKey?.('escape');
			}
			return;
		}
		if (modal || e.repeat || typingInField(e)) return;
		if (e.key === '?' || e.key === 'F1') {
			e.preventDefault();
			options.onKey?.('help');
			return;
		}
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
				if (vessel !== null) void send({ type: 'stage', vessel });
				break;
			case 'KeyM':
				toggleMap();
				break;
			case 'KeyV':
				hudCtl?.cycleSpeedMode();
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
		if (dragging) {
			const input = { dYaw: -e.movementX * 0.005, dPitch: e.movementY * 0.005 };
			renderer?.orbitCamera(input);
		}
	};
	const onWheel = (e: WheelEvent): void => {
		e.preventDefault();
		const input = { zoomFactor: Math.exp(e.deltaY * 0.001) };
		renderer?.orbitCamera(input);
	};

	function toggleMap(): void {
		hud.map = renderer?.toggleMapView() ?? false;
		hudCtl?.setMapView(hud.map);
	}

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
				// Keep the HUD's throttle truthful for commands the autopilot sends.
				if (c.type === 'throttle') throttle = sentThrottle = c.value;
				void send(c);
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
		if (hudCtl) {
			const t0 = performance.now();
			options.onFrame?.(hudCtl.frame());
			if (import.meta.env.DEV) stats.add('paint', performance.now() - t0);
		}
		if (now - lastHud >= HUD_PERIOD_MS) {
			lastHud = now;
			if (catalog && vessel !== null && snap) {
				hud.telemetry = computeTelemetry(snap, vessel, catalog.bodies);
				if (presence.lost() && hud.status === 'flying') {
					hud.status = 'lost';
					hud.message = 'the vessel was destroyed';
				}
			}
			hud.throttle = throttle;
			const t0 = performance.now();
			hud.model = hudCtl?.model(now, throttle) ?? null;
			if (import.meta.env.DEV) stats.add('model', performance.now() - t0);
			if (auto) hud.autopilot = `${auto.phase}: ${auto.note}`;
			publish();
			if (scriptDirty) {
				scriptDirty = false;
				options.onScript?.(script);
			}
		}
	}

	function resize(): void {
		const parent = canvas.parentElement ?? canvas;
		const w = Math.max(1, parent.clientWidth);
		const h = Math.max(1, parent.clientHeight);
		renderer?.resize(w, h);
	}
	const observer = new ResizeObserver(resize);

	// --- boot --------------------------------------------------------------------------------
	client.onSnapshot((s) => {
		snap = s;
		presence.snapshot(s);
		hudCtl?.snapshot(s);
		dirty = true;
		auto?.update(s);
	});
	client.onStage((event) => hudCtl?.stage(event));
	client.onSimEvent((event) => hudCtl?.simEvent(event));
	client.onScript((event) => {
		script = reduceScript(script, event);
		scriptDirty = true;
		// The script ended (or never ran): removing the iframe also kills a Worker that is still
		// spinning inside a native builtin (ADR 0038).
		if (event.kind === 'script-status' && !scriptIsActive(event.status)) options.sandbox?.close();
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
			hudCtl = createHudController({
				design,
				content: options.content,
				bodies: c.bodies,
				project: (world) => renderer?.project(world) ?? null
			});
			renderer = createRenderer({
				canvas,
				bodies: c.bodies.map((b) => ({ id: b.id, radius: b.radius, atmosphere: b.atmosphere })),
				partShapes: partShapesOf(c),
				partVisuals: new Map(c.parts.flatMap((p) => (p.visual ? [[p.id, p.visual] as const] : []))),
				partAttach: new Map(c.parts.flatMap((p) => (p.attach ? [[p.id, p.attach] as const] : []))),
				preset: initialGraphicsPreset()
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
			presence.attach(vessel);
			hudCtl.attach(Number(vessel));
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
			hudStats: () => ({
				paintAvgMs: stats.total.paint / Math.max(1, stats.n.paint),
				paintMaxMs: stats.max.paint,
				modelAvgMs: stats.total.model / Math.max(1, stats.n.model),
				modelMaxMs: stats.max.model,
				frames: stats.n.paint
			}),
			renderer: () => renderer,
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
			const target = Number(vessel);
			const run = ++scriptRun;
			const show = (status: 'starting' | 'failed', error?: string): void => {
				script = reduceScript(script, {
					kind: 'script-status',
					status,
					...(error === undefined ? {} : { error }),
					lastMs: 0,
					maxMs: 0
				});
				scriptDirty = true;
			};
			const sandbox = options.sandbox;
			if (!sandbox) return show('failed', 'scripting is not available here');
			show('starting');
			sandbox.open().then(
				(port) => {
					if (run === scriptRun && !disposed) client.startScript(source, target, port);
					else port.close();
				},
				(error: unknown) => {
					// A newer Run (or Stop) closed this sandbox while it started: nothing to report.
					if (run === scriptRun && !disposed) {
						show(
							'failed',
							`script sandbox: ${error instanceof Error ? error.message : String(error)}`
						);
					}
				}
			);
		},
		stopScript() {
			scriptRun += 1;
			client.stopScript();
			options.sandbox?.close();
		},
		setGraphicsPreset(preset) {
			saveGraphicsPreset(preset);
			renderer?.setPreset(preset);
		},
		stepWarp(delta) {
			setWarp(warpIndex + delta);
		},
		stage() {
			if (vessel !== null) void send({ type: 'stage', vessel });
		},
		toggleMap,
		cycleSpeedMode() {
			hudCtl?.cycleSpeedMode();
		},
		setPaused(paused) {
			hud.paused = paused;
			client.setPaused(paused);
		},
		setModal(open) {
			modal = open;
			if (open) held.clear();
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
			options.sandbox?.close();
			client.dispose();
		}
	};
}
