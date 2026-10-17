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

/** The ground kinds the pass draws (ADR 0090): the stock moon's craters and the home planet's hills. */
export type GroundKind = 'craters' | 'hills';

/** What differs by kind in the sizes of the pass (the shaders differ too, see `moon.glsl.ts`). */
export interface GroundSpec {
	/** Texels per side of a cube face of the whole-body height map. */
	cubeSize: number;
	/** Detail of the whole-body icosphere. */
	globeDetail: number;
	/** The patches' skirt drop, m. */
	skirtDrop: number;
	/** The cube map is baked within this many radii of the camera, and released beyond twice that when `releaseCube`. */
	bakeDistance: number;
	releaseCube: boolean;
}

/**
 * A hills body is the size of the home planet and its ridges 16 to 55 km across, so its cube is the
 * planet pass's 1024 (920 m a texel on 600 km: an interpolation error of 13 to 27 m on average, ADR
 * 0044), its globe has a vertex every 7 km, and the skirt covers what the coarse globe and the exact
 * patch differ by at the patch's edge. Its cube is baked within 8 radii and released again beyond 16
 * (ADR 0090): only the bodies the camera is near hold the 50 MB.
 */
export const GROUND_SPECS: Readonly<Record<GroundKind, GroundSpec>> = {
	craters: {
		cubeSize: MOON_CUBE_SIZE,
		globeDetail: MOON_GLOBE_DETAIL,
		skirtDrop: MOON_SKIRT_DROP,
		bakeDistance: MOON_BAKE_DISTANCE,
		releaseCube: false
	},
	hills: { cubeSize: 1024, globeDetail: 96, skirtDrop: 160, bakeDistance: 8, releaseCube: true }
};

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
