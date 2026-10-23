/**
 * The HUD's brain, plain TypeScript outside Svelte (ADR 0026). `flight-loop.ts` feeds it snapshots,
 * events and input; it answers with (a) `frame()`, cheap per-frame data for the canvas and the map
 * markers, and (b) `model()`, the complete display model Svelte renders at ~10 Hz.
 */
import type { HeatMark } from './hud/heat-marks';
import { rcsFiring, rcsState, type RcsState } from './hud/rcs-model';
import { aeroReadout, wingStallAngle, type AeroReadout } from './aircraft/aero-readout';
import { projectGhost, type GhostTrack, type ScreenGhost } from './replays/ghost-model';
import { rangeWarning } from './range/range-model';
import {
	linkBadge,
	projectNetwork,
	type LinkBadge,
	type ScreenNetwork
} from './comms/network-model';
import {
	placeBodyLabels,
	projectBodies,
	siteLabelsShown,
	type BodyLabel
} from './map/body-labels';
import {
	bodyPole,
	calendarOf,
	discoveryDossier,
	dossierOf,
	entityId,
	formatDate,
	homeBodyOf,
	parseSubjectId,
	type BodyDefinition,
	type Command,
	type Dossier,
	type Epoch,
	type SasMode,
	type SasSnapshot,
	type Snapshot,
	type Vec3,
	type VesselDesign,
	type VesselSnapshot
} from '@orbital/core';
import type { ScreenPoint } from '@orbital/renderer';
import { attitudeAngles, markerDirections, type Attitude } from './navball-math';
import type { NavballFrame } from './hud/navball-draw';
import { commandForMode, referenceFollowUp } from './hud/sas-model';
import {
	entityIndexMap,
	stageDeltaV,
	stagingModelFromSnapshot,
	type ContentLookups,
	type DeltaVReport
} from './delta-v';
import type { ManeuverFrame } from './maneuver-controller';
import { burnIndicator, burnTime, type BurnState } from './maneuver';
import {
	bodyLabel,
	displayVesselName,
	groundClearance,
	situationLabel,
	vesselThrottle
} from './hud-model';
import { vesselBlackout } from './blackout';
import { crewCard, type CrewCard } from './crew-card';
import { radarReading } from './radar';
import {
	nextTarget,
	targetChoices,
	targetCommand,
	targetHud,
	type TargetChoice,
	type TargetHud
} from './target-model';
import { bodyMu, orbitInfo, type OrbitInfo } from './orbit-info';
import { planeNodes, referenceNormal } from './nav-markers';
import { bodyNodes } from './map-path';
import type { RendezvousInfo, TargetViewFrame } from './target-view';
import type { SimEventMessage, StageEvent } from './sim-client';
import { nextSpeedMode, speedReadout, type SpeedMode, type SpeedModePreference } from './speed';
import { stageStackModel, type Environment, type StageStackModel } from './stage-stack';
import { noStages, reduceStages, stagesFiredBy, type StageProgress } from './stage-state';
import { computeTelemetry, type FlightPhase, type Telemetry } from './telemetry';
import {
	addToast,
	pruneToasts,
	heatRatio,
	toastForHeat,
	toastForPhase,
	toastForSimEvent,
	toastForRefusal,
	type LiveToast,
	type Toast,
	type ToastContext
} from './toasts';
import { propagate } from '@orbital/kepler';

export interface ResourceRow {
	id: string;
	/** Current / full amount over the parts still on the vessel, in the resource's unit. */
	amount: number;
	capacity: number;
	unit: string;
	/** Net flow, units/s, from the sim (plan 213); absent before it reports one. */
	rate?: number;
	/** Seconds until empty at that rate, or null while it does not drain (plan 213). */
	timeToEmpty?: number | null;
}

/** The earliest maneuver node as the burn panel shows it (plan 045). */
export interface ManeuverHud {
	id: number;
	/** Nodes the vessel has. */
	count: number;
	/** Burn left, m/s. */
	dv: number;
	/** Full-throttle burn time with the stages now, s; null when no engine is lit or fuelled. */
	burnTime: number | null;
	/** The stages cannot deliver `dv`. */
	short: boolean;
	/** Seconds until the node (negative once passed) and until the centred burn starts. */
	toNode: number;
	toBurn: number | null;
	state: BurnState;
	/** The node's body and SAS is pointing at it. */
	pointing: boolean;
	/** Every node in time order (plan 224): the node panel edits the selected one. */
	nodes: NodeHud[];
}

