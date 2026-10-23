/** Graphics presets (ADR 0027): one table, one pure selector. The host persists the choice. */

import type { PartDetail } from './parts/types.ts';

export type GraphicsPreset = 'low' | 'medium' | 'high';
export const GRAPHICS_PRESETS: readonly GraphicsPreset[] = ['low', 'medium', 'high'];

export interface PresetSettings {
	/** Upper bound on the device pixel ratio. */
	pixelRatioCap: number;
	/** MSAA samples of the scene target (0 = none). */
	msaa: 0 | 2 | 4;
	/** Shadow map side in texels (0 = shadows off). */
	shadowMapSize: 0 | 1024 | 2048 | 4096;
	/**
	 * Pixel budget of the planet pass, in pixels (plan 252, ADR 0234): the fullscreen sky, cloud and
	 * terrain shader draws at the largest scale in [0.5, 1] of the scene target's side that keeps it under
	 * this many pixels, and the depth-aware upsample (ADR 0061) brings it to full size. The vessel, the
	 * meshes and the HUD keep the full pixel ratio. 0 = no budget.
	 */
	planetPixels: number;
	/** Bloom and the half-float post chain; false renders straight to the canvas. */
	post: boolean;
	/** Bloom runs at this fraction of the canvas size. */
	bloomScale: number;
	/** Ray-march samples along the view ray in the sky shader (the sun ray is one fetch of the sun-depth table, ADR 0053). */
	viewSamples: number;
	/** Noise octaves for the ground detail and the clouds. */
	groundOctaves: number;
	cloudOctaves: number;
	/** Octaves of the cloud density the sun's shadow of the cloud deck on the ground reads, 0 = no cloud shadows (plan 050). */
	cloudShadowOctaves: number;
	/** The ground's cloud shadows read the baked cloud map (plan 056, ADR 0086) instead of evaluating the noise; for presets with `cloudShadowOctaves` 0. */
	cloudShadowMap: boolean;
	/** Ray-march steps through the cumulus slab (plan 037, ADR 0059). */
	cloudSteps: number;
	/** Octaves of billow detail in the cumulus slab, 1 to 3. */
	cloudDetail: 1 | 2 | 3;
	/**
	 * Light shafts (plan 054, ADR 0070): samples of the second march that puts cloud shadows into the haze (0 = off); each reads
	 * the baked cloud-coverage map once.
	 */
	shaftSteps: number;
	/** Steps of the aurora march through the shell of emission (plan 061, ADR 0093), 0 = no aurora. */
	auroraSteps: number;
	/** Reads of the terrain height per shaft sample for ridge-cast shafts (plan 062, ADR 0089), 0 = clouds only. */
	shaftTerrain: number;
	/** Biome map width in texels (height is half). */
	mapWidth: number;
	/** Instanced trees at the launch site. */
	trees: number;
	/** Instanced grass tufts around the pad (plan 025). */
	tufts: number;
	/**
	 * Terrain (ADR 0036): baked cube face size in texels, march steps of the prepass that crosses the far
	 * field once per block of pixels (0 = flat planet; plan 039), sun-shadow march steps.
	 */
	terrainSize: 0 | 512 | 768 | 1024;
	terrainSteps: number;
	/** Steps the per-pixel march may take after the march prepass (plan 039); `terrainSteps` is the prepass's budget. */
	terrainRefineSteps: number;
	terrainShadowSteps: number;
	/** Camera-centred terrain patches (ADR 0044): texels per side of the fine (4 km) and mid (33 km) windows, 0 = off. */
	terrainPatch: 0 | 512 | 1024;
	/** PMREM cube size for image-based light. */
	envSize: 64 | 128 | 256;
	/** Part models (plan 020): radial segments, hardware detail level, procedural texture side. */
	partSegments: 16 | 24 | 32;
	partExtras: 0 | 1 | 2;
	partTexture: 128 | 256 | 512;
	/** Smoke, dust and gas particles alive at once, debris shards per explosion, fireball sprites. */
	smokeParticles: number;
	debrisShards: number;
	/** Re-entry plasma and condensation (plan 399): Low a two-stop gradient and no condensation, Medium the full gradient and condensation, High adds streaks and the bow shock. */
	plasma: 'low' | 'medium' | 'high';
	/** Engine plumes (plan 400): Low draws the inner flame and the nozzle glow, no diamonds and no cluster light; Medium adds the outer flame, the diamonds and the cluster light; High is for the volumetric layer (plan 400 follow-up). */
	plume: 'low' | 'medium' | 'high';
}

