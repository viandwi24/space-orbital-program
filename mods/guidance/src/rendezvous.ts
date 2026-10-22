/**
 * The rendezvous autopilot (plan 331, ADR 0286), MechJeb style: from anywhere in orbit to 10–200 m
 * from the target vessel, at rest relative to it.
 *
 * 1. plane: a plane change at the nearer relative node when the planes differ by more than 0.05°;
 * 2. transfer: a phasing orbit when the two share an orbit, else a Hohmann transfer at its phase
 *    window (or, when the window is far off, a Hohmann to the target's radius first), with a
 *    mid-course correction when the predicted closest approach is too far;
 * 3. match: the target's velocity, 200 m before the closest approach;
 * 4. close: a closed loop on the relative velocity: toward the target, slowing to a stop at the
 *    standoff; the main engine far out, RCS translation within 1 km;
 * 5. hold: at rest within 200 m until the player stops it; with "Dock when close" and a targeted
 *    port it hands over to Auto Dock.
 * Every far burn is a maneuver node flown by the node executor, and coasts are warped through.
 * Memory is plain JSON, so a world reopened mid-rendezvous goes on.
 */
import {
	burnComponents,
	closestApproach,
	defineAutopilot,
	hohmannToTarget,
	orbitalAxes,
	propagateUniversal,
	relativeNodes,
	type AutopilotStep,
	type StateVector,
	type TargetSnapshot,
	type Vec3,
	type VesselPilot,
	type VesselSnapshot
} from '@orbital/sdk';
import { exhaustVelocity, facts, newNodeMemory, noseOf, stepNode, type NodeMemory } from './autopilots.ts';
import { add, angleBetween, burnTime, clamp, cross, dot, length, orbitOf, scale, sub, unit, visViva } from './orbit.ts';

const DEG = Math.PI / 180;
/** Relative inclination above which the plane is matched first, rad. */
export const PLANE_TOLERANCE = 0.05 * DEG;
/** Two orbits whose semi-major axes differ by less than this share is "the same orbit". */
const COORBITAL = 0.005;
/** A Hohmann window farther off than this many own orbits is not waited for. */
const MAX_WAIT_ORBITS = 12;
/** Inside this the far phases end and the close phase flies the rest, m. */
export const CLOSE_RANGE = 3_000;
/** A predicted closest approach this near is matched without a correction, m. */
const INTERCEPT = 2_000;
/** Without corrections left, a closest approach this near is still matched (the close phase flies the rest), m. */
const FAR_MATCH = 25_000;
/** The match burn stops the vessel this far before the closest approach along the relative path, m. */
const MATCH_AHEAD = 200;
/** A correction aims this far above the target, so the vessel passes beside it, m. */
const AIM_ABOVE = 300;
/** Where the close phase stops, m from the target. */
export const STANDOFF = 150;
/** The rendezvous is complete within this distance… */
export const HOLD_DISTANCE = 200;
/** The nearest standoff it flies to, m (the parts' own sizes may keep it farther). */
export const MIN_STANDOFF = 10;
/** …and below this relative speed, m/s. */
export const HOLD_SPEED = 0.2;
/** RCS flies the close phase inside this, m. */
const RCS_RANGE = 1_000;
/** The earliest a planned node may come: time to turn to it, s. */
const LEAD = 60;
/** A coast longer than this is warped through, s; the warp ends this long before the burn. */
const WARP_MIN = 120;
const WARP_WAKE = 45;
/**
 * Once the vessel points along the burn, the rest of the wait is warped through too, to this
 * long before the burn, s; only when more than `NEAR_WARP_MIN` s are left.
 */
export const WARP_NEAR = 5;
const NEAR_WARP_MIN = 15;
/** Aligned enough to warp the last stretch, rad. */
const NEAR_WARP_ALIGN = 2 * DEG;
/** Transfer plans before it gives up. */
const MAX_PLANS = 4;
/** Mid-course corrections per transfer. */
const MAX_CORRECTIONS = 2;
/** Fast mode (plan 371): one correction, aimed closer, a quicker close phase. */
const FAST_CORRECTIONS = 1;
const FAST_AIM_ABOVE = 150;
/** Fast mode's transfer times, as shares of the vessel's orbital period, and how many it tries. */
const FAST_SHORTEST = 0.25;
const FAST_LONGEST = 1;
const FAST_TRIES = 16;
/** Departure times it tries, spread over one orbit. */
const FAST_DEPARTURES = 8;
/** The close phase's allowance in an estimate: time, s, and delta-v, m/s. */
const CLOSE_TIME = 300;
const CLOSE_DV = 55;
/** Plane changes before it goes on with the planes as they are. */
const MAX_PLANE_TRIES = 3;
/** It aborts when the estimate times this, plus the reserve, is more than the delta-v left. */
const DV_MARGIN = 1.1;
const DV_RESERVE = 5;
/** Below this share of its capacity the RCS propellant counts as gone. */
const RCS_RESERVE = 0.02;
const MONOPROPELLANT = 'stock.monopropellant';
const ELECTRIC_CHARGE = 'stock.electric-charge';
/** First guess of the RCS acceleration per unit of demand, m/s² (learned while flying). */
const RCS_ACCEL_GUESS = 0.2;

export type RendezvousStage =
	| 'plan'
	| 'plane'
	| 'transfer'
	| 'phasing'
	| 'correct'
	| 'match'
	| 'close'
	| 'hold';

export interface RendezvousMemory extends NodeMemory {
	stage: RendezvousStage;
	/** Where a burn leads when it is done. */
	next: RendezvousStage;
	/** Expected closest approach of the planned transfer, sim time; -1 without one. */
	arrival: number;
	/** After a Hohmann to the target's radius: circularize at this apsis next ('' for none). */
	circAt: '' | 'apoapsis' | 'periapsis';
	plans: number;
	corrections: number;
	planeTries: number;
	/** The node time the coast was warped for, -1 for none. */
	warpedFor: number;
	/** The node time the short warp after aligning was made for, -1 for none (absent in older saves). */
	nearWarpFor?: number;
	warp: boolean;
	dock: boolean;
	standoff: number;
	/** Delta-v the vessel's own thrust gave it so far, m/s (measured: velocity change less gravity). */
	used: number;
	/** The estimate of the delta-v still needed, m/s, made at the last plan. */
	estimate: number;
	/** `used` at that plan. */
	usedAtEstimate: number;
	lastR: Vec3 | null;
	lastV: Vec3 | null;
	/** The vessel pushed (engine or RCS) since the last step. */
	pushed: boolean;
	/** Main engine burn under way in the close and hold phases (hysteresis). */
	thrusting: boolean;
	/** RCS: learned acceleration per unit of demand, m/s², and the last demand and velocity. */
	accel: number;
	lastDemand: Vec3 | null;
	lastVelocity: Vec3 | null;
	/** RCS full-push window: its start and the relative velocity then; RCS found not to move the vessel. */
	windowAt: number;
	windowVelocity: Vec3 | null;
	noRcs: boolean;
	/** Last try to hand over to Auto Dock, sim time. */
	dockTriedAt: number;
	/** Fast mode (plan 371): a direct intercept, fewer corrections, a quicker close phase. Absent: efficient. */
	fast?: boolean;
	/** Fast mode's delta-v cap, m/s; 0: twice the efficient estimate. */
	cap?: number;
}

