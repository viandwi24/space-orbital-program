/**
 * Flight read-outs for aircraft (plan 063, ADR 0161 point 6): angle of attack, indicated airspeed,
 * glide ratio and a stall warning, from the snapshot and the body's atmosphere (the sim's own
 * exponential model). Pure.
 */
import type { BodyDefinition, Quat, Vec3, VesselSnapshot } from '@orbital/core';
import { spinVector, surfaceVelocity } from '../speed';

/** Sea-level density of the sim's air at 101 325 Pa, kg/m³ (ideal gas, fixed temperature). */
const RHO_PER_PA = 1.225 / 101_325;
/** The stall warning shows this close to the wings' stall angle, degrees. */
export const STALL_MARGIN_DEG = 2;

export interface AeroReadout {
	/** Angle of attack, degrees: the nose above the flight path through the air (positive up). */
	aoa: number;
	/** True airspeed, m/s. */
	tas: number;
	/** Indicated airspeed, m/s: what the air pressure says, `tas × √(ρ/ρ₀)`. */
	ias: number;
	/** Horizontal over vertical speed while descending; null when level or climbing. */
	glide: number | null;
	stall: boolean;
}

const rotate = (q: Quat, v: Vec3): Vec3 => {
	const ix = q.w * v.x + q.y * v.z - q.z * v.y;
	const iy = q.w * v.y + q.z * v.x - q.x * v.z;
	const iz = q.w * v.z + q.x * v.y - q.y * v.x;
	const iw = -q.x * v.x - q.y * v.y - q.z * v.z;
	return {
		x: ix * q.w + iw * -q.x + iy * -q.z - iz * -q.y,
		y: iy * q.w + iw * -q.y + iz * -q.x - ix * -q.z,
		z: iz * q.w + iw * -q.z + ix * -q.y - iy * -q.x
	};
};
const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;

/**
 * The read-out of a winged vessel in air, or null (no wings, out of the atmosphere, or too slow
 * to read: under 2 m/s). `stallAngle` is the smallest stall angle of its wings, degrees.
 */
export function aeroReadout(
	vessel: Pick<VesselSnapshot, 'position' | 'velocity' | 'orientation'>,
	body: Pick<BodyDefinition, 'rotationPeriod' | 'rotation' | 'atmosphere' | 'radius'>,
	stallAngle: number | null
): AeroReadout | null {
	if (stallAngle === null || !body.atmosphere) return null;
	const r = Math.hypot(vessel.position.x, vessel.position.y, vessel.position.z);
	const altitude = r - body.radius;
	if (altitude >= body.atmosphere.height) return null;
	const air = surfaceVelocity(vessel.position, vessel.velocity, spinVector(body));
	const tas = Math.hypot(air.x, air.y, air.z);
	if (tas < 2) return null;
	const nose = rotate(vessel.orientation, { x: 0, y: 1, z: 0 });
	const top = rotate(vessel.orientation, { x: 0, y: 0, z: 1 });
	const aoa = (Math.atan2(-dot(air, top), dot(air, nose)) * 180) / Math.PI;
	const pressure =
		body.atmosphere.surfacePressure *
		Math.exp(-Math.max(altitude, 0) / body.atmosphere.scaleHeight);
	const ias = tas * Math.sqrt((pressure * RHO_PER_PA) / 1.225);
	const up = { x: vessel.position.x / r, y: vessel.position.y / r, z: vessel.position.z / r };
	const vertical = dot(air, up);
	const horizontal = Math.sqrt(Math.max(0, tas * tas - vertical * vertical));
	return {
		aoa,
		tas,
		ias,
		glide: vertical < -0.5 ? horizontal / -vertical : null,
		stall: aoa >= stallAngle - STALL_MARGIN_DEG
	};
}

/**
 * The smallest stall angle of the vessel's wings, degrees, or null without wings: a module config
 * with a `stallAngle` (the stock wing's, 15 by default).
 */
export function wingStallAngle(
	partIds: readonly string[],
	parts: { get(id: string): { modules?: readonly (readonly [string, unknown])[] } | undefined }
): number | null {
	let least: number | null = null;
	for (const id of partIds) {
		for (const [moduleId, config] of parts.get(id)?.modules ?? []) {
			if (moduleId !== 'stock.wing') continue;
			const stall = (config as { stallAngle?: number } | undefined)?.stallAngle ?? 15;
			least = least === null ? stall : Math.min(least, stall);
		}
	}
	return least;
}
