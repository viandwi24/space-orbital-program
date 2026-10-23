/**
 * Plan 381 / ADR 0318: a body's look from its appearance. Maps are deterministic, follow the
 * pattern, the rings have their gap, the sky's shares follow its colour, and a body with no
 * appearance keeps the regolith and the home sky of before.
 */
import { describe, expect, test } from 'bun:test';
import {
	cloudMap,
	hexLinear,
	lookSeed,
	ringStrip,
	RING_TEXELS,
	skyOptics,
	surfaceMap
} from '../src/body-look.ts';
import { whiteLook } from '../src/moon.ts';

const SMALL = { width: 64, height: 32 };
const at = (map: Uint8Array, i: number, j: number): number[] => {
	const o = (j * SMALL.width + i) * 4;
	return [map[o]!, map[o + 1]!, map[o + 2]!, map[o + 3]!];
};
const luminance = (c: number[]): number => 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;

describe('body look (plan 381)', () => {
	test('a map is the same for the same body and differs between bodies', () => {
		const look = { palette: ['#b0603a', '#7c3c25', '#d38c5c'] };
		const a = surfaceMap(look, lookSeed('stock.ochre'), SMALL);
		expect(surfaceMap(look, lookSeed('stock.ochre'), SMALL)).toEqual(a);
		expect(surfaceMap(look, lookSeed('stock.kiln'), SMALL)).not.toEqual(a);
		expect(a.length).toBe(SMALL.width * SMALL.height * 4);
	});

	test('polar caps are white at the poles and the palette at the equator', () => {
		const map = surfaceMap(
			{ palette: ['#b0603a', '#7c3c25'], pattern: 'polar-caps' },
			lookSeed('stock.ochre'),
			SMALL
		);
		for (let i = 0; i < SMALL.width; i += 8) {
			expect(luminance(at(map, i, 0))).toBeGreaterThan(220);
			expect(luminance(at(map, i, SMALL.height - 1))).toBeGreaterThan(220);
			expect(luminance(at(map, i, SMALL.height / 2))).toBeLessThan(160);
		}
	});

	test('bands run along latitude: colour changes far more north-south than east-west', () => {
		const map = surfaceMap(
			{ palette: ['#e2c79a', '#8c5a3a', '#f3e6c8'], pattern: 'bands' },
			lookSeed('stock.tempest'),
			SMALL
		);
		let ew = 0;
		let ns = 0;
		for (let j = 1; j < SMALL.height - 1; j++) {
			for (let i = 0; i < SMALL.width - 1; i++) {
				ew += Math.abs(luminance(at(map, i + 1, j)) - luminance(at(map, i, j)));
				ns += Math.abs(luminance(at(map, i, j + 1)) - luminance(at(map, i, j)));
			}
		}
		expect(ns).toBeGreaterThan(2 * ew);
	});

	test('lineae draw dark cracks over bright ice', () => {
		const map = surfaceMap(
			{ palette: ['#dfe7ea', '#8c5a44', '#b9d4e0'], pattern: 'lineae' },
			lookSeed('stock.rime'),
			{ width: 256, height: 128 }
		);
		let dark = 0;
		for (let o = 0; o < map.length; o += 4) if (map[o]! < 180) dark++;
		const share = dark / (map.length / 4);
		expect(share).toBeGreaterThan(0.02);
		expect(share).toBeLessThan(0.4);
	});

	test('clouds carry the cover in alpha; rings fade at the edges and have a gap', () => {
		const clouds = cloudMap({ color: '#eedcae', altitude: 48_000, opacity: 0.96 }, 1, SMALL);
		expect(Math.min(...Array.from({ length: 50 }, (_, k) => clouds[k * 4 + 3]!))).toBeGreaterThan(180);
		const strip = ringStrip({ inner: 1, outer: 2, color: '#d8c7a4', opacity: 0.7 }, 5);
		const alpha = (t: number): number => strip[Math.floor(t * (RING_TEXELS - 1)) * 4 + 3]!;
		expect(alpha(0)).toBeLessThan(20);
		expect(alpha(0.999)).toBeLessThan(20);
		expect(alpha(0.62)).toBeLessThan(alpha(0.4));
	});

	test("the sky's shares follow its colour; no appearance keeps the home sky", () => {
		expect(skyOptics(undefined)).toEqual({ rayleigh: [1, 1, 1], mie: 1 });
		const ochre = skyOptics({ palette: ['#b0603a'], sky: '#d6a27a', haze: 0.35 });
		// Earth's blue-heavy shares turned toward red: red scatters more than before, blue less
		expect(ochre.rayleigh[0]).toBeGreaterThan(1);
		expect(ochre.rayleigh[2]).toBeLessThan(0.5);
		expect(ochre.mie).toBeCloseTo(2.75, 6);
		const c = hexLinear('#ffffff');
		expect(c).toEqual([1, 1, 1]);
	});

	test('a body without appearance draws its regolith through a white map', () => {
		const w = whiteLook();
		expect(Array.from(w.image.data as Uint8Array)).toEqual([255, 255, 255, 255]);
	});
});