export interface RendezvousParams {
	/** Hand over to Auto Dock at the standoff when the target is a docking port. */
	dock?: boolean | string;
	/** Warp through the coasts (default on). */
	warp?: boolean | string;
	/** Standoff distance, m (10–200). */
	standoff?: number | string;
	/** `efficient` (default: Hohmann and phasing, the least delta-v) or `fast` (a direct intercept, plan 371). */
	mode?: string;
	/** Fast mode's delta-v cap, m/s; 0 or absent: twice the efficient estimate. */
	cap?: number | string;
}

const flag = (v: unknown, fallback: boolean): boolean =>
	v === undefined ? fallback : v === true || v === 'on' || v === 'true' || v === 1;

const round = (v: number, step = 1): number => Math.round(v / step) * step;

/** The target as a state about the vessel's body, and relative to the vessel. */
interface Target {
	/** Target state, body-centred inertial. */
	state: StateVector;
	/** Target minus own position, m; own minus target velocity, m/s. */
	p: Vec3;
	u: Vec3;
	d: number;
}

function targetOf(pilot: VesselPilot): Target | string {
	const t = pilot.target;
	if (!t || t.kind !== 'vessel') return 'Target a vessel or a docking port first.';
	const other = pilot.targetVessel;
	if (other && other.soi !== pilot.vessel.soi) return `The target orbits ${bodyName(other.soi)}.`;
	const r = pilot.vessel.position;
	const v = pilot.vessel.velocity;
	return {
		state: { r: add(r, t.position), v: add(v, t.velocity) },
		p: t.position,
		u: scale(t.velocity, -1),
		d: t.distance
	};
}

/** A body's display name from its id: `stock.cinder` → "Cinder". */
export const bodyName = (id: string): string =>
	(id.split('.').pop() ?? id)
		.split('-')
		.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
		.join(' ');

const kmText = (m: number): string => `${(m / 1000).toFixed(Math.abs(m) < 10_000 ? 1 : 0)} km`;

/** The body the readiness check needs (the pilot's `body`, or the panel's, ADR 0288). */
export interface ReadinessBody {
	id: string;
	radius: number;
	mu: number;
	atmosphereHeight: number;
}

/** Why the rendezvous cannot start, and the program that fixes it (plan 333). */
export interface Readiness {
	problem: string | null;
	/** The Guidance tab with the next step: `ascent` to reach orbit, `orbit` to round it. */
	next?: 'ascent' | 'orbit';
}

const grounded = (v: VesselSnapshot): boolean =>
	v.surface === true || v.splashed === true || v.recovery !== undefined;

/** Lowest periapsis altitude that counts as a stable orbit: the top of the air, or 2 % of the radius without one, m. */
export const stableAltitude = (b: ReadinessBody): number =>
	b.atmosphereHeight > 0 ? b.atmosphereHeight : 0.02 * b.radius;

/**
 * Whether a rendezvous can start (plan 333): the true reason when it cannot, from the vessel's and
 * the target's orbits, the same for the autopilot and the panel. `targetVessel` is the target's
 * snapshot when the view has it.
 */
export function readiness(
	own: VesselSnapshot,
	target: TargetSnapshot | undefined,
	targetVessel: VesselSnapshot | undefined,
	body: ReadinessBody | null | undefined
): Readiness {
	if (!target || target.kind !== 'vessel') return { problem: 'Target a vessel or a docking port first.' };
	if (own.uncontrolled) return { problem: `The vessel takes no commands (${own.uncontrolled.replace('no-', 'no ')}).` };
	if (targetVessel && targetVessel.soi !== own.soi)
		return {
			problem: `The target orbits ${bodyName(targetVessel.soi)}; you orbit ${bodyName(own.soi)}. A rendezvous needs both around one body.`
		};
	if (grounded(own)) return { problem: 'On the ground: fly Ascent to orbit first.', next: 'ascent' };
	if (!body) return { problem: null };
	const safe = stableAltitude(body);
	const o = orbitOf(own.position, own.velocity, body.mu);
	if (!(o.e < 1)) return { problem: 'On an escape path: get into an orbit first.', next: 'orbit' };
	const peri = o.periapsis - body.radius;
	if (peri < safe) {
		const where = peri < 0 ? 'below the surface' : kmText(peri);
		const apoOk = o.apoapsis - body.radius > safe;
		return {
			problem: `Reach a stable orbit first: periapsis ${where}, needs ${kmText(safe)}+. ${apoOk ? 'Circularize at the apoapsis.' : 'Fly Ascent.'}`,
			next: apoOk ? 'orbit' : 'ascent'
		};
	}
	if (targetVessel && grounded(targetVessel)) return { problem: 'The target is on the ground.' };
	const t = orbitOf(add(own.position, target.position), add(own.velocity, target.velocity), body.mu);
	if (!(t.e < 1)) return { problem: 'The target is on an escape path.' };
	const tPeri = t.periapsis - body.radius;
	if (tPeri < safe)
		return {
			problem: `The target is not in a stable orbit: periapsis ${tPeri < 0 ? 'below the surface' : kmText(tPeri)}, needs ${kmText(safe)}+.`
		};
	return { problem: null };
}

/** The delta-v estimate from two states about one body (plan 333: the panel shows it while off), m/s. */
export function rendezvousEstimate(own: StateVector, target: StateVector, distance: number, mu: number): number {
	return estimateNeeded(own, { state: target, p: sub(target.r, own.r), u: sub(own.v, target.v), d: distance }, mu);
}

