/**
 * The flight screen's engine room, deliberately outside Svelte reactivity: the Worker client, the
 * renderer, the rAF loop and the keyboard live here as plain TypeScript. Svelte only receives a
 * ~10 Hz `FlightHud` copy through `onHud` and paints it.
 */
import {
	entityId,
	type Command,
	type EntityId,
	type SasMode,
	type Snapshot,
	type VesselDesign
} from '@orbital/core';
import {
	QualityGovernor,
	createRenderer,
	type GovernorLevel,
	type GraphicsPreset,
	type Renderer
} from '@orbital/renderer';
import { pageAudio } from './audio/audio';
import { createDirector, type AudioFlightView } from './audio/director';
import { partShapesOf } from './catalog';
import {
	clearGraphicsPreset,
	initialGraphicsPreset,
	loadAutoQuality,
	probeCapabilities,
	resolvePreset,
	saveAutoQuality,
	saveGraphicsPreset
} from './graphics';
import { modeForAction } from './hud/sas-model';
import { DEFAULT_KEYMAP, keyIdOf, type ActionId, type Keymap } from './keybindings';
import type { Catalog } from './messages';
import { idleScript, reduceScript, scriptIsActive, type ScriptView } from './script-state';
import type { ScriptSandbox } from './script-sandbox';
import { startSimWorker, type SimClient } from './sim-client';
import { createManeuverController, type ManeuverController } from './maneuver-controller';
import { computeTelemetry, type Telemetry } from './telemetry';
import { createVesselPresence } from './vessel-presence';
import type { ContentLookups } from './delta-v';
import { resumeInfo, type GameSave } from './save/game-save';
import type { SaveRequest } from './save/saves';
import { captureThumbnail } from './save/thumbnail';
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
	/** The key map in force (plan 053, ADR 0061); read on every key event, so rebinding applies at once. */
	keymap?: () => Keymap;
	/** Esc (pause menu), help, quicksave and quickload were pressed (by their keys now in force). */
	onKey?(key: 'escape' | 'help' | 'quicksave' | 'quickload'): void;
	/** A loaded flight (plan 043): the sim resumes it instead of launching `design`, which is the save's own. */
	resume?: GameSave;
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
	setGraphicsPreset(preset: GraphicsPreset | 'auto'): void;
	/** Whether the quality governor may lower resolution and preset when the view runs slow (plan 039, ADR 0053). */
	readonly autoQuality: boolean;
	/** Turn the governor on or off and remember it; off restores the player's preset at full resolution. */
	setAutoQuality(on: boolean): void;
	/** Fire the next stage (the button next to the stage stack). */
	stage(): void;
	/** The map view's maneuver planner (plan 045); null until the sim has started. */
	readonly maneuver: ManeuverController | null;
	/** Time warp to the burn of the earliest maneuver node. */
	warpToNode(): void;
	/** Remove the earliest maneuver node. */
	removeNode(): void;
	toggleMap(): void;
	cycleSpeedMode(): void;
	/** Ask for a stability assist mode (the SAS buttons next to the navball; plan 042). */
	setSas(mode: SasMode): void;
	/** Freeze or resume the sim (pause menu). */
	setPaused(paused: boolean): void;
	/** Everything a save needs from the running flight (plan 043); rejects when there is no vessel to save. */
	collectSave(): Promise<SaveRequest>;
	/** While a dialog is open the flight keys do nothing. */
	setModal(open: boolean): void;
	/** Pixels of the view the interface panels cover; the camera centres the vessel in the rest (plan 023). */
	setViewInsets(insets: { top: number; right: number; bottom: number; left: number }): void;
	dispose(): void;
}