/** The flight stage stack's body and situation picker (plan 224). */
export interface DeltaVView {
	body: string;
	situation: 'vacuum' | 'surface';
}

/** One node for the node panel (plan 224): its plan values and its own burn numbers. */
export interface NodeHud {
	id: number;
	time: number;
	prograde: number;
	normal: number;
	radial: number;
	dv: number;
	burnTime: number | null;
	short: boolean;
	toNode: number;
	toBurn: number | null;
	state: BurnState;
}

export interface HudModel {
	name: string;
	body: string;
	situation: string;
	/** On the pad before the first stage (plan 200). */
	prelaunch: boolean;
	/** Sim time, s: what the clock shows before liftoff. */
	time: number;
	phase: FlightPhase | null;
	met: number;
	/** The game date at `met` in the world's calendar (plan 081, ADR 0141). */
	date: string;
	altitude: number;
	/** Height of the vessel's lowest point above the ground under it, m; null without terrain data or above 20 km (plan 039). */
	radar: number | null;
	speed: number;
	speedMode: SpeedMode;
	speedPreference: SpeedModePreference;
	vertical: number;
	attitude: Attitude | null;
	orbit: OrbitInfo | null;
	stages: StageStackModel;
	environment: 'vacuum' | 'sea-level';
	/** The stage stack's body and situation picker (plan 224); null while it follows the vessel. */
	deltaVView: DeltaVView | null;
	/** The bodies the picker offers, `atmosphere` true where a surface figure differs from vacuum. */
	deltaVBodies: readonly { id: string; label: string; atmosphere: boolean }[];
	stagesFired: number;
	resources: ResourceRow[];
	/** The throttle the vessel is at (scripts and the autopilot included), 0..1. */
	throttle: number;
	/** Hottest part as a fraction of its limit. */
	heat: number;
	/** Loss of signal to the plasma around the vessel, 0..1 (plan 040, ADR 0079). */
	blackout: number;
	/** The predicted drop of the next spent stage breaks the range (plan 127, ADR 0155 point 6). */
	range: string | null;
	/** The link indicator and the reason a link is down (plan 115, ADR 0158); null without a network. */
	link: LinkBadge | null;
	/** Aircraft read-outs (plan 063, ADR 0161 point 6); null without wings or out of the air. */
	aero: AeroReadout | null;
	/** Stability assist state from the snapshot (plan 042); undefined before the sim reports it. */
	sas: SasSnapshot | undefined;
	/** The vessel has a command part: SAS and attitude commands are accepted. */
	controllable: boolean;
	/** Why the sim takes no control commands now (plan 208, ADR 0214): the "Uncontrolled" chip. */
	uncontrolled: 'no-source' | 'no-crew' | 'no-power' | null;
	/** The trim on each axis, -1..1 (plan 245); null while all three are zero. */
	trim: { pitch: number; yaw: number; roll: number } | null;
	/** The RCS pill (plan 211). */
	rcs: RcsState;
	/** How hard the RCS fires, 0..1 (the hiss). */
	rcsFiring: number;
	/** The earliest maneuver node, if any (plan 045). */
	maneuver: ManeuverHud | null;
	/** The vessel's target and what to show about it (plan 035); null without one. */
	target: TargetHud | null;
	/** What the vessel may aim at: bodies, then other vessels (plan 035). */
	targets: TargetChoice[];
	/** Closest approach across spheres and the rendezvous aids for the target (plan 057); null without a target. */
	rendezvous: RendezvousInfo | null;
	/** The target body's dossier from the world's subjects (plan 104); null otherwise. */
	dossier: Dossier | null;
	/** The crew card (plan 107); null without crew aboard. */
	crew: CrewCard | null;
	toasts: LiveToast[];
}

/** The dossier of the body `v` targets, from the world's subjects (plan 104, ADR 0180). */
function targetDossier(
	snap: Snapshot,
	v: VesselSnapshot,
	bodies: readonly BodyDefinition[],
	content: ContentLookups
): Dossier | null {
	if (v.target?.kind !== 'body' || !content.science) return null;
	const body = bodies.find((b) => String(b.id) === String(v.target!.id));
	if (!body) return null;
	const subjects = (snap.science ?? []).flatMap((s) => {
		const parts = parseSubjectId(s.id);
		return parts ? [{ ...parts, count: s.count }] : [];
	});
	const dossier = dossierOf(
		body,
		subjects,
		content.science.dossierEntries,
		content.science.labelOf
	);
	// discovery facts, data and claims (plan 129, ADR 0192 point 10)
	return snap.discovery
		? { ...dossier, discovery: discoveryDossier(String(body.id), snap.discovery) }
		: dossier;
}