/** Delta-v the burning engines have left, m/s (ADR 0286 point 4). */
export function deltaVLeft(pilot: VesselPilot): number {
	const m = pilot.mass ?? 0;
	const mp = Math.min(pilot.propellantMass ?? 0, m * 0.999);
	const ve = exhaustVelocity(pilot);
	return m > 0 && ve > 0 ? ve * Math.log(m / (m - mp)) : 0;
}

const rcsLeft = (pilot: VesselPilot): boolean => {
	const r = pilot.resource(MONOPROPELLANT);
	return !!r && r.amount > RCS_RESERVE * r.capacity;
};

const period = (a: number, mu: number): number => 2 * Math.PI * Math.sqrt((a * a * a) / mu);
const at = (s: StateVector, mu: number, dt: number): StateVector => propagateUniversal(s.r, s.v, mu, dt);

/** Add a node with the burn `burn` (inertial axes) at the state `there`. */
function addBurn(pilot: VesselPilot, time: number, there: StateVector, burn: Vec3): void {
	const c = burnComponents(orbitalAxes(there.r, there.v), burn);
	pilot.addNode(time, c.prograde, c.normal, c.radial);
}

/** Solve the 3×3 system `a x = b` (Cramer); null when singular. */
function solve3(a: number[][], b: number[]): number[] | null {
	const det = (m: number[][]): number =>
		m[0]![0]! * (m[1]![1]! * m[2]![2]! - m[1]![2]! * m[2]![1]!) -
		m[0]![1]! * (m[1]![0]! * m[2]![2]! - m[1]![2]! * m[2]![0]!) +
		m[0]![2]! * (m[1]![0]! * m[2]![1]! - m[1]![1]! * m[2]![0]!);
	const d = det(a);
	if (!(Math.abs(d) > 1e-30)) return null;
	return [0, 1, 2].map((k) => det(a.map((row, i) => row.map((x, j) => (j === k ? b[i]! : x)))) / d);
}

/**
 * The burn at `before` (a state at `tb`) that puts the vessel at `aim` at time `tca`: damped
 * Newton on the miss with a finite-difference Jacobian (a burn a full turn before the arrival
 * cannot move it radially: the damping leaves that part alone). Returns the burn and the miss left.
 */
export function aimBurn(
	before: StateVector,
	aim: Vec3,
	mu: number,
	flight: number,
	guess: Vec3 = { x: 0, y: 0, z: 0 }
): { burn: Vec3; miss: number } {
	const missOf = (dv: Vec3): Vec3 => sub(propagateUniversal(before.r, add(before.v, dv), mu, flight).r, aim);
	let dv: Vec3 = guess;
	let m0 = missOf(dv);
	for (let k = 0; k < 10 && length(m0) > 1; k++) {
		const h = 0.05;
		const cols = [
			{ x: h, y: 0, z: 0 },
			{ x: 0, y: h, z: 0 },
			{ x: 0, y: 0, z: h }
		].map((e) => scale(sub(missOf(add(dv, e)), m0), 1 / h));
		const j = (i: number, c: number): number => [cols[c]!.x, cols[c]!.y, cols[c]!.z][i]!;
		// (JᵀJ + λI) x = -Jᵀ m0
		const jtj = [0, 1, 2].map((a) => [0, 1, 2].map((b) => [0, 1, 2].reduce((s, i) => s + j(i, a) * j(i, b), 0)));
		const trace = jtj[0]![0]! + jtj[1]![1]! + jtj[2]![2]!;
		for (let i = 0; i < 3; i++) jtj[i]![i]! += 1e-6 * trace + 1e-12;
		const mv = [m0.x, m0.y, m0.z];
		const rhs = [0, 1, 2].map((a) => -[0, 1, 2].reduce((s, i) => s + j(i, a) * mv[i]!, 0));
		const x = solve3(jtj, rhs);
		if (!x) break;
		let stepV = { x: x[0]!, y: x[1]!, z: x[2]! };
		if (length(stepV) > 200) stepV = scale(unit(stepV), 200);
		const next = add(dv, stepV);
		const m1 = missOf(next);
		if (length(m1) >= length(m0)) break;
		dv = next;
		m0 = m1;
	}
	return { burn: dv, miss: length(m0) };
}

/** The longest phasing wait it plans, s (10 days). */
export const MAX_PHASING_WAIT = 10 * 86_400;

/**
 * A phasing orbit (both in one orbit): the prograde burn at `tb` after which, `k` turns later, the
 * vessel is back where it burnt as the target gets there. Two ways round (plan 333): lower and
 * faster to catch a target ahead, or higher and slower to let it come round from behind; each with
 * `k` turns up to the wait limit. The first (fewest turns) whose two burns are cheap, else the
 * cheapest; the whole orbit stays above `floor`. Undefined when none fits.
 */
export function phasingBurn(
	own: StateVector,
	target: StateVector,
	mu: number,
	targetA: number,
	floor: number
): { dv: number; turns: number; flight: number } | undefined {
	const h = unit(cross(own.r, own.v));
	const u1 = unit(own.r);
	const u2 = unit(target.r);
	// how far the target leads, 0..2π
	const lead = (Math.atan2(dot(cross(u1, u2), h), dot(u1, u2)) + 2 * Math.PI) % (2 * Math.PI);
	const nT = Math.sqrt(mu / (targetA * targetA * targetA));
	const rb = length(own.r);
	const speed = length(own.v);
	if (rb < floor) return undefined;
	const cheap = Math.max(20, 0.01 * speed);
	let best: { dv: number; turns: number; flight: number } | undefined;
	for (let k = 1; k <= 20; k++) {
		let first: { dv: number; turns: number; flight: number } | undefined;
		// laps = k: catch up from behind (lower); laps = k + 1: let the target lap round (higher)
		for (const laps of [k, k + 1]) {
			const tp = (2 * Math.PI * laps - lead) / (k * nT);
			if (!(tp > 0) || k * tp > MAX_PHASING_WAIT) continue;
			const ap = Math.cbrt(mu * (tp / (2 * Math.PI)) ** 2);
			const other = 2 * ap - rb;
			if (other < floor || other > 3 * rb) continue;
			const option = { dv: visViva(mu, rb, ap) - speed, turns: k, flight: k * tp };
			if (!first || Math.abs(option.dv) < Math.abs(first.dv)) first = option;
		}
		if (!first) continue;
		if (2 * Math.abs(first.dv) <= cheap) return first;
		if (!best || Math.abs(first.dv) < Math.abs(best.dv)) best = first;
	}
	return best;
}

