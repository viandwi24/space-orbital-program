/**
 * The trip planner's delta-v map (plan 034, ADR 0083). Pure maths on body data, no DOM:
 *
 * - `destinationsOf(bodies)` lists what the loaded bodies offer: low orbit and escape of the home
 *   body (the first one), and for every body that orbits it the transfer, the orbit, the landing and
 *   the round trip. A mod body appears without a line of code.
 * - each destination is a list of legs with a delta-v (vis-viva / Hohmann for transfers,
 *   hyperbolic capture and ejection by patched conics, a point-mass ascent integration for the
 *   climbs and, reversed, the landings; research/delta-v-map.md).
 * - `planTrip` lays the legs over the stages of a design in firing order: which stage covers which
 *   leg, the first stage at sea level on an atmospheric leg, and what is short or spare.
 *
 * Assumptions, shown in the UI: coplanar circular orbits, no plane change, a moon on a circular
 * orbit of its semi-major axis, impulsive burns.
 */
import { homeBodyOf, type BodyDefinition } from '@orbital/core';
import { bodyMu } from '../orbit-info';

/** Ascent acceleration of the reference rocket, in surface gravities of the home body (every body). */
export const REFERENCE_ACCELERATION_G = 1.5;
/** Ballistic coefficient m / (Cd A) of the reference rocket, kg/m^2 (a 30 t stock stack, Cd A about 2). */
export const BALLISTIC_COEFFICIENT = 15_000;
/** Vertical speed at which the reference ascent starts to turn, m/s. */
const TURN_SPEED = 40;
/** The sim's air (packages/sim constants.ts; research/atmosphere.md): density = p / (R T). */
const AIR_GAS_CONSTANT = 287.05;
const AIR_TEMPERATURE = 288.15;
/** Margin above the atmosphere of a body's low orbit, m (airless: a quarter of the radius instead). */
const ORBIT_CLEARANCE = 10_000;
/** Periapsis of the return path, as a fraction of the home atmosphere's height (the heat shield brakes). */
const REENTRY_DEPTH = 0.5;

export type LegId =
	'ascent' | 'escape' | 'transfer' | 'capture' | 'descent' | 'liftoff' | 'ejection' | 'reentry';

export interface Leg {
	id: LegId;
	label: string;
	/** Delta-v of the leg, m/s. */
	dv: number;
	/** The leg burns in the home atmosphere: the first stage counts at its sea-level figure. */
	atmospheric: boolean;
}

export interface Destination {
	id: string;
	label: string;
	/** Body the destination is about. */
	body: string;
	kind: 'low-orbit' | 'escape' | 'transfer' | 'orbit' | 'landing' | 'return';
	/** Every leg from the pad, in order. */
	legs: Leg[];
	/** Sum of the legs, m/s. */
	total: number;
}

// --- body helpers --------------------------------------------------------------------------------------

/** "stock.cinder" -> "Cinder". */
export function bodyName(body: Pick<BodyDefinition, 'id'>): string {
	const last = body.id.split('.').pop() ?? body.id;
	return last
		.split('-')
		.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
		.join(' ');
}

export const surfaceGravity = (body: BodyDefinition): number =>
	bodyMu(body) / (body.radius * body.radius);

/** Altitude of a body's low orbit, m: 10 km over the atmosphere, or a quarter of the radius when airless. */
export const lowOrbitAltitude = (body: BodyDefinition): number =>
	body.atmosphere ? body.atmosphere.height + ORBIT_CLEARANCE : body.radius / 4;

// --- the ascent ------------------------------------------------------------------------------------------

export interface Ascent {
	/** Burn plus circularisation, m/s. */
	dv: number;
	/** Thrust-acceleration integral to the cut-off, m/s. */
	burn: number;
	/** Circularisation burn at the apoapsis, m/s. */
	circularise: number;
	/** Initial turn of the best path, degrees from the vertical. */
	turnDeg: number;
}

