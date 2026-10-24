/**
 * A body's scaled-space colour map baked from its own surface function (plan 403, ADR 0361 on the
 * bakes): the palette's pattern (`body-look.ts`) shaded by what the ground does under each texel, so
 * the Moon seen from orbit has its craters, its rims and its low plains instead of a flat mottle.
 * Pure (data in, bytes out), so it runs in a worker, in the page or in a test and gives the same
 * bytes. The relief term is a texel's height against the mean of its four neighbours (a laplacian):
 * a crater rim stands above its neighbours and is lit up, a floor sits below them and is darkened.
 */
import type { BodyAppearance, BodyDefinition, TerrainField } from '@orbital/core';
import { createBodyTerrainField } from '@orbital/core';
import { patternColour, texelDir, type LOOK_MAP } from './body-look.ts';

export interface BakeSize {
	width: number;
	height: number;
}

/** How strongly relief and height move the colour (1 is the palette's own). */
export const BAKE_RELIEF = 0.34;
export const BAKE_HEIGHT = 0.16;

/** The field a body's bake reads: only a cratered body has one the bake shades by. */
export function bakeField(
	body: Pick<BodyDefinition, 'radius' | 'terrain'>
): TerrainField | undefined {
	return body.terrain?.kind === 'craters' ? createBodyTerrainField(body) : undefined;
}

type Vec = { x: number; y: number; z: number };

/** The unit direction one texel to the east, west, north or south of `(i, j)`. */
const neighbours = (i: number, j: number, w: number, h: number): [Vec, Vec, Vec, Vec] => {
	const dir = (a: number, b: number): Vec => {
		const [x, y, z] = texelDir(a, Math.min(h - 1, Math.max(0, b)), w, h);
		return { x, y, z };
	};
	return [dir(i + 1, j), dir(i - 1, j), dir(i, j + 1), dir(i, j - 1)];
};

/**
 * Rows `j0` to `j1` (exclusive) of the map into `out` (RGBA sRGB bytes, rows from the south pole
 * up, like `surfaceRows`), the palette shaded by the field. `field` undefined is the plain palette.
 */
export function bakeRows(
	look: BodyAppearance,
	seed: number,
	field: TerrainField | undefined,
	size: BakeSize,
	out: Uint8Array,
	j0: number,
	j1: number
): void {
	const { width: w, height: h } = size;
	const max = Math.max(1, field?.maxHeight ?? 1);
	// relief is measured over one texel, so its scale follows the map's size: a finer map sees finer craters
	const scale = max * 0.012;
	for (let j = j0; j < Math.min(j1, h); j++) {
		for (let i = 0; i < w; i++) {
			const [x, y, z] = texelDir(i, j, w, h);
			const c = patternColour(look, [x, y, z], seed);
			let k = 1;
			if (field) {
				const here = field.heightAt({ x, y, z });
				const [e, wst, n, s] = neighbours(i, j, w, h);
				const ring =
					(field.heightAt(e) + field.heightAt(wst) + field.heightAt(n) + field.heightAt(s)) / 4;
				const relief = Math.max(-1, Math.min(1, (here - ring) / scale));
				k = 1 + BAKE_RELIEF * relief + BAKE_HEIGHT * Math.max(-1, Math.min(1, here / max));
			}
			const o = (j * w + i) * 4;
			out[o] = Math.min(255, Math.max(0, Math.round(c[0] * k)));
			out[o + 1] = Math.min(255, Math.max(0, Math.round(c[1] * k)));
			out[o + 2] = Math.min(255, Math.max(0, Math.round(c[2] * k)));
			out[o + 3] = 255;
		}
	}
}

/** The whole map in one go (a test, a small size, a fallback with no worker). */
export function bakeMap(
	look: BodyAppearance,
	seed: number,
	field: TerrainField | undefined,
	size: BakeSize
): Uint8Array {
	const out = new Uint8Array(size.width * size.height * 4);
	bakeRows(look, seed, field, size, out, 0, size.height);
	return out;
}

/** The size the palette-only map has (`LOOK_MAP`): a terrain bake is larger than this to be worth it. */
export type PaletteSize = typeof LOOK_MAP;
