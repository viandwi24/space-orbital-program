/**
 * Speed readouts (plan 021, ADR 0026). `surface` is the velocity relative to the rotating ground
 * (the atmosphere co-rotates), `orbit` the snapshot's inertial velocity. A vessel on surface rails
 * has `v = omega x r` in its snapshot (ADR 0024), so its surface speed is zero.
 */
import type { BodyDefinition, Vec3 } from '@orbital/core';

export type SpeedModePreference = 'auto' | 'surface' | 'orbit' | 'target';
/** `target` is the velocity relative to the target (plan 057, ADR 0084); `auto` never picks it. */
/** The two references of the planet; `auto` picks between them. */
export type BodySpeedMode = 'surface' | 'orbit';
export type SpeedMode = BodySpeedMode | 'target';

export const SPEED_MODE_ORDER: readonly SpeedModePreference[] = [
	'auto',
	'surface',
	'orbit',
	'target'
];

/**
 * Cycles auto -> surface -> orbit -> auto (the `V` key); with a target `target` follows `orbit`
 * before returning to `auto`.
 */
export function nextSpeedMode(mode: SpeedModePreference, hasTarget = false): SpeedModePreference {
	const order = hasTarget ? SPEED_MODE_ORDER : SPEED_MODE_ORDER.filter((m) => m !== 'target');
	const at = order.indexOf(mode);
	return order[(at + 1) % order.length]!;
}

/** Altitude above which an airless body flips to orbit speed, m. */
export const AIRLESS_SURFACE_LIMIT = 10_000;
/** Switching back to surface mode needs this fraction below the threshold (no flicker at the edge). */
export const SPEED_MODE_HYSTERESIS = 0.05;

export const spin = (body: Pick<BodyDefinition, 'rotationPeriod'>): number =>
	(2 * Math.PI) / body.rotationPeriod;

const cross = (a: Vec3, b: Vec3): Vec3 => ({
	x: a.y * b.z - a.z * b.y,
	y: a.z * b.x - a.x * b.z,
	z: a.x * b.y - a.y * b.x
});

/** Velocity relative to the ground under `position`: `v - omega x r`, omega about +Y. */
export function surfaceVelocity(position: Vec3, velocity: Vec3, omega: number): Vec3 {
	const w = cross({ x: 0, y: omega, z: 0 }, position);
	return { x: velocity.x - w.x, y: velocity.y - w.y, z: velocity.z - w.z };
}

/** Altitude where `auto` flips from surface to orbit speed: the top of the atmosphere, else 10 km. */
export const speedModeLimit = (body: Pick<BodyDefinition, 'atmosphere'>): number =>
	body.atmosphere?.height ?? AIRLESS_SURFACE_LIMIT;

/** The mode `auto` picks; `previous` adds hysteresis so the switch does not chatter. */
export function autoSpeedMode(
	altitude: number,
	body: Pick<BodyDefinition, 'atmosphere'>,
	previous: BodySpeedMode = 'surface'
): BodySpeedMode {
	const limit = speedModeLimit(body);
	if (altitude >= limit) return 'orbit';
	if (previous === 'orbit' && altitude > limit * (1 - SPEED_MODE_HYSTERESIS)) return 'orbit';
	return 'surface';
}

export interface SpeedReadout {
	mode: SpeedMode;
	velocity: Vec3;
	/** Magnitude of `velocity`, m/s. */
	speed: number;
	/** Rate of change of altitude in this mode (velocity along the local vertical), m/s. */
	vertical: number;
}

export function speedReadout(input: {
	position: Vec3;
	velocity: Vec3;
	altitude: number;
	body: Pick<BodyDefinition, 'rotationPeriod' | 'atmosphere'>;
	preference: SpeedModePreference;
	previous?: SpeedMode;
	/**
	 * The target relative to the vessel (`TargetSnapshot.position` and `.velocity`). Without it a
	 * `target` preference falls back to `auto`.
	 */
	target?: { position: Vec3; velocity: Vec3 } | null;
}): SpeedReadout {
	const { position: p, velocity, altitude, body, preference, target } = input;
	if (preference === 'target' && target) {
		// The vessel's velocity relative to the target; `vertical` is the range rate (positive: opening).
		const w = target.velocity;
		const d = Math.hypot(target.position.x, target.position.y, target.position.z);
		const closing =
			d > 0
				? -(target.position.x * w.x + target.position.y * w.y + target.position.z * w.z) / d
				: 0;
		return {
			mode: 'target',
			velocity: { x: 0 - w.x, y: 0 - w.y, z: 0 - w.z },
			speed: Math.hypot(w.x, w.y, w.z),
			vertical: -closing
		};
	}
	const wanted = preference === 'target' ? 'auto' : preference;
	const mode: BodySpeedMode =
		wanted === 'auto'
			? autoSpeedMode(altitude, body, input.previous === 'orbit' ? 'orbit' : 'surface')
			: wanted;
	const v = mode === 'surface' ? surfaceVelocity(p, velocity, spin(body)) : velocity;
	const r = Math.hypot(p.x, p.y, p.z) || 1;
	return {
		mode,
		velocity: v,
		speed: Math.hypot(v.x, v.y, v.z),
		vertical: (v.x * p.x + v.y * p.y + v.z * p.z) / r
	};
}
