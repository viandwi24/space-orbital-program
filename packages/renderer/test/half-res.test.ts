import { describe, expect, test } from 'bun:test';
import {
	HALF_PLANET_SCALE,
	UPSAMPLE_TOLERANCE_OCTAVES,
	depthOctaves,
	depthSimilarity,
	upsampleWeights
} from '../src/half-res.ts';

const FAR = 1e10;
const LOG_FAR = Math.log2(FAR + 1);
/** The fragment depth the planet pass writes for a view-space distance z (planet.glsl.ts). */
const depthOf = (z: number): number => Math.log2(1 + z) / LOG_FAR;
const sum = (w: readonly number[]): number => w.reduce((a, b) => a + b, 0);

describe('upsample weights (plan 050)', () => {
	test('the half rung is half the side', () => {
		expect(HALF_PLANET_SCALE).toBe(0.5);
	});

	test('depth differences convert to octaves of distance', () => {
		expect(depthOctaves(depthOf(100), depthOf(200), FAR)).toBeCloseTo(Math.log2(201 / 101), 9);
		expect(depthOctaves(depthOf(100), depthOf(100), FAR)).toBe(0);
		expect(depthSimilarity(0)).toBe(1);
		expect(depthSimilarity(UPSAMPLE_TOLERANCE_OCTAVES)).toBeCloseTo(Math.exp(-1), 12);
		expect(depthSimilarity(3)).toBeLessThan(1e-9);
	});

	test('on a surface of one depth the weights are the bilinear ones and sum to 1', () => {
		const d = depthOf(300);
		for (const [fx, fy] of [
			[0, 0],
			[0.25, 0.75],
			[0.5, 0.5],
			[0.9, 0.1]
		] as const) {
			const w = upsampleWeights(fx, fy, [d, d, d, d], FAR);
			expect(sum(w)).toBeCloseTo(1, 12);
			expect(w[0]).toBeCloseTo((1 - fx) * (1 - fy), 12);
			expect(w[1]).toBeCloseTo(fx * (1 - fy), 12);
			expect(w[2]).toBeCloseTo((1 - fx) * fy, 12);
			expect(w[3]).toBeCloseTo(fx * fy, 12);
		}
	});

	test('a gently sloping surface is still filtered nearly bilinearly (grazing ground, 20 percent per texel: no weight moves by 0.1)', () => {
		const d = [depthOf(100), depthOf(120), depthOf(120), depthOf(144)] as const;
		const w = upsampleWeights(0.25, 0.25, d, FAR);
		const bilinear = [0.5625, 0.1875, 0.1875, 0.0625];
		for (let i = 0; i < 4; i++) expect(Math.abs(w[i]! - bilinear[i]!)).toBeLessThan(0.1);
	});

	test('across a depth edge (ground against sky, ridge against valley) nothing leaks over', () => {
		const sky = 1;
		const ground = depthOf(2000);
		// the pixel is in the ground texel's corner: the sky texels on the right get no weight
		const w = upsampleWeights(0.25, 0.25, [ground, sky, ground, sky], FAR);
		expect(w[1]).toBeLessThan(1e-9);
		expect(w[3]).toBeLessThan(1e-9);
		expect(w[0]! + w[2]!).toBeCloseTo(1, 9);
		// and the same from the other side
		const v = upsampleWeights(0.75, 0.25, [ground, sky, ground, sky], FAR);
		expect(v[0]).toBeLessThan(1e-9);
		expect(v[1]! + v[3]!).toBeCloseTo(1, 9);
		// a ridge 5 km away in front of a valley 25 km away
		const ridge = depthOf(5000);
		const valley = depthOf(25000);
		const r = upsampleWeights(0.25, 0.75, [ridge, valley, ridge, valley], FAR);
		expect(r[1]! + r[3]!).toBeLessThan(1e-3);
	});

	test('the nearest texel keeps its weight, so the sum is never zero and no weight is negative or NaN', () => {
		const depths = [0, 0.3, 0.7, 1] as const;
		for (let fx = 0; fx < 1; fx += 0.125) {
			for (let fy = 0; fy < 1; fy += 0.125) {
				const w = upsampleWeights(fx, fy, depths, FAR);
				expect(sum(w)).toBeCloseTo(1, 12);
				for (const x of w) {
					expect(Number.isFinite(x)).toBe(true);
					expect(x).toBeGreaterThanOrEqual(0);
				}
				const nearest = (fx >= 0.5 ? 1 : 0) + (fy >= 0.5 ? 2 : 0);
				expect(w[nearest]).toBeGreaterThanOrEqual(0.25 / 1.0001 - 1e-12);
			}
		}
	});

	test('the interpolated depth stays within the depths of the texels that carry weight', () => {
		const ground = depthOf(40);
		const w = upsampleWeights(0.3, 0.6, [ground, 1, ground, 1], FAR);
		const depth = w[0]! * ground + w[1]! * 1 + w[2]! * ground + w[3]! * 1;
		expect(Math.abs(depth - ground)).toBeLessThan(1e-6);
	});
});
