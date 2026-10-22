/**
 * The Guidance Computer's autopilots (plan 321, ADR 0271, 0276, 0277): execute the next maneuver
 * node, circularize, fly an ascent to orbit, land. Each flies only through the `VesselPilot` and
 * keeps its memory as plain JSON (a phase and a few numbers), so a world reopened mid-burn goes on.
 * The player takes any channel by touching it (ADR 0276); these loops have no integrators to reset.
 */
import {
	defineAutopilot,
	type AutopilotStep,
	type Quat,
	type Vec3,
	type VesselPilot
} from '@orbital/sdk';
import { pointAt as surfacePoint, rotate, surfaceDistance } from './predict.ts';
import {
	STANDARD_GRAVITY,
	add,
	angleBetween,
	burnTime,
	clamp,
	cross,
	dot,
	length,
	orbitOf,
	scale,
	sub,
	unit,
	visViva
} from './orbit.ts';

const DEG = Math.PI / 180;
/** The nose must be this close to the burn direction before the engines light. */
const ALIGN = 5 * DEG;
/** A burn ends when less than this is left, m/s. */
const NODE_DONE = 0.1;
/** Seconds between two stagings, so a stage that just fired gets to light. */
const STAGE_GAP = 1.5;

/** The pilot's facts (ADR 0277), or a reason they are missing. */
export function facts(pilot: VesselPilot): { mu: number; radius: number; mass: number } | string {
	if (!pilot.body || pilot.mass === undefined) return 'the vessel has no guidance data';
	return { mu: pilot.body.mu, radius: pilot.body.radius, mass: pilot.mass };
}

/** Exhaust velocity of the burning engines, m/s (0 when none burns). */
export function exhaustVelocity(pilot: VesselPilot): number {
	let thrust = 0;
	let flow = 0;
	for (const e of pilot.engines) {
		if (!e.ignited || e.flameout) continue;
		thrust += e.thrustVacuum;
		flow += e.thrustVacuum / (e.ispVacuum * STANDARD_GRAVITY);
	}
	return flow > 0 ? thrust / flow : 0;
}

/** The control part's nose (+Y) in inertial axes. */
export const noseOf = (pilot: VesselPilot): Vec3 => pilot.toWorld({ x: 0, y: 1, z: 0 });

/** A spent engine is dropped this long after it burns out, s (MechJeb's autostage delay). */
const SPENT_DELAY = 0.5;

/**
 * Stage (plan 360), as MechJeb's autostage does; returns true when it staged:
 * - nothing burns: the next stage, when it lights an engine or drops a spent one while an engine
 *   with propellant stays (or when the host gives no stage facts: the old rule);
 * - spent boosters (solid motors burnt out, liquid ones with empty tanks) beside burning engines:
 *   the next stage, half a second after they burn out, when it drops a spent engine and keeps
 *   every burning one.
 * It never drops a part with crew aboard, and stops when no stage is left.
 */
export function autoStage(pilot: VesselPilot, memory: { stagedAt: number; spentAt?: number }): boolean {
	if (pilot.time - memory.stagedAt < STAGE_GAP) return false;
	const next = pilot.nextStage;
	if (next === null) return false; // nothing left to stage
	// an engine that burnt out reads `flameout` (stock clears `ignited` then)
	const spent = pilot.engines.filter((e) => e.flameout);
	const burning = pilot.engines.filter((e) => e.ignited && !e.flameout);
	const drops = new Set(next?.drops ?? []);
	const crew = new Set((pilot.vessel.crew ?? []).map((c) => c.part));
	if (next && next.drops.some((p) => crew.has(p))) return false;
	let go: boolean;
	if (burning.length === 0) {
		go =
			!next ||
			next.ignites.length > 0 ||
			(spent.some((e) => drops.has(e.part)) && pilot.engines.some((e) => !e.flameout && !drops.has(e.part)));
	} else {
		go =
			next !== undefined &&
			spent.some((e) => drops.has(e.part)) &&
			burning.every((e) => !drops.has(e.part));
		if (go) {
			// wait a moment after the burn-out, so a booster on its last puff is not cut loose
			if (!(memory.spentAt !== undefined && memory.spentAt >= 0)) memory.spentAt = pilot.time;
			go = pilot.time - memory.spentAt >= SPENT_DELAY;
		} else memory.spentAt = -1;
	}
	if (!go) return false;
	memory.stagedAt = pilot.time;
	memory.spentAt = -1;
	pilot.stage();
	return true;
}

