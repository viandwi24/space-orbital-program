/**
 * The public vessel-pilot API (plan 310, ADR 0271): what a mod autopilot, a script host, a panel
 * or a test uses to read a vessel's state relative to its target and to fly it. Built from
 * snapshots and a command sink; every control call is a `Command` the sim validates through the
 * same handler the keys and scripts use: there is no second control path. Environment-neutral.
 */
import type { Quat, Vec3 } from './math.ts';
import type {
	Command,
	PortSnapshot,
	SasMode,
	SasReference,
	TargetRef,
	TargetSnapshot,
	VesselSnapshot
} from './protocol.ts';
import type { EntityId } from './ids.ts';

/** What a `VesselPilot` reads: the sim time and the snapshots of the vessel and its target vessel (others are ignored). */
export interface ControlView {
	t: number;
	vessels: readonly VesselSnapshot[];
}

/** The target state relative to the own reference point (the control port, else the centre of mass). */
export interface RelativeState {
	/** Target point minus own point, m, in the shared inertial axes. */
	position: Vec3;
	/** Target velocity minus own, m/s, inertial axes. */
	velocity: Vec3;
	/** The same two in the control part's axes (x right, y forward/nose, z up). */
	localPosition: Vec3;
	localVelocity: Vec3;
	distance: number;
	/** Rate at which the distance shrinks, m/s (positive while closing). */
	closing: number;
}

/**
 * How the own control port lines up with the target port. The approach axis runs out of the
 * target port's face along `targetPort.direction`.
 */
export interface DockingAlignment {
	/** Angle between the own face direction and the reverse of the target's, rad (0: face to face). */
	angle: number;
	/** How far the own face is out in front of the target face along its axis, m (negative: behind it). */
	along: number;
	/** The own face's offset from the target axis, m, inertial axes (perpendicular to the axis). */
	lateral: Vec3;
	/** Length of `lateral`, m. */
	lateralDistance: number;
	/** Face to face, m. */
	distance: number;
	/** Rate at which `along` shrinks, m/s (positive while approaching the target face). */
	closing: number;
	/** Own velocity relative to the target, m/s, inertial axes. */
	velocity: Vec3;
	/** The two ports are the same size (only same-size ports capture). */
	sameSize: boolean;
}

/** The body the vessel is in the sphere of influence of (ADR 0277). */
export interface PilotBody {
	id: string;
	/** Gravitational parameter, m³/s². */
	mu: number;
	/** Reference radius, m. */
	radius: number;
	/** Top of the atmosphere above the radius, m; 0 without one. */
	atmosphereHeight: number;
	/** Spin of the body, rad/s, inertial axes. */
	angularVelocity: Vec3;
}

/** One engine module of the vessel (ADR 0277), from its descriptor (ADR 0033). */
export interface PilotEngine {
	part: EntityId;
	/** Full-throttle thrust in vacuum, N. */
	thrustVacuum: number;
	/** Vacuum specific impulse, s. */
	ispVacuum: number;
	ignited: boolean;
	flameout: boolean;
}

/** What the host knows beyond the snapshot (ADR 0277): the sim's runner always passes it. */
export interface PilotFacts {
	body: PilotBody;
	/** Current mass of the vessel, kg. */
	mass: number;
	engines: PilotEngine[];
}

