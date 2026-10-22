/**
 * The prediction (plan 347, ADR 0296 point 7): where a coasting vessel comes down. A point mass
 * under the body's gravity and drag, integrated with RK4 in the body-centred inertial frame. The
 * air turns with the body, so drag acts on the velocity relative to it (`v − Ω × r`), and the
 * drag area is the sim's own measurement (`WorldVessel.dragArea`) with its transonic rise. The
 * ground also turns: each point is taken back into the body's axes at the time it is reached, so
 * the arc and the impact sit where they will be on the ground. Pure: no SDK state, testable alone.
 */

export interface Vec3 {
	x: number;
	y: number;
	z: number;
}
export interface Quat extends Vec3 {
	w: number;
}

export interface PredictInput {
	/** Position and velocity relative to the body centre, inertial axes, m and m/s. */
	r: Vec3;
	v: Vec3;
	/** The body: gravitational parameter, reference radius, SOI radius, spin (inertial, rad/s). */
	mu: number;
	radius: number;
	soi: number;
	omega: Vec3;
	/** The body's axes now (body-fixed to inertial), to place points in its frame. */
	rotation: Quat;
	/** Top of the air above the radius, m (0: none). */
	atmosphereHeight: number;
	/** The air at an altitude: density, kg/m³, and the speed of sound, m/s (absent in vacuum). */
	air(altitude: number): { density: number; speedOfSound?: number };
	/** The transonic drag factor at a Mach number (the sim's curve). */
	machFactor(mach: number): number;
	/** Ground height above the radius under an inertial position *now*, m (0 when unknown). */
	ground(position: Vec3): number;
	mass: number;
	/** C_d·A, m². */
	dragArea: number;
	/** Longest flight to follow, s (default 1 800). */
	maxTime?: number;
}

export interface Prediction {
	/** The arc in the body's own axes (the frame `body-fixed` overlays use), from the vessel on. */
	path: Vec3[];
	/** Where and when it comes down, in the body's axes; null when it does not within the time. */
	impact: { position: Vec3; time: number; speed: number } | null;
	/** Why the prediction stopped. */
	end: 'ground' | 'soi' | 'time';
}

const add = (a: Vec3, b: Vec3, k = 1): Vec3 => ({ x: a.x + b.x * k, y: a.y + b.y * k, z: a.z + b.z * k });
const len = (a: Vec3): number => Math.hypot(a.x, a.y, a.z);
const cross = (a: Vec3, b: Vec3): Vec3 => ({
	x: a.y * b.z - a.z * b.y,
	y: a.z * b.x - a.x * b.z,
	z: a.x * b.y - a.y * b.x
});

/** Rotate `v` by the unit quaternion `q`. */
export function rotate(q: Quat, v: Vec3): Vec3 {
	const t = cross(q, v);
	const t2 = { x: 2 * t.x, y: 2 * t.y, z: 2 * t.z };
	return add(add(v, t2, q.w), cross(q, t2));
}
const conj = (q: Quat): Quat => ({ x: -q.x, y: -q.y, z: -q.z, w: q.w });
/** The rotation by `angle` about the unit `axis`. */
const about = (axis: Vec3, angle: number): Quat => {
	const s = Math.sin(angle / 2);
	return { x: axis.x * s, y: axis.y * s, z: axis.z * s, w: Math.cos(angle / 2) };
};

/** Most integration steps per prediction, and most points kept for the arc. */
const MAX_STEPS = 6_000;
const MAX_POINTS = 400;
/** Above this the ground is never higher (the stock terrain tops out at 4.5 km): no lookups. */
const GROUND_CEILING = 12_000;

