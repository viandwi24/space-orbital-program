/** Temperature glow of part skins (pure; plan 020). Values are linear HDR emissive colours. */
import { clamp } from '../vec.ts';

/** Below this a skin is not visibly hot, K. */
export const GLOW_THRESHOLD_K = 650;

/** Blackbody-ish colour ramp: [temperature K, r, g, b], r = 1. */
const STOPS: ReadonlyArray<readonly [number, number, number, number]> = [
	[650, 1, 0.02, 0],
	[900, 1, 0.06, 0.01],
	[1200, 1, 0.17, 0.02],
	[1600, 1, 0.32, 0.06],
	[2000, 1, 0.5, 0.16],
	[2500, 1, 0.74, 0.4],
	[3000, 1, 0.92, 0.76],
	[4000, 1, 1, 0.95]
];

export type GlowRGB = readonly [number, number, number];

/** Colour of the glow at `kelvin` (largest channel 1). */
export function glowColour(kelvin: number): GlowRGB {
	const t = Number.isFinite(kelvin) ? kelvin : 0;
	const first = STOPS[0]!;
	const last = STOPS[STOPS.length - 1]!;
	if (t <= first[0]) return [first[1], first[2], first[3]];
	if (t >= last[0]) return [last[1], last[2], last[3]];
	for (let i = 1; i < STOPS.length; i++) {
		const b = STOPS[i]!;
		if (t > b[0]) continue;
		const a = STOPS[i - 1]!;
		const k = (t - a[0]) / (b[0] - a[0]);
		return [a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k, a[3] + (b[3] - a[3]) * k];
	}
	return [last[1], last[2], last[3]];
}

/** Brightness multiplier: 0 up to the threshold, > 3 (the bloom threshold) from about 1 900 K. */
export function glowBrightness(kelvin: number): number {
	if (!Number.isFinite(kelvin) || kelvin <= GLOW_THRESHOLD_K) return 0;
	const fade = clamp((kelvin - GLOW_THRESHOLD_K) / 150, 0, 1);
	const rise = Math.pow((Math.min(kelvin, 4500) - GLOW_THRESHOLD_K) / 1350, 1.6);
	return fade * fade * (3 - 2 * fade) * (0.05 + 4.1 * rise);
}

/** Emissive colour (linear HDR) of a skin at `kelvin`; all zero when not glowing. */
export function glowEmissive(kelvin: number): GlowRGB {
	const k = glowBrightness(kelvin);
	if (k <= 0) return [0, 0, 0];
	const c = glowColour(kelvin);
	return [c[0] * k, c[1] * k, c[2] * k];
}
