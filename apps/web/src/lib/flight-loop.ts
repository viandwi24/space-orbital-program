/**
 * The flight screen's engine room, deliberately outside Svelte reactivity: the Worker client, the
 * renderer, the rAF loop and the keyboard live here as plain TypeScript. Svelte only receives a
 * ~10 Hz `FlightHud` copy through `onHud` and paints it.
 */
import type { GhostTrack } from './replays/ghost-model';
import { API_VERSION, designCost } from '@orbital/core';
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
	type PartDefinition,
	type SasMode,
	type Snapshot,
	type VesselDesign,
	type WarpTarget,
	type SimSave,
	type VesselPlacement,
	type VesselSnapshot,
	type WorldInfo
} from '@orbital/core';
import {
	calendarOf,
	homeBodyOf,
	type BodyDefinition,
	type CommandResult,
	type WarpLimitSnapshot,
	type PanelInput
} from '@orbital/core';
import {
	CAMERA_MODE_LABEL,
	QualityGovernor,
	createRenderer,
	nextCameraMode,
	type CameraMode,
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
	chordIdOf,
	keyIdOf,
	type ActionId,
	type Keymap,
	customGroupSlot
} from './keybindings';
import type { Catalog } from './messages';
import {
	boardTarget,
	isSuit,
	jetpackTranslate,
	JETPACK_MODULE,
	RUN_SPEED,
	suitStatus,
	walkHeading,
	WALK_SPEED,
	type SuitStatus
} from './eva/eva-model';
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
import { warpStepsFor } from './warp';

/** The level a granted warp-to runs at. */
const r_granted = (r: CommandResult): number => (r.ok ? (r.granted ?? 1) : 1);
import { catchUpCommand, catchUpOffer, type CatchUp } from './worlds/world-model';
import { setGlassFallback } from './ui/root-theme';
import { regionHoverLabel, regionLayer } from './hud/regions-model';
import {
	broadcastOffers,
	suitRadio,
	type BroadcastOffer,
	type RadioBars
} from './comms/suit-radio';
import { logBuffer } from './log-buffer';
import type { DebugHost } from './debug/api';
import { simEventLine } from './debug/model';
import {
	createHudController,
	type DeltaVView,
	type FrameData,
	type HudController,
	type HudModel
} from './hud-controller';

/** How far `[` and `]` look for another vessel, m: the physics range (plan 221). */
const SWITCH_RANGE = 2_500;

/** What fine control (Caps Lock) scales the pilot's keys by (plan 211). */
const PRECISION = 0.25;
/** Throttle change per second while Shift/Ctrl is held. */
const THROTTLE_RATE = 0.5;
/**
 * A new vessel's throttle (plan 200, ADR 0216 point 4): half, so the first stage lifts off without a
 * key press. The HUD shows it at once; the sim gets it with the first stage, so the vessel stays at
 * rest on the pad (a raised throttle wakes it and caps warp).
 */