/** What the render loop needs every frame (small, no Svelte). */
export interface FrameData {
	navball: NavballFrame | null;
	/** Screen positions in px inside the canvas box; null when not in map view. */
	map: {
		apoapsis: Point | null;
		periapsis: Point | null;
		vessel: Point | null;
		/** Where the orbit crosses the target's plane, or the equator without one (plan 224). */
		nodes?: NavNodeFrame[];
	} | null;
	/** The Network layer in map view (plan 115, ADR 0158); null outside it. */
	network?: ScreenNetwork | null;
	/** The names of the bodies in map view (plan 382); null outside it. */
	bodyLabels?: BodyLabel[] | null;
	/** A replay's ghost (plan 131): its track in map view and where it is now. */
	ghost?: ScreenGhost | null;
	/** Maneuver nodes and handles in px (plan 045); filled in by the flight loop. */
	maneuver?: ManeuverFrame | null;
	/** The target's markers in the map, or its label and arrow in the flight view (plan 057). */
	target?: TargetViewFrame | null;
	/** Heat bars over the hottest parts in the flight view (plan 246); filled in by the flight loop. */
	heat?: HeatMark[] | null;
}
/** An ascending or descending node marker (plan 224). */
export interface NavNodeFrame {
	kind: 'ascending' | 'descending';
	relativeTo: 'target' | 'equator';
	/** Sim time of the crossing. */
	time: number;
	point: Point | null;
}

/** A map marker position in px inside the canvas box; `hidden` when a body is in front of it. */
export type Point = ScreenPoint;

export interface HudControllerOptions {
	design: VesselDesign;
	content: ContentLookups;
	bodies: readonly BodyDefinition[];
	/** The world's epoch (`t = 0`); J2000 / day 0 when absent (plan 081). */
	epoch?: Epoch;
	/**
	 * `Renderer.project` (plan 024, ADR 0033): a point in the sim's inertial frame to canvas pixels
	 * through the camera that is drawn; `null` behind the camera or while there is no renderer.
	 */
	project: (world: Vec3) => Point | null;
	/** The canvas box, px: the body names are placed inside it (plan 382); without it, none are drawn. */
	size?: () => { width: number; height: number };
	/** Wall clock in ms (the render loop's `now`); toasts expire against it. */
	now?: () => number;
	/**
	 * A loaded flight (plan 043): the part entity to design index map of the vessel in focus, which
	 * can no longer be derived from a snapshot of a vessel that already lost parts, and the stages
	 * it had fired.
	 */
	resume?: { entityIndex: ReadonlyMap<number, number>; stagesFired: number };
	/** The target view's approach and aids (plan 057); read at the model's rate. */
	rendezvous?: () => RendezvousInfo | null;
}

export interface HudController {
	attach(vessel: number): void;
	snapshot(s: Snapshot): void;
	stage(e: StageEvent): void;
	simEvent(e: SimEventMessage): void;
	refused(command: string, reason: string): void;
	/** A notice that is not about a command or the sim (the quality governor changed the graphics, plan 039). */
	notice(toast: Toast): void;
	/** Cycles the speed reference; `target` joins the cycle while the vessel has a target (plan 057). */
	cycleSpeedMode(): SpeedModePreference;
	/** The `sas` command a button or key asks for (plan 042); null before a vessel is attached. */
	sasCommand(mode: SasMode): Command | null;
	/** `target-set` for the choice with this key (`body:stock.cinder`), or for none with `null`; null when it is not in the list or there is no vessel (plan 035). */
	targetCommand(key: string | null): Command | null;
	/** `target-set` for the next entry of the list (bodies, other vessels, then none). */
	nextTargetCommand(): Command | null;
	/** The `sas` command that keeps the prograde reference in step with the speed readout, or null. */
	sasFollowUp(): Command | null;
	/**
	 * The stage stack's delta-v for another body and situation (plan 224), or `null` for the
	 * body the vessel is at, in the air or not as it flies now.
	 */
	setDeltaVView(view: DeltaVView | null): void;
	/** Whether the map view is on: map markers are only computed then. */
	setMapView(on: boolean): void;
	/** A replay's ghost to draw over this flight, or none (plan 131, ADR 0159 point 7). */
	setGhost(track: GhostTrack | null): void;
	frame(): FrameData;
	/** `localThrottle`: the page's own setting, used when the vessel has no engine to read it from. */
	model(now: number, localThrottle: number): HudModel | null;
	/** Full-throttle burn time of `dv` m/s with the stages as they are now; null before the first stage reading. */
	burnTimeFor(dv: number): number | null;
	readonly stagesFired: number;
}

