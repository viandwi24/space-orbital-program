/**
 * Seasons (plan 122, ADR 0119): where the system's star stands over a body. The home planet's pole
 * is the system +Y and its orbit is inclined by the tilt, so the sun's declination over the equator
 * swings between +tilt and -tilt over a year. Pure; the renderer reads the same from the snapshot.
 */
import { GRAVITATIONAL_CONSTANT } from './units.ts';
import { toStateVector } from '@orbital/kepler';
import { bodyPole } from './body-rotation.ts';
import type { BodyDefinition } from './definitions.ts';
import type { Vec3 } from './math.ts';

/** Position of body `id` relative to the system's star (its first ancestor with `star`) at `t`, m; null without one. */
export function positionFromStar(
	bodies: readonly BodyDefinition[],
	id: string,
	t: number
): Vec3 | null {
	const byId = new Map(bodies.map((b) => [String(b.id), b]));
	let r: Vec3 = { x: 0, y: 0, z: 0 };
	for (let b = byId.get(id); b;) {
		if (b.star) return r;
		const parent = b.parent === undefined ? undefined : byId.get(String(b.parent));
		if (!parent || !b.orbit) return null;
		const s = toStateVector(b.orbit, GRAVITATIONAL_CONSTANT * parent.mass, t).r;
		r = { x: r.x + s.x, y: r.y + s.y, z: r.z + s.z };
		b = parent;
	}
	return null;
}

/** Latitude, rad, where the star stands overhead on body `id` at `t` (its declination); null without a star. */
export function subSolarLatitude(
	bodies: readonly BodyDefinition[],
	id: string,
	t: number
): number | null {
	const body = bodies.find((b) => String(b.id) === id);
	const r = positionFromStar(bodies, id, t);
	if (!body || !r) return null;
	const n = Math.hypot(r.x, r.y, r.z);
	if (n === 0) return null;
	const pole = bodyPole(body);
	// the star seen from the body is -r
	const s = -(r.x * pole.x + r.y * pole.y + r.z * pole.z) / n;
	return Math.asin(Math.max(-1, Math.min(1, s)));
}