/**
 * The default pixel budget of the planet pass (plan 252, ADR 0234): 1.75 Mpx, a little under a
 * 1920 x 1080 frame (2.07 Mpx). Plan 251's baseline on the M5 showed the frame cost follows the planet
 * pass's pixels (at pixel ratio 2, `high` at 2.07 Mpx read 17.8 / 16.8 / 18.6 ms at the pad, 3 km and
 * 12 km, with the governor still bouncing between 100 % and 85 %). At 1.75 Mpx a 14" Retina screen
 * (5.7 Mpx) runs the pass at 0.55 of the side and the same scenes should read about 15 / 14 / 16 ms; a
 * 1080p frame at pixel ratio 1 still draws it at full size.
 */
export const PLANET_PIXEL_BUDGET = 1_750_000;

/** From this pixel ratio up the frame is dense enough for lighter multisampling and shadows (plan 252). */
export const RETINA_RATIO = 2;

/** MSAA samples of the scene target at `baseRatio` (the preset's pixel ratio before any render scale): at most 2 from `RETINA_RATIO` up. */
export const msaaSamples = (msaa: 0 | 2 | 4, baseRatio: number): 0 | 2 | 4 =>
	baseRatio >= RETINA_RATIO && msaa > 2 ? 2 : msaa;

/** Shadow map side at `baseRatio`: at most 2048 from `RETINA_RATIO` up, where each texel covers more pixels' worth of screen. */
export const shadowSizeAt = (size: number, baseRatio: number): number =>
	baseRatio >= RETINA_RATIO ? Math.min(size, 2048) : size;

/**
 * Whether the canvas itself is multisampled (plan 252): the canvas only receives the post chain's output
 * quad, and on a dense screen the scene's own MSAA is enough. `low` draws straight into the canvas, so a
 * 1x screen keeps it.
 */
export const canvasAntialias = (devicePixelRatio: number): boolean =>
	devicePixelRatio < RETINA_RATIO;

export const PRESETS: Readonly<Record<GraphicsPreset, PresetSettings>> = {
	low: {
		pixelRatioCap: 1,
		planetPixels: PLANET_PIXEL_BUDGET,
		msaa: 0,
		shadowMapSize: 0,
		post: false,
		bloomScale: 0.25,
		viewSamples: 8,
		groundOctaves: 8,
		cloudOctaves: 3,
		cloudShadowOctaves: 0,
		cloudShadowMap: false,
		cloudSteps: 3,
		cloudDetail: 1,
		shaftSteps: 0,
		shaftTerrain: 0,
		auroraSteps: 0,
		mapWidth: 512,
		trees: 250,
		tufts: 0,
		terrainSize: 512,
		terrainSteps: 48,
		terrainRefineSteps: 24,
		terrainShadowSteps: 0,
		terrainPatch: 512,
		envSize: 128,
		partSegments: 16,
		partExtras: 0,
		partTexture: 128,
		smokeParticles: 56,
		debrisShards: 0,
		plasma: 'low',
		plume: 'low'
	},
	medium: {
		pixelRatioCap: 1.5,
		planetPixels: PLANET_PIXEL_BUDGET,
		msaa: 4,
		shadowMapSize: 2048,
		post: true,
		bloomScale: 0.5,
		viewSamples: 12,
		groundOctaves: 9,
		cloudOctaves: 3,
		cloudShadowOctaves: 0,
		cloudShadowMap: true,
		cloudSteps: 4,
		cloudDetail: 2,
		shaftSteps: 4,
		shaftTerrain: 2,
		auroraSteps: 8,
		mapWidth: 1024,
		trees: 900,
		tufts: 10000,
		terrainSize: 768,
		terrainSteps: 80,
		terrainRefineSteps: 32,
		terrainShadowSteps: 5,
		terrainPatch: 512,
		envSize: 128,
		partSegments: 24,
		partExtras: 1,
		partTexture: 256,
		smokeParticles: 160,
		debrisShards: 24,
		plasma: 'medium',
		plume: 'medium'
	},
	high: {
		pixelRatioCap: 2,
		planetPixels: PLANET_PIXEL_BUDGET,
		msaa: 4,
		shadowMapSize: 4096,
		post: true,
		bloomScale: 0.5,
		viewSamples: 12,
		groundOctaves: 11,
		cloudOctaves: 4,
		// the baked cloud-shadow map, as `medium` (plan 252, ADR 0234): +1.0 ms at 1080p for the noise, +0.1 for the map
		cloudShadowOctaves: 0,
		cloudShadowMap: true,
		cloudSteps: 6,
		cloudDetail: 3,
		shaftSteps: 8,
		shaftTerrain: 4,
		auroraSteps: 12,
		mapWidth: 1024,
		trees: 2000,
		tufts: 28000,
		terrainSize: 1024,
		terrainSteps: 128,
		terrainRefineSteps: 40,
		terrainShadowSteps: 8,
		terrainPatch: 1024,
		envSize: 128,
		partSegments: 32,
		partExtras: 2,
		partTexture: 512,
		smokeParticles: 320,
		debrisShards: 48,
		plasma: 'high',
		plume: 'high'
	}
};

