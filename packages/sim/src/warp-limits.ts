/**
 * The world's time warp limit (plan 206, ADR 0202): the highest level the watched vessel and the
 * vessels in physics range of it allow, and why it is not higher. Pure over the sim state: the
 * `warp` command, the snapshot (the time bar) and the step loop all read the same answer.
 */
import {
	PHYSICS_WARP_MAX,
	SOL_WARP_LEVEL,
	WARP_LEVELS,
	type EntityId,
	type WarpLimitSnapshot
} from '@orbital/core';
import { length, sub } from '@orbital/kepler';
import { bodyOfVessel, type BodyRuntime } from './bodies.ts';
import { PHYSICS_RANGE } from './constants.ts';
import { frameOfVessel, isControlled, vesselIds, vesselOf, type SimCore } from './core.ts';
import { NBODY_MAX_WARP, nBodyOn } from './nbody.ts';
import { motionOf } from './orbit.ts';

/** One rails tier: from this altitude above the reference sphere, warp up to `factor`. */
export interface WarpTier {
	factor: number;
	altitude: number;
}

/**
 * Rails tiers of a body (ADR 0202 point 3), derived from its atmosphere and size: the first above
 * the atmosphere top (an airless body: above 2.5 % of its radius, its hills), the next ones at
 * 20 %, 40 %, 80 % and 100 % of the radius. For a Kerbin-sized home with a 70 km atmosphere this
 * is KSP's table: 50× above 70 km, 100× above 120 km, 1k× above 240 km, 10k× above 480 km and
 * 100k× above 600 km.
 */
export function warpTiers(body: Pick<BodyRuntime, 'def'>): WarpTier[] {
	const r = body.def.radius;
	const base = body.def.atmosphere?.height ?? Math.max(2_000, 0.025 * r);
	const at = (f: number): number => Math.max(base, f * r);
	return [
		{ factor: 50, altitude: base },
		{ factor: 100, altitude: at(0.2) },
		{ factor: 1_000, altitude: at(0.4) },
		{ factor: 10_000, altitude: at(0.8) },
		{ factor: SOL_WARP_LEVEL, altitude: at(1) }
	];
}

/** The highest level of this world: 10k× (100k× in a Sol world), lower with n-body gravity. */
export function topWarp(core: SimCore): number {
	const top = core.info.systemId === 'sol' ? SOL_WARP_LEVEL : WARP_LEVELS[WARP_LEVELS.length - 1]!;
	return nBodyOn(core) ? Math.min(top, NBODY_MAX_WARP) : top;
}

const label = (factor: number): string => (factor >= 1000 ? `${factor / 1000}k×` : `${factor}×`);
const km = (m: number): string => `${Math.round(m / 1000)} km`;

/** The vessels whose state limits the warp: the watched one and those in physics range of it. */
export function limitingVessels(core: SimCore): EntityId[] {
	const focus = core.warpFocus;
	const flying = vesselIds(core).filter((id) => {
		const v = vesselOf(core, id);
		return v.mode === 'flight' && v.owner === undefined;
	});
	if (focus === null || !core.world.hasEntity(focus)) {
		return flying.filter((id) => isControlled(core, vesselOf(core, id)));
	}
	const out = [focus];
	const frame = frameOfVessel(core, focus);
	if (frame) {
		const at = vesselOf(core, focus).com;
		for (const id of frame.vessels) {
			if (id !== focus && length(sub(vesselOf(core, id).com, at)) < PHYSICS_RANGE) out.push(id);
		}
	}
	return out;
}

/** Whether the vessel's throttle is up in flight (saved state only, so a resumed sim agrees). */
export const thrusting = (core: SimCore, id: EntityId): boolean => {
	const v = vesselOf(core, id);
	return v.mode === 'flight' && v.control.throttle > 0;
};

/** Landed or floating: on surface rails, or in contact with the ground. */
const grounded = (core: SimCore, id: EntityId): boolean => {
	const v = vesselOf(core, id);
	return v.mode === 'flight' ? v.landed : v.rails?.kind === 'surface';
};

/** What one vessel allows, or null for the world's top. */
function vesselLimit(core: SimCore, id: EntityId, top: number): WarpLimitSnapshot {
	if (thrusting(core, id)) return { max: PHYSICS_WARP_MAX, reason: 'engine running' };
	if (grounded(core, id)) return { max: top, reason: null };
	const vessel = vesselOf(core, id);
	const body = bodyOfVessel(core, vessel);
	const alt = length(motionOf(core, vessel).r) - body.def.radius;
	if (body.def.atmosphere && alt < body.def.atmosphere.height) {
		return { max: PHYSICS_WARP_MAX, reason: 'in the atmosphere' };
	}
	let max = PHYSICS_WARP_MAX;
	let next: WarpTier | null = null;
	for (const tier of warpTiers(body)) {
		if (tier.factor > top) break;
		if (alt >= tier.altitude) max = tier.factor;
		else {
			next = tier;
			break;
		}
	}
	return next ? { max, reason: `below ${km(next.altitude)}` } : { max: top, reason: null };
}

/** The warp the world allows now (ADR 0202 points 3, 7 and 8). */
export function warpLimit(core: SimCore): WarpLimitSnapshot {
	const top = topWarp(core);
	let limit: WarpLimitSnapshot = { max: top, reason: null };
	for (const id of limitingVessels(core)) {
		const own = vesselLimit(core, id, top);
		if (own.max < limit.max) limit = own;
	}
	return limit;
}

/** The reason text the time bar shows for a clamp: "Max 4× — engine running". */
export const clampText = (limit: WarpLimitSnapshot): string =>
	`Max ${label(limit.max)} — ${limit.reason ?? 'the top of this world'}`;