// ---- execute the next maneuver node ---------------------------------------------------------

export interface NodeMemory {
	phase: 'align' | 'burn';
	/** Remaining delta-v at the last step, m/s (a growing value means the burn went past); -1 before the burn. Memory is JSON: no Infinity. */
	last: number;
	stagedAt: number;
	/** Stage when the engines run dry during the burn. */
	autoStage: boolean;
	/** When spent boosters were first seen beside burning engines, s (-1: none; absent in older saves). */
	spentAt?: number;
	/** The node's delta-v when it was first seen, m/s (-1 before): the burn's progress (plan 332). */
	first?: number;
}

export const newNodeMemory = (autoStageOn = true): NodeMemory => ({
	phase: 'align',
	last: -1,
	stagedAt: -1e9,
	autoStage: autoStageOn,
	first: -1
});

/** One step of a node burn: point along it, light at half the burn before the node, tail off. */
export function stepNode(pilot: VesselPilot, memory: NodeMemory): AutopilotStep {
	const node = pilot.vessel.nodes?.[0];
	if (!node) {
		pilot.throttle(0);
		return memory.phase === 'burn'
			? { phase: 'done', status: 'Node executed', done: true }
			: { phase: 'align', abort: 'there is no maneuver node' };
	}
	const f = facts(pilot);
	if (typeof f === 'string') return { phase: memory.phase, abort: f };
	if (!node.vector) {
		// a node set this step gets its burn vector with the next prediction
		pilot.throttle(0);
		return node.time < pilot.time
			? { phase: memory.phase, abort: 'the node is not on the predicted path' }
			: { phase: memory.phase, status: 'Waiting for the node prediction' };
	}
	if (!(memory.first !== undefined && memory.first > 0)) memory.first = Math.max(node.dv, 0.01);
	const direction = unit(node.vector);
	pilot.pointAt(direction);
	const error = angleBetween(noseOf(pilot), direction);
	if (memory.autoStage && memory.phase === 'burn' && autoStage(pilot, memory)) {
		return { phase: 'burn', status: 'Staging' };
	}
	const thrust = pilot.maxThrust;
	if (thrust <= 0) return { phase: memory.phase, abort: 'no engine is burning: stage first' };
	const burn = burnTime(node.dv, f.mass, thrust, exhaustVelocity(pilot));
	const readouts = {
		'Delta-v left': Math.round(node.dv * 10) / 10,
		'Burn time': Math.round(burn * 10) / 10,
		'Pointing error': Math.round((error / DEG) * 10) / 10,
		'Burn done': Math.round(clamp(1 - node.dv / memory.first, 0, 1) * 100) / 100
	};
	if (memory.phase === 'align') {
		const lead = node.time - burn / 2 - pilot.time;
		pilot.throttle(0);
		if (lead > 0 || error > ALIGN) {
			return {
				phase: 'align',
				status: lead > 0 ? `Burn in ${Math.ceil(lead)} s` : 'Turning to the burn',
				readouts
			};
		}
		memory.phase = 'burn';
	}
	if (node.dv < NODE_DONE || (memory.last >= 0 && node.dv > memory.last + 0.05)) {
		pilot.throttle(0);
		pilot.removeNode(node.id);
		return { phase: 'done', status: 'Node executed', readouts, done: true };
	}
	memory.last = node.dv;
	// full thrust until the last 1.5 s of the burn, then down to the delta-v left
	const left = (f.mass * node.dv) / thrust;
	pilot.throttle(error > 2 * ALIGN ? 0 : clamp(left / 1.5, 0.02, 1));
	return { phase: 'burn', status: `Burning: ${node.dv.toFixed(1)} m/s left`, readouts };
}

