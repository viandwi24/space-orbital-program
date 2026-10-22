/**
 * The night sky (plan 364, ADR 0306): the numbers both renderers' shaders are built from, and their
 * CPU twins for the tests.
 *
 * - The Milky Way, its dust lanes, faint nebulae and the haze of unresolved stars are baked once into
 *   a half-float octahedral map (`skyMapSize`), read with an explicit level from the pixel's angle.
 * - The stars are a procedural catalogue, evaluated per pixel. Each one is a Gaussian at least
 *   `STAR_SIGMA_MIN_PX` pixels wide, normalised so its sum over the pixels is its flux wherever it
 *   falls: it cannot twinkle as the camera turns, at any resolution.
 *
 * Every direction is inertial (the stars do not turn with the planet).
 */

/** The galactic pole and the direction of the galactic centre (orthogonal unit vectors). */
export const GALACTIC_POLE: readonly [number, number, number] = normalize3([0.3, 0.8, 0.5]);
export const GALACTIC_CENTRE: readonly [number, number, number] = normalize3(
	cross3(GALACTIC_POLE, [0, 0, 1])
);

/** One layer of the star catalogue: a grid of `cells` × `cells` per cube face. */
export interface StarLayer {
	/** Cells along a face's edge (equi-angular cube map). */
	cells: number;
	/** Chance that a cell holds a star. */
	chance: number;
	/** Brightest and faintest magnitude in the layer. */
	magBright: number;
	magFaint: number;
	/** Hash salt. */
	salt: number;
}

/**
 * Bright, middle and faint stars: about 3,500, 12,000 and 44,000 over the whole sky. The faint layers
 * are thinned so the sky reads as depth, not as a field of dots (the owner found many dots dizzying).
 */
export const STAR_LAYERS: readonly StarLayer[] = [
	{ cells: 30, chance: 0.65, magBright: -1.2, magFaint: 3.5, salt: 11 },
	{ cells: 64, chance: 0.5, magBright: 3.0, magFaint: 5.5, salt: 23 },
	{ cells: 128, chance: 0.45, magBright: 5.0, magFaint: 7.0, salt: 37 }
];

/** Radiance × solid angle of a magnitude-0 star, in the planet pass's units (before exposure). */
export const STAR_FLUX0 = 2.4e-5;
/** The narrowest star, pixels (σ of the Gaussian): sampled at pixel centres its sum is within 2 % of its flux. */
export const STAR_SIGMA_MIN_PX = 0.62;
/**
 * Extra width of the brightest stars, pixels of σ, reached at `STAR_SIGMA_BRIGHT_MAG`: small and crisp,
 * about 1.5 device pixels across for most stars and 2 for the brightest (the owner: "kecil kecil aja
 * cukup"). Device pixels: a Retina screen does not draw them twice as large.
 */
export const STAR_SIGMA_EXTRA_PX = 0.23;
/**
 * A star's radiance is compressed softly toward this cap, under the bloom's threshold (3, scene units
 * before exposure): magnitude reads as brightness, and no star swells into a bloomed disc.
 */
export const STAR_PEAK_CAP = 2.0;
export const STAR_SIGMA_BRIGHT_MAG = -1;
/** Magnitude at which the extra width starts. */
export const STAR_SIGMA_FROM_MAG = 3.5;
/** A star sits within the middle half of its cell: the cell's own pixels see all of it. */
export const STAR_CELL_MARGIN = 0.25;

/** Brightness of the Milky Way's bake (radiance at its brightest clouds, before exposure). */
export const MILKY_WAY_RADIANCE = 0.075;
/** A faint glow over the whole sky (zodiacal and unresolved light). */
export const SKY_FLOOR_RADIANCE = 0.0012;

/**
 * Octahedral map size from the preset's biome map width (512 on low, 1024 above): the band is smooth,
 * so a texel of 0.2° (1024, 8 MB with mips) is plenty.
 */
export const skyMapSize = (mapWidth: number): number => (mapWidth <= 512 ? 512 : 1024);

/** Mean angle of a texel of an octahedral map of `size`² (rad): its solid angle 4π/size², square-rooted. */
export const skyTexelAngle = (size: number): number => Math.sqrt(4 * Math.PI) / size;

/**
 * A layer's magnitude from a uniform `u` in [0, 1]: the count of stars brighter than m grows as
 * 10^(0.5 m) (a uniform population of equal stars), so faint ones are far more common.
 */
export function starMagnitude(layer: StarLayer, u: number): number {
	const span = Math.pow(10, -0.5 * (layer.magFaint - layer.magBright));
	return layer.magFaint + 2 * Math.log10(span + (1 - span) * u);
}