const STAGE_RECOMPUTE_MS = 250;

/** The attitude the navball shows (plan 221): the "control from here" part's, else the root's. */
const controlOrientation = (v: VesselSnapshot) =>
	v.controlPart === undefined
		? v.orientation
		: (v.parts.find((p) => p.id === v.controlPart)?.orientation ?? v.orientation);
/** Above this the vessel counts as having left the pad, m (the pad vessel settles within a metre). */
const LIFTOFF_ALTITUDE = 50;

/** The burn panel's numbers for the earliest node of `v`, or null without one. */
function maneuverHud(v: VesselSnapshot, now: number, report: DeltaVReport): ManeuverHud | null {
	const list = v.nodes ?? [];
	if (list.length === 0) return null;
	const nodes = list.map((node): NodeHud => {
		const burn = burnTime(node.dv, report.stages);
		const time = burn.time > 0 ? burn.time : null;
		const indicator = burnIndicator(now, node.time, time ?? 0, node.dv);
		return {
			id: node.id,
			time: node.time,
			prograde: node.prograde,
			normal: node.normal,
			radial: node.radial,
			dv: node.dv,
			burnTime: time,
			short: !burn.enough,
			toNode: indicator.toNode,
			toBurn: time === null ? null : indicator.toBurn,
			state: indicator.state
		};
	});
	const first = nodes[0]!;
	return {
		id: first.id,
		count: nodes.length,
		dv: first.dv,
		burnTime: first.burnTime,
		short: first.short,
		toNode: first.toNode,
		toBurn: first.toBurn,
		state: first.state,
		pointing: v.sas?.mode === 'maneuver',
		nodes
	};
}