export const ExecuteNode = defineAutopilot<NodeMemory>({
	id: 'guidance.node',
	title: 'Execute node',
	description: 'Points along the next maneuver node, starts half the burn before it and burns it off.',
	start(pilot) {
		if (!pilot.vessel.nodes?.length) throw new Error('there is no maneuver node');
		return newNodeMemory();
	},
	step: (pilot, memory) => stepNode(pilot, memory)
});

// ---- circularize ----------------------------------------------------------------------------

export interface CircularizeMemory extends NodeMemory {
	planned: boolean;
	at: 'apoapsis' | 'periapsis';
}

/** Plan a node at the apsis that makes the orbit circular there. */
function planCircular(pilot: VesselPilot, at: 'apoapsis' | 'periapsis'): string | null {
	const f = facts(pilot);
	if (typeof f === 'string') return f;
	const o = orbitOf(pilot.vessel.position, pilot.vessel.velocity, f.mu);
	if (!(o.e < 1)) return 'the orbit is open: there is no apoapsis';
	const r = at === 'apoapsis' ? o.apoapsis : o.periapsis;
	const dt = at === 'apoapsis' ? o.toApoapsis : o.toPeriapsis;
	const dv = Math.sqrt(f.mu / r) - visViva(f.mu, r, o.a);
	pilot.addNode(pilot.time + dt, dv, 0, 0);
	return null;
}

export const Circularize = defineAutopilot<CircularizeMemory>({
	id: 'guidance.circularize',
	title: 'Circularize',
	description: 'Plans a node at the apoapsis (or periapsis) that rounds the orbit, then burns it.',
	start(pilot, params) {
		const at = (params as { at?: string } | undefined)?.at === 'periapsis' ? 'periapsis' : 'apoapsis';
		const f = facts(pilot);
		if (typeof f === 'string') throw new Error(f);
		if (!(orbitOf(pilot.vessel.position, pilot.vessel.velocity, f.mu).e < 1))
			throw new Error('the orbit is open: there is no apoapsis');
		return { ...newNodeMemory(), planned: false, at };
	},
	step(pilot, memory) {
		if (!memory.planned) {
			// a node of the player's comes first: it is removed so the burn is ours
			for (const n of pilot.vessel.nodes ?? []) pilot.removeNode(n.id);
			const problem = planCircular(pilot, memory.at);
			if (problem) return { phase: 'plan', abort: problem };
			memory.planned = true;
			return { phase: 'plan', status: `Planned a burn at the ${memory.at}` };
		}
		return stepNode(pilot, memory);
	}
});

// ---- ascent to orbit ------------------------------------------------------------------------

export interface AscentMemory extends NodeMemory {
	stage: 'launch' | 'ascent' | 'coast' | 'circularize';
	/** Target orbit altitude above the radius, m. */
	altitude: number;
	/** Altitude where the turn ends (pitch 0), m. */
	turnEnd: number;
	/** Turn shape: 0.4 turns early and flat, 1 is linear. */
	shape: number;
	/** Wanted orbit inclination, rad (plan 332); 0 flies due east. Absent in older saves. */
	inclination?: number;
	planned: boolean;
}

/**
 * Up and the launch heading at the vessel, inertial axes: due east, or turned toward north for an
 * orbit of inclination `inclination` (rad; the launch azimuth `sin az = cos i / cos latitude`, the
 * nearest one the latitude allows).
 */