export interface VesselPilot {
	readonly time: number;
	/** The sphere-of-influence body; undefined when the host gave no facts (ADR 0277). */
	readonly body: PilotBody | undefined;
	/** Current mass, kg; undefined without facts. */
	readonly mass: number | undefined;
	/** Engine modules; empty without facts. */
	readonly engines: readonly PilotEngine[];
	/** Vacuum thrust of the engines that burn (ignited, not flamed out), N; 0 without facts. */
	readonly maxThrust: number;
	readonly vessel: VesselSnapshot;
	/** The part the vessel is controlled from: the chosen control part, or the root. */
	readonly controlPart: EntityId;
	/** That part's absolute orientation (part axes to inertial axes). */
	readonly controlOrientation: Quat;
	/** The control part when it is a docking port. */
	readonly controlPort: PortSnapshot | undefined;
	readonly target: TargetSnapshot | undefined;
	/** The target's snapshot when the target is a vessel in the view. */
	readonly targetVessel: VesselSnapshot | undefined;
	/** The targeted docking port of the target vessel. */
	readonly targetPort: PortSnapshot | undefined;
	/** Inertial vector into the control part's axes. */
	toLocal(v: Vec3): Vec3;
	/** Control-part-axes vector into the inertial axes. */
	toWorld(v: Vec3): Vec3;
	/** The target relative to the own reference point, or undefined without a target. */
	relative(): RelativeState | undefined;
	/** Port to port alignment, or undefined unless controlled from a port and targeting a port. */
	alignment(): DockingAlignment | undefined;
	/** A resource's amount and capacity over the vessel, or undefined when it carries none. */
	resource(id: string): { amount: number; capacity: number } | undefined;

	/** SAS mode (and prograde reference). */
	sas(mode: SasMode, reference?: SasReference): void;
	/** Point the control part's nose (+Y) along an inertial direction (SAS `direction`). */
	pointAt(direction: Vec3): void;
	/** Turn the control part to an absolute orientation and hold it (SAS `hold` with an attitude). */
	holdAttitude(attitude: Quat): void;
	/** RCS translation, each -1..1 in the control part's axes (x right, y forward, z up). */
	translate(x: number, y: number, z: number): void;
	/** Rotation demand, each -1..1 in the control part's axes; SAS steps aside while it is not zero. */
	rotate(pitch: number, yaw: number, roll: number): void;
	rcs(on: boolean): void;
	throttle(value: number): void;
	stage(): void;
	controlFrom(part: EntityId | null): void;
	setTarget(target: TargetRef | null): void;
	setTargetPort(vessel: EntityId, part: EntityId): void;
	/** Add a maneuver node (ADR 0277): delta-v components in m/s at sim time `time`. */
	addNode(time: number, prograde: number, normal: number, radial: number): void;
	/** Remove a node by id, or the first one. */
	removeNode(id?: number): void;
}

const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const scale = (a: Vec3, k: number): Vec3 => ({ x: a.x * k, y: a.y * k, z: a.z * k });
const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: Vec3, b: Vec3): Vec3 => ({
	x: a.y * b.z - a.z * b.y,
	y: a.z * b.x - a.x * b.z,
	z: a.x * b.y - a.y * b.x
});
const length = (a: Vec3): number => Math.hypot(a.x, a.y, a.z);

/** Rotate `v` by unit quaternion `q`. */
export function rotateByQuat(q: Quat, v: Vec3): Vec3 {
	const u = { x: q.x, y: q.y, z: q.z };
	const t = scale(cross(u, v), 2);
	return add(add(v, scale(t, q.w)), cross(u, t));
}
const conj = (q: Quat): Quat => ({ x: -q.x, y: -q.y, z: -q.z, w: q.w });
const clampUnit = (n: number): number => Math.max(-1, Math.min(1, Number.isFinite(n) ? n : 0));

/**
 * A `VesselPilot` for vessel `id` over `view`; `send` receives every control command (the sim
 * applies it at once, a page dispatches it). Throws when the vessel is not in the view.
 */