/** A star's flux from its magnitude. */
export const starFlux = (mag: number): number => STAR_FLUX0 * Math.pow(10, -0.4 * mag);

/** σ of a star of magnitude `mag`, pixels. */
export function starSigmaPx(mag: number): number {
	const t = clamp01((STAR_SIGMA_FROM_MAG - mag) / (STAR_SIGMA_FROM_MAG - STAR_SIGMA_BRIGHT_MAG));
	return STAR_SIGMA_MIN_PX + STAR_SIGMA_EXTRA_PX * t;
}

/**
 * The radiance a pixel at angular distance `d` (rad) from a star of flux `flux` sees, with the
 * pixel's angle `px` (rad) and σ in pixels: an energy-normalised Gaussian.
 */
export function starRadiance(flux: number, d: number, px: number, sigmaPx: number): number {
	const s = sigmaPx * px;
	const l = (flux * Math.exp((-d * d) / (2 * s * s))) / (2 * Math.PI * s * s);
	return STAR_PEAK_CAP * (1 - Math.exp(-l / STAR_PEAK_CAP));
}

/** Star colour by a uniform `t`: mostly white, some blue-white, a few yellow, orange and red. */
export const STAR_TINTS: readonly (readonly [number, number, number])[] = [
	[0.8, 0.86, 1.0],
	[0.9, 0.94, 1.0],
	[1.0, 0.99, 0.97],
	[1.0, 0.94, 0.84],
	[1.0, 0.86, 0.72]
];
/** Where each tint takes over along `t` (the first is at 0). */
export const STAR_TINT_STOPS: readonly number[] = [0, 0.12, 0.38, 0.74, 0.92];

/** Unit direction from an octahedral map coordinate (uv in [0, 1]²). */
export function octDecode(u: number, v: number): [number, number, number] {
	const fx = u * 2 - 1;
	const fy = v * 2 - 1;
	let x = fx;
	let y = fy;
	const z = 1 - Math.abs(fx) - Math.abs(fy);
	const t = Math.max(-z, 0);
	x += x >= 0 ? -t : t;
	y += y >= 0 ? -t : t;
	return normalize3([x, y, z]);
}

/** Octahedral map coordinate (uv in [0, 1]²) of a unit direction. */
export function octEncode(d: readonly [number, number, number]): [number, number] {
	const s = Math.abs(d[0]) + Math.abs(d[1]) + Math.abs(d[2]);
	let x = d[0] / s;
	let y = d[1] / s;
	if (d[2] < 0) {
		const ox = (1 - Math.abs(y)) * (x >= 0 ? 1 : -1);
		const oy = (1 - Math.abs(x)) * (y >= 0 ? 1 : -1);
		x = ox;
		y = oy;
	}
	return [x * 0.5 + 0.5, y * 0.5 + 0.5];
}

/**
 * The equi-angular cube face of a direction and its coordinates in [-1, 1]² (the star grid's cells
 * are near-equal in angle): face 0..5 = +x, -x, +y, -y, +z, -z.
 */
export function cubeFaceCoords(d: readonly [number, number, number]): [number, number, number] {
	const ax = Math.abs(d[0]);
	const ay = Math.abs(d[1]);
	const az = Math.abs(d[2]);
	let face: number;
	let a: number;
	let b: number;
	if (ax >= ay && ax >= az) {
		face = d[0] > 0 ? 0 : 1;
		a = d[1] / ax;
		b = d[2] / ax;
	} else if (ay >= az) {
		face = d[1] > 0 ? 2 : 3;
		a = d[2] / ay;
		b = d[0] / ay;
	} else {
		face = d[2] > 0 ? 4 : 5;
		a = d[0] / az;
		b = d[1] / az;
	}
	return [face, (4 / Math.PI) * Math.atan(a), (4 / Math.PI) * Math.atan(b)];
}

/** The direction of face coordinates (inverse of `cubeFaceCoords`). */
export function cubeFaceDirection(face: number, s: number, t: number): [number, number, number] {
	const a = Math.tan((s * Math.PI) / 4);
	const b = Math.tan((t * Math.PI) / 4);
	const sign = face % 2 === 0 ? 1 : -1;
	const axis = face >> 1;
	const v: [number, number, number] =
		axis === 0 ? [sign, a, b] : axis === 1 ? [b, sign, a] : [a, b, sign];
	return normalize3(v);
}

function clamp01(x: number): number {
	return Math.min(1, Math.max(0, x));
}

function normalize3(v: readonly [number, number, number]): [number, number, number] {
	const n = Math.hypot(v[0], v[1], v[2]);
	return [v[0] / n, v[1] / n, v[2] / n];
}

function cross3(
	a: readonly [number, number, number],
	b: readonly [number, number, number]
): [number, number, number] {
	return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