function localAxes(pilot: VesselPilot, inclination = 0, correction = 0): { up: Vec3; east: Vec3 } {
	const up = unit(pilot.vessel.position);
	const spin = pilot.body && length(pilot.body.angularVelocity) > 0 ? pilot.body.angularVelocity : { x: 0, y: 1, z: 0 };
	let east = unit(cross(unit(spin), up));
	if (length(east) < 0.5) east = unit(cross({ x: 1, y: 0, z: 0 }, up)); // at a pole
	if (!inclination) return { up, east };
	const north = cross(up, east);
	const coslat = Math.sqrt(Math.max(1e-9, 1 - dot(up, unit(spin)) ** 2));
	// from north, plus the closed-loop correction (more east lowers the inclination)
	const az = Math.asin(clamp(Math.cos(inclination) / coslat, -1, 1)) + correction;
	const heading = unit({
		x: north.x * Math.cos(az) + east.x * Math.sin(az),
		y: north.y * Math.cos(az) + east.y * Math.sin(az),
		z: north.z * Math.cos(az) + east.z * Math.sin(az)
	});
	return { up, east: heading };
}

export const Ascent = defineAutopilot<AscentMemory>({
	id: 'guidance.ascent',
	title: 'Ascent to orbit',
	description: 'Launches, flies a gravity turn east, stages when the engines run dry and circularizes.',
	start(pilot, params) {
		const f = facts(pilot);
		if (typeof f === 'string') throw new Error(f);
		const p = (params ?? {}) as { altitude?: number; shape?: number; inclination?: number };
		const air = pilot.body?.atmosphereHeight ?? 0;
		const altitude = p.altitude ?? Math.max(80_000, air + 10_000);
		if (!(altitude > air)) throw new Error(`the orbit must be above the atmosphere (${air / 1000} km)`);
		return {
			...newNodeMemory(),
			stage: 'launch',
			altitude,
			turnEnd: air > 0 ? 0.75 * air : Math.min(altitude, 15_000),
			shape: clamp(Number(p.shape ?? 0.5) || 0.5, 0.2, 1),
			inclination: (clamp(Number(p.inclination ?? 0) || 0, 0, 180) * Math.PI) / 180,
			planned: false
		};
	},
	step(pilot, memory) {
		const f = facts(pilot);
		if (typeof f === 'string') return { phase: memory.stage, abort: f };
		const r = pilot.vessel.position;
		const altitude = length(r) - f.radius;
		const o = orbitOf(r, pilot.vessel.velocity, f.mu);
		const apo = o.apoapsis - f.radius;
		const air = pilot.body?.atmosphereHeight ?? 0;
		const readouts = {
			Altitude: Math.round(altitude),
			Apoapsis: Number.isFinite(apo) ? Math.round(apo) : 'open',
			Periapsis: Math.round(o.periapsis - f.radius),
			Target: memory.altitude
		};
		if (memory.stage === 'launch') {
			pilot.throttle(1);
			pilot.pointAt(localAxes(pilot).up);
			if (pilot.maxThrust > 0) memory.stage = 'ascent';
			else if (pilot.time - memory.stagedAt >= STAGE_GAP) {
				memory.stagedAt = pilot.time;
				pilot.stage();
			}
			return { phase: 'launch', status: 'Liftoff', readouts };
		}
		if (memory.stage === 'ascent') {
			autoStage(pilot, memory);
			// steer out the inclination error once the vessel moves fast enough to have a plane
			const want = memory.inclination ?? 0;
			let correction = 0;
			if (want && pilot.body && length(pilot.vessel.velocity) > 800) {
				const h = cross(r, pilot.vessel.velocity);
				const now = angleBetween(h, pilot.body.angularVelocity);
				correction = clamp(2 * (now - want), -20 * DEG, 20 * DEG);
			}
			const { up, east } = localAxes(pilot, want, correction);
			const done = clamp((altitude - 500) / (memory.turnEnd - 500), 0, 1);
			const pitch = (Math.PI / 2) * (1 - Math.pow(done, memory.shape));
			pilot.pointAt(unit({
				x: up.x * Math.sin(pitch) + east.x * Math.cos(pitch),
				y: up.y * Math.sin(pitch) + east.y * Math.cos(pitch),
				z: up.z * Math.sin(pitch) + east.z * Math.cos(pitch)
			}));
			// ease off as the apoapsis nears the target, so it is not overshot
			pilot.throttle(clamp((memory.altitude - apo) / 2_000, 0.05, 1));
			if (apo >= memory.altitude) {
				pilot.throttle(0);
				memory.stage = 'coast';
			}
			return { phase: 'ascent', status: `Pitch ${Math.round(pitch / DEG)}°`, readouts };
		}
		if (memory.stage === 'coast') {
			pilot.sas('prograde', 'orbit');
			// drag lowers the apoapsis on the way out of the air: top it up
			pilot.throttle(apo < memory.altitude - 300 ? 0.1 : 0);
			if (altitude > air && altitude > 0.5 * memory.altitude) {
				pilot.throttle(0);
				memory.stage = 'circularize';
			}
			return { phase: 'coast', status: 'Coasting to the apoapsis', readouts };
		}
		if (!memory.planned) {
			for (const n of pilot.vessel.nodes ?? []) pilot.removeNode(n.id);
			const problem = planCircular(pilot, 'apoapsis');
			if (problem) return { phase: 'circularize', abort: problem };
			memory.planned = true;
			return { phase: 'circularize', status: 'Planned the circularization', readouts };
		}
		const step = stepNode(pilot, memory);
		return { ...step, readouts: { ...readouts, ...step.readouts } };
	}
});

