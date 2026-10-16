/**
 * Cloud layers (ADR 0037): the altitude table the planet pass reads and the pure twin of its
 * distance-ordered composite. Each layer is a thin shell at a fixed altitude; the atmosphere
 * between the camera, the layers and the surface is integrated once and snapshotted at the
 * layers' distances, so any number of layers costs one march.
 */
import type { RGB } from './atmosphere-model.ts';

export interface CloudLayerSpec {
	name: 'cumulus' | 'cirrus';
	/** Height of the shell above the surface, m. */
	altitude: number;
}

/** Ordered from the ground up; all inside the atmosphere. */
export const CLOUD_LAYERS: readonly CloudLayerSpec[] = [
	{ name: 'cumulus', altitude: 3_500 },
	{ name: 'cirrus', altitude: 9_500 }
];

/** Altitude of the cumulus shell (the one with ground shadows), m. */
export const CLOUD_ALTITUDE = CLOUD_LAYERS[0]!.altitude;
/** Altitude of the cirrus shell, m. */
export const CIRRUS_ALTITUDE = CLOUD_LAYERS[1]!.altitude;

/** What the march knows about the light at one layer along a ray. */
export interface LayerSample {
	/** Distance of the layer along the ray, m (layers are given nearest first). */
	distance: number;
	/** Opacity 0..1 (0 where the ray misses the layer or finds no cloud). */
	alpha: number;
	/** Radiance the cloud sends toward the camera (before attenuation). */
	radiance: RGB;
	/** Haze added between the camera and this layer, and the fraction of light that survives to it. */
	inscatter: RGB;
	transmittance: RGB;
}

/**
 * Colour of a ray that crosses `layers` (nearest first) on its way to a surface or the sky `base`.
 * `end` is the haze and attenuation over the whole path. This is the composite in the planet
 * pass: each layer contributes the haze in front of it, its own light, and shields everything
 * behind it by (1 - alpha).
 */
export function compositeLayers(
	base: RGB,
	end: { inscatter: RGB; transmittance: RGB },
	layers: readonly LayerSample[]
): RGB {
	const out: RGB = [0, 0, 0];
	let pass = 1;
	const previous: RGB = [0, 0, 0];
	for (const layer of layers) {
		for (let c = 0; c < 3; c++) {
			out[c]! +=
				pass *
				(layer.inscatter[c]! -
					previous[c]! +
					layer.alpha * layer.transmittance[c]! * layer.radiance[c]!);
			previous[c] = layer.inscatter[c]!;
		}
		pass *= 1 - layer.alpha;
	}
	for (let c = 0; c < 3; c++) {
		out[c]! += pass * (end.inscatter[c]! - previous[c]! + end.transmittance[c]! * base[c]!);
	}
	return out;
}

/** Orders layer samples nearest first (a layer the ray misses keeps alpha 0 and goes last). */
export const sortLayers = (layers: readonly LayerSample[]): LayerSample[] =>
	[...layers].sort((a, b) => {
		const da = a.alpha > 0 ? a.distance : Number.POSITIVE_INFINITY;
		const db = b.alpha > 0 ? b.distance : Number.POSITIVE_INFINITY;
		return da - db;
	});

/** A layer the ray does not touch: snapshotted at the end of the path so the composite telescopes. */
export const emptyLayer = (end: { inscatter: RGB; transmittance: RGB }): LayerSample => ({
	distance: Number.POSITIVE_INFINITY,
	alpha: 0,
	radiance: [0, 0, 0],
	inscatter: end.inscatter,
	transmittance: end.transmittance
});