/**
 * One gravity-turn ascent of a point mass from the equator, in the plane of the orbit (polar
 * coordinates in the inertial frame), at constant thrust acceleration `accel`. It climbs straight to
 * `TURN_SPEED`, tilts by `turn` and then thrusts along the velocity relative to the ground; drag is
 * `rho |v| v / (2 beta)` with the sim's exponential air. It cuts off when the apoapsis reaches
 * `altitude`, coasts (drag ignored: the apoapsis is above the air) and circularises there. Returns
 * null when the path falls back to the ground or never gets there.
 */
function oneAscent(
	body: BodyDefinition,
	accel: number,
	altitude: number,
	turn: number
): Ascent | null {
	const mu = bodyMu(body);
	const R = body.radius;
	const w = (2 * Math.PI) / body.rotationPeriod;
	const air = body.atmosphere;
	const rho0 = air ? air.surfacePressure / (AIR_GAS_CONSTANT * AIR_TEMPERATURE) : 0;
	const target = R + altitude;
	const dt = 0.1;
	let r = R;
	let vr = 0;
	let vt = w * R;
	let burn = 0;
	let turning = false;
	for (let i = 0; i < 30_000; i++) {
		const h = r - R;
		const vrel = vt - w * r;
		const speed = Math.hypot(vr, vrel);
		if (!turning && vr >= TURN_SPEED) turning = true;
		// Thrust direction as an angle from the local vertical: straight up, then at least `turn`
		// and otherwise along the relative velocity (zero angle of attack).
		const angle = turning ? Math.max(Math.atan2(vrel, vr), turn) : 0;
		const rho = air && h < air.height ? rho0 * Math.exp(-h / air.scaleHeight) : 0;
		const k = (rho * speed) / (2 * BALLISTIC_COEFFICIENT);
		const ar = accel * Math.cos(angle) - mu / (r * r) + (vt * vt) / r - k * vr;
		const at = accel * Math.sin(angle) - (vr * vt) / r - k * vrel;
		vr += ar * dt;
		vt += at * dt;
		r += vr * dt;
		burn += accel * dt;
		if (r < R) return null;
		const energy = 0.5 * (vr * vr + vt * vt) - mu / r;
		const momentum = r * vt;
		if (energy >= 0) return null;
		const a = -mu / (2 * energy);
		const e = Math.sqrt(Math.max(0, 1 + (2 * energy * momentum * momentum) / (mu * mu)));
		const apoapsis = a * (1 + e);
		if (vr > 0 && apoapsis >= target) {
			const circularise = Math.sqrt(mu / apoapsis) - momentum / apoapsis;
			return {
				dv: burn + Math.max(0, circularise),
				burn,
				circularise: Math.max(0, circularise),
				turnDeg: (turn * 180) / Math.PI
			};
		}
	}
	return null;
}

const ascentCache = new Map<string, Ascent | null>();

/**
 * The cheapest reference ascent to a circular orbit at `altitude`: `oneAscent` over a scan of initial
 * turns (0.5 to 89.5 degrees, then refined to 0.05), the lowest delta-v wins. Null when the body's
 * gravity is more than the reference acceleration can lift against.
 */
export function ascentOf(body: BodyDefinition, accel: number, altitude: number): Ascent | null {
	const key = [
		body.id,
		body.mass,
		body.radius,
		body.rotationPeriod,
		body.atmosphere?.scaleHeight,
		body.atmosphere?.surfacePressure,
		body.atmosphere?.height,
		accel,
		altitude
	].join('|');
	if (ascentCache.has(key)) return ascentCache.get(key) ?? null;
	const rad = Math.PI / 180;
	let best: Ascent | null = null;
	const scan = (from: number, to: number, step: number): void => {
		for (let d = from; d <= to + 1e-9; d += step) {
			const a = oneAscent(body, accel, altitude, d * rad);
			if (a && (!best || a.dv < best.dv)) best = a;
		}
	};
	scan(0.5, 89.5, 0.5);
	const coarse = best as Ascent | null;
	if (coarse) scan(Math.max(0.05, coarse.turnDeg - 0.5), coarse.turnDeg + 0.5, 0.05);
	ascentCache.set(key, best);
	return best;
}

// --- conics ----------------------------------------------------------------------------------------------