export function createVesselPilot(
	view: ControlView,
	id: EntityId,
	send: (command: Command) => unknown,
	facts?: PilotFacts
): VesselPilot {
	const vessel = view.vessels.find((v) => v.id === id);
	if (!vessel) throw new Error(`vessel ${id} is not in the view`);
	const controlPart = vessel.controlPart ?? vessel.parts[0]?.id ?? id;
	const part = vessel.parts.find((p) => p.id === vessel.controlPart);
	const controlOrientation = part?.orientation ?? vessel.orientation;
	const controlPort =
		vessel.controlPart === undefined
			? undefined
			: vessel.ports?.find((p) => p.part === vessel.controlPart);
	const target = vessel.target;
	const targetVessel =
		target?.kind === 'vessel' ? view.vessels.find((v) => v.id === target.id) : undefined;
	const targetPort =
		target?.kind === 'vessel' && target.part !== undefined
			? targetVessel?.ports?.find((p) => p.part === target.part)
			: undefined;
	const toLocal = (v: Vec3): Vec3 => rotateByQuat(conj(controlOrientation), v);
	const toWorld = (v: Vec3): Vec3 => rotateByQuat(controlOrientation, v);

	const engines = facts?.engines ?? [];
	const ctrl: VesselPilot = {
		time: view.t,
		body: facts?.body,
		mass: facts?.mass,
		engines,
		maxThrust: engines.reduce((sum, e) => sum + (e.ignited && !e.flameout ? e.thrustVacuum : 0), 0),
		vessel,
		controlPart,
		controlOrientation,
		controlPort,
		target,
		targetVessel,
		targetPort,
		toLocal,
		toWorld,
		relative() {
			if (!target) return undefined;
			const d = target.distance;
			return {
				position: target.position,
				velocity: target.velocity,
				localPosition: toLocal(target.position),
				localVelocity: toLocal(target.velocity),
				distance: d,
				closing: d > 1e-9 ? -dot(target.velocity, scale(target.position, 1 / d)) : 0
			};
		},
		alignment() {
			if (!target || !controlPort || !targetPort) return undefined;
			const n = targetPort.direction;
			// own face relative to the target face, and own velocity relative to the target
			const r = scale(target.position, -1);
			const u = scale(target.velocity, -1);
			const along = dot(r, n);
			const lateral = sub(r, scale(n, along));
			const c = dot(controlPort.direction, scale(n, -1));
			return {
				angle: Math.acos(Math.max(-1, Math.min(1, c))),
				along,
				lateral,
				lateralDistance: length(lateral),
				distance: length(r),
				closing: -dot(u, n),
				velocity: u,
				sameSize: Math.abs(controlPort.size - targetPort.size) < 1e-3
			};
		},
		resource(rid) {
			const r = vessel.resources?.find((x) => x.resource === rid);
			return r ? { amount: r.amount, capacity: r.capacity } : undefined;
		},
		sas(mode, reference) {
			send({ type: 'sas', vessel: id, mode, ...(reference ? { reference } : {}) });
		},
		pointAt(direction) {
			send({ type: 'sas', vessel: id, mode: 'direction', direction });
		},
		holdAttitude(attitude) {
			send({ type: 'sas', vessel: id, mode: 'hold', attitude });
		},
		translate(x, y, z) {
			send({
				type: 'attitude',
				vessel: id,
				pitch: 0,
				yaw: 0,
				roll: 0,
				translate: { x: clampUnit(x), y: clampUnit(y), z: clampUnit(z) }
			});
		},
		rotate(pitch, yaw, roll) {
			send({
				type: 'attitude',
				vessel: id,
				pitch: clampUnit(pitch),
				yaw: clampUnit(yaw),
				roll: clampUnit(roll)
			});
		},
		rcs(on) {
			send({ type: 'set-rcs', vessel: id, on });
		},
		throttle(value) {
			send({ type: 'throttle', vessel: id, value: Math.max(0, Math.min(1, value)) });
		},
		stage() {
			send({ type: 'stage', vessel: id });
		},
		controlFrom(p) {
			send({ type: 'set-control-part', vessel: id, part: p });
		},
		setTarget(t) {
			send({ type: 'target-set', vessel: id, target: t });
		},
		setTargetPort(other, p) {
			send({ type: 'target-set', vessel: id, target: { kind: 'vessel', id: other, part: p } });
		},
		addNode(time, prograde, normal, radial) {
			send({ type: 'node-set', vessel: id, time, prograde, normal, radial });
		},
		removeNode(node) {
			send({ type: 'node-remove', vessel: id, ...(node === undefined ? {} : { id: node }) });
		}
	};
	return ctrl;
}
