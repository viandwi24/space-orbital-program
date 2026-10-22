import { describe, expect, test } from 'bun:test';
import {
	GALACTIC_CENTRE,
	GALACTIC_POLE,
	STAR_CELL_MARGIN,
	STAR_LAYERS,
	STAR_PEAK_CAP,
	STAR_SIGMA_MIN_PX,
	cubeFaceCoords,
	cubeFaceDirection,
	octDecode,
	octEncode,
	skyMapSize,
	skyTexelAngle,
	starFlux,
	starMagnitude,
	starRadiance,
	starSigmaPx
} from '../src/sky-model.ts';
import { skyBakeFragment, skyMapGLSL } from '../src/shaders/starfield.glsl.ts';

describe('the night sky (plan 364, ADR 0306)', () => {
	test('the galactic frame is orthonormal', () => {
		const dot = (a: readonly number[], b: readonly number[]) =>
			a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
		expect(dot(GALACTIC_POLE, GALACTIC_POLE)).toBeCloseTo(1, 9);
		expect(dot(GALACTIC_CENTRE, GALACTIC_CENTRE)).toBeCloseTo(1, 9);
		expect(dot(GALACTIC_POLE, GALACTIC_CENTRE)).toBeCloseTo(0, 9);
	});

	test('magnitudes span each layer, faint stars far more common (counts grow as 10^(0.5 m))', () => {
		for (const L of STAR_LAYERS) {
			expect(starMagnitude(L, 1)).toBeCloseTo(L.magFaint, 9);
			expect(starMagnitude(L, 0)).toBeCloseTo(L.magBright, 9);
			const mid = (L.magBright + L.magFaint) / 2;
			let brighter = 0;
			const n = 10_000;
			for (let i = 0; i < n; i++) if (starMagnitude(L, (i + 0.5) / n) < mid) brighter++;
			const expected =
				(Math.pow(10, 0.5 * (mid - L.magFaint)) - Math.pow(10, -0.5 * (L.magFaint - L.magBright))) /
				(1 - Math.pow(10, -0.5 * (L.magFaint - L.magBright)));
			expect(brighter / n).toBeCloseTo(expected, 2);
			expect(brighter / n).toBeLessThan(0.25);
		}
	});

	test('no star is narrower than the floor, brighter ones are wider', () => {
		for (let m = -2; m <= 8; m += 0.25) expect(starSigmaPx(m)).toBeGreaterThanOrEqual(STAR_SIGMA_MIN_PX);
		expect(starSigmaPx(-1)).toBeGreaterThan(starSigmaPx(5));
		expect(starFlux(0) / starFlux(5)).toBeCloseTo(100, 6);
	});

	test('a star sampled at pixel centres sums to the same light wherever it falls: it cannot twinkle', () => {
		const px = 4e-4;
		for (const mag of [-1, 2, 4.5, 6.5]) {
			const flux = starFlux(mag);
			const sig = starSigmaPx(mag);
			const sums: number[] = [];
			for (let k = 0; k < 16; k++) {
				// sub-pixel offsets across a pixel, as a turning camera sweeps them
				const ox = (k % 4) / 4 + 0.07;
				const oy = Math.floor(k / 4) / 4 + 0.13;
				let sum = 0;
				for (let y = -8; y <= 8; y++)
					for (let x = -8; x <= 8; x++) {
						const d = Math.hypot(x - ox, y - oy) * px;
						sum += starRadiance(flux, d, px, sig) * px * px;
					}
				sums.push(sum);
			}
			const mean = sums.reduce((a, b) => a + b, 0) / sums.length;
			// within 6 % of each other (a faint star: of its flux too)
			expect((Math.max(...sums) - Math.min(...sums)) / mean).toBeLessThan(0.06);
			if (mag > 5) expect(Math.abs(mean / flux - 1)).toBeLessThan(0.03);
		}
	});

	test('small and crisp: at most about 2 px across, and never brighter than the cap under the bloom', () => {
		expect(starSigmaPx(-2) * 2.355).toBeLessThan(2.1);
		expect(starSigmaPx(6) * 2.355).toBeLessThan(1.5);
		const px = 3.5e-4;
		expect(starRadiance(starFlux(-2), 0, px, starSigmaPx(-2))).toBeLessThanOrEqual(STAR_PEAK_CAP);
		expect(STAR_PEAK_CAP).toBeLessThan(3);
	});

	test('a star stays inside its cell at the widest it is drawn on high (3 σ at 1080p, half size)', () => {
		const px = (2 * Math.tan(Math.PI / 6)) / 540;
		const L = STAR_LAYERS[0]!;
		const margin = (STAR_CELL_MARGIN * Math.PI) / 2 / L.cells;
		expect(3 * starSigmaPx(L.magBright) * px).toBeLessThan(margin * 1.6);
	});

	test('octahedral and cube-face mappings round-trip', () => {
		for (let i = 0; i < 200; i++) {
			const a = Math.sin(i * 12.9898) * 43758.5453;
			const b = Math.sin(i * 78.233) * 12345.678;
			const z = 2 * (a - Math.floor(a)) - 1;
			const phi = 2 * Math.PI * (b - Math.floor(b));
			const r = Math.sqrt(1 - z * z);
			const d: [number, number, number] = [r * Math.cos(phi), r * Math.sin(phi), z];
			const [u, v] = octEncode(d);
			const e = octDecode(u, v);
			for (let k = 0; k < 3; k++) expect(e[k]!).toBeCloseTo(d[k]!, 6);
			const [face, s, t] = cubeFaceCoords(d);
			expect(Math.abs(s)).toBeLessThanOrEqual(1);
			expect(Math.abs(t)).toBeLessThanOrEqual(1);
			const c = cubeFaceDirection(face, s, t);
			for (let k = 0; k < 3; k++) expect(c[k]!).toBeCloseTo(d[k]!, 6);
		}
	});

	test('map sizes and texel angles', () => {
		expect(skyMapSize(512)).toBe(512);
		expect(skyMapSize(1024)).toBe(1024);
		expect(skyTexelAngle(1024)).toBeCloseTo(0.00346, 4);
	});

	test('the GLSL holds one block per layer and no time (deterministic, never twinkles)', () => {
		expect(skyMapGLSL.match(/hash33i\(ivec3\(cell, face \* 64 \+ \d+\)\)/g)?.length).toBe(
			STAR_LAYERS.length * 2
		);
		expect(skyMapGLSL).not.toContain('uTime');
		expect(skyBakeFragment).not.toContain('uTime');
	});
});