export function predict(input: PredictInput): Prediction {
	const { mu, radius, omega } = input;
	const spin = len(omega);
	const axis = spin > 0 ? { x: omega.x / spin, y: omega.y / spin, z: omega.z / spin } : { x: 0, y: 1, z: 0 };
	const toNow = conj(input.rotation);
	/** An inertial point at time `t` from now, in the body's axes as they will be then. */
	const fixedAt = (p: Vec3, t: number): Vec3 => rotate(toNow, rotate(about(axis, -spin * t), p));
	/** The same point in the inertial axes of now (what `ground` reads). */
	const nowAt = (p: Vec3, t: number): Vec3 => rotate(about(axis, -spin * t), p);
	const k = input.dragArea / Math.max(input.mass, 1e-6);

	const accel = (r: Vec3, v: Vec3): Vec3 => {
		const d = len(r);
		let a = { x: (-mu * r.x) / d ** 3, y: (-mu * r.y) / d ** 3, z: (-mu * r.z) / d ** 3 };
		const altitude = d - radius;
		if (input.atmosphereHeight > 0 && altitude < input.atmosphereHeight && k > 0) {
			const air = input.air(altitude);
			if (air.density > 0) {
				const rel = add(v, cross(omega, r), -1);
				const speed = len(rel);
				const mach = air.speedOfSound ? speed / air.speedOfSound : 0;
				const f = -0.5 * air.density * k * input.machFactor(mach) * speed;
				a = add(a, rel, f);
			}
		}
		return a;
	};

	let r = input.r;
	let v = input.v;
	let t = 0;
	const maxTime = input.maxTime ?? 1_800;
	const path: Vec3[] = [fixedAt(r, 0)];
	let end: Prediction['end'] = 'time';
	let impact: Prediction['impact'] = null;
	for (let step = 0; step < MAX_STEPS && t < maxTime; step++) {
		const altitude = len(r) - radius;
		const speed = Math.max(len(v), 1);
		// steps of half the time to fall the height at this speed: short low down, long in vacuum
		const inAir = input.atmosphereHeight > 0 && altitude < input.atmosphereHeight;
		const h = Math.min(inAir ? 2 : 20, Math.max(0.05, (0.5 * Math.max(altitude, 1)) / speed));
		// RK4
		const a1 = accel(r, v);
		const r2 = add(r, v, h / 2);
		const v2 = add(v, a1, h / 2);
		const a2 = accel(r2, v2);
		const r3 = add(r, v2, h / 2);
		const v3 = add(v, a2, h / 2);
		const a3 = accel(r3, v3);
		const r4 = add(r, v3, h);
		const v4 = add(v, a3, h);
		const a4 = accel(r4, v4);
		const rn = add(r, add(add(v, add(v2, v3), 2), v4), h / 6);
		const vn = add(v, add(add(a1, add(a2, a3), 2), a4), h / 6);
		const tn = t + h;
		const altN = len(rn) - radius;
		if (altN < GROUND_CEILING) {
			const groundN = input.ground(nowAt(rn, tn));
			if (altN <= groundN) {
				// the crossing between the two states, linearly in height above the ground
				const above = Math.max(altitude - input.ground(nowAt(r, t)), 0);
				const f = above / Math.max(above + (groundN - altN), 1e-9);
				const ri = add(r, add(rn, r, -1), f);
				const vi = add(v, add(vn, v, -1), f);
				const ti = t + h * f;
				const position = fixedAt(ri, ti);
				path.push(position);
				impact = { position, time: ti, speed: len(add(vi, cross(omega, ri), -1)) };
				end = 'ground';
				break;
			}
		}
		if (len(rn) > input.soi) {
			end = 'soi';
			break;
		}
		r = rn;
		v = vn;
		t = tn;
		path.push(fixedAt(r, t));
	}
	return { path: thin(path), impact, end };
}

/** At most `MAX_POINTS` points, evenly picked, the first and last kept. */
function thin(path: Vec3[]): Vec3[] {
	if (path.length <= MAX_POINTS) return path;
	const out: Vec3[] = [];
	const k = (path.length - 1) / (MAX_POINTS - 1);
	for (let i = 0; i < MAX_POINTS; i++) out.push(path[Math.round(i * k)]!);
	return out;
}

/** Great-circle distance between two points of the body's surface (any radius), m. */
export function surfaceDistance(a: Vec3, b: Vec3, radius: number): number {
	const c = (a.x * b.x + a.y * b.y + a.z * b.z) / (len(a) * len(b));
	return radius * Math.acos(Math.max(-1, Math.min(1, c)));
}

/** Latitude and longitude of a body-fixed point, rad (+Y north, as the game's terrain). */
export function latLonOf(p: Vec3): { lat: number; lon: number } {
	const d = len(p);
	return { lat: Math.asin(p.y / d), lon: Math.atan2(p.z, p.x) };
}

/** The body-fixed point at a latitude, longitude and radius (the inverse of `latLonOf`). */
export function pointAt(lat: number, lon: number, radius: number): Vec3 {
	return {
		x: radius * Math.cos(lat) * Math.cos(lon),
		y: radius * Math.sin(lat),
		z: radius * Math.cos(lat) * Math.sin(lon)
	};
}
