/**
 * Sunlight on a part (plan 208, ADR 0213): the direction of the star in the part's frame, the flux
 * as a fraction of the flux at the home planet's distance (inverse square), and the shadow of every
 * other body on the line to the star (an umbra cylinder test, no penumbra). The same function serves
 * a flight step (one sample now) and a background interval on rails (samples along the rails path),
 * so a panel gives the same charge in both.
 */
import type { EntityId, Quat, Vec3 } from '@orbital/core';
import { add, dot, length, normalize, scale, sub } from '@orbital/kepler';
import { bodyById, rotationAt, systemPosition, type BodyRuntime } from './bodies.ts';
import { frameOfPart, partOf, vesselOf, type SimCore } from './core.ts';
import { bodyOfFrame, partTransform } from './frames.ts';
import { qConj, qMul, qRotate } from './math.ts';
import { railsMotion } from './orbit.ts';
import { isTurned, partRotation } from './parts.ts';

/** Longest step between two samples of a background interval, s. */
export const SUN_SAMPLE_STEP = 10;
/** Most samples one interval takes; a longer interval spaces them wider. */
export const SUN_MAX_SAMPLES = 4096;

/** What a panel sees at one instant. */
export interface SunSample {
	/** Unit vector to the star in the part frame; null in a system without a star. */
	direction: Vec3 | null;
	/** Flux over the flux at the home planet's distance; 0 in shadow (1 without a star). */
	flux: number;
}

/** The system's star, if it has one (ADR 0119: the root of the tree). */
function starOf(core: SimCore): BodyRuntime | undefined {
	for (const body of core.bodies.values()) if (body.def.star) return body;
	return undefined;
}

/** Distance of the home planet's orbit around the star, m: the reference of `flux` 1. */
function referenceDistance(core: SimCore, star: BodyRuntime): number {
	let body: BodyRuntime | undefined = core.root;
	while (body?.parent && body.parent !== star) body = body.parent;
	return (
		body?.elements?.a ??
		length(sub(systemPosition(core.root, core.t), systemPosition(star, core.t)))
	);
}

/** The part's position in the system frame and its rotation (part to inertial axes) at `t`. */
function partPose(core: SimCore, partId: EntityId, t: number): { r: Vec3; q: Quat } {
	const part = partOf(core, partId);
	const vessel = vesselOf(core, part.vessel);
	const frame = vessel.mode === 'flight' ? frameOfPart(core, partId) : undefined;
	if (frame) {
		const transform = partTransform(core, frame, partId);
		return {
			r: add(systemPosition(bodyOfFrame(core, frame), t), add(frame.origin, transform.position)),
			q: transform.rotation
		};
	}
	const body = bodyById(core, vessel.soi);
	const rails = vessel.rails;
	const r = rails ? railsMotion(body, rails, t).r : vessel.com;
	const root = rails?.kind === 'surface' ? qMul(rotationAt(body, t), rails.q) : vessel.orientation;
	return {
		r: add(systemPosition(body, t), r),
		q: isTurned(part) ? qMul(root, partRotation(part)) : root
	};
}

/** Whether a body other than the star covers the star seen from `at`. */
function shadowed(core: SimCore, star: BodyRuntime, at: Vec3, toStar: Vec3, t: number): boolean {
	const far = length(toStar);
	const dir = scale(toStar, 1 / far);
	for (const body of core.bodies.values()) {
		if (body === star) continue;
		const c = sub(systemPosition(body, t), at);
		const along = dot(c, dir);
		if (along <= 0 || along >= far) continue; // behind the part or beyond the star
		const off = length(sub(c, scale(dir, along)));
		if (off < body.def.radius) return true;
	}
	return false;
}

/** Sunlight on the part at time `t` (now in flight; a past instant of the rails path on rails). */
export function sunSample(core: SimCore, partId: EntityId, t: number = core.t): SunSample {
	const star = starOf(core);
	if (!star) return { direction: null, flux: 1 };
	const pose = partPose(core, partId, t);
	const toStar = sub(systemPosition(star, t), pose.r);
	const d = length(toStar);
	const direction = qRotate(qConj(pose.q), normalize(toStar));
	if (shadowed(core, star, pose.r, toStar, t)) return { direction, flux: 0 };
	const ref = referenceDistance(core, star);
	return { direction, flux: (ref * ref) / (d * d) };
}

/**
 * Mean of `factor(direction) × flux` over the last `dt` seconds. In flight that is the value now
 * (a step is 20 ms); on rails the interval is sampled at the middle of steps of at most
 * `SUN_SAMPLE_STEP` seconds along the rails path.
 */
export function sunExposure(
	core: SimCore,
	partId: EntityId,
	dt: number,
	factor: (direction: Vec3 | null) => number
): number {
	const vessel = vesselOf(core, partOf(core, partId).vessel);
	const one = (t: number): number => {
		const s = sunSample(core, partId, t);
		return s.flux > 0 ? s.flux * Math.max(0, factor(s.direction)) : 0;
	};
	if (vessel.mode === 'flight' || !(dt > 0)) return one(core.t);
	const n = Math.min(SUN_MAX_SAMPLES, Math.max(1, Math.ceil(dt / SUN_SAMPLE_STEP)));
	let sum = 0;
	for (let k = 0; k < n; k++) sum += one(core.t - dt + ((k + 0.5) * dt) / n);
	return sum / n;
}
