/**
 * The Guidance Computer's autopilots (plan 316, ADR 0271, 0273, 0274): execute the next maneuver
 * node, circularize, fly an ascent to orbit, land. Each flies only through the `VesselPilot` and
 * keeps its memory as plain JSON (a phase and a few numbers), so a world reopened mid-burn goes on.
 * The player takes any channel by touching it (ADR 0273); these loops have no integrators to reset.
 */
import { defineAutopilot, type AutopilotStep, type Vec3, type VesselPilot } from '@orbital/sdk';
import {
	STANDARD_GRAVITY,
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

/** The pilot's facts (ADR 0274), or a reason they are missing. */
function facts(pilot: VesselPilot): { mu: number; radius: number; mass: number } | string {
	if (!pilot.body || pilot.mass === undefined) return 'the vessel has no guidance data';
	return { mu: pilot.body.mu, radius: pilot.body.radius, mass: pilot.mass };
}

/** Exhaust velocity of the burning engines, m/s (0 when none burns). */
function exhaustVelocity(pilot: VesselPilot): number {
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
const noseOf = (pilot: VesselPilot): Vec3 => pilot.toWorld({ x: 0, y: 1, z: 0 });

/** Stage when nothing burns or a burning engine ran dry; returns true when it staged. */
function autoStage(pilot: VesselPilot, memory: { stagedAt: number }): boolean {
	const dry = pilot.engines.some((e) => e.ignited && e.flameout);
	if ((pilot.maxThrust > 0 && !dry) || pilot.time - memory.stagedAt < STAGE_GAP) return false;
	memory.stagedAt = pilot.time;
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
}

export const newNodeMemory = (autoStageOn = true): NodeMemory => ({
	phase: 'align',
	last: -1,
	stagedAt: -1e9,
	autoStage: autoStageOn
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
		'Pointing error': Math.round((error / DEG) * 10) / 10
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
	planned: boolean;
}

/** Up and east at the vessel, inertial axes. */
function localAxes(pilot: VesselPilot): { up: Vec3; east: Vec3 } {
	const up = unit(pilot.vessel.position);
	const spin = pilot.body && length(pilot.body.angularVelocity) > 0 ? pilot.body.angularVelocity : { x: 0, y: 1, z: 0 };
	let east = unit(cross(unit(spin), up));
	if (length(east) < 0.5) east = unit(cross({ x: 1, y: 0, z: 0 }, up)); // at a pole
	return { up, east };
}

export const Ascent = defineAutopilot<AscentMemory>({
	id: 'guidance.ascent',
	title: 'Ascent to orbit',
	description: 'Launches, flies a gravity turn east, stages when the engines run dry and circularizes.',
	start(pilot, params) {
		const f = facts(pilot);
		if (typeof f === 'string') throw new Error(f);
		const p = (params ?? {}) as { altitude?: number; shape?: number };
		const air = pilot.body?.atmosphereHeight ?? 0;
		const altitude = p.altitude ?? Math.max(80_000, air + 10_000);
		if (!(altitude > air)) throw new Error(`the orbit must be above the atmosphere (${air / 1000} km)`);
		return {
			...newNodeMemory(),
			stage: 'launch',
			altitude,
			turnEnd: air > 0 ? 0.75 * air : Math.min(altitude, 15_000),
			shape: clamp(p.shape ?? 0.5, 0.2, 1),
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
			Periapsis: Math.round(o.periapsis - f.radius)
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
			const { up, east } = localAxes(pilot);
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
}

/** Touchdown speed the final descent aims for, m/s. */
export const TOUCHDOWN_SPEED = 1.2;

export const Land = defineAutopilot<LandMemory>({
	id: 'guidance.land',
	title: 'Land',
	description: 'Lowers the periapsis into the ground, then a suicide burn and a slow vertical touchdown.',
	rate: 20,
	start(pilot) {
		const f = facts(pilot);
		if (typeof f === 'string') throw new Error(f);
		if (pilot.maxThrust <= 0) throw new Error('no engine is burning: stage first');
		return { stage: 'deorbit', stagedAt: -1e9 };
	},
	step(pilot, memory) {
		const f = facts(pilot);
		if (typeof f === 'string') return { phase: memory.stage, abort: f };
		const thrust = pilot.maxThrust;
		if (thrust <= 0) return { phase: memory.stage, abort: 'the engines are out' };
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
		const readouts = {
			Height: Math.round(height),
			Speed: Math.round(speed * 10) / 10,
			'Vertical speed': Math.round(climb * 10) / 10
		};
		if (accel <= g) return { phase: memory.stage, abort: 'the engines cannot hold the vessel up here' };
		if (memory.stage === 'deorbit') {
			const o = orbitOf(r, pilot.vessel.velocity, f.mu);
			if (o.periapsis - f.radius < 0) {
				pilot.throttle(0);
				memory.stage = 'coast';
			} else {
				const back = unit(scale(pilot.vessel.velocity, -1));
				pilot.pointAt(back);
				pilot.throttle(angleBetween(noseOf(pilot), back) < ALIGN ? 1 : 0);
				return { phase: 'deorbit', status: 'Lowering the periapsis', readouts };
			}
		}
		// the burn that stops the vessel just above the ground, with 15 % thrust in reserve
		const stop = (speed * speed) / (2 * (0.85 * accel - g));
		if (memory.stage === 'coast') {
			pilot.pointAt(unit(scale(surface, -1)));
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
				TOUCHDOWN_SPEED,
				Math.min(Math.sqrt(2 * 0.5 * (accel - g) * h), TOUCHDOWN_SPEED + 0.4 * h)
			);
			pilot.pointAt(speed > 3 ? unit(scale(surface, -1)) : up);
			const tilt = angleBetween(noseOf(pilot), up);
			const need = g / Math.max(0.3, Math.cos(tilt)) + 3 * (speed - wanted);
			pilot.throttle(clamp((need * f.mass) / thrust, 0, 1));
			if (height < 3 && speed < 3) memory.stage = 'touchdown';
			return { phase: 'brake', status: `Braking to ${wanted.toFixed(1)} m/s`, readouts };
		}
		// touchdown: hold the touchdown speed straight down until the ground holds the vessel
		pilot.pointAt(up);
		const need = g + 3 * (-climb - TOUCHDOWN_SPEED);
		pilot.throttle(clamp((need * f.mass) / thrust, 0, 1));
		if (pilot.vessel.surface === true || (height < 0.5 && speed < 0.3)) {
			pilot.throttle(0);
			pilot.sas('hold');
			return { phase: 'landed', status: 'Landed', readouts, done: true };
		}
		return { phase: 'touchdown', status: 'Touching down', readouts };
	}
});
