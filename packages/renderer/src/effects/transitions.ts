/**
 * Effects inferred from two consecutive snapshots (pure; plan 020). The renderer reads snapshots
 * only (ADR 0003), so "a part was destroyed" and "the stack separated" are recognised from what
 * disappeared or split. Positions are relative to the vessel's SOI body, inertial axes (BCI).
 */
import type { Vec3 } from '@orbital/core';
import { add, cross, length, scale, sub } from '../vec.ts';

export interface FxPart {
	id: number;
	definition: string;
	/** Relative to the vessel root, inertial axes. */
	position: Vec3;
	temperature?: number;
}

export interface FxVessel {
	id: number;
	soi: string;
	position: Vec3;
	velocity: Vec3;
	parts: readonly FxPart[];
}

export type FxEvent =
	| {
			kind: 'destroyed';
			cause: 'impact' | 'burn';
			soi: string;
			position: Vec3;
			/** Characteristic radius of what was lost, m. */
			size: number;
			/** Speed relative to the ground/air at the last snapshot, m/s. */
			speed: number;
			/** Velocity of the wreck in the body's inertial axes, m/s. */
			velocity: Vec3;
	  }
	| { kind: 'separated'; soi: string; position: Vec3; speed: number };

export interface TransitionContext {
	/** Angular velocity of a body in inertial axes, rad/s. */
	omega(soi: string): Vec3;
	/** Characteristic radius of a part definition, m. */
	sizeOf(definition: string): number;
}

/** A part this hot when it vanishes burned up rather than crashed, K. */
export const BURN_TEMPERATURE = 700;
/** Slowest ground-relative speed at which a vanishing part counts as destroyed, m/s. */
export const MIN_DESTROY_SPEED = 4;

const worldOf = (v: FxVessel, p: FxPart): Vec3 => add(v.position, p.position);

export function detectTransitions(
	prev: readonly FxVessel[],
	next: readonly FxVessel[],
	ctx: TransitionContext
): FxEvent[] {
	const events: FxEvent[] = [];
	const nextHome = new Map<number, number>();
	for (const v of next) for (const p of v.parts) nextHome.set(p.id, v.id);

	for (const v of prev) {
		const lost = v.parts.filter((p) => !nextHome.has(p.id));
		if (lost.length > 0) {
			const centre = scale(
				lost.reduce<Vec3>((acc, p) => add(acc, worldOf(v, p)), { x: 0, y: 0, z: 0 }),
				1 / lost.length
			);
			const speed = length(sub(v.velocity, cross(ctx.omega(v.soi), centre)));
			const hot = lost.some((p) => (p.temperature ?? 0) > BURN_TEMPERATURE);
			if (hot || speed >= MIN_DESTROY_SPEED) {
				const volume = lost.reduce((s, p) => s + ctx.sizeOf(p.definition) ** 3, 0);
				events.push({
					kind: 'destroyed',
					cause: hot ? 'burn' : 'impact',
					soi: v.soi,
					position: centre,
					size: Math.cbrt(volume),
					speed,
					velocity: v.velocity
				});
			}
		}
		// Survivors that ended up in two or more vessels: the stack separated.
		const groups = new Map<number, FxPart[]>();
		for (const p of v.parts) {
			const home = nextHome.get(p.id);
			if (home === undefined) continue;
			const list = groups.get(home) ?? [];
			list.push(p);
			groups.set(home, list);
		}
		if (groups.size >= 2) {
			const lists = [...groups.values()];
			let best: { d: number; at: Vec3 } | null = null;
			for (let i = 0; i < lists.length; i++) {
				for (let j = i + 1; j < lists.length; j++) {
					for (const a of lists[i]!) {
						for (const b of lists[j]!) {
							const pa = worldOf(v, a);
							const pb = worldOf(v, b);
							const d = length(sub(pa, pb));
							if (!best || d < best.d) best = { d, at: scale(add(pa, pb), 0.5) };
						}
					}
				}
			}
			if (best) {
				events.push({
					kind: 'separated',
					soi: v.soi,
					position: best.at,
					speed: length(sub(v.velocity, cross(ctx.omega(v.soi), best.at)))
				});
			}
		}
	}
	return events;
}

/** Angular velocity (inertial axes) from two body orientations `dt` seconds apart. */
export function angularVelocity(
	q0: { x: number; y: number; z: number; w: number },
	q1: { x: number; y: number; z: number; w: number },
	dt: number
): Vec3 {
	if (!(dt > 0)) return { x: 0, y: 0, z: 0 };
	// dq = q1 * conj(q0): the rotation from the old to the new orientation in inertial axes.
	const c = { x: -q0.x, y: -q0.y, z: -q0.z, w: q0.w };
	const dq = {
		w: q1.w * c.w - q1.x * c.x - q1.y * c.y - q1.z * c.z,
		x: q1.w * c.x + q1.x * c.w + q1.y * c.z - q1.z * c.y,
		y: q1.w * c.y - q1.x * c.z + q1.y * c.w + q1.z * c.x,
		z: q1.w * c.z + q1.x * c.y - q1.y * c.x + q1.z * c.w
	};
	const s = Math.hypot(dq.x, dq.y, dq.z);
	if (s < 1e-12) return { x: 0, y: 0, z: 0 };
	const sign = dq.w < 0 ? -1 : 1;
	const angle = 2 * Math.atan2(s, Math.abs(dq.w));
	const k = (sign * angle) / (s * dt);
	return { x: dq.x * k, y: dq.y * k, z: dq.z * k };
}