// ---- landing --------------------------------------------------------------------------------

export interface LandMemory {
	stage: 'deorbit' | 'coast' | 'brake' | 'touchdown';
	stagedAt: number;
	/** Touchdown speed, m/s (plan 332 setting); absent in older saves. */
	touchdown?: number;
	/** The landing target on the body's surface (plan 372, ADR 0309 point 4), rad; absent: anywhere. */
	target?: { lat: number; lon: number };
	/** Deorbit with a target: the along-track lead of the target over the impact a burn now gives, rad (null before). */
	lead?: number | null;
	/** The deorbit burn has started. */
	burning?: boolean;
	/** The wait for the deorbit burn was warped through. */
	warped?: boolean;
	/** The coast's last touchdown prediction: when, s, and the miss to the target (target minus touchdown, inertial, m). */
	aimAt?: number;
	fix?: { x: number; y: number; z: number; t: number } | null;
}

/** The deorbit lowers the periapsis this share of the height under the ground: a steep, short fall. */
const DEORBIT_DEPTH = 0.5;
/** The coast steers when the predicted touchdown misses the target by more than this, m. */
const STEER_MISS = 300;
/** The deorbit still burns when the impact has passed the target by less than this, rad. */
const LATE = 0.02;
/** Below this height the descent no longer leans toward the target: straight down, m. */
const LEAN_FLOOR = 100;
/** The descent leans toward the target at most this fast across the ground, m/s. */
const LEAN_SPEED = 30;

/** The rotation by `angle` about the unit `axis`. */
const about = (axis: Vec3, angle: number): Quat => {
	const sn = Math.sin(angle / 2);
	return { x: axis.x * sn, y: axis.y * sn, z: axis.z * sn, w: Math.cos(angle / 2) };
};

/**
 * Where a surface point (latitude, longitude, rad) is in inertial axes `dt` s from now: the
 * body's axes now (`rotation`), turned on by its spin.
 */
export function surfaceInertial(
	target: { lat: number; lon: number },
	radius: number,
	rotation: Quat,
	spin: Vec3,
	dt: number
): Vec3 {
	const w = length(spin);
	const now = rotate(rotation, surfacePoint(target.lat, target.lon, radius));
	return w > 0 ? rotate(about(scale(spin, 1 / w), w * dt), now) : now;
}

/**
 * Where the descent from `(r, v)` touches down, as the Land autopilot flies it: a coast until the
 * stopping height (as `step`'s rule), then the brake's speed profile (thrust up to `accel`, m/s²,
 * against the velocity over the turning ground) until it is slow. Point mass, vacuum, Euler steps. Inertial position and time, or
 * null when it does not come down within `limit` s.
 */
