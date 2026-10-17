/**
 * Plasma blackout read-out (plan 040, ADR 0079): how much of the signal the shock layer around
 * the vessel takes, from the same heating law the renderer draws the glow with. A display only:
 * there is no communications system to lose yet.
 */
import type { BodyDefinition, Vec3 } from '@orbital/core';
import { BLACKOUT_BADGE_LEVEL, blackoutLevel } from '@orbital/renderer/reentry';
import { spinVector, surfaceVelocity } from './speed';

export { BLACKOUT_BADGE_LEVEL };

/** 0..1 loss of signal for a vessel at `position` (relative to the body, inertial) moving at `velocity`. */
export function vesselBlackout(
	position: Vec3,
	velocity: Vec3,
	altitude: number,
	body: Pick<BodyDefinition, 'rotationPeriod' | 'rotation' | 'atmosphere'>
): number {
	if (!body.atmosphere) return 0;
	const air = surfaceVelocity(position, velocity, spinVector(body));
	return blackoutLevel(Math.hypot(air.x, air.y, air.z), altitude, body.atmosphere);
}

/** Whether the badge shows. */
export const blackoutShown = (level: number): boolean => level >= BLACKOUT_BADGE_LEVEL;