export const DEFAULT_THROTTLE = 0.5;
/** Governor changes Debug → Info lists (plan 201). */
const GOVERNOR_LOG = 5;
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
	/** The world's warp limit for the vessel (plan 206), and the text of the last clamp. */
	warpLimit: WarpLimitSnapshot | null;
	warpClamp: string | null;
	map: boolean;
	autopilot: string | null;
	/**
	 * A crew member outside in a suit (plan 109, ADR 0120): since plan 225 the suit has focus, and
	 * this is its HUD state: the vessel it came from, its propellant, O₂, charge and jetpack.
	 */
	eva: {
		suit: number;
		name: string;
		walking: boolean;
		radio?: RadioBars;
		ship?: number | null;
		latched?: boolean;
		status?: SuitStatus | null;
	} | null;
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
	onKey?(
		key: 'escape' | 'help' | 'quicksave' | 'quickload' | 'debug' | 'hideUi' | 'screenshot'
	): void;
	/** The sim's save just before a fresh launch (plan 230): what Revert to the Hangar restores. */
	onLaunchPoint?(sim: SimSave): void;
	/** The camera mode to start in (plan 226: the world's last one) and where a change goes. */
	cameraMode?: CameraMode;
	onCameraMode?(mode: CameraMode): void;
	/** A loaded flight (plan 043): the sim resumes it instead of launching `design`, which is the save's own. */
	resume?: GameSave;
	/**
	 * The world's running sim (plan 204, ADR 0201): the flight uses it instead of starting a Worker
	 * and leaves it running on dispose. With it, `resume` only says which vessel to take up.
	 */
	client?: SimClient;
	/** Take up a vessel already flying in `client` (back in Flight from another page) instead of launching. */
	attach?: { vessel: number };
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
	/** The stage stack's delta-v body and situation (plan 224); null follows the vessel. */
	setDeltaVView(view: DeltaVView | null): void;
	/** The map view's maneuver planner (plan 045); null until the sim has started. */
	readonly maneuver: ManeuverController | null;
	/** Time warp to the burn of the earliest maneuver node. */
	warpToNode(): void;
	/** The design of the vessel flown now (plan 221: it changes with a switch). */
	readonly design: VesselDesign;
	/** Fly another vessel without a reload (plan 221); refused with a reason when it cannot be flown. */
	switchVessel(id: number): Promise<{ ok: true } | { ok: false; reason: string }>;
	/** `]` (1) and `[` (-1): the nearest other vessel within 2.5 km, or the farthest. */
	cycleVessel(direction: 1 | -1): void;
	/** Time warp to just before the next apsis (plan 206): the sim works out the time and the level. */
	warpToApsis(to: 'apoapsis' | 'periapsis'): void;
	/** Time warp to `time` (plan 224: a map marker, already less its margin) or to an alarm by id. */
	warpTo(to: { time: number } | { alarm: string }): void;
	/** Set an alarm for the flown vessel (plan 224): its apsis, or a time with a name and lead. */
	addAlarm(alarm: {
		kind: 'time' | 'apoapsis' | 'periapsis' | 'soi' | 'node';
		name?: string;
		time?: number;
		lead?: number;
	}): Promise<boolean>;
	/** Whether the world is behind the real date `nowMs` (plan 087, ADR 0143): offer, unavailable or none. */
	catchUp(nowMs: number): CatchUp;
	/** Accept the catch-up: `warp-to` the real date; resolves with the sim's answer (null when nothing to do). */
	acceptCatchUp(nowMs: number): Promise<CommandResult | null>;
	/** Remove the earliest maneuver node. */
	removeNode(): void;
	toggleMap(): void;
	/** The flight camera (plan 226): the next mode (V), the mode now, a part to look at or none. */
	cycleCameraMode(): void;
	readonly cameraMode: CameraMode;
	focusPart(part: number | null): void;
	/** One frame of the canvas as a PNG; null before the renderer exists. */
	capture(): Promise<Blob | null>;
	cycleSpeedMode(): void;
	/** Ask for a stability assist mode (the SAS buttons next to the navball; plan 042). */
	setSas(mode: SasMode): void;
	/** RCS on or off (the R key and the RCS pill; plan 211). */
	toggleRcs(): void;
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
	/**
	 * Pixels of the view the interface covers; the camera centres the vessel in the rest (plan 023).
	 * Since plan 215 only the fixed bars count unless the player asked for the free area; `animate`
	 * eases a change over 250 ms.
	 */
	setViewInsets(
		insets: { top: number; right: number; bottom: number; left: number },
		options?: { animate?: boolean }
	): void;
	/** What dock panel selectors read now (plan 112, ADR 0149 point 2); null before the first snapshot. */
	panelInput(): PanelInput | null;
	/** Rim-light one part in the view, or none (plan 111, ADR 0153 point 5). */
	highlightPart(part: EntityId | null): void;
	/** The flown vessel's part under a point of the view (CSS px of the canvas box), or null (plan 214). */
	partAt(x: number, y: number): EntityId | null;
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
	/** What the Debug panel and the debug API work on (plan 203). */
	readonly debug: DebugHost;
	/** The Debug panel's Info tab: sim step time, graphics level, vessels (plan 203). */
	debugInfo(): DebugInfo;
	dispose(): void;
}

/** The numbers of the Debug panel's Info tab that only the flight knows. */
export interface DebugInfo {
	/** Wall time of the last sim step, ms; null before the first snapshot. */
	stepMs: number | null;
	vessels: number;
	/** The preset drawn now, its resolution scale and whether the governor may change them. */
	preset: string | null;
	scale: number;
	governor: boolean;
	/** The governor's latest changes, newest last (plan 201): `mm:ss preset at NN%`. */
	governorChanges: readonly string[];
	/** The game's API version and the mods running. */
	versions: string;
}

/** The home body of a sim's catalog (plan 122, ADR 0119): the sim's `home`, else the same rule as core's. */
const homeOfCatalog = (c: Catalog): BodyDefinition | undefined =>
	c.bodies.find((b) => b.id === c.home) ?? homeBodyOf(c.bodies);

