/**
 * Ocean waves (ADR 0037): a small table of deep-water components the planet pass sums per pixel.
 * Each component is a sine wave whose angular frequency obeys the deep-water dispersion relation
 * (omega^2 = g k), rounded so that every component repeats exactly after `WAVE_PERIOD` seconds
 * and time can be wrapped on the CPU without a jump. Pure maths, tested in Bun; the shader takes
 * the table from here.
 */

/** Gravity used for the dispersion relation, m/s^2. The visual ocean uses Earth's regardless of the body. */
export const WAVE_GRAVITY = 9.81;
/** The whole sea repeats after this many seconds. */
export const WAVE_PERIOD = 180;

export interface WaveComponent {
	wavelength: number;
	/** Direction of travel as an angle in the tangent plane, rad. */
	direction: number;
	/** Amplitude, m. */
	amplitude: number;
	phase: number;
}

/** Wind-driven swell and chop around one wind direction, largest first. */
export const WAVES: readonly WaveComponent[] = [
	{ wavelength: 120, direction: 0.1, amplitude: 1.6, phase: 0.4 },
	{ wavelength: 53, direction: -0.5, amplitude: 0.8, phase: 2.1 },
	{ wavelength: 24, direction: 0.55, amplitude: 0.38, phase: 4.2 },
	{ wavelength: 11, direction: -0.15, amplitude: 0.17, phase: 1.3 },
	{ wavelength: 5.2, direction: 0.8, amplitude: 0.075, phase: 5.5 },
	{ wavelength: 2.4, direction: -0.9, amplitude: 0.032, phase: 3.1 },
	{ wavelength: 1.1, direction: 0.3, amplitude: 0.014, phase: 0.9 }
];

export const waveNumber = (wavelength: number): number => (2 * Math.PI) / wavelength;

/** Deep-water phase speed of a wave of this length, m/s: sqrt(g lambda / 2 pi). */
export const waveSpeed = (wavelength: number, g = WAVE_GRAVITY): number =>
	Math.sqrt((g * wavelength) / (2 * Math.PI));

/**
 * Angular frequency of a component: the dispersion value rounded to a whole number of cycles per
 * `WAVE_PERIOD` (at least one), so the sea is periodic in time.
 */
export function waveOmega(wavelength: number): number {
	const exact = Math.sqrt(WAVE_GRAVITY * waveNumber(wavelength));
	const cycles = Math.max(1, Math.round((exact * WAVE_PERIOD) / (2 * Math.PI)));
	return (2 * Math.PI * cycles) / WAVE_PERIOD;
}

/** Steepness a * k of one component (1 would be a breaking wave). */
export const waveSteepness = (w: WaveComponent): number => w.amplitude * waveNumber(w.wavelength);

/**
 * Height in metres of the sea at tangent-plane position (x, y) at time t. The shader evaluates the
 * same sum along 3D directions; this reference is what the tests pin down.
 */
export function seaHeight(x: number, y: number, t: number, waves = WAVES): number {
	let h = 0;
	for (const w of waves) {
		const k = waveNumber(w.wavelength);
		const phase = k * (x * Math.cos(w.direction) + y * Math.sin(w.direction));
		h += w.amplitude * Math.sin(phase - waveOmega(w.wavelength) * t + w.phase);
	}
	return h;
}

/** Wave components kept at a pixel footprint (m): wavelengths under three pixels are dropped. */
export const wavesResolvedAt = (footprint: number, waves = WAVES): number =>
	waves.filter((w) => w.wavelength >= 3 * footprint).length;

/**
 * The scrolled detail layers of Medium and up (plan 401): wavelength (m), drift speed (m/s) and
 * heading (rad), the slope each adds, and a noise salt. The planet pass reads them; like a wave,
 * a layer fades out from about three pixels a wavelength.
 */
export const DETAIL_LAYERS = [
	{ lambda: 1.7, speed: 0.45, heading: 0.35, slope: 0.07, salt: 211 },
	{ lambda: 0.55, speed: 0.3, heading: -0.9, slope: 0.05, salt: 223 }
] as const;

/** How much of a detail layer of `lambda` m shows at a pixel footprint (m): 1 at a wavelength per three pixels or finer, 0 at one per three. */
export const detailFade = (lambda: number, footprint: number): number =>
	Math.min(1, Math.max(0, lambda / (3 * Math.max(footprint, 1e-9)) - 1));

/** The slope (rise over run) the detail layers add at most at a footprint: the sum of the faded layer slopes. */
export const detailSlopeAt = (footprint: number): number =>
	DETAIL_LAYERS.reduce((s, d) => s + d.slope * detailFade(d.lambda, footprint), 0);

/** The direction a ray reflects off a flat sea (the surface normal `up`): `rd - 2 (rd · up) up`, for the sky-view lookup. */
export function reflectOffSea(
	rd: readonly [number, number, number],
	up: readonly [number, number, number]
): [number, number, number] {
	const d = 2 * (rd[0] * up[0] + rd[1] * up[1] + rd[2] * up[2]);
	return [rd[0] - d * up[0], rd[1] - d * up[1], rd[2] - d * up[2]];
}
