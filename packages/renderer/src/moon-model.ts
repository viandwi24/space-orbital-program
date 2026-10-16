/**
 * The moon's ground as the renderer sees it (ADR 0054): sizes of the bakes and the geometry of the
 * patch meshes. Pure numbers and maths, no Three.js, so Bun tests them. The height function itself is
 * `@orbital/core` `moonHeight`; `shaders/moon.glsl.ts` is its GLSL twin.
 */
import { moonHeight, type Vec3 } from '@orbital/core';
import { length, normalize, scale, vec } from './vec.ts';

/** Texels per side of a cube face of the whole-body height map (about 580 m at the equator). */
export const MOON_CUBE_SIZE = 512;
/** The two camera-centred height patches: width in metres, texels and mesh quads per side. */
export const MOON_PATCHES = {
	fine: { span: 2_048, texels: 512, quads: 256 },
	mid: { span: 16_384, texels: 512, quads: 256 }
} as const;
/** The patches are not drawn (nor baked) above this camera altitude, m. */
export const MOON_PATCH_MAX_ALTITUDE = 40_000;
/** The mesh border of a patch is let down by this much (a skirt, no crack to the sky), m. */
export const MOON_SKIRT_DROP = 40;
/** Vertices of the whole-body mesh: an icosphere of this detail (triangles = 20 (detail + 1)^2). */
export const MOON_GLOBE_DETAIL = 64;
/** The cube map is baked once the camera comes this close to the moon's centre, in body radii. */
export const MOON_BAKE_DISTANCE = 40;

/**
 * Local position of the patch vertex at patch coordinates (u, v) in [-1, 1], relative to the patch
 * centre point `c (R + hc)`, on a body of `radius` whose ground there has height `h`: the CPU twin of
 * `moonPatchPoint` in the vertex shader (written so that no two large numbers are subtracted: the
 * result is accurate to a fraction of a millimetre in float32 for a patch of a few kilometres).
 */
export function patchVertex(
	centre: Vec3,
	east: Vec3,
	north: Vec3,
	halfTan: number,
	radius: number,
	u: number,
	v: number,
	h: number,
	hCentre: number
): Vec3 {
	const w = vec(u * east.x + v * north.x, u * east.y + v * north.y, u * east.z + v * north.z);
	const kk = halfTan * halfTan * (w.x * w.x + w.y * w.y + w.z * w.z);
	const L = Math.sqrt(1 + kk);
	const s = kk / (L + 1);
	const along = (radius + h) / L;
	return vec(
		(halfTan * w.x - centre.x * s) * along + centre.x * (h - hCentre),
		(halfTan * w.y - centre.y * s) * along + centre.y * (h - hCentre),
		(halfTan * w.z - centre.z * s) * along + centre.z * (h - hCentre)
	);
}

/** Position of the ground point under unit direction `n`, body-fixed, m from the body's centre. */
export const groundPoint = (n: Vec3, radius: number): Vec3 =>
	scale(n, radius + moonHeight(n, radius));

/** Altitude of a body-fixed position above the ground under it, m (negative: inside the ground). */
export function altitudeAbove(position: Vec3, radius: number): number {
	const r = length(position);
	return r - radius - moonHeight(normalize(position), radius);
}