export function descentTouchdown(
	r0: Vec3,
	v0: Vec3,
	mu: number,
	radius: number,
	spin: Vec3,
	accel: number,
	limit: number
): { t: number; r: Vec3 } | null {
	let r = r0;
	let v = v0;
	let t = 0;
	let braking = false;
	while (t < limit) {
		const up = unit(r);
		const height = length(r) - radius;
		const g = mu / dot(r, r);
		const surface = sub(v, cross(spin, r));
		const speed = length(surface);
		if (height <= 0 || (braking && speed < 3)) return { t, r: scale(up, radius) };
		if (!braking && height <= ((speed * speed) / (2 * Math.max(0.85 * accel - g, 0.1))) * 1.1 + 30) braking = true;
		const h = braking ? 0.1 : Math.min(2, Math.max(0.1, height / Math.max(speed, 1) / 4));
		// the brake as `step` flies it: a speed for the height left, the thrust to hold it
		let push = 0;
		if (braking) {
			const wanted = Math.max(TOUCHDOWN_SPEED, Math.min(Math.sqrt(2 * 0.5 * (accel - g) * Math.max(height, 0)), TOUCHDOWN_SPEED + 0.4 * height));
			push = clamp(g + 3 * (speed - wanted), 0, accel);
		}
		const a = add(scale(r, -mu / length(r) ** 3), scale(unit(surface), -push));
		v = add(v, scale(a, h));
		r = add(r, scale(v, h));
		t += h;
	}
	return null;
}

/**
 * The deorbit burn now (impulsive, retrograde, periapsis `DEORBIT_DEPTH` of the height under the
 * ground) and where the descent after it touches down (`descentTouchdown`): the touchdown's
 * along-track angle behind the target then (positive: the target is still ahead), rad, and the
 * miss, m. Null when it does not come down within an orbit.
 */
export function deorbitAim(
	r: Vec3,
	v: Vec3,
	mu: number,
	radius: number,
	rotation: Quat,
	spin: Vec3,
	target: { lat: number; lon: number },
	accel: number
): { lead: number; miss: number; fall: number } | null {
	const rr = length(r);
	const rp = radius - DEORBIT_DEPTH * Math.max(0, rr - radius);
	const after = scale(unit(v), visViva(mu, rr, (rr + rp) / 2));
	const o = orbitOf(r, v, mu);
	const turn = o.a > 0 ? 2 * Math.PI * Math.sqrt(o.a ** 3 / mu) : 3_600;
	const hit = descentTouchdown(r, after, mu, radius, spin, accel, turn);
	if (!hit) return null;
	const goal = surfaceInertial(target, radius, rotation, spin, hit.t);
	const h = unit(cross(r, v));
	const lead = Math.atan2(dot(cross(hit.r, goal), h), dot(hit.r, goal));
	return { lead, miss: surfaceDistance(hit.r, goal, radius), fall: hit.t };
}

/** Touchdown speed the final descent aims for, m/s. */
export const TOUCHDOWN_SPEED = 1.2;

