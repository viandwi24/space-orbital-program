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
	/** Bloom and the half-float post chain; false renders straight to the canvas. */
	post: boolean;
	/** Bloom runs at this fraction of the canvas size. */
	bloomScale: number;
	/** Ray-march samples along the view ray / the sun ray in the sky shader. */
	viewSamples: number;
	lightSamples: number;
	/** Noise octaves for the ground detail and the clouds. */
	groundOctaves: number;
	cloudOctaves: number;
	/** Biome map width in texels (height is half). */
	mapWidth: number;
	/** Instanced trees at the launch site. */
	trees: number;
	/** PMREM cube size for image-based light. */
	envSize: 64 | 128 | 256;
	/** Part models (plan 020): radial segments, hardware detail level, procedural texture side. */
	partSegments: 16 | 24 | 32;
	partExtras: 0 | 1 | 2;
	partTexture: 128 | 256 | 512;
	/** Smoke, dust and gas particles alive at once, debris shards per explosion, fireball sprites. */
	smokeParticles: number;
	debrisShards: number;
}

export const PRESETS: Readonly<Record<GraphicsPreset, PresetSettings>> = {
	low: {
		pixelRatioCap: 1,
		msaa: 0,
		shadowMapSize: 0,
		post: false,
		bloomScale: 0.25,
		viewSamples: 8,
		lightSamples: 3,
		groundOctaves: 8,
		cloudOctaves: 3,
		mapWidth: 512,
		trees: 250,
		envSize: 64,
		partSegments: 16,
		partExtras: 0,
		partTexture: 128,
		smokeParticles: 56,
		debrisShards: 0
	},
	medium: {
		pixelRatioCap: 1.5,
		msaa: 4,
		shadowMapSize: 2048,
		post: true,
		bloomScale: 0.5,
		viewSamples: 12,
		lightSamples: 4,
		groundOctaves: 11,
		cloudOctaves: 4,
		mapWidth: 1024,
		trees: 900,
		envSize: 128,
		partSegments: 24,
		partExtras: 1,
		partTexture: 256,
		smokeParticles: 160,
		debrisShards: 24
	},
	high: {
		pixelRatioCap: 2,
		msaa: 4,
		shadowMapSize: 4096,
		post: true,
		bloomScale: 0.5,
		viewSamples: 16,
		lightSamples: 6,
		groundOctaves: 13,
		cloudOctaves: 5,
		mapWidth: 1024,
		trees: 2000,
		envSize: 128,
		partSegments: 32,
		partExtras: 2,
		partTexture: 512,
		smokeParticles: 320,
		debrisShards: 48
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
	// Measured only on an Apple M5 (journal 019): M1/M2 are the budget machine, not yet measured, so they get medium.
	if (/apple m[12]\b/.test(gpu)) return 'medium';
	if (/apple m\d|nvidia|geforce|rtx|radeon rx|radeon pro|arc/.test(gpu)) return 'high';
	return 'medium';
}

/** Parses a persisted value; anything else is `null` so the caller falls back to `selectPreset`. */
export function parsePreset(value: unknown): GraphicsPreset | null {
	return typeof value === 'string' && (GRAPHICS_PRESETS as readonly string[]).includes(value)
		? (value as GraphicsPreset)
		: null;
}

/** Part-model detail from a preset (`PartModelFactory`). */
export function detailOf(settings: PresetSettings): PartDetail {
	return {
		segments: settings.partSegments,
		extras: settings.partExtras,
		textureSize: settings.partTexture
	};
}