/** The plain words when no phasing orbit fits: raise the orbit first (the Orbit tab). */
export const tooLowToPhase = (floorAltitude: number): string =>
	`Too low to phase: raise your orbit above ${Math.ceil((floorAltitude + 20_000) / 1000)} km first (Orbit tab).`;

/** A direct intercept (plan 371): the burn at `tb` and the arrival at `tca`. */
export interface FastIntercept {
	tb: number;
	tca: number;
	before: StateVector;
	burn: Vec3;
	/** The match burn at the arrival, m/s. */
	match: number;
	/** Both burns, m/s. */
	total: number;
}

/**
 * The soonest direct intercept within `cap` m/s (plan 371), Lambert-style: for transfer times
 * from a quarter of the vessel's orbit to a whole one, the burn `LEAD` s from now that reaches a
 * point `FAST_AIM_ABOVE` m above the target then (a damped Newton, `aimBurn`), plus the burn that
 * matches its velocity there; the path's periapsis must stay above `floor`. Null when none fits.
 */
export function fastIntercept(
	own: StateVector,
	target: StateVector,
	mu: number,
	now: number,
	floor: number,
	cap: number
): FastIntercept | null {
	const o = orbitOf(own.r, own.v, mu);
	if (!(o.e < 1) || !(cap > 0)) return null;
	const turn = period(o.a, mu);
	let best: FastIntercept | null = null;
	// departures over most of an orbit, transfers from a quarter to a whole one: the soonest arrival
	for (let j = 0; j < FAST_DEPARTURES; j++) {
		const tb = now + LEAD + (j * turn) / FAST_DEPARTURES;
		if (best && tb >= best.tca) break;
		const before = at(own, mu, tb - now);
		for (let k = 0; k < FAST_TRIES; k++) {
			const tof = turn * (FAST_SHORTEST + ((FAST_LONGEST - FAST_SHORTEST) * k) / (FAST_TRIES - 1));
			const tca = tb + tof;
			if (best && tca >= best.tca) break;
			const there = at(target, mu, tca - now);
			const aim = add(there.r, scale(unit(there.r), FAST_AIM_ABOVE));
			// a prograde first guess: the Hohmann-like speed change to the target's height
			const rb = length(before.r);
			const vb = length(before.v);
			const guess = scale(unit(before.v), visViva(mu, rb, (rb + length(aim)) / 2) - vb);
			const fix = aimBurn(before, aim, mu, tof, guess);
			if (fix.miss > 50) continue;
			const after = { r: before.r, v: add(before.v, fix.burn) };
			const path = orbitOf(after.r, after.v, mu);
			if (!(path.e < 1) || path.periapsis < floor) continue;
			const arrive = at(after, mu, tof);
			const match = length(sub(there.v, arrive.v));
			const total = length(fix.burn) + match;
			if (total <= cap) best = { tb, tca, before, burn: fix.burn, match, total };
		}
	}
	return best;
}

/** What each mode would take from here (plan 371): seconds to the standoff and delta-v, or null. */
export interface ModePreview {
	efficient: { eta: number | null; dv: number };
	fast: { eta: number; dv: number; cap: number } | null;
}

/**
 * Both modes' estimates from two states about one body (plan 371), for the panel and the
 * autopilot: the efficient plan's wait (phasing or Hohmann) and delta-v, and the soonest direct
 * intercept within the cap (`capSetting`, or twice the efficient delta-v; never more than `left`
 * less 10 %).
 */
export function previewModes(
	own: StateVector,
	target: StateVector,
	distance: number,
	mu: number,
	floor: number,
	now: number,
	left: number | null,
	capSetting = 0
): ModePreview {
	const dv = rendezvousEstimate(own, target, distance, mu);
	let eta: number | null = null;
	const oOwn = orbitOf(own.r, own.v, mu);
	const oT = orbitOf(target.r, target.v, mu);
	if (distance < CLOSE_RANGE) eta = CLOSE_TIME;
	else if (oOwn.e < 1 && oT.e < 1) {
		if (Math.abs(oOwn.a - oT.a) / oT.a < COORBITAL) {
			const p = phasingBurn(at(own, mu, LEAD), at(target, mu, LEAD), mu, oT.a, floor);
			if (p) eta = LEAD + p.flight + CLOSE_TIME;
		} else {
			const h = hohmannToTarget(own, target, mu, now, LEAD);
			if (h) eta = h.wait + h.transferTime + CLOSE_TIME;
		}
	}
	let cap = capSetting > 0 ? capSetting : 2 * dv;
	if (left !== null) cap = Math.min(cap, 0.9 * left);
	const f = distance < CLOSE_RANGE ? null : fastIntercept(own, target, mu, now, floor, cap - CLOSE_DV);
	return {
		efficient: { eta, dv },
		fast: f ? { eta: f.tca - now + CLOSE_TIME, dv: f.total + CLOSE_DV, cap } : null
	};
}

/** Rough delta-v still needed from here: plane, transfer, match and the close phase, m/s. */
function estimateNeeded(own: StateVector, target: Target, mu: number): number {
	const n1 = cross(own.r, own.v);
	const n2 = cross(target.state.r, target.state.v);
	const plane = 2 * length(own.v) * Math.sin(angleBetween(n1, n2) / 2);
	const a1 = orbitOf(own.r, own.v, mu).a;
	const a2 = orbitOf(target.state.r, target.state.v, mu).a;
	let transfer = 0;
	if (a1 > 0 && a2 > 0) {
		const s = a1 + a2;
		transfer =
			Math.abs(Math.sqrt(mu / a1) * (Math.sqrt((2 * a2) / s) - 1)) +
			Math.abs(Math.sqrt(mu / a2) * (1 - Math.sqrt((2 * a1) / s)));
		// the phasing: about a degree of phase per m/s at these speeds; at most a few dozen m/s
		transfer += Math.abs(a1 - a2) / a2 < COORBITAL ? Math.min(40, (2 * target.d) / 2_000) : 10;
	}
	// the close phase starts within CLOSE_RANGE: out to it and back to rest
	const close = 2 * (Math.min(target.d, CLOSE_RANGE) / 120) + 5;
	return plane + transfer + close;
}