export function startFlight(options: FlightOptions): Flight {
	const { canvas, design } = options;
	const client: SimClient = startSimWorker(options.resume ? { resume: options.resume.sim } : {});
	let renderer: Renderer | null = null;
	let governor: QualityGovernor | null = null;
	let autoQuality = loadAutoQuality();
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
	/** Sound (plan 053, ADR 0062): the director reads `audioView`, refreshed with the 10 Hz HUD model. */
	const director = createDirector(pageAudio());
	let audioView: AudioFlightView | null = null;
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

	const keymap = (): Keymap => options.keymap?.() ?? DEFAULT_KEYMAP;
	/** Any key of the action is down (held keys are key ids, `keybindings.ts`). */
	const isHeld = (action: ActionId): boolean =>
		keymap()
			.keys(action)
			.some((k) => held.has(k));
	const axis = (neg: ActionId, pos: ActionId): number =>
		(isHeld(pos) ? 1 : 0) - (isHeld(neg) ? 1 : 0);

	function sendInput(dt: number): void {
		if (vessel === null) return;
		const up = isHeld('throttleUp');
		const down = isHeld('throttleDown');
		throttle = Math.min(
			1,
			Math.max(0, throttle + ((up ? 1 : 0) - (down ? 1 : 0)) * THROTTLE_RATE * dt)
		);
		if (!auto && Math.abs(throttle - sentThrottle) > 0.004) {
			sentThrottle = throttle;
			void send({ type: 'throttle', vessel, value: throttle });
		}
		if (!auto) {
			const a = [
				axis('pitchMinus', 'pitchPlus'),
				axis('yawMinus', 'yawPlus'),
				axis('rollMinus', 'rollPlus')
			];
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
		const id = keyIdOf(e);
		const action = keymap().actionFor('flight', id);
		held.add(id);
		switch (action) {
			case 'quicksave':
			case 'quickload':
				// The browser would reload the page (F5); in flight the keys are quicksave and quickload.
				e.preventDefault();
				options.onKey?.(action);
				break;
			case 'help':
				e.preventDefault();
				options.onKey?.('help');
				break;
			case 'throttleFull':
				throttle = 1;
				break;
			case 'throttleCut':
				throttle = 0;
				break;
			case 'stage':
				e.preventDefault();
				if (vessel !== null) void send({ type: 'stage', vessel });
				break;
			case 'map':
				toggleMap();
				break;
			case 'mapFocus':
				// In map view this looks at the next body (the vessel's own sphere first); elsewhere it is Tab.
				if (renderer?.isMapView) {
					e.preventDefault();
					cycleMapFocus(e.shiftKey ? -1 : 1);
				}
				break;
			case 'speedMode':
				hudCtl?.cycleSpeedMode();
				break;
			case 'warpDown':
				setWarp(warpIndex - 1);
				break;
			case 'warpUp':
				setWarp(warpIndex + 1);
				break;
			case 'nodePrograde':
			case 'nodeRetrograde':
			case 'nodeNormal':
			case 'nodeAntinormal':
			case 'nodeRadialOut':
			case 'nodeRadialIn':
			case 'nodeDelete':
				if (maneuverCtl?.key(action, { shift: e.shiftKey, alt: e.altKey })) e.preventDefault();
				break;
			case null:
				if (import.meta.env.DEV && id === 'KeyP') void toggleAutopilot();
				// Backspace is a fixed second key for removing the selected node (ADR 0061).
				else if (id === 'Backspace' && maneuverCtl?.key('nodeDelete', {})) e.preventDefault();
				break;
			default: {
				const sasMode = modeForAction(action, hud.model?.sas?.mode ?? 'off');
				if (sasMode !== null) setSas(sasMode);
			}
		}
	}
	const onKeyUp = (e: KeyboardEvent): void => {
		held.delete(keyIdOf(e));
		// A key released after Shift changed its character (`,` held, Shift pressed, `<` released): drop the code too.
		held.delete(e.code);
	};
	const onBlur = (): void => held.clear();

	let dragging = false;
	let pressed = { active: false, moved: 0 };
	const onPointerDown = (e: PointerEvent): void => {
		dragging = true;
		pressed = { active: true, moved: 0 };
		canvas.setPointerCapture(e.pointerId);
	};
	const onPointerUp = (e: PointerEvent): void => {
		dragging = false;
		// A press that did not move is a click: on the map it places or deselects a maneuver node.
		// Only a press that began on the canvas counts (not the end of a drag of a node marker).
		const wasPress = pressed.active;
		pressed.active = false;
		if (wasPress && pressed.moved < 4) {
			const box = canvas.getBoundingClientRect();
			maneuverCtl?.click(e.clientX - box.left, e.clientY - box.top);
		}
	};
	const onPointerMove = (e: PointerEvent): void => {
		if (dragging) {
			pressed.moved += Math.abs(e.movementX) + Math.abs(e.movementY);
			const input = { dYaw: -e.movementX * 0.005, dPitch: e.movementY * 0.005 };
			renderer?.orbitCamera(input);
		}
	};
	const onWheel = (e: WheelEvent): void => {
		e.preventDefault();
		const input = { zoomFactor: Math.exp(e.deltaY * 0.001) };
		renderer?.orbitCamera(input);
	};

	function setSas(mode: SasMode): void {
		const command = hudCtl?.sasCommand(mode);
		if (command) {
			void send(command);
			director.event(command.type === 'sas' && command.mode === 'off' ? 'sasOff' : 'sasOn');
		}
	}

	function toggleMap(): void {
		hud.map = renderer?.toggleMapView() ?? false;
		hudCtl?.setMapView(hud.map);
	}

	/** Map view focus: the vessel's own sphere (null), then every body in order (plan 044). */
	function cycleMapFocus(step: 1 | -1): void {
		if (!renderer) return;
		const order: Array<string | null> = [null, ...renderer.bodyIds];
		const at = order.indexOf(renderer.mapFocus);
		renderer.setMapFocus(order[(at + step + order.length) % order.length] ?? null);
	}

	/** The predicted path across spheres of influence and the maneuver nodes, kept up to date while the map is open. */
	let maneuverCtl: ManeuverController | null = null;
	function updateMapPath(now: number): void {
		maneuverCtl?.update(now);
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
	/** Draws at the governor's level and, when it moved by itself, tells the player once (plan 039). */
	function applyLevel(level: GovernorLevel, announce: boolean): void {
		if (!renderer) return;
		if (level.preset !== renderer.preset) renderer.setPreset(level.preset);
		renderer.setRenderScale(level.scale);
		if (announce) {
			const percent = Math.round(level.scale * 100);
			hudCtl?.notice({
				kind: 'info',
				title: 'Graphics adjusted',
				detail: `${level.preset} at ${percent}% resolution to keep the frame rate up`,
				key: 'governor'
			});
		}
	}

	function frame(now: number): void {
		if (disposed) return;
		raf = requestAnimationFrame(frame);
		const interval = now - lastFrame;
		const dt = Math.min(interval / 1000, 0.1);
		lastFrame = now;
		if (governor) {
			const level = governor.frame(interval);
			if (level) applyLevel(level, true);
		}
		sendInput(dt);
		director.frame(now, audioView, hud.warp, hud.paused);
		if (renderer && snap && dirty) {
			renderer.update(snap);
			dirty = false;
		}
		updateMapPath(now);
		renderer?.render();
		if (hudCtl) {
			const t0 = performance.now();
			const frameData = hudCtl.frame();
			frameData.maneuver = maneuverCtl?.frame() ?? null;
			options.onFrame?.(frameData);
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
			const m = hud.model;
			const soi = snap?.vessels.find((v) => Number(v.id) === Number(vessel))?.soi;
			audioView = m
				? {
						throttle: m.throttle,
						engineOn: m.stages.rows.some((r) => r.current),
						altitude: m.altitude,
						speed: m.speed,
						heat: m.heat,
						atmosphere: catalog?.bodies.find((b) => b.id === soi)?.atmosphere
					}
				: null;
			// The prograde reference follows the speed readout (V, or the automatic switch).
			const follow = hudCtl?.sasFollowUp();
			if (follow) void send(follow);
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
	client.onSnapshot((s, simWarp) => {
		snap = s;
		// The sim changes its own warp (a change of sphere, a finished warp-to): follow it.
		if (simWarp !== undefined && simWarp !== hud.warp) {
			hud.warp = simWarp;
			warpIndex = Math.max(
				0,
				WARP_STEPS.reduce((at, step, i) => (step <= simWarp ? i : at), 0)
			);
		}
		presence.snapshot(s);
		hudCtl?.snapshot(s);
		dirty = true;
		auto?.update(s);
	});
	client.onStage((event) => {
		hudCtl?.stage(event);
		director.event('stage');
	});
	client.onSimEvent((event) => {
		hudCtl?.simEvent(event);
		if (event.type === 'flameout' || event.type === 'part-damaged') director.event('warning');
	});
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
			const resumed = options.resume ? resumeInfo(options.resume) : null;
			hudCtl = createHudController({
				design,
				content: options.content,
				bodies: c.bodies,
				project: (world) => renderer?.project(world) ?? null,
				...(resumed
					? { resume: { entityIndex: resumed.entityIndex, stagesFired: resumed.stagesFired } }
					: {})
			});
			renderer = createRenderer({
				canvas,
				// The root body first (the renderer treats the first body as the one with the planet pass);
				// a moon's `parent` and `orbit` let the map view draw its orbit and sphere (plan 044).
				bodies: [...c.bodies]
					.sort((x, y) => Number(x.parent !== undefined) - Number(y.parent !== undefined))
					.map((b) => ({
						id: b.id,
						radius: b.radius,
						mass: b.mass,
						atmosphere: b.atmosphere,
						...(b.parent !== undefined && b.orbit ? { parent: b.parent, orbit: b.orbit } : {})
					})),
				partShapes: partShapesOf(c),
				partVisuals: new Map(c.parts.flatMap((p) => (p.visual ? [[p.id, p.visual] as const] : []))),
				partAttach: new Map(c.parts.flatMap((p) => (p.attach ? [[p.id, p.attach] as const] : []))),
				preset: initialGraphicsPreset()
			});
			const draw = renderer;
			maneuverCtl = createManeuverController({
				bodies: c.bodies,
				dispatch: (command) => client.dispatch(command),
				project: (world) => draw.project(world),
				setPath: (path) => draw.setMapPath(path),
				mapOn: () => draw.isMapView,
				vessel: () => vessel,
				snapshot: () => snap,
				burnTime: (dv) => hudCtl?.burnTimeFor(dv) ?? null,
				notice: (title, detail) =>
					hudCtl?.notice({ kind: 'warning', title, ...(detail ? { detail } : {}), key: 'maneuver' })
			});
			governor = new QualityGovernor(renderer.preset);
			governor.setEnabled(autoQuality);
			// compile this preset's programs and the other presets' planet pass off the main thread
			void renderer.precompile();
			resize();
			if (resumed && options.resume) {
				// The sim already holds the flight; the page only takes up the controls where they were.
				if (resumed.focus === null) {
					hud.status = 'error';
					hud.message = 'this save has no vessel to fly';
					publish();
					return;
				}
				vessel = entityId(resumed.focus);
				throttle = sentThrottle = resumed.throttle;
				const warp = options.resume.sim.warp;
				hud.warp = warp;
				warpIndex = Math.max(0, (WARP_STEPS as readonly number[]).indexOf(warp));
			} else {
				const result = await client.dispatch({ type: 'load-vessel', design });
				if (!result.ok || result.vessel === undefined) {
					hud.status = 'error';
					hud.message = `launch refused: ${result.ok ? 'no vessel id returned' : result.reason}`;
					publish();
					return;
				}
				vessel = result.vessel;
			}
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
		async collectSave() {
			if (vessel === null || !catalog || !renderer || hud.status !== 'flying') {
				throw new Error('There is no flight to save yet.');
			}
			const body = catalog.bodies[0];
			if (!body) throw new Error('The simulation has no body to save.');
			// Draw a frame and read it in the same task: a WebGL canvas is cleared after it is shown.
			renderer.render();
			const thumbnail = captureThumbnail(canvas);
			const sim = await client.save();
			return { sim, focus: Number(vessel), design, thumbnail, bodyRadius: body.radius };
		},
		setViewInsets(insets) {
			renderer?.setViewInsets(insets);
		},
		setGraphicsPreset(choice) {
			// `auto` forgets the saved choice and takes the device default again (plan 023)
			if (choice === 'auto') clearGraphicsPreset();
			else saveGraphicsPreset(choice);
			const preset = choice === 'auto' ? resolvePreset(null, probeCapabilities()) : choice;
			// the player's choice is the governor's ceiling and starts it again at full resolution
			if (governor) applyLevel(governor.setCeiling(preset), false);
			else renderer?.setPreset(preset);
		},
		get autoQuality() {
			return autoQuality;
		},
		setAutoQuality(on) {
			autoQuality = on;
			saveAutoQuality(on);
			if (governor) applyLevel(governor.setEnabled(on), false);
		},
		stepWarp(delta) {
			setWarp(warpIndex + delta);
		},
		get maneuver() {
			return maneuverCtl;
		},
		warpToNode() {
			maneuverCtl?.warpToNode();
		},
		removeNode() {
			const first = snap?.vessels.find((v) => Number(v.id) === vessel)?.nodes?.[0];
			if (first) maneuverCtl?.remove(first.id);
		},
		stage() {
			if (vessel !== null) void send({ type: 'stage', vessel });
		},
		toggleMap,
		cycleSpeedMode() {
			hudCtl?.cycleSpeedMode();
		},
		setSas,
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
			director.stop();
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
