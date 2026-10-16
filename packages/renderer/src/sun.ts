/**
 * The sun. The home body is the root of the system, so there is no sun body in the snapshot: the
 * star is a fixed direction in the inertial frame (the render frame has the same orientation) and
 * the time of day comes from the body's rotation (`BodySnapshot.rotation`). Pure maths, tested.
 */
import type { Quat, Vec3 } from '@orbital/core';
import { DEG, add, cross, dot, normalize, rotate, rotateInverse, scale, vec } from './vec.ts';

/** Inclination of the sun above the equatorial plane, rad (a mild "season": shadows are never exactly overhead). */
export const SUN_DECLINATION = 0.2;
/** Longitude of the sub-solar point in the inertial frame, rad: the launch site (longitude 0) sees the sun 30 degrees up and rising at t = 0. */
export const SUN_LONGITUDE = Math.PI / 3;

/** Unit vector toward the star in the inertial/render frame (same lat/lon convention as `placeOnSurface`). */
export function starDirection(): Vec3 {
	const c = Math.cos(SUN_DECLINATION);
	return vec(c * Math.cos(SUN_LONGITUDE), Math.sin(SUN_DECLINATION), -c * Math.sin(SUN_LONGITUDE));
}

/** Direction toward the star in the body-fixed frame (rotates with the planet). */
export const sunDirectionBodyFixed = (bodyRotation: Quat): Vec3 =>
	rotateInverse(bodyRotation, starDirection());

/** Angle of the sun above the local horizon, rad, for a point with outward normal `up` (same frame as `sun`). */
export const sunElevation = (sun: Vec3, up: Vec3): number =>
	Math.asin(Math.max(-1, Math.min(1, dot(sun, up))));

/** Local up of latitude/longitude in the body-fixed frame (units-and-frames.md, `placeOnSurface`). */
export const surfaceUp = (latitude: number, longitude: number): Vec3 =>
	vec(
		Math.cos(latitude) * Math.cos(longitude),
		Math.sin(latitude),
		-Math.cos(latitude) * Math.sin(longitude)
	);

/** Sun elevation, rad, at a surface point of a body with the given rotation. */
export const sunElevationAt = (bodyRotation: Quat, latitude: number, longitude: number): number =>
	sunElevation(starDirection(), rotate(bodyRotation, surfaceUp(latitude, longitude)));

/** Rotation quaternion of a body turning about +Y at `omega` rad/s for `t` s (what the sim reports). */
export const bodyRotationAt = (omega: number, t: number): Quat => ({
	x: 0,
	y: Math.sin((omega * t) / 2),
	z: 0,
	w: Math.cos((omega * t) / 2)
});

/**
 * Sun direction for a debug/screenshot override: `elevationDeg` above the horizon and `azimuthDeg`
 * clockwise from north, seen from a site whose frame vectors (in the inertial frame) are given.
 */
export function sunFromHorizontal(
	frame: { up: Vec3; east: Vec3; north: Vec3 },
	elevationDeg: number,
	azimuthDeg: number
): Vec3 {
	const e = elevationDeg * DEG;
	const a = azimuthDeg * DEG;
	const horizontal = add(scale(frame.north, Math.cos(a)), scale(frame.east, Math.sin(a)));
	return normalize(add(scale(frame.up, Math.sin(e)), scale(horizontal, Math.cos(e))));
}

/** East, north and up of a site, body-fixed. */
export function siteAxes(
	latitude: number,
	longitude: number
): { up: Vec3; east: Vec3; north: Vec3 } {
	const up = surfaceUp(latitude, longitude);
	const eastRaw = cross(vec(0, 1, 0), up);
	const east =
		Math.hypot(eastRaw.x, eastRaw.y, eastRaw.z) > 1e-9 ? normalize(eastRaw) : vec(0, 0, -1);
	return { up, east, north: normalize(cross(up, east)) };
}

/** Latitude and longitude, rad, of a body-fixed position (inverse of `surfaceUp`; longitude 0 on +X, east toward -Z). */
export function latLonOf(bodyFixed: Vec3): { latitude: number; longitude: number } {
	const l = Math.hypot(bodyFixed.x, bodyFixed.y, bodyFixed.z);
	return {
		latitude: l > 0 ? Math.asin(Math.max(-1, Math.min(1, bodyFixed.y / l))) : 0,
		longitude: Math.atan2(-bodyFixed.z, bodyFixed.x)
	};
}
