/**
 * The scaled-space bake of the home planet (plan 364, ADR 0306): KSP's colour and normal maps, made
 * on the GPU from the planet pass's own `surfaceAt`. Numbers shared by both renderers.
 */
import type { PresetSettings } from './presets.ts';

/**
 * Face size of the bake: low 512, medium 1024, high and up 1536 (from the terrain cube's size). With the
 * WebGPU atlas's gutters and mips that is about 20, 76 and 164 MB for both maps.
 */
export function scaledSpaceSize(s: Pick<PresetSettings, 'terrainSize' | 'mapWidth'>): number {
	if (s.terrainSize >= 1024) return 1536;
	if (s.terrainSize >= 768) return 1024;
	return 512;
}

/** GPU bytes of the bake: two RGBA8 cube maps with their mip chains (4/3). */
export const scaledSpaceBytes = (size: number): number => Math.round(2 * 6 * size * size * 4 * (4 / 3));

/**
 * Metres a texel spans on a planet of radius `r` (m), taken at a face's centre (2 r / size) less a
 * fifth: toward a face's corners texels are smaller, and the bake is read only where a pixel covers
 * a whole texel.
 */
export const scaledTexelMetres = (radius: number, size: number): number =>
	((2 * radius) / size) * 0.8;

/** The ground reads the bake from this many texels a pixel, blending from `SCALED_BLEND[0]`. */
export const SCALED_BLEND: readonly [number, number] = [0.6, 1.2];

/** Mid octaves of the coast and colour (km): the scales between the biome map's noise and 1,024 m. */
export const MID_OCTAVES_KM: readonly number[] = [16, 8, 4, 2];
/** Salts of the mid octaves (core's terrain noise). */
export const MID_OCTAVE_SALT = 91;
/**
 * The mid octaves' coast shift is capped at this many elevation units: inside the terrain's land
 * margin (`TERRAIN_SHAPE.landStart - SEA_LEVEL` = 0.012), so water never covers relief.
 */
export const MID_COAST_CAP = 0.008;

/** Passes baked per frame (a face of one map each). */
export const SCALED_PASSES_PER_FRAME = 2;

/**
 * The WebGPU bake's atlas (ADR 0306): six faces in three columns and two rows, each with a gutter of
 * `SCALED_GUTTER` texels baked from directions past its edge, so mips up to `SCALED_MAX_LOD` never mix
 * faces. One texture per map: the planet pass may sample only 16 textures.
 */
export const SCALED_GUTTER = 32;
export const SCALED_MAX_LOD = 5;
export const scaledAtlasSize = (size: number): { tile: number; width: number; height: number } => {
	const tile = size + 2 * SCALED_GUTTER;
	return { tile, width: 3 * tile, height: 2 * tile };
};