/** Farthest part from `from` (part positions are offsets from the vessel root, inertial axes), m. */
function reach(parts: readonly { position: Vec3 }[], from: Vec3 = { x: 0, y: 0, z: 0 }): number {
	let r = 0;
	for (const p of parts) r = Math.max(r, length(sub(p.position, from)));
	return r;
}

/** The sphere round the target the vessel must stay out of, m from its centre: both vessels' sizes and 3 m. */
const keepOutOf = (pilot: VesselPilot): number =>
	reach(pilot.targetVessel?.parts ?? []) + reach(pilot.vessel.parts) + 3;

/** Where it stops: the setting, but never inside the keep-out sphere plus 2 m, m. */
export const standoffFor = (pilot: VesselPilot, m: Pick<RendezvousMemory, 'standoff'>): number =>
	Math.max(m.standoff, keepOutOf(pilot) + 2);

/** Close enough to the standoff to hold there, m. */
const arrivedWithin = (standoff: number): number => Math.min(HOLD_DISTANCE, standoff + Math.max(5, 0.3 * standoff));

export function newRendezvousMemory(pilot: VesselPilot, params: RendezvousParams = {}): RendezvousMemory {
	const standoff = clamp(Number(params.standoff ?? STANDOFF) || STANDOFF, MIN_STANDOFF, HOLD_DISTANCE);
	return {
		...newNodeMemory(false),
		stage: 'plan',
		next: 'plan',
		arrival: -1,
		circAt: '',
		plans: 0,
		corrections: 0,
		planeTries: 0,
		warpedFor: -1,
		nearWarpFor: -1,
		warp: flag(params.warp, true),
		dock: flag(params.dock, false),
		standoff,
		used: 0,
		estimate: 0,
		usedAtEstimate: 0,
		lastR: null,
		lastV: null,
		pushed: false,
		thrusting: false,
		accel: RCS_ACCEL_GUESS,
		lastDemand: null,
		lastVelocity: null,
		windowAt: pilot.time,
		windowVelocity: null,
		noRcs: false,
		dockTriedAt: -1e9,
		fast: params.mode === 'fast',
		cap: Math.max(0, Number(params.cap ?? 0) || 0)
	};
}

/** Why the target does not do for a rendezvous, or null (the panel's check: it needs no facts). */
export function targetProblem(pilot: VesselPilot): string | null {
	const t = targetOf(pilot);
	return typeof t === 'string' ? t : null;
}

/** Why the vessel cannot start, or null. */
export function rendezvousProblem(pilot: VesselPilot): string | null {
	const f = facts(pilot);
	if (typeof f === 'string') return f;
	const t = targetOf(pilot);
	if (typeof t === 'string') return t;
	const ready = readiness(pilot.vessel, pilot.target, pilot.targetVessel, pilot.body);
	if (ready.problem) return ready.problem;
	if (pilot.maxThrust <= 0 && !(t.d < RCS_RANGE && rcsLeft(pilot)))
		return 'No engine is burning: stage first.';
	return null;
}

const flight = (pilot: VesselPilot): Record<string, number | string> => {
	const t = pilot.target;
	return t ? { Distance: round(t.distance, 0.1), 'Relative speed': round(t.relativeSpeed, 0.01) } : {};
};

/** One step of the rendezvous. */
export function stepRendezvous(pilot: VesselPilot, m: RendezvousMemory, dt: number): AutopilotStep {
	const f = facts(pilot);
	if (typeof f === 'string') return { phase: m.stage, abort: f };
	const target = targetOf(pilot);
	if (typeof target === 'string') return { phase: m.stage, abort: target };
	const own: StateVector = { r: pilot.vessel.position, v: pilot.vessel.velocity };
	// measure the delta-v the vessel gave itself: its velocity change less the gravity's
	if (m.pushed && m.lastR && m.lastV && dt > 0) {
		const g = (r: Vec3): Vec3 => scale(r, -f.mu / length(r) ** 3);
		const gravity = scale(add(g(m.lastR), g(own.r)), dt / 2);
		m.used += length(sub(sub(own.v, m.lastV), gravity));
	}
	m.lastR = own.r;
	m.lastV = own.v;
	m.pushed = false;
	const left = deltaVLeft(pilot);
	const estimate = Math.max(0, m.estimate - (m.used - m.usedAtEstimate));
	const readouts = {
		...flight(pilot),
		'Delta-v used': round(m.used, 0.1),
		'Delta-v estimate': round(estimate, 0.1),
		'Delta-v left': round(left, 0.1)
	};
	const out = (step: AutopilotStep): AutopilotStep => {
		if (step.abort) {
			pilot.throttle(0);
			pilot.translate(0, 0, 0);
		}
		return { ...step, readouts: { ...readouts, ...step.readouts } };
	};
	// a probe without power takes no commands
	const power = pilot.resource(ELECTRIC_CHARGE);
	if (power && power.capacity > 0 && power.amount <= 0)
		return out({ phase: m.stage, abort: 'Out of electric charge: the vessel takes no commands.' });
	// fuel: main engine and RCS both spent
	if (left < 0.5 && !(rcsLeft(pilot) && !m.noRcs && target.d < RCS_RANGE))
		return out({ phase: m.stage, abort: 'Out of fuel: no delta-v left.' });

	switch (m.stage) {
		case 'plan':
			return out(plan(pilot, m, f.mu, f.radius, own, target, left));
		case 'close':
			return out(close(pilot, m, f.mass, target, dt));
		case 'hold':
			return out(hold(pilot, m, f.mass, target, dt));
		default:
			return out(burn(pilot, m, f.mass));
	}
}