/** Vis-viva speed at radius `r` on a conic of semi-major axis `a`. */
export const visViva = (mu: number, r: number, a: number): number =>
	Math.sqrt(Math.max(0, mu * (2 / r - 1 / a)));

/** First burn of a Hohmann transfer from a circular orbit `r1` to apoapsis `r2`, m/s. */
export function hohmannDeparture(mu: number, r1: number, r2: number): number {
	return visViva(mu, r1, (r1 + r2) / 2) - Math.sqrt(mu / r1);
}

/**
 * Burn between a circular orbit of radius `r` about a body of `mu` and a hyperbola of excess speed
 * `vInf`: capture when arriving, ejection when leaving (the same number), m/s.
 */
export function hyperbolicBurn(mu: number, r: number, vInf: number): number {
	return Math.sqrt(vInf * vInf + (2 * mu) / r) - Math.sqrt(mu / r);
}

// --- destinations --------------------------------------------------------------------------------------

const sum = (legs: readonly Leg[]): number => legs.reduce((s, l) => s + l.dv, 0);

function destination(
	id: string,
	label: string,
	body: string,
	kind: Destination['kind'],
	legs: Leg[]
): Destination {
	return { id, label, body, kind, legs, total: sum(legs) };
}

const km = (m: number): string => `${Math.round(m / 1000)} km`;

/**
 * Everything the bodies offer from the pad of the home body (plan 122: not the root once a Sun is there), in order: its low orbit, escape, then per
 * moon (a body whose `parent` is the home body and that has an `orbit`) the transfer, the orbit,
 * the landing and the way back. A destination whose ascent the reference rocket cannot fly (gravity
 * above its acceleration) or whose orbit lies inside the home body's low orbit is left out.
 */
export function destinationsOf(bodies: readonly BodyDefinition[]): Destination[] {
	const home = homeBodyOf(bodies);
	if (!home) return [];
	const muH = bodyMu(home);
	const accel = REFERENCE_ACCELERATION_G * surfaceGravity(home);
	const altH = lowOrbitAltitude(home);
	const r1 = home.radius + altH;
	const homeName = bodyName(home);
	const up = ascentOf(home, accel, altH);
	if (!up) return [];
	const launch: Leg = {
		id: 'ascent',
		label: `Launch to ${km(altH)} orbit`,
		dv: up.dv,
		atmospheric: true
	};
	const out: Destination[] = [
		destination('low-orbit', `Low orbit (${km(altH)})`, home.id, 'low-orbit', [launch]),
		destination('escape', `Escape from ${homeName}`, home.id, 'escape', [
			launch,
			{
				id: 'escape',
				label: 'Escape burn',
				dv: (Math.SQRT2 - 1) * Math.sqrt(muH / r1),
				atmospheric: false
			}
		])
	];
	for (const moon of bodies) {
		if (moon.parent !== home.id || !moon.orbit || moon.orbit.a <= r1) continue;
		const r2 = moon.orbit.a;
		const muM = bodyMu(moon);
		const name = bodyName(moon);
		const altM = lowOrbitAltitude(moon);
		const rp = moon.radius + altM;
		const climb = ascentOf(moon, accel, altM);
		if (!climb) continue;

		const vMoon = Math.sqrt(muH / r2);
		const outbound = visViva(muH, r2, (r1 + r2) / 2);
		const departure: Leg = {
			id: 'transfer',
			label: `Transfer to ${name}`,
			dv: hohmannDeparture(muH, r1, r2),
			atmospheric: false
		};
		const capture: Leg = {
			id: 'capture',
			label: `Capture at ${name}`,
			dv: hyperbolicBurn(muM, rp, Math.abs(vMoon - outbound)),
			atmospheric: false
		};
		const descent: Leg = {
			id: 'descent',
			label: `Land on ${name}`,
			dv: climb.dv,
			atmospheric: false
		};
		const liftoff: Leg = {
			id: 'liftoff',
			label: `Lift off from ${name}`,
			dv: climb.dv,
			atmospheric: false
		};
		// The way home: an ellipse from the moon's orbit down to a periapsis inside the home
		// atmosphere (the heat shield brakes, no burn), or to the low orbit when there is no air.
		const rReturn = home.atmosphere ? home.radius + home.atmosphere.height * REENTRY_DEPTH : r1;
		const inbound = visViva(muH, r2, (r2 + rReturn) / 2);
		const ejection: Leg = {
			id: 'ejection',
			label: `Leave ${name}`,
			dv: hyperbolicBurn(muM, rp, Math.abs(vMoon - inbound)),
			atmospheric: false
		};
		const back: Leg[] = [liftoff, ejection];
		if (!home.atmosphere) {
			back.push({
				id: 'reentry',
				label: `Circularise at ${homeName}`,
				dv: visViva(muH, r1, (r2 + r1) / 2) - Math.sqrt(muH / r1),
				atmospheric: false
			});
		}
		const toTransfer = [launch, departure];
		const toOrbit = [...toTransfer, capture];
		const toLanding = [...toOrbit, descent];
		out.push(
			destination(`${moon.id}:transfer`, `${name} transfer`, moon.id, 'transfer', toTransfer),
			destination(`${moon.id}:orbit`, `${name} orbit (${km(altM)})`, moon.id, 'orbit', toOrbit),
			destination(`${moon.id}:landing`, `${name} landing`, moon.id, 'landing', toLanding),
			destination(`${moon.id}:return`, `${name} and back`, moon.id, 'return', [
				...toLanding,
				...back
			])
		);
	}
	return out;
}

