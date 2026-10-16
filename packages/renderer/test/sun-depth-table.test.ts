import { describe, expect, test } from 'bun:test';
import { atmosphereFor, columnDensity } from '../src/atmosphere-model.ts';
import {
	SUN_DEPTH_H,
	SUN_DEPTH_MU,
	horizonMu,
	sunDepthCoords,
	sunDepthExact,
	sunDepthLookup,
	sunDepthTable,
	sunDepthTexel
} from '../src/sun-depth-table.ts';

const atm = atmosphereFor(600_000, 70_000);
const table = sunDepthTable(atm);

/** Deterministic pseudo-random numbers in [0, 1). */
function rng(seed: number): () => number {
	let s = seed >>> 0;
	return () => {
		s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
		return s / 4294967296;
	};
}

describe('sun depth table', () => {
	test('the exact integral agrees with the 24-step column density of the CPU lighting model (Rayleigh; its Mie sum is coarse)', () => {
		for (const [h, mu] of [
			[0, 1],
			[0, 0.3],
			[2_000, 0.05],
			[20_000, -0.1],
			[60_000, 0.5]
		] as const) {
			const r = atm.radius + h;
			const exact = sunDepthExact(atm, r, mu)!;
			const [dr, dm] = columnDensity(atm, r, mu);
			expect(Math.abs(exact[0] - dr) / exact[0]).toBeLessThan(0.03);
			// the 24 uniform steps of the CPU model are too coarse for the 840 m Mie scale height: within 40 %
			expect(Math.abs(exact[1] - dm) / exact[1]).toBeLessThan(0.4);
		}
	});

	test('the horizon cosine is zero on the ground and falls with height', () => {
		expect(horizonMu(atm.radius, atm.radius)).toBe(0);
		let last = 0;
		for (let h = 1_000; h <= 70_000; h += 3_000) {
			const m = horizonMu(atm.radius, atm.radius + h);
			expect(m).toBeLessThan(last);
			last = m;
		}
	});

	test('rays under the horizon are blocked, rays on or above it are not', () => {
		expect(sunDepthCoords(atm, 0, -0.01)).toBeNull();
		expect(sunDepthCoords(atm, 0, 0)).not.toBeNull();
		const muH = horizonMu(atm.radius, atm.radius + 20_000);
		expect(sunDepthCoords(atm, 20_000, muH - 0.01)).toBeNull();
		expect(sunDepthCoords(atm, 20_000, muH + 0.01)).not.toBeNull();
		expect(sunDepthLookup(atm, table, 0, -0.2)).toBeNull();
	});

	test('texel coordinates invert: a texel centre looks itself up', () => {
		for (const [i, j] of [
			[0, 0],
			[10, 3],
			[64, 32],
			[SUN_DEPTH_MU - 1, SUN_DEPTH_H - 1],
			[100, 50]
		] as const) {
			const { h, mu } = sunDepthTexel(atm, i, j);
			const c = sunDepthCoords(atm, h, mu)!;
			expect(c.u * (SUN_DEPTH_MU - 1)).toBeCloseTo(i, 3);
			expect(c.v * (SUN_DEPTH_H - 1)).toBeCloseTo(j, 3);
		}
	});

	test('the bilinear lookup is within 2 % of a fine integration over 3 000 random rays', () => {
		const r = rng(5);
		let worstR = 0;
		let worstM = 0;
		let worstT = 0;
		for (let n = 0; n < 3_000; n++) {
			const h = Math.pow(r(), 2) * atm.height;
			const muH = horizonMu(atm.radius, atm.radius + h);
			const mu = muH + Math.pow(r(), 2) * (1 - muH);
			const exact = sunDepthExact(atm, atm.radius + h, mu)!;
			const got = sunDepthLookup(atm, table, h, mu)!;
			// relative error where the air matters; near the top of the atmosphere (tens of metres of depth) an absolute one
			worstR = Math.max(worstR, Math.abs(got[0] - exact[0]) / Math.max(exact[0], 1_000));
			worstM = Math.max(worstM, Math.abs(got[1] - exact[1]) / Math.max(exact[1], 5_000));
			// what the eye sees: transmittance of the blue channel
			const tExact = Math.exp(-(atm.betaRayleigh[2] * exact[0] + atm.betaMie * 1.1 * exact[1]));
			const tGot = Math.exp(-(atm.betaRayleigh[2] * got[0] + atm.betaMie * 1.1 * got[1]));
			worstT = Math.max(worstT, Math.abs(tGot - tExact));
		}
		expect(worstR).toBeLessThan(0.02);
		expect(worstM).toBeLessThan(0.03);
		expect(worstT).toBeLessThan(0.003);
	});

	test('depth grows toward the horizon and with lower starting height (more air on the way)', () => {
		const up = sunDepthLookup(atm, table, 0, 1)!;
		const slant = sunDepthLookup(atm, table, 0, 0.1)!;
		const grazing = sunDepthLookup(atm, table, 0, 0.0)!;
		expect(slant[0]).toBeGreaterThan(up[0] * 5);
		expect(grazing[0]).toBeGreaterThan(slant[0]);
		const high = sunDepthLookup(atm, table, 40_000, 1)!;
		expect(high[0]).toBeLessThan(up[0] * 0.1);
	});

	test('the table is about 32 kB and finite', () => {
		expect(table.byteLength).toBe(SUN_DEPTH_MU * SUN_DEPTH_H * 2 * 2);
		expect(table.length).toBe(SUN_DEPTH_MU * SUN_DEPTH_H * 2);
	});
});
