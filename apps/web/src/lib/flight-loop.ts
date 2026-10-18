/**
 * The flight screen's engine room, deliberately outside Svelte reactivity: the Worker client, the
 * renderer, the rAF loop and the keyboard live here as plain TypeScript. Svelte only receives a
 * ~10 Hz `FlightHud` copy through `onHud` and paints it.
 */
import type { GhostTrack } from './replays/ghost-model';
import { designCost } from '@orbital/core';
import { bookStore, finishRun, scoreText } from './challenges/challenge-model';
import { designStats } from './editor/stats';
import type { ReplayFile } from '@orbital/core';
import { panelInputOf } from './dock/panel-input';
import { createAchievementTracker, type AchievementTracker } from './achievements/tracker';
import type { ProfileStore } from './achievements/store';
import {
	entityId,
	type Command,
	type EntityId,
	type SasMode,
	type Snapshot,
	type VesselDesign,
	type SimSave,
	type VesselPlacement,
	type WorldInfo
} from '@orbital/core';
import {
	calendarOf,
	homeBodyOf,
	type BodyDefinition,
	type CommandResult,
	type PanelInput
} from '@orbital/core';
import {
	QualityGovernor,
	createRenderer,
	type GovernorLevel,
	type GraphicsPreset,
	type PrecompileProgress,
	type Renderer
} from '@orbital/renderer';
import { pageAudio } from './audio/audio';
import { createDirector, type AudioFlightView } from './audio/director';
import { partShapesOf } from './catalog';
import { modelProviders } from './mods/asset-models';
import { pinchZoomFactor } from './touch/touch-model';
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
import {
	DEFAULT_KEYMAP,
	keyIdOf,
	type ActionId,
	type Keymap,
	customGroupSlot
} from './keybindings';
import type { Catalog } from './messages';
import { idleScript, reduceScript, scriptIsActive, type ScriptView } from './script-state';
import type { ScriptSandbox } from './script-sandbox';
import { startSimWorker, type SimClient } from './sim-client';
import { createManeuverController, type ManeuverController } from './maneuver-controller';
import type { AidId } from './rendezvous-aids';
import { createTargetView, type TargetView } from './target-view';
import { computeTelemetry, type Telemetry } from './telemetry';
import { createVesselPresence } from './vessel-presence';
import type { ContentLookups } from './delta-v';
import { resumeInfo, type GameSave } from './save/game-save';
import type { SaveRequest } from './save/saves';
import { captureThumbnail } from './save/thumbnail';
import { WARP_STEPS } from './warp';
import { catchUpCommand, catchUpOffer, type CatchUp } from './worlds/world-model';
import { setGlassFallback } from './ui/root-theme';
import { regionHoverLabel, regionLayer } from './hud/regions-model';
import {
	broadcastOffers,
	suitRadio,
	type BroadcastOffer,
	type RadioBars
} from './comms/suit-radio';
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
	/** A crew member outside in a suit (plan 109, ADR 0120): the camera follows the suit. */
	eva: { suit: number; name: string; walking: boolean; radio?: RadioBars } | null;
	/** Firsts that may still be broadcast live (plan 121, ADR 0193 point 5). */
	broadcasts: BroadcastOffer[];
	/** The world's funds with the economy on, else null (plan 132). */
	funds: number | null;
	/** The focused vessel's recovery quote while it can be recovered (plan 132, ADR 0113 point 6). */
	recovery: { value: number; factor: number; distance: number | null; credit: number } | null;
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
	/** A new flight in a world without saves (plan 087): its info; ignored when resuming. */
	world?: WorldInfo;
	/** Where a new flight's vessel stands, from the Launch screen (plan 094, ADR 0150); default: the site's pad. */
	placement?: VesselPlacement;
	/** A scenario's other vessels and its missions, for a world's first flight (plan 100, ADR 0151). */
	scenario?: { others: { design: VesselDesign; placement: VesselPlacement }[]; missions: string[] };
	/**
	 * Launch into the world (plan 108, ADR 0152): its newest save, resumed, and the new vessel added to
	 * it; the roster, ledger and missions carry on.
	 */
	into?: SimSave;
	/** Crew seated in the new vessel at launch (design part indices). */
	crew?: { member: string; part: number }[];
	/** JPL's DE440, un-gzipped, for an n-body Sol world (plan 125, ADR 0122 point 7). */
	ephemeris?: ArrayBuffer;
	/** Script status and print output, at HUD rate and only when something changed. */
	onScript?(view: ScriptView): void;
	/** Progress of the renderer's background shader compile (plan 038, ADR 0074), until it is done. */
	onGraphics?(progress: PrecompileProgress): void;
	/**
	 * Where scripts run (ADR 0038): a sandboxed iframe with the script Worker in it. Without one
	 * (tests, a browser that cannot provide it) Run reports a failed script.
	 */
	sandbox?: ScriptSandbox;
	/** The achievements profile (plan 102, ADR 0147); without one nothing unlocks (tests). */
	profile?: ProfileStore;
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
	/** Whether the world is behind the real date `nowMs` (plan 087, ADR 0143): offer, unavailable or none. */
	catchUp(nowMs: number): CatchUp;
	/** Accept the catch-up: `warp-to` the real date; resolves with the sim's answer (null when nothing to do). */
	acceptCatchUp(nowMs: number): Promise<CommandResult | null>;
	/** Remove the earliest maneuver node. */
	removeNode(): void;
	toggleMap(): void;
	cycleSpeedMode(): void;
	/** Ask for a stability assist mode (the SAS buttons next to the navball; plan 042). */
	setSas(mode: SasMode): void;
	/** Select the target with this key (`TargetChoice.key`), or clear it with null (plan 035). */
	setTarget(key: string | null): void;
	/** EVA (plan 109, ADR 0120): step out, walk (heading from north, rad; null stops), plant a flag, board again. */
	eva(member: string): void;
	walk(heading: number | null): void;
	plantFlag(): void;
	board(): void;
	/** Select the next entry of the target list; the one after the last is none. */
	cycleTarget(): void;
	/** Place the node of a rendezvous aid of the Target card (plan 057). */
	planAid(id: AidId): void;
	/** Freeze or resume the sim (pause menu). */
	setPaused(paused: boolean): void;
	/** The on-screen steering pad and roll buttons (plan 053): added to what the keys send, each -1..1. */
	setTouchAttitude(input: { pitch: number; yaw: number; roll: number }): void;
	/** The on-screen throttle slider: sets the throttle outright, 0..1. */
	setThrottle(value: number): void;
	/** Everything a save needs from the running flight (plan 043); rejects when there is no vessel to save. */
	collectSave(): Promise<SaveRequest>;
	/**
	 * Recover the focused vessel (plan 132): `recover-vessel`, then the flight can still be saved
	 * without a focus, so the credit is in the world's newest save.
	 */
	recover(): Promise<{ ok: true; credit: number } | { ok: false; reason: string }>;
	/** While a dialog is open the flight keys do nothing. */
	setModal(open: boolean): void;
	/** Pixels of the view the interface panels cover; the camera centres the vessel in the rest (plan 023). */
	setViewInsets(insets: { top: number; right: number; bottom: number; left: number }): void;
	/** What dock panel selectors read now (plan 112, ADR 0149 point 2); null before the first snapshot. */
	panelInput(): PanelInput | null;
	/** Rim-light one part in the view, or none (plan 111, ADR 0153 point 5). */
	highlightPart(part: EntityId | null): void;
	/** The flight recorded since the sim booted, as a replay file (plan 131, ADR 0159). */
	replay(name: string): Promise<ReplayFile | null>;
	/** Draw a replay's ghost over this flight, or none (plan 131). */
	setGhost(track: GhostTrack | null): void;
	/** Map view: tint the bodies by their science regions (plan 192), or not. */
	setRegions(on: boolean): void;
	/** Map view: `<body> · <region>` under canvas point `(x, y)`, or null (plan 192). */
	regionLabelAt(x: number, y: number): string | null;
	/** A command from a dock panel; the sim validates it, a refusal shows as a toast. */
	command(command: Command): Promise<boolean>;
	dispose(): void;
}