/** A far-phase burn: the node executor, warping through the coast to it. */
function burn(pilot: VesselPilot, m: RendezvousMemory, mass: number): AutopilotStep {
	const node = pilot.vessel.nodes?.[0];
	if (node?.vector && m.phase === 'align' && m.warp) {
		const start = node.time - burnTime(node.dv, mass, pilot.maxThrust, exhaustVelocity(pilot)) / 2;
		const left = start - pilot.time;
		if (m.warpedFor !== node.time && left > WARP_MIN) {
			// the long coast: warp to WARP_WAKE s before the burn, time to wake up and turn
			m.warpedFor = node.time;
			pilot.warpTo(start - WARP_WAKE);
		} else if (
			m.nearWarpFor !== node.time &&
			left > NEAR_WARP_MIN &&
			left <= WARP_WAKE + 5 &&
			angleBetween(noseOf(pilot), unit(node.vector)) < NEAR_WARP_ALIGN
		) {
			// turned and steady: warp the rest, to WARP_NEAR s before the burn
			m.nearWarpFor = node.time;
			pilot.warpTo(start - WARP_NEAR);
		}
	}
	const step = stepNode(pilot, m);
	if (step.abort) {
		// the player removed the node: plan again
		if (!node) return toStage(m, 'plan', 'The node is gone: planning again');
		return { phase: m.stage, abort: step.abort };
	}
	if (m.phase === 'burn') m.pushed = true;
	if (step.done) {
		Object.assign(m, newNodeMemory(false), { warpedFor: -1, nearWarpFor: -1 });
		return toStage(m, m.next, `${m.stage} burn done`);
	}
	// the node's own delta-v is the burn's; "Delta-v left" stays the vessel's
	const { 'Delta-v left': burnLeft, ...rest } = step.readouts ?? {};
	return {
		phase: m.stage,
		status: `${title(m.stage)}: ${step.status ?? ''}`,
		readouts: { ...rest, ...(burnLeft === undefined ? {} : { 'Burn left': burnLeft }) }
	};
}

const TITLES: Record<RendezvousStage, string> = {
	plan: 'Planning',
	plane: 'Plane change',
	transfer: 'Transfer',
	phasing: 'Phasing orbit',
	correct: 'Course correction',
	match: 'Match velocity',
	close: 'Closing in',
	hold: 'Holding'
};
const title = (s: RendezvousStage): string => TITLES[s];

function toStage(m: RendezvousMemory, stage: RendezvousStage, line: string): AutopilotStep {
	m.stage = stage;
	m.thrusting = false;
	return { phase: stage, status: line, log: line };
}

/** Plan the next far burn (as a node), or move on to the close phase. */
function plan(
	pilot: VesselPilot,
	m: RendezvousMemory,
	mu: number,
	radius: number,
	own: StateVector,
	target: Target,
	left: number
): AutopilotStep {
	const now = pilot.time;
	for (const n of pilot.vessel.nodes ?? []) pilot.removeNode(n.id);
	m.estimate = estimateNeeded(own, target, mu);
	m.usedAtEstimate = m.used;
	if (left < m.estimate * DV_MARGIN + DV_RESERVE)
		return {
			phase: 'plan',
			abort: `Not enough delta-v: about ${Math.round(m.estimate)} m/s needed, ${Math.round(left)} m/s left.`
		};
	if (target.d < CLOSE_RANGE) {
		m.arrival = -1;
		return toStage(m, 'close', `${Math.round(target.d)} m from the target: closing in`);
	}
	const oOwn = orbitOf(own.r, own.v, mu);
	const oT = orbitOf(target.state.r, target.state.v, mu);
	if (!(oOwn.e < 1) || !(oT.e < 1)) return { phase: 'plan', abort: 'Both must be in closed orbits.' };
	const turn = period(oOwn.a, mu);
	const floor = radius + Math.max(10_000, (pilot.body?.atmosphereHeight ?? 0) + 10_000);
	const planned = (stage: RendezvousStage, next: RendezvousStage, line: string): AutopilotStep => {
		Object.assign(m, newNodeMemory(false), { warpedFor: -1, nearWarpFor: -1 });
		m.next = next;
		return toStage(m, stage, line);
	};

	// the second half of a Hohmann to the target's radius
	if (m.circAt) {
		const apsis = m.circAt;
		m.circAt = '';
		const r = apsis === 'apoapsis' ? oOwn.apoapsis : oOwn.periapsis;
		const dt = Math.max(LEAD, apsis === 'apoapsis' ? oOwn.toApoapsis : oOwn.toPeriapsis);
		const there = at(own, mu, dt);
		const want = scale(unit(there.v), Math.sqrt(mu / r));
		addBurn(pilot, now + dt, there, sub(want, there.v));
		return planned('transfer', 'plan', `circularizing at the ${apsis}`);
	}

	// 1. the plane
	const angle = angleBetween(cross(own.r, own.v), cross(target.state.r, target.state.v));
	// fast mode leaves the plane to its direct intercept
	if (!m.fast && angle > PLANE_TOLERANCE && m.planeTries < MAX_PLANE_TRIES && m.arrival < now) {
		const node = relativeNodes(own, target.state, mu, now, LEAD)[0];
		if (node) {
			m.planeTries++;
			pilot.addNode(node.time, node.dv.prograde, node.dv.normal, node.dv.radial);
			return planned(
				'plane',
				'plan',
				`planes ${(angle / DEG).toFixed(2)}° apart: ${node.magnitude.toFixed(1)} m/s at the ${node.kind} node`
			);
		}
	}

	// 2. an intercept already planned: match, or correct the course
	const horizon = Math.max(1.5 * turn, m.arrival > now ? m.arrival - now + 0.25 * turn : 0);
	const ownAt = (t: number) => at(own, mu, t - now);
	const targetAt = (t: number) => at(target.state, mu, t - now);
	const ca = closestApproach(ownAt, targetAt, now + LEAD, now + horizon, Math.ceil((horizon / turn) * 180));
	const correctionsLeft = m.arrival > now + 600 && m.corrections < (m.fast ? FAST_CORRECTIONS : MAX_CORRECTIONS);
	if (ca.distance < INTERCEPT || (ca.distance < FAR_MATCH && m.arrival > now && !correctionsLeft)) {
		const early = Math.sqrt(Math.max(0, MATCH_AHEAD ** 2 - ca.distance ** 2)) / Math.max(ca.relativeSpeed, 0.1);
		const tm = Math.max(now + LEAD, ca.t - Math.min(early, 0.1 * turn));
		const o = ownAt(tm);
		addBurn(pilot, tm, o, sub(targetAt(tm).v, o.v));
		m.arrival = -1;
		return planned(
			'match',
			'close',
			`closest approach ${(ca.distance / 1000).toFixed(2)} km in ${Math.round(ca.t - now)} s: matching velocity there`
		);
	}
	if (correctionsLeft) {
		const tca = Math.abs(ca.t - m.arrival) < 0.25 * turn ? ca.t : m.arrival;
		const tb = now + Math.max(LEAD, 0.25 * (tca - now));
		const before = ownAt(tb);
		const aimAt = targetAt(tca).r;
		const aim = add(aimAt, scale(unit(aimAt), m.fast ? FAST_AIM_ABOVE : AIM_ABOVE));
		const fix = aimBurn(before, aim, mu, tca - tb);
		m.corrections++;
		if (fix.miss < 0.5 * ca.distance && length(fix.burn) < 0.2 * length(own.v)) {
			addBurn(pilot, tb, before, fix.burn);
			m.arrival = tca;
			return planned(
				'correct',
				'plan',
				`closest approach ${(ca.distance / 1000).toFixed(1)} km: ${length(fix.burn).toFixed(1)} m/s correction`
			);
		}
	}

	// 3. a new transfer
	if (m.plans >= MAX_PLANS) return { phase: 'plan', abort: 'Could not find an intercept with the target.' };
	m.plans++;
	m.corrections = 0;
	if (m.fast) {
		// the soonest direct intercept within the cap (twice the efficient plan unless set)
		const capped = Math.min(m.cap && m.cap > 0 ? m.cap : 2 * m.estimate, 0.9 * left) - CLOSE_DV;
		const f = fastIntercept(own, target.state, mu, now, floor, capped);
		if (f) {
			addBurn(pilot, f.tb, f.before, f.burn);
			m.arrival = f.tca;
			m.estimate = f.total + CLOSE_DV;
			m.usedAtEstimate = m.used;
			return planned(
				'transfer',
				'plan',
				`fast: a direct intercept, ${length(f.burn).toFixed(1)} m/s now, at the target in ${Math.round(f.tca - now)} s (${Math.round(f.total)} m/s with the match)`
			);
		}
		// none within the cap: the efficient plan, from the next step
		m.fast = false;
		m.plans--;
		const line = `fast: no direct intercept within ${Math.round(capped + CLOSE_DV)} m/s: the efficient plan instead`;
		return { phase: 'plan', status: line, log: line };
	}
	if (Math.abs(oOwn.a - oT.a) / oT.a < COORBITAL && oOwn.e < 0.01) {
		const tb = now + LEAD;
		const phasing = phasingBurn(ownAt(tb), targetAt(tb), mu, oT.a, floor);
		if (!phasing) return { phase: 'plan', abort: tooLowToPhase(floor - radius) };
		pilot.addNode(tb, phasing.dv, 0, 0);
		m.arrival = tb + phasing.flight;
		return planned(
			'phasing',
			'plan',
			`same orbit, ${(target.d / 1000).toFixed(1)} km apart: a phasing orbit of ${phasing.turns} turn${phasing.turns > 1 ? 's' : ''} (${phasing.dv.toFixed(1)} m/s)`
		);
	}
	if (oOwn.e > 0.02) {
		// round the orbit at the apsis nearer the target's radius first
		const apsis = Math.abs(oOwn.apoapsis - oT.a) < Math.abs(oOwn.periapsis - oT.a) ? 'apoapsis' : 'periapsis';
		m.circAt = apsis;
		m.plans--;
		return { phase: 'plan', status: `rounding the orbit at the ${apsis} first` };
	}
	const hohmann = hohmannToTarget(own, target.state, mu, now, LEAD);
	if (hohmann && hohmann.wait < MAX_WAIT_ORBITS * turn) {
		pilot.addNode(hohmann.time, hohmann.dv1, 0, 0);
		m.arrival = hohmann.time + hohmann.transferTime;
		return planned(
			'transfer',
			'plan',
			`Hohmann transfer in ${Math.round(hohmann.wait)} s: ${hohmann.dv1.toFixed(1)} m/s, ${Math.round(hohmann.transferTime)} s to the target`
		);
	}
	// the window is far off: go to the target's radius now, then phase
	const tb = now + LEAD;
	const there = ownAt(tb);
	const rb = length(there.r);
	const a = (rb + oT.a) / 2;
	const dv = visViva(mu, rb, a) - length(there.v);
	pilot.addNode(tb, dv, 0, 0);
	m.circAt = oT.a > rb ? 'apoapsis' : 'periapsis';
	m.arrival = -1;
	return planned('transfer', 'plan', `the Hohmann window is far off: to the target's orbit first (${dv.toFixed(1)} m/s)`);
}

