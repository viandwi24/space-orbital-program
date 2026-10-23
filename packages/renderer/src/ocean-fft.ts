/**
 * The CPU reference of the ocean's FFT (plan 401): a Phillips spectrum from the wind, its
 * seeded amplitudes, the time evolution by the deep-water dispersion relation, and the 2D inverse
 * FFT that turns it into the sea's height. The WebGPU compute pass does the same arithmetic on a
 * 64² grid; this is what the tests pin down and what a WebGL2 build could use to bake a patch.
 * Complex arrays are split into real and imaginary `Float64Array`s of `n * n`, row-major
 * (`x` fastest), frequency index `0..n-1` meaning `0..n/2-1, -n/2..-1`.
 */
import { WAVE_GRAVITY } from './water-model.ts';

export interface OceanParams {
	/** Grid side, a power of two. */
	n: number;
	/** Side of the tile, m. */
	size: number;
	/** Wind speed at 10 m, m/s, and its direction, rad. */
	windSpeed: number;
	windDirection: number;
	/** Phillips amplitude constant. */
	amplitude?: number;
	/** Waves shorter than this are damped, m. */
	smallest?: number;
	seed: number;
}

/** Mulberry32: a small deterministic generator. */
export function rng(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/** The signed wave number of frequency index `i` on a grid of `n` over `size` metres. */
export const waveVector = (i: number, n: number, size: number): number =>
	((i < n / 2 ? i : i - n) * 2 * Math.PI) / size;

/** The Phillips spectrum P(k) for a wave vector (kx, ky) and the wind. */
export function phillips(kx: number, ky: number, p: OceanParams): number {
	const k2 = kx * kx + ky * ky;
	if (k2 < 1e-12) return 0;
	const k = Math.sqrt(k2);
	const L = (p.windSpeed * p.windSpeed) / WAVE_GRAVITY;
	const along = (kx * Math.cos(p.windDirection) + ky * Math.sin(p.windDirection)) / k;
	// waves against the wind are weak but not absent
	const align = along * along * (along < 0 ? 0.25 : 1);
	const small = p.smallest ?? 0.2;
	return (
		((p.amplitude ?? 1e-3) * Math.exp(-1 / (k2 * L * L)) * align * Math.exp(-k2 * small * small)) /
		(k2 * k2)
	);
}

/** The spectrum's expected energy: the sum of P over the grid, which is the height variance. */
export function expectedEnergy(p: OceanParams): number {
	let sum = 0;
	for (let y = 0; y < p.n; y++) {
		for (let x = 0; x < p.n; x++) {
			sum += phillips(waveVector(x, p.n, p.size), waveVector(y, p.n, p.size), p);
		}
	}
	return sum;
}

export interface ComplexField {
	re: Float64Array;
	im: Float64Array;
}

/**
 * The seeded initial amplitudes: the Phillips amplitude `sqrt(P(k))` with a random phase per mode, so
 * the energy is the spectrum's exactly (a Rayleigh-distributed amplitude would put 30 % noise on
 * the few low modes that hold most of it). Deterministic for a seed.
 */
export function initialSpectrum(p: OceanParams): ComplexField {
	const { n } = p;
	const r = rng(p.seed);
	const re = new Float64Array(n * n);
	const im = new Float64Array(n * n);
	for (let y = 0; y < n; y++) {
		for (let x = 0; x < n; x++) {
			const amp = Math.sqrt(phillips(waveVector(x, n, p.size), waveVector(y, n, p.size), p));
			const phase = 2 * Math.PI * r();
			re[y * n + x] = Math.cos(phase) * amp;
			im[y * n + x] = Math.sin(phase) * amp;
		}
	}
	return { re, im };
}

/** The energy of a spectrum: the sum of |h0|², which is `expectedEnergy` for the spectrum it was made from. */
export function spectrumEnergy(h0: ComplexField): number {
	let sum = 0;
	for (let i = 0; i < h0.re.length; i++) sum += h0.re[i]! ** 2 + h0.im[i]! ** 2;
	return sum;
}

/** h(k, t) = h0(k) e^{iωt} + conj(h0(-k)) e^{-iωt}, ω = sqrt(g |k|): a real field after the inverse FFT. */
export function evolve(h0: ComplexField, p: OceanParams, t: number): ComplexField {
	const { n } = p;
	const re = new Float64Array(n * n);
	const im = new Float64Array(n * n);
	for (let y = 0; y < n; y++) {
		for (let x = 0; x < n; x++) {
			const i = y * n + x;
			const j = ((n - y) % n) * n + ((n - x) % n);
			const k = Math.hypot(waveVector(x, n, p.size), waveVector(y, n, p.size));
			const w = Math.sqrt(WAVE_GRAVITY * k) * t;
			const c = Math.cos(w);
			const s = Math.sin(w);
			// h0(k) e^{iw}
			const ar = h0.re[i]! * c - h0.im[i]! * s;
			const ai = h0.re[i]! * s + h0.im[i]! * c;
			// conj(h0(-k)) e^{-iw}
			const br = h0.re[j]! * c - h0.im[j]! * s;
			const bi = -(h0.re[j]! * s + h0.im[j]! * c);
			re[i] = ar + br;
			im[i] = ai + bi;
		}
	}
	return { re, im };
}

/** In-place radix-2 FFT of `n` values at `offset` with `stride`; inverse without the 1/n scale. */
function fft1d(
	re: Float64Array,
	im: Float64Array,
	offset: number,
	stride: number,
	n: number,
	inverse: boolean
): void {
	for (let i = 1, j = 0; i < n; i++) {
		let bit = n >> 1;
		for (; j & bit; bit >>= 1) j ^= bit;
		j ^= bit;
		if (i < j) {
			const a = offset + i * stride;
			const b = offset + j * stride;
			[re[a], re[b]] = [re[b]!, re[a]!];
			[im[a], im[b]] = [im[b]!, im[a]!];
		}
	}
	for (let len = 2; len <= n; len <<= 1) {
		const ang = ((inverse ? 1 : -1) * 2 * Math.PI) / len;
		const wr = Math.cos(ang);
		const wi = Math.sin(ang);
		for (let i = 0; i < n; i += len) {
			let cr = 1;
			let ci = 0;
			for (let k = 0; k < len / 2; k++) {
				const a = offset + (i + k) * stride;
				const b = offset + (i + k + len / 2) * stride;
				const tr = re[b]! * cr - im[b]! * ci;
				const ti = re[b]! * ci + im[b]! * cr;
				re[b] = re[a]! - tr;
				im[b] = im[a]! - ti;
				re[a] = re[a]! + tr;
				im[a] = im[a]! + ti;
				const nr = cr * wr - ci * wi;
				ci = cr * wi + ci * wr;
				cr = nr;
			}
		}
	}
}

/** The 2D inverse FFT of `f` (unscaled: a single unit mode gives a unit wave), in place. */
export function ifft2d(f: ComplexField, n: number): ComplexField {
	for (let y = 0; y < n; y++) fft1d(f.re, f.im, y * n, 1, n, true);
	for (let x = 0; x < n; x++) fft1d(f.re, f.im, x, n, n, true);
	return f;
}

/** The sea's height field at time `t`: the evolved spectrum, inverse transformed (real part). */
export function oceanHeights(h0: ComplexField, p: OceanParams, t: number): Float64Array {
	return ifft2d(evolve(h0, p, t), p.n).re;
}