// --- laying the legs over the stages ----------------------------------------------------------------------

/** What one stage gives, m/s (`StageDeltaV`): `stage` is the index into the design's stages, 0 fires first. */
export interface StageBudget {
	stage: number;
	dvSeaLevel: number;
	dvVacuum: number;
}

export interface Cover {
	stage: number;
	/** Delta-v this stage gives to the leg, m/s. */
	dv: number;
	/** Counted at the stage's sea-level figure (the first stage on an atmospheric leg). */
	seaLevel: boolean;
}

export interface LegCover {
	leg: Leg;
	covers: Cover[];
	/** m/s of the leg no stage is left to give. */
	short: number;
}

export interface TripPlan {
	destination: Destination;
	legs: LegCover[];
	needed: number;
	/** What the stages give to the legs, m/s. */
	covered: number;
	/** Missing delta-v over all legs, m/s. */
	short: number;
	/** What is left in the stages after the last leg, m/s (vacuum figures). */
	spare: number;
	enough: boolean;
}

/**
 * Burns the stages in firing order, one leg after the other. The first stage of the design counts
 * at its sea-level delta-v on an atmospheric leg and at its vacuum figure elsewhere; a stage partly
 * used keeps the rest in proportion (a stage is a fraction of its own burn). Stages without
 * delta-v are skipped.
 */
export function planTrip(dest: Destination, stages: readonly StageBudget[]): TripPlan {
	const first = stages[0]?.stage;
	const left = new Map<number, number>();
	const usable = stages.filter((s) => s.dvVacuum > 0);
	for (const s of usable) left.set(s.stage, 1);
	const legs: LegCover[] = dest.legs.map((leg) => {
		let need = leg.dv;
		const covers: Cover[] = [];
		for (const s of usable) {
			if (need <= 1e-9) break;
			const fraction = left.get(s.stage) ?? 0;
			const seaLevel = leg.atmospheric && s.stage === first && s.dvSeaLevel > 0;
			const per = seaLevel ? s.dvSeaLevel : s.dvVacuum;
			const give = Math.min(need, per * fraction);
			if (give <= 0) continue;
			left.set(s.stage, fraction - give / per);
			need -= give;
			covers.push({ stage: s.stage, dv: give, seaLevel });
		}
		return { leg, covers, short: Math.max(0, need) };
	});
	const short = legs.reduce((s, l) => s + l.short, 0);
	const spare = usable.reduce((s, st) => s + st.dvVacuum * (left.get(st.stage) ?? 0), 0);
	return {
		destination: dest,
		legs,
		needed: dest.total,
		covered: dest.total - short,
		short,
		spare,
		enough: short <= 1e-9
	};
}