/** What the host can cheaply learn about the device (WebGL renderer string, limits, navigator hints). */
export interface DeviceCapabilities {
	/** `WEBGL_debug_renderer_info` UNMASKED_RENDERER_WEBGL, when exposed. */
	gpu?: string;
	maxTextureSize: number;
	/** `navigator.deviceMemory` (GB), when exposed. */
	deviceMemoryGb?: number;
	hardwareConcurrency?: number;
	/** Touch phone or tablet. */
	mobile?: boolean;
}

/**
 * Default preset for a device. Conservative on purpose: software rasterisers, phones and old
 * integrated GPUs get `low`; Apple silicon from M3, discrete and recent integrated GPUs with enough memory
 * get `high` (Apple M1/M2 `medium` until measured); anything unknown gets `medium`.
 */
export function selectPreset(caps: DeviceCapabilities): GraphicsPreset {
	const gpu = (caps.gpu ?? '').toLowerCase();
	if (caps.mobile) return 'low';
	if (/swiftshader|llvmpipe|software|basic render/.test(gpu)) return 'low';
	if (caps.maxTextureSize < 8192) return 'low';
	if ((caps.deviceMemoryGb ?? 8) < 4) return 'low';
	if (/intel/.test(gpu) && !/iris.*xe|arc |iris pro|apple/.test(gpu)) return 'low';
	// The base M1/M2 GPU (plan 066, ADR 0157): `medium` read 33 ms at the pad at 1080p on an M2 (budget
	// 13.3), `low` 21.6, so they start on `low` and the governor's rungs take it from there. Their Pro, Max
	// and Ultra GPUs are two to four times larger and not measured: `medium` until they are.
	if (/apple m[12] (pro|max|ultra)\b/.test(gpu)) return 'medium';
	if (/apple m[12]\b/.test(gpu)) return 'low';
	if (/apple m\d|nvidia|geforce|rtx|radeon rx|radeon pro|arc/.test(gpu)) return 'high';
	return 'medium';
}

/** Parses a persisted value; anything else is `null` so the caller falls back to `selectPreset`. */
/**
 * The settings that size the world's baked resources: the biome map, the terrain cube and its patches,
 * and through them the scaled-space bake (plan 364). A governor step keeps the resource preset's values
 * (plan 373, ADR 0310): a step that resized them rebuilt the terrain and re-ran the scaled-space bake,
 * up to 1.5 s at a sunrise on the M2. Only a player's preset change resizes them.
 */
export const RESOURCE_SETTINGS = ['mapWidth', 'terrainSize', 'terrainPatch'] as const;

/** `preset`'s settings with the resource sizes of `resources` (none: the preset's own). Pure (tested). */
export function settingsFor(preset: GraphicsPreset, resources?: GraphicsPreset): PresetSettings {
	const s = PRESETS[preset];
	if (!resources || resources === preset) return s;
	const r = PRESETS[resources];
	return { ...s, mapWidth: r.mapWidth, terrainSize: r.terrainSize, terrainPatch: r.terrainPatch };
}

export function parsePreset(value: unknown): GraphicsPreset | null {
	return typeof value === 'string' && (GRAPHICS_PRESETS as readonly string[]).includes(value)
		? (value as GraphicsPreset)
		: null;
}

/** Part-model detail from a preset (`PartModelFactory`). */
/**
 * Part detail in the Hangar (plan 220): always the high preset's, whatever the graphics preset, so
 * round parts are smooth up close; the Hangar has one vessel and no planet to pay for it.
 */
export const hangarDetail = (_quality: 'low' | 'high'): PartDetail => detailOf(PRESETS.high);

export function detailOf(settings: PresetSettings): PartDetail {
	return {
		segments: settings.partSegments,
		extras: settings.partExtras,
		textureSize: settings.partTexture
	};
}
