/**
 * The HUD's brain, plain TypeScript outside Svelte (ADR 0026). `flight-loop.ts` feeds it snapshots,
 * events and input; it answers with (a) `frame()`, cheap per-frame data for the canvas and the map
 * markers, and (b) `model()`, the complete display model Svelte renders at ~10 Hz.
 */
import {
	entityId,
	type BodyDefinition,
	type Command,
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
import type { SimEventMessage, StageEvent } from './sim-client';
import { nextSpeedMode, speedReadout, type SpeedMode, type SpeedModePreference } from './speed';
import { stageStackModel, type StageStackModel } from './stage-stack';
import { noStages, reduceStages, stagesFiredBy, type StageProgress } from './stage-state';
import { computeTelemetry, type FlightPhase, type Telemetry } from './telemetry';
import {
	addToast,
	pruneToasts,
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
}

export interface HudModel {
	name: string;
	body: string;
	situation: string;
	phase: FlightPhase | null;
	met: number;
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
	stagesFired: number;
	resources: ResourceRow[];
	/** The throttle the vessel is at (scripts and the autopilot included), 0..1. */
	throttle: number;
	/** Hottest part as a fraction of its limit. */
	heat: number;
	/** Stability assist state from the snapshot (plan 042); undefined before the sim reports it. */
	sas: SasSnapshot | undefined;
	/** The vessel has a command part: SAS and attitude commands are accepted. */
	controllable: boolean;
	/** The earliest maneuver node, if any (plan 045). */
	maneuver: ManeuverHud | null;
	/** The vessel's target and what to show about it (plan 035); null without one. */
	target: TargetHud | null;
	/** What the vessel may aim at: bodies, then other vessels (plan 035). */
	targets: TargetChoice[];
	toasts: LiveToast[];
}

/** What the render loop needs every frame (small, no Svelte). */
export interface FrameData {
	navball: NavballFrame | null;
	/** Screen positions in px inside the canvas box; null when not in map view. */
	map: { apoapsis: Point | null; periapsis: Point | null; vessel: Point | null } | null;
	/** Maneuver nodes and handles in px (plan 045); filled in by the flight loop. */
	maneuver?: ManeuverFrame | null;
}
/** A map marker position in px inside the canvas box; `hidden` when a body is in front of it. */
export type Point = ScreenPoint;

export interface HudControllerOptions {
	design: VesselDesign;
	content: ContentLookups;
	bodies: readonly BodyDefinition[];
	/**
	 * `Renderer.project` (plan 024, ADR 0033): a point in the sim's inertial frame to canvas pixels
	 * through the camera that is drawn; `null` behind the camera or while there is no renderer.
	 */
	project: (world: Vec3) => Point | null;
	/** Wall clock in ms (the render loop's `now`); toasts expire against it. */
	now?: () => number;
	/**
	 * A loaded flight (plan 043): the part entity to design index map of the vessel in focus, which
	 * can no longer be derived from a snapshot of a vessel that already lost parts, and the stages
	 * it had fired.
	 */
	resume?: { entityIndex: ReadonlyMap<number, number>; stagesFired: number };
}

export interface HudController {
	attach(vessel: number): void;
	snapshot(s: Snapshot): void;
	stage(e: StageEvent): void;
	simEvent(e: SimEventMessage): void;
	refused(command: string, reason: string): void;
	/** A notice that is not about a command or the sim (the quality governor changed the graphics, plan 039). */
	notice(toast: Toast): void;
	cycleSpeedMode(): SpeedModePreference;
	/** The `sas` command a button or key asks for (plan 042); null before a vessel is attached. */
	sasCommand(mode: SasMode): Command | null;
	/** `target-set` for the choice with this key (`body:stock.cinder`), or for none with `null`; null when it is not in the list or there is no vessel (plan 035). */
	targetCommand(key: string | null): Command | null;
	/** `target-set` for the next entry of the list (bodies, other vessels, then none). */
	nextTargetCommand(): Command | null;
	/** The `sas` command that keeps the prograde reference in step with the speed readout, or null. */
	sasFollowUp(): Command | null;
	/** Whether the map view is on: map markers are only computed then. */
	setMapView(on: boolean): void;
	frame(): FrameData;
	/** `localThrottle`: the page's own setting, used when the vessel has no engine to read it from. */
	model(now: number, localThrottle: number): HudModel | null;
	/** Full-throttle burn time of `dv` m/s with the stages as they are now; null before the first stage reading. */
	burnTimeFor(dv: number): number | null;
	readonly stagesFired: number;
}

const STAGE_RECOMPUTE_MS = 250;
/** Above this the vessel counts as having left the pad, m (the pad vessel settles within a metre). */
const LIFTOFF_ALTITUDE = 50;

/** The burn panel's numbers for the earliest node of `v`, or null without one. */
function maneuverHud(v: VesselSnapshot, now: number, report: DeltaVReport): ManeuverHud | null {
	const node = v.nodes?.[0];
	if (!node) return null;
	const burn = burnTime(node.dv, report.stages);
	const time = burn.time > 0 ? burn.time : null;
	const indicator = burnIndicator(now, node.time, time ?? 0, node.dv);
	return {
		id: node.id,
		count: v.nodes!.length,
		dv: node.dv,
		burnTime: time,
		short: !burn.enough,
		toNode: indicator.toNode,
		toBurn: time === null ? null : indicator.toBurn,
		state: indicator.state,
		pointing: v.sas?.mode === 'maneuver'
	};
}

export function createHudController(options: HudControllerOptions): HudController {
	const { design, content, bodies } = options;
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
		}
	};
	const clock = options.now ?? (() => performance.now());
	const push = (t: Toast | null): void => {
		if (t) toasts = addToast(toasts, t, clock(), ++toastId);
	};

	function stageModel(now: number, v: VesselSnapshot, body: BodyDefinition, altitude: number) {
		if (stageCache && now - stageCache.at < STAGE_RECOMPUTE_MS) return stageCache;
		const fired = stagesFiredBy(stages, vessel);
		const staging = stagingModelFromSnapshot(design, content, v, entityIndex!);
		const report = stageDeltaV(staging, fired);
		const environment = altitude < (body.atmosphere?.height ?? 0) ? 'sea-level' : 'vacuum';
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
		stageCache = { at: now, model, resources: [...totals.values()], report };
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
			preference = nextSpeedMode(preference);
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
		setMapView(on) {
			map = on;
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
					previous: lastMode
				});
				navball = {
					orientation: v.orientation,
					position: v.position,
					markers: markerDirections(v.position, v.velocity, read.velocity, v.nodes?.[0]?.vector),
					heading: attitudeAngles(v.orientation, v.position).heading
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
					vessel: at(v.position)
				};
			}
			return { navball, map: marks };
		},
		model(now, localThrottle) {
			const v = find();
			if (!v || !snap || !entityIndex) return null;
			const body = bodyOf(v);
			const tele: Telemetry | null = computeTelemetry(snap, v.id, bodies);
			if (!body || !tele) return null;
			const read = speedReadout({
				position: v.position,
				velocity: v.velocity,
				altitude: tele.altitude,
				body,
				preference,
				previous: lastMode
			});
			lastMode = read.mode;
			ceiling = Math.max(ceiling, tele.altitude);
			if (tele.phase !== 'landed' || ceiling > LIFTOFF_ALTITUDE) {
				push(toastForPhase(lastPhase, tele.phase, tele));
			}
			lastPhase = tele.phase;
			let heat = 0;
			for (const p of v.parts) {
				const limit = content.parts.get(p.definition)?.maxTemperature ?? 1000;
				if (p.temperature !== undefined) heat = Math.max(heat, p.temperature / limit);
			}
			const h = toastForHeat(heat, heatArmed);
			heatArmed = h.armed;
			push(h.toast);
			toasts = pruneToasts(toasts, now);
			const cache = stageModel(now, v, body, tele.altitude);
			const environment = tele.altitude < (body.atmosphere?.height ?? 0) ? 'sea-level' : 'vacuum';
			return {
				name,
				body: bodyLabel(body.id),
				situation: situationLabel(tele.phase, tele.escape, bodyLabel(body.id)),
				phase: tele.phase,
				met: snap.t,
				altitude: Math.max(0, tele.altitude - clearance),
				radar: radarReading(tele.altitude, clearance, v.terrainHeight),
				speed: read.speed,
				speedMode: read.mode,
				speedPreference: preference,
				vertical: read.vertical,
				attitude: attitudeAngles(v.orientation, v.position),
				orbit: v.orbit ? orbitInfo(v.orbit, bodyMu(body), snap.t, body.radius) : null,
				stages: cache.model,
				environment,
				stagesFired: stagesFiredBy(stages, vessel),
				resources: cache.resources,
				throttle: vesselThrottle(v.parts, localThrottle, content),
				heat,
				sas: v.sas,
				controllable: hasControlSource(v),
				maneuver: maneuverHud(v, snap.t, cache.report),
				target: targetHud(v, snap.t),
				targets: targetChoices(snap, Number(v.id), bodies),
				toasts
			};
		}
	};
}