export function startFlight(options: FlightOptions): Flight {
	const { canvas } = options;
	/** The flown vessel's design (plan 221): the launch design, or the record of a vessel switched to. */
	let design = options.design;
	const de440 = options.ephemeris ? { ephemeris: options.ephemeris } : {};
	// the world's one sim (plan 204, ADR 0201): given by the world session; a Worker of its own only
	// for a host without one (tests, a page outside a world)
	const ownsClient = options.client === undefined;
	const client: SimClient =
		options.client ??
		startSimWorker(
			options.resume
				? { resume: options.resume.sim, ...de440 }
				: options.into
					? { resume: options.into, ...de440 }
					: options.world
						? { world: options.world, ...de440 }
						: {}
		);
	/** Unsubscribes from the shared client on dispose. */
	const offClient: Array<() => void> = [];
	let renderer: Renderer | null = null;
	let governor: QualityGovernor | null = null;
	/** The governor's latest changes for Debug → Info (plan 201), at most `GOVERNOR_LOG`. */
	const governorChanges: string[] = [];
	const governorStart = performance.now();
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
		warpLimit: null,
		warpClamp: null,
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
	const director = createDirector(pageAudio(), {
		// the touchdown has no toast of its own: the cue's visual sign (plan 227, rancangan §11.8)
		onCue: (id, detail) => {
			if (id === 'touchdown' && detail.speed !== undefined)
				hudCtl?.notice({
					kind: detail.speed >= 6 ? 'warning' : 'info',
					title: `Touchdown at ${detail.speed.toFixed(1)} m/s`,
					key: 'touchdown'
				});
		},
		// the cues played, for the e2e (`data-audio-cues`), as the engine publishes `data-audio`
		publish: (played) => {
			if (typeof document === 'undefined') return;
			document.documentElement.dataset.audioCues = Object.entries(played)
				.map(([id, n]) => `${id}:${n}`)
				.join(',');
		}
	});
	let audioView: AudioFlightView | null = null;
	let modal = false;
	let script: ScriptView = idleScript();
	let scriptDirty = false;
	/** Counts Runs and Stops, so a sandbox that finishes starting after a newer action is dropped. */
	let scriptRun = 0;
	/** The HUD for `design` and, for a vessel that already flew, its part indices and stages fired. */
	function makeHud(
		c: Catalog,
		resume?: { entityIndex: ReadonlyMap<number, number>; stagesFired: number }
	): HudController {
		return createHudController({
			design,
			content: options.content,
			bodies: c.bodies,
			...(c.epoch ? { epoch: c.epoch } : {}),
			project: (world) => renderer?.project(world) ?? null,
			rendezvous: () => targetView?.info ?? null,
			...(resume ? { resume } : {})
		});
	}
	/** Part entity to design index and stages fired, from the snapshot (plan 221). */
	const recordOf = (v: VesselSnapshot) => ({
		entityIndex: new Map(
			v.parts.flatMap((p) => (p.index === undefined ? [] : [[Number(p.id), p.index] as const]))
		),
		stagesFired: v.nextStage ?? 0
	});

	/**
	 * Fly another vessel (plan 221, ADR 0208 point 2): its design record from the sim, a new HUD,
	 * the camera on it. No reload; the sim brings it into physics when the player acts on it.
	 */
	async function switchVessel(
		id: number,
		/** A dock or undock changed the vessel (plan 222): reload its record, no "Switched" notice. */
		refresh = false
	): Promise<{ ok: true } | { ok: false; reason: string }> {
		if (!catalog || !snap) return { ok: false, reason: 'the flight has not started' };
		if (!refresh && vessel !== null && Number(vessel) === id) return { ok: true };
		const v = snap.vessels.find((x) => Number(x.id) === id);
		if (!v) return { ok: false, reason: `vessel ${id} is gone` };
		if (v.owner !== undefined)
			return { ok: false, reason: `${v.name ?? 'that vessel'} belongs to another agency` };
		const record = await client.designOf(id);
		if (!record) return { ok: false, reason: `vessel ${id} has no design record` };
		if (disposed) return { ok: false, reason: 'the flight ended' };
		const now = client.latest?.vessels.find((x) => Number(x.id) === id) ?? v;
		design = { ...record.design, name: now.name ?? record.design.name };
		vessel = entityId(id);
		client.stopScript();
		throttle = sentThrottle = 0;
		padThrottle = false;
		hudCtl = makeHud(catalog, recordOf(now));
		presence.attach(vessel);
		hudCtl.attach(id);
		if (client.latest) hudCtl.snapshot(client.latest);
		renderer?.setActiveVessel(vessel);
		hud.vesselName = design.name;
		hud.model = null;
		if (!refresh)
			hudCtl.notice({ kind: 'info', title: `Switched to ${design.name}`, key: 'switch' });
		publish();
		return { ok: true };
	}

	/** `[` and `]` (plan 221): the player's vessels within physics range, nearest first. */
	function cycleVessel(direction: 1 | -1): void {
		if (!snap || vessel === null) return;
		const here = snap.vessels.find((v) => v.id === vessel);
		if (!here) return;
		const near = snap.vessels
			.filter((v) => v.id !== vessel && v.owner === undefined && v.soi === here.soi)
			.map((v) => ({
				id: Number(v.id),
				d: Math.hypot(
					v.position.x - here.position.x,
					v.position.y - here.position.y,
					v.position.z - here.position.z
				)
			}))
			.filter((v) => v.d <= SWITCH_RANGE)
			.sort((a, b) => a.d - b.d || a.id - b.id);
		const pick = direction > 0 ? near[0] : near[near.length - 1];
		if (!pick) {
			hudCtl?.notice({ kind: 'info', title: 'No other vessel within 2.5 km', key: 'switch' });
			return;
		}
		void switchVessel(pick.id).then((r) => {
			if (!r.ok) hudCtl?.refused('switch', r.reason);
		});
	}

	const publish = (): void =>
		options.onHud({ ...hud, telemetry: hud.telemetry && { ...hud.telemetry } });

	const send = (command: Command): Promise<boolean> =>
		client.dispatch(command).then((result) => {
			if (!result.ok) {
				hudCtl?.refused(command.type, result.reason);
				logBuffer.add('warn', 'command', `${command.type} refused: ${result.reason}`);
			}
			return result.ok;
		});

	/** `warp-to` at the top level the bar offers (plan 206); the sim grants what the world allows. */
	function warpToCommand(to: { time: number } | { target: WarpTarget }): void {
		const top = steps()[steps().length - 1]!;
		void client
			.dispatch({ type: 'warp-to', ...to, factor: top, ...(vessel !== null ? { vessel } : {}) })
			.then((r) => {
				if (!r.ok) return hudCtl?.refused('warp-to', r.reason);
				hud.warp = r.granted ?? top;
				hud.warpClamp = r.limit ?? null;
				publish();
			});
	}

	// --- input state -------------------------------------------------------------------------
	const held = new Set<string>();
	/** Caps Lock is on: fine control (plan 211); read from the modifier state of each key event. */
	let precision = false;
	let throttle = 0;
	/** The pitch trim sent last (plan 063): R and F step it. */
	let trim = 0;
	let sentThrottle = 0;
	/** The HUD's pad throttle the sim has not been sent yet (`DEFAULT_THROTTLE`). */
	let padThrottle = false;
	/** Fires the next stage; the pad throttle goes first (quietly: an uncontrolled vessel's chip says why). */
	async function stageNext(): Promise<void> {
		if (vessel === null) return;
		const id = vessel;
		if (padThrottle) {
			padThrottle = false;
			await client.dispatch({ type: 'throttle', vessel: id, value: sentThrottle });
		}
		await send({ type: 'stage', vessel: id });
	}
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

	/** The suit has focus (plan 225): EVA keys instead of the flight's. */
	const onSuit = (): boolean =>
		hud.eva !== null && vessel !== null && Number(vessel) === hud.eva.suit;
	let sentWalk = 'stop';
	let sentClimb = 0;
	/** Walk, climb or fly the suit from the held EVA keys, relative to the view (plan 225). */
	function sendEvaInput(): void {
		const e = hud.eva;
		const s = snap?.vessels.find((v) => Number(v.id) === Number(vessel));
		if (!e || !s || !snap || vessel === null) return;
		const forward = axis('evaBack', 'evaForward');
		const side = axis('evaLeft', 'evaRight');
		if (e.latched) {
			if (forward !== sentClimb) {
				sentClimb = forward;
				void send({ type: 'crew-climb', suit: vessel, rate: forward });
			}
			return;
		}
		const view = renderer?.viewDirection() ?? { x: 0, y: 0, z: 0 };
		if (e.status?.jetpack) {
			const vertical = (isHeld('evaRun') ? 1 : 0) - (isHeld('evaDown') ? 1 : 0);
			const t = jetpackTranslate(view, s.position, s.orientation, forward, side, vertical);
			const roll = axis('evaTurnLeft', 'evaTurnRight');
			const r = (x: number) => Math.round(x * 50) / 50;
			const key = [0, 0, roll, r(t.x), r(t.y), r(t.z)].join(',');
			if (key !== sentAttitude) {
				sentAttitude = key;
				void send({
					type: 'attitude',
					vessel,
					pitch: 0,
					yaw: 0,
					roll,
					translate: { x: r(t.x), y: r(t.y), z: r(t.z) }
				});
			}
			return;
		}
		const body = snap.bodies.find((b) => String(b.id) === String(s.soi));
		const heading = body ? walkHeading(view, s.position, body.rotation, forward, side) : null;
		const speed = heading === null ? 0 : isHeld('evaRun') ? RUN_SPEED : WALK_SPEED;
		const key = heading === null ? 'stop' : `${heading.toFixed(2)},${speed}`;
		if (key !== sentWalk) {
			sentWalk = key;
			void send({ type: 'crew-walk', vessel, heading: heading ?? 0, speed });
			hud.eva = { ...e, walking: heading !== null };
		}
	}

	function sendInput(dt: number): void {
		if (vessel === null) return;
		if (onSuit()) return sendEvaInput();
		const up = isHeld('throttleUp');
		const down = isHeld('throttleDown');
		throttle = Math.min(
			1,
			Math.max(0, throttle + ((up ? 1 : 0) - (down ? 1 : 0)) * THROTTLE_RATE * dt)
		);
		if (!auto && Math.abs(throttle - sentThrottle) > 0.004) {
			sentThrottle = throttle;
			padThrottle = false;
			void send({ type: 'throttle', vessel, value: throttle });
		}
		if (!auto) {
			// fine control (Caps Lock, plan 211) scales the pilot's keys, not SAS
			const k = precision ? PRECISION : 1;
			const a = [
				Math.max(-1, Math.min(1, k * axis('pitchMinus', 'pitchPlus') + touchAttitude.pitch)),
				Math.max(-1, Math.min(1, k * axis('yawMinus', 'yawPlus') + touchAttitude.yaw)),
				Math.max(-1, Math.min(1, k * axis('rollMinus', 'rollPlus') + touchAttitude.roll))
			];
			// RCS translation (plan 211): x right, y forward along the nose, z up
			const t = [
				k * axis('translateLeft', 'translateRight'),
				k * axis('translateBack', 'translateForward'),
				k * axis('translateDown', 'translateUp')
			];
			const key = [...a, ...t].join(',');
			if (key !== sentAttitude) {
				sentAttitude = key;
				void send({
					type: 'attitude',
					vessel,
					pitch: a[0]!,
					yaw: a[1]!,
					roll: a[2]!,
					translate: { x: t[0]!, y: t[1]!, z: t[2]! }
				});
			}
		}
	}

	/** The world's levels (plan 206): 9 in a Sol world. */
	const steps = (): readonly number[] => warpStepsFor(catalog?.systemId);
	function setWarp(index: number): void {
		const list = steps();
		const next = Math.min(list.length - 1, Math.max(0, index));
		const factor = list[next]!;
		// the sim grants as much as the world allows and says why when it is less (ADR 0202 point 4)
		void client
			.dispatch({ type: 'warp', factor, ...(vessel !== null ? { vessel } : {}) })
			.then((r) => {
				if (!r.ok) {
					hudCtl?.refused('warp', r.reason);
					return;
				}
				const granted = r.granted ?? factor;
				if (granted !== hud.warp) director.cue(granted > hud.warp ? 'warp-up' : 'warp-down');
				hud.warp = granted;
				hud.warpClamp = r.limit ?? null;
				warpIndex = list.reduce((at, step, i) => (step <= granted ? i : at), 0);
				if (r.limit) logBuffer.add('info', 'warp', r.limit);
				publish();
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
		precision = e.getModifierState?.('CapsLock') ?? false;
		if (modal || e.repeat || typingInField(e)) return;
		const id = keyIdOf(e);
		const chord = chordIdOf(e);
		const km = keymap();
		// Map keys first, and only in the map (plan 216): a node key with no node selected falls through.
		if (renderer?.isMapView) {
			const mapAction = km.actionFor('map', chord) ?? km.actionFor('map', id);
			if (mapAction && mapKey(mapAction, e)) return;
		}
		// A suit with focus takes the EVA keys first (plan 225); the rest stay the flight's.
		if (onSuit() && !renderer?.isMapView) {
			const evaAction = km.actionFor('eva', id);
			if (evaAction) {
				held.add(id);
				e.preventDefault();
				evaKey(evaAction);
				return;
			}
		}
		// A chord bound to an action is that action; an unbound chord is its plain key (Alt+W pitches).
		const chordAction = chord === id ? null : km.actionFor('flight', chord);
		const action = chordAction ?? km.actionFor('flight', id);
		if (chordAction) e.preventDefault();
		else held.add(id);
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
			case 'debug':
				if (!e.altKey) break;
				e.preventDefault();
				options.onKey?.('debug');
				break;
			case 'throttleFull':
				throttle = 1;
				break;
			case 'throttleCut':
				throttle = 0;
				break;
			case 'stage':
				e.preventDefault();
				void stageNext();
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
			case 'vesselNext':
			case 'vesselPrev':
				e.preventDefault();
				cycleVessel(action === 'vesselNext' ? 1 : -1);
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
			case 'rcsToggle':
				toggleRcs();
				break;
			case 'gear':
				if (vessel !== null)
					void send({ type: 'action-group', vessel, group: 'stock.landing-gear' });
				break;
			case 'lights':
				if (vessel !== null) void send({ type: 'action-group', vessel, group: 'stock.lights' });
				break;
			case 'abort':
				// Abort is a later plan's; in the map it still removes the selected node (ADR 0061)
				if (renderer?.isMapView && maneuverCtl?.key('nodeDelete', {})) e.preventDefault();
				break;
			case 'map':
				toggleMap();
				break;
			// the camera (plan 226, ADR 0226)
			case 'cameraMode':
				e.preventDefault();
				cycleCameraMode();
				break;
			case 'cameraReset':
				e.preventDefault();
				renderer?.focusPart(null);
				break;
			case 'hideUi':
			case 'screenshot':
				e.preventDefault();
				options.onKey?.(action);
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
	/** A map-scope key in the map view: true when it did something (plan 216: node keys need a node). */
	function mapKey(action: ActionId, e: KeyboardEvent): boolean {
		switch (action) {
			case 'mapFocus':
				// look at the next body (the vessel's own sphere first)
				e.preventDefault();
				cycleMapFocus(e.shiftKey ? -1 : 1);
				return true;
			case 'nodePrograde':
			case 'nodeRetrograde':
			case 'nodeNormal':
			case 'nodeAntinormal':
			case 'nodeRadialOut':
			case 'nodeRadialIn':
			case 'nodeDelete':
				if (!maneuverCtl?.key(action, { shift: e.shiftKey, alt: e.altKey })) return false;
				e.preventDefault();
				return true;
			default:
				return false;
		}
	}
	const onKeyUp = (e: KeyboardEvent): void => {
		precision = e.getModifierState?.('CapsLock') ?? false;
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
		// The middle button looks at the part under it (plan 226); Backtick looks at the vessel again.
		if (e.button === 1 && e.pointerType === 'mouse') {
			e.preventDefault();
			const box = canvas.getBoundingClientRect();
			const part = renderer?.isMapView
				? null
				: (renderer?.partAt(e.clientX - box.left, e.clientY - box.top) ?? null);
			if (part !== null) renderer?.focusPart(part);
			return;
		}
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

	let cameraMode: CameraMode = options.cameraMode ?? 'free';
	/** V and the toolbar's Change camera (plan 226): the next mode, named in a toast. */
	function cycleCameraMode(): void {
		setCameraMode(nextCameraMode(cameraMode));
	}
	function setCameraMode(mode: CameraMode): void {
		cameraMode = mode;
		renderer?.setCameraMode(mode);
		hudCtl?.notice({ kind: 'info', title: CAMERA_MODE_LABEL[mode], key: 'camera-mode' });
		options.onCameraMode?.(mode);
	}

	function setSas(mode: SasMode): void {
		const command = hudCtl?.sasCommand(mode);
		if (command) {
			void send(command);
			director.event(command.type === 'sas' && command.mode === 'off' ? 'sasOff' : 'sasOn');
		}
	}

	function toggleRcs(): void {
		if (vessel === null) return;
		const on = hud.model?.rcs === 'on' || hud.model?.rcs === 'dry';
		void send({ type: 'set-rcs', vessel, on: !on });
		director.event(on ? 'sasOff' : 'sasOn');
	}

	function setTarget(key: string | null): void {
		const command = hudCtl?.targetCommand(key);
		if (command) void send(command);
	}

	// ---- EVA (plan 109, ADR 0120; plan 225, ADR 0209): focus and the HUD move to the suit ----
	async function eva(member: string): Promise<void> {
		if (vessel === null || hud.eva) return;
		const ship = Number(vessel);
		const name = client.latest?.crew?.find((m) => m.id === member)?.name ?? member;
		const result = await client.dispatch({ type: 'crew-eva', vessel, member });
		if (!result.ok) return void hudCtl?.refused('crew-eva', result.reason);
		const suit = Number(result.vessel);
		sentWalk = 'stop';
		sentClimb = 0;
		// the suit exists from the next snapshot on: focus can only move once the flight has seen it
		evaPending = true;
		await untilSeen(suit);
		const switched = await switchVessel(suit);
		evaPending = false;
		if (!switched.ok) renderer?.setActiveVessel(result.vessel as EntityId);
		hud.eva = { suit, name, walking: false, ship, latched: false, status: null };
		publish();
	}
	/** Set while focus moves to a new suit, so the frame does not end the EVA HUD meanwhile. */
	let evaPending = false;
	/** Resolves once the flight's snapshot holds vessel `id` (at most about 3 s). */
	async function untilSeen(id: number): Promise<void> {
		for (let i = 0; i < 60 && !disposed; i++) {
			if (snap?.vessels.some((v) => Number(v.id) === id)) return;
			await new Promise((r) => setTimeout(r, 50));
		}
	}
	/** The discrete EVA keys (plan 225). */
	function evaKey(action: ActionId): void {
		const e = hud.eva;
		if (!e || vessel === null) return;
		const suit = vessel;
		switch (action) {
			case 'evaJetpack': {
				const part = e.status?.jetpackPart;
				if (part === null || part === undefined) return;
				void send({
					type: 'action',
					vessel: suit,
					part: part as EntityId,
					module: JETPACK_MODULE,
					action: 'setOn',
					args: [!(e.status?.jetpack ?? false)]
				});
				return;
			}
			case 'evaGrab':
			case 'evaJump':
				if (e.latched) {
					void send({ type: 'crew-grab', suit, release: true });
					hud.eva = { ...e, latched: false };
				} else if (action === 'evaGrab') {
					void client.dispatch({ type: 'crew-grab', suit }).then((r) => {
						if (!r.ok) return void hudCtl?.refused('crew-grab', r.reason);
						sentClimb = 0;
						if (hud.eva) hud.eva = { ...hud.eva, latched: true, walking: false };
						publish();
					});
				} else void send({ type: 'crew-jump', suit });
				publish();
				return;
			case 'evaBoard':
				void board();
				return;
		}
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
		if (!e || !snap || !catalog) return;
		const target = boardTarget(snap, e.suit, partsById(), e.ship ?? null);
		if (target === null)
			return void hudCtl?.refused('crew-board', 'no vessel within 60 m to board');
		const result = await client.dispatch({
			type: 'crew-board',
			suit: e.suit as EntityId,
			vessel: target as EntityId
		});
		if (!result.ok) return void hudCtl?.refused('crew-board', result.reason);
		hud.eva = null;
		await untilSeen(target);
		const switched = await switchVessel(target);
		if (!switched.ok) renderer?.setActiveVessel(target as EntityId);
		publish();
	}
	let partsCache: { from: Catalog; map: Map<string, PartDefinition> } | null = null;
	const partsById = (): Map<string, PartDefinition> => {
		if (!catalog) return new Map();
		if (partsCache?.from !== catalog)
			partsCache = { from: catalog, map: new Map(catalog.parts.map((p) => [String(p.id), p])) };
		return partsCache.map;
	};

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
		director.cue(hud.map ? 'map-open' : 'map-close');
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
				if (c.type === 'throttle') {
					throttle = sentThrottle = c.value;
					padThrottle = false;
				}
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
			logBuffer.add('info', 'graphics', `governor: ${level.preset} at ${percent}%`);
			const s = Math.floor((performance.now() - governorStart) / 1000);
			const at = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
			governorChanges.push(`${at} ${level.preset} at ${percent}%`);
			if (governorChanges.length > GOVERNOR_LOG) governorChanges.shift();
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
				// the suit with focus (plan 225): reached by EVA or by `[`/`]`; anything else ends the EVA HUD
				const focused = snap.vessels.find((v) => Number(v.id) === Number(vessel));
				if (focused && catalog && isSuit(focused, partsById())) {
					const id = Number(focused.id);
					const name =
						snap.crew?.find((m) => Number(m.vessel) === id)?.name ?? focused.name ?? 'Crew';
					const base = hud.eva?.suit === id ? hud.eva : { suit: id, name, walking: false };
					hud.eva = { ...base, status: suitStatus(focused) };
				} else if (hud.eva && !evaPending) hud.eva = null;
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
						atmosphere: catalog?.bodies.find((b) => b.id === soi)?.atmosphere,
						rcs: m.rcsFiring,
						radar: m.radar,
						walking: hud.eva?.walking === true,
						jetpack: hud.eva?.status?.jetpackFiring ?? 0
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
	offClient.push(
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
				if (simWarp <= 1) hud.warpClamp = null;
				warpIndex = Math.max(
					0,
					steps().reduce((at, step, i) => (step <= simWarp ? i : at), 0)
				);
			}
			hud.warpLimit = s.warpLimit ?? null;
			presence.snapshot(s);
			hudCtl?.snapshot(s);
			dirty = true;
			auto?.update(s);
		})
	);
	offClient.push(
		client.onStage((event) => {
			logBuffer.add('info', 'sim', `stage ${event.stage} fired on vessel ${event.vessel}`);
			hudCtl?.stage(event);
			director.cue('decouple');
		})
	);
	offClient.push(
		client.onSimEvent((event) => {
			const line = simEventLine(event);
			logBuffer.add(line.level, 'sim', line.message);
			// the active vessel docked (or was docked into another) or undocked: follow the merged or
			// split vessel with its new design record, then toast on the new HUD (plan 222)
			const active = vessel === null ? null : Number(vessel);
			const follow =
				(event.type === 'docked' && (active === event.vessel || active === event.absorbed)) ||
				(event.type === 'undocked' && active === event.vessel);
			if (follow) void switchVessel(event.vessel, true).then(() => hudCtl?.simEvent(event));
			else hudCtl?.simEvent(event);
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
			// a hard landing is a touchdown the radar may not catch between two readings (plan 227)
			if (event.type === 'part-damaged' && event.cause !== 'overheat') director.touch(event.speed);
			// a destroyed part explodes, louder the heavier it was (plan 227)
			if (event.type === 'part-damaged' && event.outcome === 'destroyed') {
				const mass = catalog?.parts.find((p) => String(p.id) === event.definition)?.mass ?? 500;
				director.cue('explosion', Math.min(1, Math.sqrt(mass / 4000)));
			}
			// a canopy streaming, then filling (plan 209); a torn one warns
			if (event.type === 'parachute-deployed')
				director.cue(event.stage === 'semi' ? 'chute-semi' : 'chute-full');
			if (event.type === 'parachute-torn') director.event('warning');
			if (event.type === 'docked') director.cue('docking');
		})
	);
	offClient.push(
		client.onScript((event) => {
			script = reduceScript(script, event);
			scriptDirty = true;
			// The script ended (or never ran): removing the iframe also kills a Worker that is still
			// spinning inside a native builtin (ADR 0038).
			if (event.kind === 'script-status' && !scriptIsActive(event.status)) options.sandbox?.close();
		})
	);
	offClient.push(
		client.onError((message) => {
			logBuffer.add('error', 'sim', message);
			hud.status = 'error';
			hud.message = message;
			publish();
		})
	);
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
					blocked: () => snap?.debug?.usedCheats === true,
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
			hudCtl = makeHud(
				c,
				resumed ? { entityIndex: resumed.entityIndex, stagesFired: resumed.stagesFired } : undefined
			);
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
			renderer.setCameraMode(cameraMode);
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
				padThrottle = resumed.throttle > 0; // a pad throttle saved before it was sent

				const warp = options.resume.sim.warp;
				hud.warp = warp;
				warpIndex = Math.max(0, steps().indexOf(warp));
			} else if (options.attach) {
				vessel = entityId(options.attach.vessel);
				const flying = snap?.vessels.find((v) => v.id === vessel);
				// back in Flight on a vessel that already flew: its stages and parts as they are now
				if (flying) hudCtl = makeHud(c, recordOf(flying));
				hud.warp = client.latest ? hud.warp : 1;
				if (!flying && client.latest && !client.latest.vessels.some((v) => v.id === vessel)) {
					hud.status = 'lost';
					hud.message = 'the vessel is no longer in the world';
					publish();
					return;
				}
			} else {
				// the world as it was before the launch: Revert goes back to it (plan 230)
				if (options.onLaunchPoint) options.onLaunchPoint(await client.save());
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
				throttle = sentThrottle = DEFAULT_THROTTLE;
				padThrottle = true;
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
		partAt: (x, y) => renderer?.partAt(x, y) ?? null,
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
		get design() {
			return design;
		},
		switchVessel,
		cycleVessel,
		warpToApsis(to) {
			if (vessel === null) return;
			warpToCommand({ target: { kind: to, vessel } });
		},
		addAlarm(alarm) {
			return send({ type: 'add-alarm', ...alarm, ...(vessel !== null ? { vessel } : {}) });
		},
		warpTo(to) {
			warpToCommand('time' in to ? { time: to.time } : { target: { kind: 'alarm', id: to.alarm } });
		},
		debug: {
			snapshot: () => snap,
			vessel: () => vessel,
			send: (command) => client.dispatch(command),
			onSnapshot: (listener) => client.onSnapshot((s) => listener(s)),
			bodies: () => catalog?.bodies ?? [],
			home: () => (catalog ? (homeOfCatalog(catalog)?.id ?? '') : ''),
			notice: (toast) => hudCtl?.notice(toast),
			vesselOnScreen() {
				const v = snap?.vessels.find((x) => x.id === vessel);
				const body = v && snap?.bodies.find((b) => b.id === v.soi);
				if (!v || !body || !renderer) return null;
				const p = renderer.project({
					x: body.position.x + v.position.x,
					y: body.position.y + v.position.y,
					z: body.position.z + v.position.z
				});
				return p ? { x: p.x, y: p.y } : null;
			},
			partOnScreen(part) {
				const v = snap?.vessels.find((x) => x.id === vessel);
				const body = v && snap?.bodies.find((b) => b.id === v.soi);
				const p = v?.parts.find((x) => x.id === part);
				if (!v || !body || !p || !renderer) return null;
				const at = renderer.project({
					x: body.position.x + v.position.x + p.position.x,
					y: body.position.y + v.position.y + p.position.y,
					z: body.position.z + v.position.z + p.position.z
				});
				return at ? { x: at.x, y: at.y } : null;
			}
		},
		debugInfo: () => ({
			stepMs: client.stepMs,
			vessels: snap?.vessels.length ?? 0,
			preset: renderer?.preset ?? null,
			scale: governor?.level.scale ?? 1,
			governor: autoQuality,
			governorChanges: [...governorChanges],
			versions: [`api ${API_VERSION}`, ...(catalog?.plugins ?? [])].join(', ')
		}),
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
		setViewInsets(insets, options) {
			viewInsets = insets;
			renderer?.setViewInsets(insets, options);
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
				hud.warp = r_granted(result);
				publish();
			}
			return result;
		},
		removeNode() {
			const first = snap?.vessels.find((v) => Number(v.id) === vessel)?.nodes?.[0];
			if (first) maneuverCtl?.remove(first.id);
		},
		stage() {
			void stageNext();
		},
		setDeltaVView(view) {
			hudCtl?.setDeltaVView(view);
		},
		toggleMap,
		cycleCameraMode,
		get cameraMode() {
			return cameraMode;
		},
		focusPart(part) {
			renderer?.focusPart(part === null ? null : entityId(part));
		},
		capture: () => renderer?.capture() ?? Promise.resolve(null),
		cycleSpeedMode() {
			hudCtl?.cycleSpeedMode();
		},
		setSas,
		toggleRcs,
		setTarget,
		eva: (member) => void eva(member),
		walk,
		plantFlag,
		board: () => void board(),
		cycleTarget,
		planAid,
		setPaused(paused) {
			hud.paused = paused;
			// a shared world clock is the world layout's to pause (plan 205, ADR 0201 point 4)
			if (ownsClient) client.setPaused(paused);
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
			for (const off of offClient) off();
			if (ownsClient) {
				options.sandbox?.close();
				client.dispose();
			}
			// else the world keeps running without this page (ADR 0201 point 1), and with it a
			// running script and its sandbox (point 9, plan 239)
		}
	};
}