export function createHudController(options: HudControllerOptions): HudController {
	const { design, content, bodies } = options;
	const patched = bodyNodes(bodies);
	/** AN/DN of the vessel's closed orbit against its target's plane or the equator (plan 224). */
	function navNodes(v: VesselSnapshot, s: Snapshot, body: BodyDefinition) {
		if (!v.orbit || v.orbit.e >= 1 || v.surface) return [];
		const own = { r: v.position, v: v.velocity };
		const t = v.target;
		let sameSphere = false;
		if (t?.kind === 'vessel') sameSphere = s.vessels.find((x) => x.id === t.id)?.soi === v.soi;
		else if (t?.kind === 'body')
			sameSphere = patched.find((b) => b.id === String(t.id))?.parent === String(v.soi);
		const ref = referenceNormal(
			own,
			t ? { position: t.position, velocity: t.velocity, sameSphere } : null,
			bodyPole(body)
		);
		return planeNodes(own, ref.normal, bodyMu(body), s.t).map((n) => ({
			...n,
			relativeTo: ref.relativeTo
		}));
	}
	const calendar = calendarOf(bodies);
	const bodyRadii = new Map(bodies.map((b) => [String(b.id), b.radius]));
	const epoch: Epoch = options.epoch ?? { day: 0, fraction: 0 };
	const name = displayVesselName(design);
	/** The snapshot's altitude is the root part's; the HUD shows the height of the vessel's base. */
	const clearance = groundClearance(design, content.parts);
	let vessel: number | null = null;
	let snap: Snapshot | null = null;
	let entityIndex: Map<number, number> | null = options.resume
		? new Map(options.resume.entityIndex)
		: null;
	let stages: StageProgress = noStages;
	let preference: SpeedModePreference = 'auto';
	let lastMode: SpeedMode = 'surface';
	let lastPhase: FlightPhase | null = null;
	let toasts: LiveToast[] = [];
	let toastId = 0;
	let heatArmed = true;
	/** Highest altitude seen, m: "Landed" only means something after leaving the ground. */
	let ceiling = 0;
	let map = false;
	let ghost: GhostTrack | null = null;
	/** Sim time of the first snapshot: the ghost runs from the replay's start by the same elapsed time. */
	let firstT: number | null = null;
	let stageCache: {
		at: number;
		model: StageStackModel;
		resources: ResourceRow[];
		report: DeltaVReport;
	} | null = null;

	const hasControlSource = (v: VesselSnapshot): boolean =>
		v.parts.some((p) =>
			(content.parts.get(p.definition)?.modules ?? []).some(
				([id]) => content.modules.get(id)?.controlSource === true
			)
		);
	const find = (): VesselSnapshot | undefined =>
		snap && vessel !== null ? snap.vessels.find((v) => Number(v.id) === vessel) : undefined;
	const bodyOf = (v: VesselSnapshot): BodyDefinition | undefined =>
		bodies.find((b) => b.id === v.soi);

	const ctx: ToastContext = {
		isActivePart: (e) => entityIndex?.has(e) ?? false,
		isActiveVessel: (v) => v === vessel,
		partTitle: (d) => content.parts.get(d)?.title ?? d,
		definitionOf: (e) => {
			const i = entityIndex?.get(e);
			return design.parts.find((p) => p.index === i)?.part;
		},
		home: homeBodyOf(bodies)?.id ?? ''
	};
	const clock = options.now ?? (() => performance.now());
	const push = (t: Toast | null): void => {
		if (t) toasts = addToast(toasts, t, clock(), ++toastId);
	};

	let dvView: DeltaVView | null = null;
	const deltaVBodies = bodies
		.filter((b) => !b.star)
		.map((b) => ({
			id: String(b.id),
			label: bodyLabel(b.id),
			atmosphere: b.atmosphere !== undefined
		}));
	/** The body and situation the stage stack shows: the picker's, else where the vessel is. */
	function stageEnvironment(body: BodyDefinition, altitude: number) {
		const picked = dvView ? bodies.find((b) => String(b.id) === dvView!.body) : undefined;
		if (picked && dvView) {
			const air = dvView.situation === 'surface' ? picked.atmosphere : undefined;
			return {
				body: picked,
				environment: (air ? 'sea-level' : 'vacuum') as Environment,
				pressure: air?.surfacePressure ?? 0
			};
		}
		return {
			body,
			environment: (altitude < (body.atmosphere?.height ?? 0)
				? 'sea-level'
				: 'vacuum') as Environment,
			pressure: undefined
		};
	}

	function stageModel(now: number, v: VesselSnapshot, here: BodyDefinition, altitude: number) {
		if (stageCache && now - stageCache.at < STAGE_RECOMPUTE_MS) return stageCache;
		const fired = stagesFiredBy(stages, vessel);
		const staging = stagingModelFromSnapshot(design, content, v, entityIndex!);
		const { body, environment, pressure } = stageEnvironment(here, altitude);
		const report = stageDeltaV(staging, fired, pressure);
		const g = bodyMu(body) / (body.radius * body.radius);
		const model = stageStackModel({
			report,
			design,
			content,
			environment,
			stagesFired: fired,
			gravity: g
		});
		const totals = new Map<string, ResourceRow>();
		for (const i of staging.alive) {
			const part = staging.parts.get(i)!;
			for (const [r, full] of Object.entries(part.full)) {
				const row = totals.get(r) ?? {
					id: r,
					amount: 0,
					capacity: 0,
					unit: content.resources.get(r)?.unit ?? ''
				};
				row.amount += part.amounts[r] ?? 0;
				row.capacity += full;
				totals.set(r, row);
			}
		}
		// the sim's own totals (plan 213) when the snapshot has them: the same sums, with rates
		const live = find()?.resources;
		const resources: ResourceRow[] = live
			? live.map((r) => ({
					id: r.resource,
					amount: r.amount,
					capacity: r.capacity,
					unit: content.resources.get(r.resource)?.unit ?? '',
					rate: r.rate,
					timeToEmpty: r.timeToEmpty
				}))
			: [...totals.values()];
		stageCache = { at: now, model, resources, report };
		return stageCache;
	}

	return {
		attach(id) {
			vessel = id;
			if (options.resume && options.resume.stagesFired > 0) {
				stages = { ...stages, [id]: options.resume.stagesFired };
			}
		},
		snapshot(s) {
			snap = s;
			const v = find();
			if (v && !entityIndex) entityIndex = entityIndexMap(design, v);
		},
		stage(e) {
			stages = reduceStages(stages, e);
			stageCache = null;
			push(toastForSimEvent({ type: 'stage', vessel: e.vessel, stage: e.stage }, ctx));
		},
		simEvent(e) {
			push(toastForSimEvent(e, ctx));
			stageCache = null;
		},
		refused(command, reason) {
			push(toastForRefusal(command, reason));
		},
		notice(toast) {
			push(toast);
		},
		cycleSpeedMode() {
			preference = nextSpeedMode(preference, find()?.target !== undefined);
			return preference;
		},
		sasCommand(mode) {
			if (vessel === null) return null;
			return commandForMode(entityId(vessel), mode, find()?.sas, lastMode);
		},
		targetCommand(key) {
			if (vessel === null) return null;
			if (key === null) return targetCommand(vessel, null);
			const choice = snap
				? targetChoices(snap, vessel, bodies).find((c) => c.key === key)
				: undefined;
			return choice ? targetCommand(vessel, choice.ref) : null;
		},
		nextTargetCommand() {
			if (vessel === null || !snap) return null;
			// The snapshot's target is a `TargetRef` with its readout on top.
			return targetCommand(vessel, nextTarget(targetChoices(snap, vessel, bodies), find()?.target));
		},
		sasFollowUp() {
			if (vessel === null) return null;
			return referenceFollowUp(entityId(vessel), find()?.sas, lastMode);
		},
		setDeltaVView(view) {
			dvView = view;
			stageCache = null;
		},
		setMapView(on) {
			map = on;
		},
		setGhost(track) {
			ghost = track;
		},
		burnTimeFor(dv) {
			return stageCache ? burnTime(dv, stageCache.report.stages).time : null;
		},
		get stagesFired() {
			return stagesFiredBy(stages, vessel);
		},
		frame() {
			const v = find();
			if (!v) return { navball: null, map: null };
			const body = bodyOf(v);
			let navball: NavballFrame | null = null;
			const r = Math.hypot(v.position.x, v.position.y, v.position.z);
			if (body && r > 0) {
				const read = speedReadout({
					position: v.position,
					velocity: v.velocity,
					altitude: r - body.radius,
					body,
					preference,
					previous: lastMode,
					target: v.target ?? null
				});
				navball = {
					orientation: controlOrientation(v),
					position: v.position,
					markers: markerDirections(
						v.position,
						v.velocity,
						read.velocity,
						v.nodes?.[0]?.vector,
						v.target
							? {
									position: v.target.position,
									velocity: v.target.velocity,
									relative: read.mode === 'target'
								}
							: null
					),
					heading: attitudeAngles(controlOrientation(v), v.position, bodyPole(body)).heading,
					pole: bodyPole(body)
				};
			}
			let marks: FrameData['map'] = null;
			const s = snap;
			const centre = body && s?.bodies.find((b) => b.id === body.id)?.position;
			if (map && body && s && centre) {
				// Orbit points and the vessel are SOI-relative; the renderer takes the inertial frame.
				const at = (p: Vec3): Point | null =>
					options.project({ x: centre.x + p.x, y: centre.y + p.y, z: centre.z + p.z });
				const info = v.orbit ? orbitInfo(v.orbit, bodyMu(body), s.t, body.radius) : null;
				const place = (dt: number | undefined): Point | null =>
					v.orbit && dt !== undefined ? at(propagate(v.orbit, bodyMu(body), s.t + dt).r) : null;
				marks = {
					apoapsis: place(info?.timeToApoapsis),
					periapsis: place(info?.timeToPeriapsis),
					vessel: at(v.position),
					nodes: navNodes(v, s, body).map((n) => ({
						kind: n.kind,
						relativeTo: n.relativeTo,
						time: n.time,
						point: at(n.position)
					}))
				};
			}
			// the bodies' names and, with them, whether the Space Center's is shown (plan 382)
			const screenBodies =
				map && s
					? projectBodies(
							s.bodies.map((b) => ({ id: String(b.id), position: b.position })),
							bodyRadii,
							options.project
						)
					: [];
			const network =
				map && s
					? projectNetwork(s, options.project, (body) => siteLabelsShown(screenBodies, body))
					: null;
			const box = options.size?.();
			const bodyLabels =
				map && box ? placeBodyLabels(screenBodies, bodyLabel, box.width, box.height) : null;
			if (s && firstT === null) firstT = s.t;
			const ghostFrame =
				ghost && s ? projectGhost(ghost, s, s.t - (firstT ?? s.t), map, options.project) : null;
			return { navball, map: marks, network, bodyLabels, ghost: ghostFrame };
		},
		model(now, localThrottle) {
			const v = find();
			if (!v || !snap || !entityIndex) return null;
			const body = bodyOf(v);
			const tele: Telemetry | null = computeTelemetry(snap, v.id, bodies);
			if (!body || !tele) return null;
			// A `target` reference without a target (it was cleared or lost) goes back to auto.
			if (preference === 'target' && !v.target) preference = 'auto';
			const read = speedReadout({
				position: v.position,
				velocity: v.velocity,
				altitude: tele.altitude,
				body,
				preference,
				previous: lastMode,
				target: v.target ?? null
			});
			lastMode = read.mode;
			ceiling = Math.max(ceiling, tele.altitude);
			if (tele.phase !== 'landed' || ceiling > LIFTOFF_ALTITUDE) {
				push(toastForPhase(lastPhase, tele.phase, tele));
			}
			lastPhase = tele.phase;
			// the sim's limits, 2000 K when a part names none (plan 237)
			const heat = heatRatio(v.parts, (d) => content.parts.get(d)?.maxTemperature);
			const h = toastForHeat(heat, heatArmed);
			heatArmed = h.armed;
			push(h.toast);
			toasts = pruneToasts(toasts, now);
			const cache = stageModel(now, v, body, tele.altitude);
			const environment = stageEnvironment(body, tele.altitude).environment;
			return {
				name,
				body: bodyLabel(body.id),
				situation: situationLabel(
					tele.phase,
					tele.escape,
					bodyLabel(body.id),
					tele.prelaunch,
					tele.splashed
				),
				prelaunch: tele.prelaunch,
				phase: tele.phase,
				// MET counts from liftoff (plan 200): 0 on the pad; a vessel from an older save, from t = 0
				met: tele.prelaunch ? 0 : snap.t - (v.launchedAt ?? 0),
				time: snap.t,
				date: formatDate(calendar, epoch, snap.t).text,
				altitude: Math.max(0, tele.altitude - clearance),
				radar: radarReading(tele.altitude, clearance, v.terrainHeight),
				speed: read.speed,
				speedMode: read.mode,
				speedPreference: preference,
				vertical: read.vertical,
				attitude: attitudeAngles(controlOrientation(v), v.position, bodyPole(body)),
				orbit: v.orbit ? orbitInfo(v.orbit, bodyMu(body), snap.t, body.radius) : null,
				stages: cache.model,
				environment,
				deltaVView: dvView,
				deltaVBodies,
				stagesFired: stagesFiredBy(stages, vessel),
				resources: cache.resources,
				// on the pad the engines read 0 until the first stage sends the HUD's throttle (ADR 0216 point 4)
				throttle: tele.prelaunch ? localThrottle : vesselThrottle(v.parts, localThrottle, content),
				heat,
				blackout: vesselBlackout(v.position, v.velocity, tele.altitude, body),
				range: rangeWarning(snap.range, Number(v.id)),
				link: linkBadge(snap, Number(v.id)),
				aero: aeroReadout(
					v,
					body,
					wingStallAngle(
						v.parts.map((p) => p.definition),
						options.content.parts
					)
				),
				sas: v.sas,
				controllable: hasControlSource(v) && v.uncontrolled === undefined,
				uncontrolled: v.uncontrolled ?? null,
				trim: v.trim ?? null,
				rcs: rcsState(v, content.parts),
				rcsFiring: rcsFiring(v),
				maneuver: maneuverHud(v, snap.t, cache.report),
				target: targetHud(v, snap.t),
				targets: targetChoices(snap, Number(v.id), bodies),
				rendezvous: v.target ? (options.rendezvous?.() ?? null) : null,
				dossier: targetDossier(snap, v, bodies, content),
				crew: crewCard(snap, v, (homeBodyOf(bodies) ?? body).rotationPeriod),
				toasts
			};
		}
	};
}
