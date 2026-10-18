/**
 * The science-region overlay of map view (plan 192, ADR 0180): an equirectangular texture per body,
 * each texel the colour of `regionAt` at its direction, drawn on a sphere in the body-fixed frame.
 * The texel layout follows three's `SphereGeometry` UVs, so a texel lies where the sphere puts it.
 */
import {
	regionAt,
	regionsOf,
	type BodyDefinition,
	type RegionWorld,
	type Vec3
} from '@orbital/core';

/** Region tints, by the region's index in `regionsOf` (cycled). */
export const REGION_COLOURS: readonly (readonly [number, number, number])[] = [
	[66, 135, 245],
	[245, 197, 66],
	[92, 201, 112],
	[36, 122, 72],
	[230, 140, 70],
	[150, 150, 160],
	[235, 240, 250],
	[190, 100, 220],
	[220, 80, 100],
	[80, 210, 210]
];

export type RegionBody = Pick<BodyDefinition, 'regions' | 'radius'>;

/**
 * The body-fixed unit direction at sphere UV `(u, v)`: three's `SphereGeometry` puts a vertex at
 * `(-cos φ sin θ, cos θ, sin φ sin θ)` with `u = φ / 2π` and `v = 1 - θ / π`.
 */
export function uvDirection(u: number, v: number): Vec3 {
	const phi = u * 2 * Math.PI;
	const theta = (1 - v) * Math.PI;
	return {
		x: -Math.cos(phi) * Math.sin(theta),
		y: Math.cos(theta),
		z: Math.sin(phi) * Math.sin(theta)
	};
}

/** The tint of a region id on a body. */
export function regionColour(body: RegionBody, id: string): readonly [number, number, number] {
	const k = Math.max(
		0,
		regionsOf(body).findIndex((r) => r.id === id)
	);
	return REGION_COLOURS[k % REGION_COLOURS.length]!;
}

export interface RegionTexture {
	width: number;
	height: number;
	/** RGBA, row 0 at `v` near 0 (the south pole), as a `DataTexture` reads it. */
	data: Uint8Array;
}

/** The overlay texture of a body: the colour of `regionAt` at each texel centre. */
export function regionTexture(
	body: RegionBody,
	world: RegionWorld = {},
	width = 256,
	height = 128
): RegionTexture {
	const data = new Uint8Array(width * height * 4);
	const colours = new Map<string, readonly [number, number, number]>();
	for (let j = 0; j < height; j++) {
		for (let i = 0; i < width; i++) {
			const id = regionAt(body, uvDirection((i + 0.5) / width, (j + 0.5) / height), world);
			let c = colours.get(id);
			if (!c) colours.set(id, (c = regionColour(body, id)));
			const o = (j * width + i) * 4;
			data[o] = c[0];
			data[o + 1] = c[1];
			data[o + 2] = c[2];
			data[o + 3] = 255;
		}
	}
	return { width, height, data };
}