/**
 * RCS translation toward the relative velocity `want` (own minus target, inertial), sized by the
 * learned acceleration (as Auto Dock does); returns the error, m/s.
 */
function translate(pilot: VesselPilot, m: RendezvousMemory, u: Vec3, want: Vec3, dt: number): number {
	if (m.lastDemand && m.lastVelocity && dt > 0) {
		const d2 = dot(m.lastDemand, m.lastDemand);
		if (d2 > 0.04) {
			const seen = dot(sub(u, m.lastVelocity), m.lastDemand) / (d2 * dt);
			if (seen > 0) m.accel = 0.7 * m.accel + 0.3 * clamp(seen, 0.005, 50);
		}
	}
	m.lastVelocity = u;
	const error = sub(want, u);
	const size = length(error);
	if (size < 0.01) {
		pilot.translate(0, 0, 0);
		m.lastDemand = null;
		return size;
	}
	let demand = scale(error, 0.5 / (m.accel * Math.max(dt, 0.02)));
	if (length(demand) > Math.sqrt(3)) demand = scale(unit(demand), Math.sqrt(3));
	const local = pilot.toLocal(demand);
	const x = clamp(local.x, -1, 1);
	const y = clamp(local.y, -1, 1);
	const z = clamp(local.z, -1, 1);
	pilot.translate(x, y, z);
	m.lastDemand = pilot.toWorld({ x, y, z });
	m.pushed = true;
	// RCS pushing hard without changing the velocity: no thrusters that can do it
	if (size < 0.3) m.windowVelocity = null;
	else if (!m.windowVelocity) {
		m.windowVelocity = u;
		m.windowAt = pilot.time;
	} else if (pilot.time - m.windowAt >= 15) {
		if (length(sub(u, m.windowVelocity)) < 0.05) m.noRcs = true;
		m.windowVelocity = null;
	}
	return size;
}

/** Fly the relative velocity toward `want` with the main engine, with hysteresis; returns the error. */
function engine(
	pilot: VesselPilot,
	m: RendezvousMemory,
	mass: number,
	u: Vec3,
	want: Vec3,
	on: number,
	off: number,
	face: Vec3
): number {
	const error = sub(want, u);
	const size = length(error);
	if (!m.thrusting && size > on) m.thrusting = true;
	if (m.thrusting && size < off) m.thrusting = false;
	const thrust = pilot.maxThrust;
	if (!m.thrusting || thrust <= 0) {
		pilot.throttle(0);
		pilot.pointAt(face);
		return size;
	}
	const direction = unit(error);
	pilot.pointAt(direction);
	const aligned = angleBetween(noseOf(pilot), direction) < 5 * DEG;
	// reach the wanted velocity in about a second
	pilot.throttle(aligned ? clamp((size * mass) / thrust, 0, 1) : 0);
	if (aligned) m.pushed = true;
	return size;
}