export const Land = defineAutopilot<LandMemory>({
	id: 'guidance.land',
	title: 'Land',
	description: 'Lowers the periapsis into the ground, then a suicide burn and a slow vertical touchdown.',
	rate: 20,
	start(pilot, params) {
		const f = facts(pilot);
		if (typeof f === 'string') throw new Error(f);
		if (pilot.vessel.surface === true) throw new Error('the vessel is on the ground');
		if (pilot.maxThrust <= 0) throw new Error('no engine is burning: stage first');
		const p = (params ?? {}) as {
			touchdown?: number;
			target?: { body?: string; lat?: number; lon?: number } | null;
		};
		const t = p.target;
		// a target on this body (plan 372): the deorbit waits for it, the descent leans toward it
		const target =
			t && t.body === pilot.body?.id && Number.isFinite(t.lat) && Number.isFinite(t.lon)
				? { lat: Number(t.lat), lon: Number(t.lon) }
				: undefined;
		return {
			stage: 'deorbit',
			stagedAt: -1e9,
			touchdown: clamp(Number(p.touchdown ?? TOUCHDOWN_SPEED) || TOUCHDOWN_SPEED, 0.5, 3),
			...(target ? { target, lead: null, burning: false, warped: false } : {})
		};
	},
	step(pilot, memory) {
		const f = facts(pilot);
		if (typeof f === 'string') return { phase: memory.stage, abort: f };
		const thrust = pilot.maxThrust;
		if (thrust <= 0) return { phase: memory.stage, abort: 'the engines are out' };
		const td = memory.touchdown ?? TOUCHDOWN_SPEED;
		const r = pilot.vessel.position;
		const spin = pilot.body?.angularVelocity ?? { x: 0, y: 0, z: 0 };
		const surface = sub(pilot.vessel.velocity, cross(spin, r)); // over the ground
		const up = unit(r);
		// clearance of the lowest part (part positions are offsets from the root in inertial axes)
		const lowest = Math.min(0, ...pilot.vessel.parts.map((p) => dot(p.position, up)));
		const height = length(r) - f.radius - (pilot.vessel.terrainHeight ?? 0) + lowest - 1;
		const speed = length(surface);
		const climb = dot(surface, up);
		const g = f.mu / dot(r, r);
		const accel = thrust / f.mass;
		const readouts: Record<string, number | string> = {
			Height: Math.round(height),
			Speed: Math.round(speed * 10) / 10,
			'Vertical speed': Math.round(climb * 10) / 10
		};
		if (accel <= g) return { phase: memory.stage, abort: 'the engines cannot hold the vessel up here' };
		const rotation = pilot.body?.rotation;
		const target = memory.target && rotation ? memory.target : undefined;
		// the target's horizontal offset now, and its distance over the ground
		let lean: Vec3 = { x: 0, y: 0, z: 0 };
		if (target) {
			const goal = surfaceInertial(target, f.radius, rotation!, spin, 0);
			const off = sub(goal, r);
			const across = sub(off, scale(up, dot(off, up)));
			const distance = surfaceDistance(r, goal, f.radius);
			readouts['Target distance'] = Math.round(distance);
			// lean toward it at the speed that covers the distance in the time left, never near the ground
			const left = Math.max(height, 0) / Math.max(-climb, 5);
			if (height > LEAN_FLOOR) lean = scale(unit(across), Math.min(LEAN_SPEED, distance / Math.max(left, 1)));
		}
		if (memory.stage === 'deorbit') {
			const o = orbitOf(r, pilot.vessel.velocity, f.mu);
			const back = unit(scale(pilot.vessel.velocity, -1));
			if (target && !memory.burning && o.periapsis > f.radius) {
				// wait until a burn now comes down on the target (ADR 0309 point 4)
				const aim = deorbitAim(r, pilot.vessel.velocity, f.mu, f.radius, rotation!, spin, target, accel);
				pilot.pointAt(back);
				pilot.throttle(0);
				if (aim) {
					readouts['Target miss'] = Math.round(aim.miss);
					memory.lead = aim.lead;
					// the impact a burn now gives has just reached the target (or passed it by a little)
					if (aim.lead <= 0 && aim.lead > -LATE) memory.burning = true;
					else {
						// the lead closes at the orbit's rate less the ground's: warp most of the wait
						const rate = Math.sqrt(f.mu / length(r) ** 3) - dot(spin, unit(cross(r, pilot.vessel.velocity)));
						const wait = (aim.lead > 0 ? aim.lead : aim.lead + 2 * Math.PI) / Math.max(rate, 1e-6);
						if (!memory.warped && wait > 120) {
							memory.warped = true;
							pilot.warpTo(pilot.time + wait - 45);
						}
						return {
							phase: 'deorbit',
							status: `Deorbit over the target in ${Math.round(wait)} s`,
							readouts
						};
					}
				} else return { phase: 'deorbit', status: 'Waiting for a path down to the target', readouts };
			}
			const rp = target ? f.radius - DEORBIT_DEPTH * Math.max(0, length(r) - f.radius) : f.radius;
			if (o.periapsis < rp) {
				pilot.throttle(0);
				memory.stage = 'coast';
			} else {
				pilot.pointAt(back);
				pilot.throttle(angleBetween(noseOf(pilot), back) < ALIGN ? 1 : 0);
				return { phase: 'deorbit', status: 'Lowering the periapsis', readouts };
			}
		}
		// with a target, brake against the velocity less the lean toward it
		const steer = sub(surface, lean);
		const steerSpeed = length(steer);
		// the burn that stops the vessel just above the ground, with 15 % thrust in reserve
		const stop = (speed * speed) / (2 * (0.85 * accel - g));
		if (memory.stage === 'coast' && target) {
			// steer the coast (plan 372): predict the touchdown twice a second and burn across toward the target
			if (pilot.time - (memory.aimAt ?? -1e9) >= 0.5) {
				memory.aimAt = pilot.time;
				const td = descentTouchdown(r, pilot.vessel.velocity, f.mu, f.radius, spin, accel, 3_600);
				if (td) {
					const goal = surfaceInertial(target, f.radius, rotation!, spin, td.t);
					const miss = sub(goal, td.r);
					memory.fix = { ...miss, t: pilot.time + td.t };
				} else memory.fix = null;
			}
			const fix = memory.fix;
			const tgo = fix ? fix.t - pilot.time : 0;
			const across = fix ? sub(fix, scale(up, dot(fix, up))) : { x: 0, y: 0, z: 0 };
			const miss = length(across);
			readouts['Target miss'] = Math.round(miss);
			if (fix && miss > STEER_MISS && tgo > 30 && height > stop * 1.5 + 200) {
				const dir = unit(across);
				pilot.pointAt(dir);
				const dv = miss / tgo;
				pilot.throttle(angleBetween(noseOf(pilot), dir) < ALIGN ? clamp((dv * f.mass) / thrust, 0, 1) : 0);
				return { phase: 'coast', status: `Steering to the target: ${Math.round(miss)} m off`, readouts };
			}
		}
		if (memory.stage === 'coast') {
			pilot.pointAt(unit(scale(steer, -1)));
			pilot.throttle(0);
			if (height > stop * 1.1 + 30) {
				return { phase: 'coast', status: `Burn in ${Math.round(height - stop)} m`, readouts };
			}
			memory.stage = 'brake';
		}
		if (memory.stage === 'brake') {
			// a speed the remaining height stops at half the spare thrust, slowing to touchdown speed
			// linearly over the last metres
			const h = Math.max(0, height);
			const wanted = Math.max(
				td,
				Math.min(Math.sqrt(2 * 0.5 * (accel - g) * h), td + 0.4 * h)
			);
			pilot.pointAt(steerSpeed > 3 ? unit(scale(steer, -1)) : up);
			const tilt = angleBetween(noseOf(pilot), up);
			const need = g / Math.max(0.3, Math.cos(tilt)) + 3 * (steerSpeed - wanted);
			pilot.throttle(clamp((need * f.mass) / thrust, 0, 1));
			if (height < 3 && speed < 3) memory.stage = 'touchdown';
			return { phase: 'brake', status: `Braking to ${wanted.toFixed(1)} m/s`, readouts };
		}
		// touchdown: hold the touchdown speed straight down until the ground holds the vessel
		pilot.pointAt(up);
		const need = g + 3 * (-climb - td);
		pilot.throttle(clamp((need * f.mass) / thrust, 0, 1));
		if (pilot.vessel.surface === true || (height < 0.5 && speed < 0.3)) {
			pilot.throttle(0);
			pilot.sas('hold');
			return { phase: 'landed', status: 'Landed', readouts, done: true };
		}
		return { phase: 'touchdown', status: 'Touching down', readouts };
	}
});