/** The home body of a sim's catalog (plan 122, ADR 0119): the sim's `home`, else the same rule as core's. */
const homeOfCatalog = (c: Catalog): BodyDefinition | undefined =>
	c.bodies.find((b) => b.id === c.home) ?? homeBodyOf(c.bodies);

export function startFlight(options: FlightOptions): Flight {
	const { canvas, design } = options;
	const de440 = options.ephemeris ? { ephemeris: options.ephemeris } : {};
	const client: SimClient = startSimWorker(
		options.resume
			? { resume: options.resume.sim, ...de440 }
			: options.into
				? { resume: options.into, ...de440 }
				: options.world
					? { world: options.world, ...de440 }
					: {}
	);
	let renderer: Renderer | null = null;
	let governor: QualityGovernor | null = null;
	let autoQuality = loadAutoQuality();
	let catalog: Catalog | null = null;
	// achievements (plan 102): the tracker once the sim is ready; the loaded records are checked once
	let achievements: AchievementTracker | null = null;
	const challenges = typeof localStorage === 'undefined' ? null : bookStore(localStorage);
	let caughtUp = false;
	let vessel: EntityId | null = null;
	let snap: Snapshot | null = null;
	/** The focused vessel was recovered (plan 132): no quote any more, saves have no focus. */
	let recovered = false;
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
		autopilot: null,
		eva: null,
		broadcasts: [],
		funds: null,
		recovery: null
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
	/** The pitch trim sent last (plan 063): R and F step it. */
	let trim = 0;
	let sentThrottle = 0;
	let sentAttitude = '0,0,0';
	const touchAttitude = { pitch: 0, yaw: 0, roll: 0 };
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
				Math.max(-1, Math.min(1, axis('pitchMinus', 'pitchPlus') + touchAttitude.pitch)),
				Math.max(-1, Math.min(1, axis('yawMinus', 'yawPlus') + touchAttitude.yaw)),
				Math.max(-1, Math.min(1, axis('rollMinus', 'rollPlus') + touchAttitude.roll))
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
			case 'customGroup1':
			case 'customGroup2':
			case 'customGroup3':
			case 'customGroup4':
			case 'customGroup5':
			case 'customGroup6':
			case 'customGroup7':
			case 'customGroup8':
			case 'customGroup9':
			case 'customGroup10':
				// A custom group of the design toggles as a whole (plan 110, ADR 0174 point 5).
				if (vessel !== null) {
					void send({ type: 'action-group', vessel, group: `custom.${customGroupSlot(action)}` });
				}
				break;
			case 'trimUp':
			case 'trimDown':
				// pitch trim in steps of 0.05 (plan 063, ADR 0161 point 4)
				if (vessel !== null) {
					trim = Math.max(
						-1,
						Math.min(1, Math.round((trim + (action === 'trimUp' ? 0.05 : -0.05)) * 100) / 100)
					);
					void send({ type: 'trim', vessel, pitch: trim });
				}
				break;
			case 'brakes':
				if (vessel !== null) void send({ type: 'action-group', vessel, group: 'stock.brakes' });
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
			case 'targetNext':
				cycleTarget();
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

	// One finger or the mouse orbits the camera; two fingers pinch to zoom (plan 053, ADR 0063).
	const pointers = new Map<number, { x: number; y: number }>();
	let pinchDistance = 0;
	let pressed = { active: false, moved: 0 };
	const pinchNow = (): number => {
		const [a, b] = [...pointers.values()];
		return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
	};
	const onPointerDown = (e: PointerEvent): void => {
		pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
		canvas.setPointerCapture(e.pointerId);
		if (pointers.size === 1) pressed = { active: true, moved: 0 };
		else {
			// A second finger makes it a pinch, never a click.
			pressed.active = false;
			pinchDistance = pinchNow();
		}
	};
	const onPointerUp = (e: PointerEvent): void => {
		if (!pointers.delete(e.pointerId)) return;
		pinchDistance = 0;
		// A press that did not move is a click: on the map it places or deselects a maneuver node.
		// Only a press that began on the canvas counts (not the end of a drag of a node marker).
		const wasPress = pressed.active && pointers.size === 0;
		pressed.active = false;
		if (wasPress && pressed.moved < 4 && e.type === 'pointerup') {
			const box = canvas.getBoundingClientRect();
			const x = e.clientX - box.left;
			const y = e.clientY - box.top;
			if (renderer?.isMapView) {
				// A body disc or a vessel dot first, then the vessel's own path (a node), then an orbit line.
				const mark = targetView?.pick(x, y, false);
				if (mark) return setTarget(mark);
				if (!maneuverCtl?.onPath(x, y)) {
					const line = targetView?.pick(x, y);
					if (line) return setTarget(line);
				}
			}
			maneuverCtl?.click(x, y);
		}
	};
	const onPointerMove = (e: PointerEvent): void => {
		const at = pointers.get(e.pointerId);
		if (!at) return;
		const dx = e.clientX - at.x;
		const dy = e.clientY - at.y;
		at.x = e.clientX;
		at.y = e.clientY;
		if (pointers.size === 1) {
			pressed.moved += Math.abs(dx) + Math.abs(dy);
			renderer?.orbitCamera({ dYaw: -dx * 0.005, dPitch: dy * 0.005 });
		} else if (pointers.size === 2) {
			const now = pinchNow();
			if (pinchDistance > 0)
				renderer?.orbitCamera({ zoomFactor: pinchZoomFactor(pinchDistance, now) });
			pinchDistance = now;
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

	function setTarget(key: string | null): void {
		const command = hudCtl?.targetCommand(key);
		if (command) void send(command);
	}

	// ---- EVA (plan 109, ADR 0120): the flight stays on its vessel; the camera follows the suit ----
	async function eva(member: string): Promise<void> {
		if (vessel === null || hud.eva) return;
		const name = client.latest?.crew?.find((m) => m.id === member)?.name ?? member;
		const result = await client.dispatch({ type: 'crew-eva', vessel, member });
		if (!result.ok) return void hudCtl?.refused('crew-eva', result.reason);
		hud.eva = { suit: Number(result.vessel), name, walking: false };
		renderer?.setActiveVessel(result.vessel as EntityId);
		publish();
	}
	function walk(heading: number | null): void {
		const e = hud.eva;
		if (!e) return;
		void send({
			type: 'crew-walk',
			vessel: e.suit as EntityId,
			heading: heading ?? 0,
			speed: heading === null ? 0 : 1.5
		});
		hud.eva = { ...e, walking: heading !== null };
		publish();
	}
	function plantFlag(): void {
		if (hud.eva) void send({ type: 'plant-flag', vessel: hud.eva.suit as EntityId });
	}
	async function board(): Promise<void> {
		const e = hud.eva;
		if (!e || vessel === null) return;
		const result = await client.dispatch({
			type: 'crew-board',
			suit: e.suit as EntityId,
			vessel
		});
		if (!result.ok) return void hudCtl?.refused('crew-board', result.reason);
		hud.eva = null;
		renderer?.setActiveVessel(vessel);
		publish();
	}

	function planAid(id: AidId): void {
		const command = targetView?.aidCommand(id);
		if (command) void send(command);
	}

	function cycleTarget(): void {
		const command = hudCtl?.nextTargetCommand();
		if (command) void send(command);
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
	/** The target's markers, the closest approach across spheres and the rendezvous aids (plan 057). */
	let targetView: TargetView | null = null;
	/** What the interface panels cover of the view (the target arrow keeps out of it). */
	let viewInsets = { top: 0, right: 0, bottom: 0, left: 0 };
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
		const body = homeOfCatalog(catalog);
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
	/** Forced by the debug hook for the blur measurement (plan 086); null follows the preset. */
	let glassOverride: 'blur' | 'solid' | null = null;
	/** Panels drop the glass blur on `low`, which the governor's lowest rungs use too (ADR 0140). */
	function syncGlass(): void {
		const solid = glassOverride ? glassOverride === 'solid' : renderer?.preset === 'low';
		setGlassFallback(document.documentElement, solid);
	}

	/** Draws at the governor's level and, when it moved by itself, tells the player once (plan 039). */
	function applyLevel(level: GovernorLevel, announce: boolean): void {
		if (!renderer) return;
		if (level.preset !== renderer.preset) renderer.setPreset(level.preset);
		syncGlass();
		renderer.setRenderScale(level.scale);
		renderer.setPlanetScale(level.planetScale);
		if (announce) {
			const percent = Math.round(level.scale * 100);
			hudCtl?.notice({
				kind: 'info',
				title: 'Graphics adjusted',
				detail: `${level.preset} at ${percent}% resolution${level.planetScale < 1 ? ', sky and ground at half detail' : ''} to keep the frame rate up`,
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
		targetView?.update(now);
		renderer?.render();
		if (hudCtl) {
			const t0 = performance.now();
			const frameData = hudCtl.frame();
			frameData.maneuver = maneuverCtl?.frame() ?? null;
			frameData.target = targetView?.frame() ?? null;
			options.onFrame?.(frameData);
			if (import.meta.env.DEV) stats.add('paint', performance.now() - t0);
		}
		if (now - lastHud >= HUD_PERIOD_MS) {
			lastHud = now;
			if (catalog && vessel !== null && snap) {
				hud.telemetry = computeTelemetry(snap, vessel, catalog.bodies);
				if (presence.lost() && hud.status === 'flying' && !recovered) {
					hud.status = 'lost';
					hud.message = 'the vessel was destroyed';
				}
			}
			hud.throttle = throttle;
			const t0 = performance.now();
			hud.model = hudCtl?.model(now, throttle) ?? null;
			// the suit radio and the live broadcasts (plan 121, ADR 0193 point 6)
			if (snap) {
				if (hud.eva) hud.eva = { ...hud.eva, radio: suitRadio(snap, hud.eva.suit) };
				hud.broadcasts = broadcastOffers(snap);
				// funds and the recovery quote (plan 132)
				hud.funds = snap.economy?.enabled ? snap.economy.funds : null;
				const quote = snap.vessels.find((v) => Number(v.id) === Number(vessel))?.recovery;
				hud.recovery = quote && !recovered ? { ...quote } : null;
			}
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
		// the loaded world's firsts, once: an achievement added since, or earned elsewhere, is not missed
		if (achievements && !caughtUp) {
			caughtUp = true;
			if (s.milestones) void achievements.check(s.milestones);
		}
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
		if (event.type === 'milestone') void achievements?.check([event]);
		// a challenge world scores the run when its goal is reached (plan 131, ADR 0159 point 6)
		if (event.type === 'milestone' && challenges && catalog) {
			const finished = finishRun(challenges, catalog.worldId ?? 'legacy', event.id, {
				cost: designCost(options.design, options.content).total,
				mass: designStats(options.design, options.content, 'sea-level', 9.81).wetMass,
				time: event.time,
				dvMargin: hud.model?.stages.total ?? 0
			});
			if (finished)
				hudCtl?.notice({
					kind: 'success',
					title: `Challenge: ${finished.challenge.title}`,
					detail: scoreText(finished.scores),
					key: 'challenge'
				});
		}
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
			if (options.profile && c.achievements) {
				achievements = createAchievementTracker({
					store: options.profile,
					achievements: c.achievements,
					home: homeOfCatalog(c)?.id ?? '',
					world: c.worldId ?? 'legacy',
					onUnlock: (a) =>
						hudCtl?.notice({
							kind: 'success',
							title: `Achievement: ${a.label}`,
							detail: a.description,
							key: `achievement:${a.id}`
						})
				});
			}
			const resumed = options.resume ? resumeInfo(options.resume) : null;
			hudCtl = createHudController({
				design,
				content: options.content,
				bodies: c.bodies,
				...(c.epoch ? { epoch: c.epoch } : {}),
				project: (world) => renderer?.project(world) ?? null,
				rendezvous: () => targetView?.info ?? null,
				...(resumed
					? { resume: { entityIndex: resumed.entityIndex, stagesFired: resumed.stagesFired } }
					: {})
			});
			renderer = createRenderer({
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
				preset: initialGraphicsPreset(),
				// the world's terrain and Space Center (plan 084, ADR 0142)
				...(c.terrain ? { terrain: c.terrain } : {}),
				...(c.launchSite ? { launchSite: c.launchSite } : {})
			});
			const draw = renderer;
			maneuverCtl = createManeuverController({
				bodies: c.bodies,
				...(c.gravityModel ? { gravityModel: c.gravityModel } : {}),
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
			targetView = createTargetView({
				bodies: c.bodies,
				...(c.gravityModel ? { gravityModel: c.gravityModel } : {}),
				project: (world) => draw.project(world),
				snapshot: () => snap,
				vessel: () => vessel,
				mapOn: () => draw.isMapView,
				size: () => ({ width: canvas.clientWidth, height: canvas.clientHeight, insets: viewInsets })
			});
			governor = new QualityGovernor(renderer.preset, undefined, renderer.halfPlanetAvailable);
			governor.setEnabled(autoQuality);
			syncGlass();
			// compile this preset's programs and the other presets' planet pass off the main thread
			void renderer.precompile(options.onGraphics);
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
				const result = await client.dispatch({
					type: 'load-vessel',
					design,
					...(options.placement ? { placement: options.placement } : {}),
					...(options.crew?.length ? { crew: options.crew } : {})
				});
				if (!result.ok || result.vessel === undefined) {
					hud.status = 'error';
					hud.message = `launch refused: ${result.ok ? 'no vessel id returned' : result.reason}`;
					publish();
					return;
				}
				vessel = result.vessel;
				// a scenario's start (plan 100, ADR 0151 point 4): its other vessels, then its missions
				for (const v of options.scenario?.others ?? [])
					await client.dispatch({ type: 'load-vessel', design: v.design, placement: v.placement });
				for (const id of options.scenario?.missions ?? [])
					await client.dispatch({ type: 'objective-start', source: { kind: 'mission', id } });
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
	canvas.addEventListener('pointercancel', onPointerUp);
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
			// Sound checks (plan 053): the engine (state, `level()`) and the director's cost counters.
			audio: () => pageAudio(),
			audioCost: () => ({ ...director.cost }),
			snapshot: () => snap,
			send: (c: Command) => client.dispatch(c),
			// Blur cost (plan 086): force the glass on or off (`null` follows the preset), then sample
			// whole-page frame intervals, compositor included (the renderer's `benchmark` is WebGL only).
			glass: (mode: 'blur' | 'solid' | null) => {
				glassOverride = mode;
				syncGlass();
			},
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
				}),
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
		panelInput: () => (snap && catalog ? panelInputOf(snap, vessel, catalog.bodies) : null),
		highlightPart: (part) => renderer?.highlightPart(part),
		replay: (name) => client.replay(name),
		setGhost: (track) => hudCtl?.setGhost(track),
		setRegions: (on) =>
			renderer?.setRegionOverlay(
				on && catalog ? regionLayer(catalog.bodies, catalog.terrain, catalog.home) : null
			),
		regionLabelAt: (x, y) =>
			renderer?.isMapView && catalog
				? regionHoverLabel(
						catalog.bodies,
						renderer.bodyDirectionAt(x, y),
						catalog.terrain,
						catalog.home
					)
				: null,
		command: (command) => send(command),
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
		async recover() {
			if (vessel === null) return { ok: false, reason: 'there is no vessel to recover' };
			const credit = hud.recovery?.credit ?? 0;
			const r = await client.dispatch({ type: 'recover-vessel', vessel });
			if (!r.ok) return { ok: false, reason: r.reason };
			recovered = true;
			hud.recovery = null;
			return { ok: true, credit };
		},
		async collectSave() {
			if (recovered && catalog) {
				// after a recovery the world is saved without a focus vessel (plan 132)
				const body = homeOfCatalog(catalog);
				const sim = await client.save();
				return { sim, focus: null, design, thumbnail: null, bodyRadius: body?.radius ?? 0 };
			}
			if (vessel === null || !catalog || !renderer || hud.status !== 'flying') {
				throw new Error('There is no flight to save yet.');
			}
			const body = homeOfCatalog(catalog);
			if (!body) throw new Error('The simulation has no body to save.');
			// Draw a frame and read it in the same task: a WebGL canvas is cleared after it is shown.
			renderer.render();
			const thumbnail = captureThumbnail(canvas);
			const sim = await client.save();
			return { sim, focus: Number(vessel), design, thumbnail, bodyRadius: body.radius };
		},
		setViewInsets(insets) {
			viewInsets = insets;
			renderer?.setViewInsets(insets);
		},
		setGraphicsPreset(choice) {
			// `auto` forgets the saved choice and takes the device default again (plan 023)
			if (choice === 'auto') clearGraphicsPreset();
			else saveGraphicsPreset(choice);
			const preset = choice === 'auto' ? resolvePreset(null, probeCapabilities()) : choice;
			// the player's choice is the governor's ceiling and starts it again at full resolution
			if (governor) applyLevel(governor.setCeiling(preset), false);
			else {
				renderer?.setPreset(preset);
				syncGlass();
			}
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
		catchUp(nowMs) {
			if (!catalog || !snap) return { kind: 'none' };
			const vessels = snap.vessels.map((v) => ({ name: v.name ?? `vessel ${v.id}`, mode: v.mode }));
			return catchUpOffer(
				catalog.epoch ?? { day: 0, fraction: 0 },
				calendarOf(catalog.bodies),
				{ t: snap.t, vessels },
				nowMs
			);
		},
		async acceptCatchUp(nowMs) {
			const offer = this.catchUp(nowMs);
			if (offer.kind !== 'offer') return null;
			const result = await client.dispatch(catchUpCommand(offer));
			if (result.ok) {
				hud.warp = 1_000_000;
				publish();
			}
			return result;
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
		setTarget,
		eva: (member) => void eva(member),
		walk,
		plantFlag,
		board: () => void board(),
		cycleTarget,
		planAid,
		setPaused(paused) {
			hud.paused = paused;
			client.setPaused(paused);
		},
		setTouchAttitude(input) {
			touchAttitude.pitch = input.pitch;
			touchAttitude.yaw = input.yaw;
			touchAttitude.roll = input.roll;
		},
		setThrottle(value) {
			throttle = Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
		},
		setModal(open) {
			modal = open;
			if (open) {
				held.clear();
				touchAttitude.pitch = touchAttitude.yaw = touchAttitude.roll = 0;
			}
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
			canvas.removeEventListener('pointercancel', onPointerUp);
			canvas.removeEventListener('pointermove', onPointerMove);
			canvas.removeEventListener('wheel', onWheel);
			renderer?.dispose();
			setGlassFallback(document.documentElement, false);
			options.sandbox?.close();
			client.dispose();
		}
	};
}
