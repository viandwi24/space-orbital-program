/**
 * Camera-centred terrain patches (ADR 0044): the pure geometry the planet pass and its bake share,
 * and the clamp that keeps the camera above the ground. A patch is a square window of regular
 * samples in a gnomonic projection around a unit body-fixed direction `c`: the texel at patch
 * coordinates (u, v) in [-1, 1] is the direction `normalize(c + halfTan (u e + v f))`. Baked from
 * the same height function as the cube map and the sim's ground, so a patch is exact where a
 * vessel can touch the ground. No Three.js: runs and is tested in Bun.
 */
import type { TerrainField, Vec3 } from '@orbital/core';
import { cross, dot, normalize, scale, smoothstep, vec } from './vec.ts';

/** Width of the two patches, m: the fine one under the camera and the mid one around it. */
export const PATCH_SPANS = { fine: 4_096, mid: 32_768 } as const;
/** Where a patch fades into the next coarser level: weight 1 inside 0.7 of the half span, 0 at the edge. */
export const PATCH_BLEND = { start: 0.7, end: 1 } as const;
/** A patch is re-centred when the camera leaves this fraction of its half span. */
export const PATCH_RECENTRE_FRACTION = 0.35;
/** Re-centring snaps the new centre to a lattice of this size on the sphere, m. */
export const PATCH_LATTICE = 64;
/** The patches are unused (and not baked) above this altitude, m. */
export const PATCH_MAX_ALTITUDE = 40_000;

export interface PatchFrame {
	/** Unit body-fixed direction at the centre of the patch. */
	centre: Vec3;
	/** Unit tangent axes at the centre (u along `east`, v along `north`). */
	east: Vec3;
	north: Vec3;
	/** Tangent of the angular half width: the patch spans `u, v` in [-1, 1] over `halfTan` each. */
	halfTan: number;
}

/** Tangent basis of a direction: the same construction as `terrainTangent1` in the shader. */
export function tangentBasis(n: Vec3): { t1: Vec3; t2: Vec3 } {
	const t1 = normalize(cross(n, Math.abs(n.y) > 0.99 ? vec(1, 0, 0) : vec(0, 1, 0)));
	return { t1, t2: cross(n, t1) };
}

/** The frame of a patch of `spanMetres` around `centre` on a body of `radius`. */
export function patchFrame(centre: Vec3, radius: number, spanMetres: number): PatchFrame {
	const c = normalize(centre);
	const { t1, t2 } = tangentBasis(c);
	return { centre: c, east: t1, north: t2, halfTan: spanMetres / (2 * radius) };
}

/** Patch coordinates of the unit direction `n`: `u` and `v` in [-1, 1] inside, and the larger |coordinate|. */
export function patchCoords(
	frame: PatchFrame,
	n: Vec3
): { u: number; v: number; extent: number; front: boolean } {
	const k = dot(n, frame.centre);
	if (k <= 1e-6) return { u: 0, v: 0, extent: Infinity, front: false };
	const u = dot(n, frame.east) / (k * frame.halfTan);
	const v = dot(n, frame.north) / (k * frame.halfTan);
	return { u, v, extent: Math.max(Math.abs(u), Math.abs(v)), front: true };
}

/** The unit direction at patch coordinates (u, v): the bake's texel direction. */
export function patchDirection(frame: PatchFrame, u: number, v: number): Vec3 {
	const k = frame.halfTan;
	return normalize(
		vec(
			frame.centre.x + k * (u * frame.east.x + v * frame.north.x),
			frame.centre.y + k * (u * frame.east.y + v * frame.north.y),
			frame.centre.z + k * (u * frame.east.z + v * frame.north.z)
		)
	);
}

/** Weight of a patch at `extent` (the larger |u|, |v|): 1 well inside, 0 at the edge, smooth between. */
export const patchWeight = (extent: number): number =>
	1 - smoothstep(PATCH_BLEND.start, PATCH_BLEND.end, extent);

/** True when a patch (or none yet) must be re-baked because the camera's ground direction left its core. */
export function patchNeedsRecentre(frame: PatchFrame | null, cameraDirection: Vec3): boolean {
	if (!frame) return true;
	const c = patchCoords(frame, cameraDirection);
	return !c.front || c.extent > PATCH_RECENTRE_FRACTION;
}

/** `n` with the surface point snapped to a lattice of `PATCH_LATTICE` metres (new patch centres). */
export function latticeDirection(n: Vec3, radius: number): Vec3 {
	const p = scale(n, radius);
	const snap = (v: number): number => Math.round(v / PATCH_LATTICE) * PATCH_LATTICE;
	return normalize(vec(snap(p.x), snap(p.y), snap(p.z)));
}

/** Angular size of one texel at the centre of a patch with `texels` per side, rad. */
export const patchTexel = (frame: PatchFrame, texels: number): number =>
	(2 * frame.halfTan) / texels;

/**
 * The camera position (body-fixed, metres from the centre of a body of `radius`) held at least
 * `clearance` above the ground under it; the same vector when it already is. Never inside a hill.
 */
export function liftAboveTerrain(
	position: Vec3,
	terrain: TerrainField,
	radius: number,
	clearance: number
): Vec3 {
	const r = Math.hypot(position.x, position.y, position.z);
	if (r === 0 || r > radius + terrain.maxHeight + clearance) return position;
	const n = scale(position, 1 / r);
	const ground = radius + terrain.heightAt(n) + clearance;
	return r >= ground ? position : scale(n, ground);
}