/** Collision course: the vessel's straight path enters the keep-out sphere and it cannot stop before. */
function collision(pilot: VesselPilot, m: RendezvousMemory, mass: number, target: Target): string | null {
	const { p, u, d } = target;
	const closing = dot(u, unit(p));
	if (closing <= 0) return null;
	const keepOut = keepOutOf(pilot);
	const t = dot(p, u) / Math.max(dot(u, u), 1e-9);
	const miss = length(sub(p, scale(u, t)));
	if (miss > keepOut) return null;
	const accel = Math.max(pilot.maxThrust / mass, rcsLeft(pilot) && !m.noRcs ? m.accel : 0);
	const stop = accel > 0 ? (closing * closing) / (2 * accel) : Infinity;
	return stop > d - keepOut ? `Collision course: ${closing.toFixed(1)} m/s toward the target, ${Math.round(d)} m away.` : null;
}

/** The close phase: toward the target, slowing to a stop at the standoff. */
function close(pilot: VesselPilot, m: RendezvousMemory, mass: number, target: Target, dt: number): AutopilotStep {
	const { p, u, d } = target;
	const crash = collision(pilot, m, mass, target);
	if (crash) return { phase: 'close', abort: crash };
	const speed = length(u);
	const standoff = standoffFor(pilot, m);
	if (d <= arrivedWithin(standoff) && speed < HOLD_SPEED) {
		pilot.throttle(0);
		pilot.translate(0, 0, 0);
		return toStage(m, 'hold', `${Math.round(d)} m from the target at ${speed.toFixed(2)} m/s: holding`);
	}
	const dir = unit(p);
	const useRcs = d < RCS_RANGE && rcsLeft(pilot) && !m.noRcs;
	const accelMain = pilot.maxThrust / mass;
	// fast mode (plan 371): twice the speed far out, braking harder and later
	const brake = useRcs
		? (m.fast ? 0.7 : 0.5) * m.accel
		: Math.min((m.fast ? 0.4 : 0.25) * accelMain, m.fast ? 4 : 2);
	const gap = Math.max(0, d - standoff);
	const wanted =
		gap > 0
			? Math.min(clamp(d / (m.fast ? 60 : 120), 0.5, m.fast ? 100 : 50), gap / (m.fast ? 15 : 30), Math.sqrt(2 * brake * gap))
			: 0;
	const want = scale(dir, wanted);
	let error: number;
	if (useRcs) {
		if (!pilot.vessel.rcs) pilot.rcs(true);
		pilot.throttle(0);
		pilot.pointAt(dir);
		error = translate(pilot, m, u, want, dt);
	} else {
		pilot.translate(0, 0, 0);
		error = engine(pilot, m, mass, u, want, Math.max(0.5, 0.15 * wanted), Math.max(0.1, 0.03 * wanted), dir);
	}
	return {
		phase: 'close',
		status: `Closing in by ${useRcs ? 'RCS' : 'engine'}: ${Math.round(d)} m, ${speed.toFixed(1)} m/s (want ${wanted.toFixed(1)})`,
		readouts: { 'Velocity error': round(error, 0.01) }
	};
}

/** Hold at the standoff; hand over to Auto Dock when asked. */
function hold(pilot: VesselPilot, m: RendezvousMemory, mass: number, target: Target, dt: number): AutopilotStep {
	const { p, u, d } = target;
	const standoff = standoffFor(pilot, m);
	if (d > arrivedWithin(standoff) + Math.max(10, 0.2 * standoff))
		return toStage(m, 'close', `drifted to ${Math.round(d)} m: closing in again`);
	const crash = collision(pilot, m, mass, target);
	if (crash) return { phase: 'hold', abort: crash };
	const dir = unit(p);
	const keepOut = keepOutOf(pilot);
	// inside the keep-out: back off; else creep to the standoff (at most 0.1 m/s) and stay there
	const gap = d - standoff;
	const want =
		d < keepOut
			? scale(dir, -0.3)
			: Math.abs(gap) > 1
				? scale(dir, clamp(gap / 40, -0.1, 0.1))
				: { x: 0, y: 0, z: 0 };
	const log: string[] = [];
	if (rcsLeft(pilot) && !m.noRcs) {
		if (!pilot.vessel.rcs) pilot.rcs(true);
		pilot.throttle(0);
		pilot.pointAt(dir);
		translate(pilot, m, u, want, dt);
	} else engine(pilot, m, mass, u, want, 0.3, 0.05, dir);

	// hand over to Auto Dock: control from a free port the size of the target port, then engage it
	const port = pilot.targetPort;
	if (m.dock && port && length(u) < HOLD_SPEED && pilot.time - m.dockTriedAt > 30) {
		if (!pilot.controlPort) {
			const mine = pilot.vessel.ports?.find((q) => q.free && Math.abs(q.size - port.size) < 1e-3);
			if (mine) pilot.controlFrom(mine.part);
			else {
				m.dockTriedAt = pilot.time;
				log.push('Dock when close: no free docking port of that size aboard');
			}
		} else {
			m.dockTriedAt = pilot.time;
			pilot.translate(0, 0, 0);
			if (pilot.engage('autodock.dock'))
				return { phase: 'hold', status: 'Handed over to Auto Dock', log: 'handed over to Auto Dock' };
			log.push('Auto Dock did not start (see its panel): holding');
		}
	}
	return {
		phase: 'hold',
		status: `Holding ${Math.round(d)} m from the target`,
		...(log.length ? { log } : {})
	};
}

export const Rendezvous = defineAutopilot<RendezvousMemory>({
	id: 'guidance.rendezvous',
	title: 'Rendezvous',
	description:
		'Flies to the target vessel or port: matches the plane, transfers with the phase wait, matches velocity and closes in to the set distance (10–200 m), then holds (or hands over to Auto Dock).',
	rate: 10,
	start(pilot, params) {
		const problem = rendezvousProblem(pilot);
		if (problem) throw new Error(problem);
		return newRendezvousMemory(pilot, (params ?? {}) as RendezvousParams);
	},
	step: (pilot, memory, dt) => stepRendezvous(pilot, memory, dt)
});
