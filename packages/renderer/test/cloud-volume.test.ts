import { describe, expect, test } from 'bun:test';
import {
	CLOUD_FILL,
	CLOUD_GAIN_CAP,
	CLOUD_MAX_PATH,
	CLOUD_RADIANCE_KNEE,
	CLOUD_SIGMA,
	CLOUD_SUN_MU_MIN,
	CLOUD_THICKNESS,
	CLOUD_TOP,
	billowShade,
	cloudFill,
	EROSION_WEIGHTS,
	erosion,
	coverShape,
	cloudPhase,
	heightProfile,
	henyeyGreenstein,
	marchSlab,
	multiScatter,
	powder,
	rollOff,
	scatterGain,
	slabDensity,
	slabInterval,
	startOffset,
	sunOpticalDepth,
	type SlabSample
} from '../src/cloud-volume.ts';
import { CLOUD_ALTITUDE } from '../src/cloud-model.ts';

const R = 600_000;
const RB = R + CLOUD_ALTITUDE;
const RT = R + CLOUD_TOP;

describe('cloud slab geometry', () => {
	test('the slab sits above the old shell and below the cirrus', () => {
		expect(CLOUD_TOP).toBe(CLOUD_ALTITUDE + CLOUD_THICKNESS);
		expect(CLOUD_TOP).toBeLessThan(9_500);
		expect(CLOUD_MAX_PATH).toBeGreaterThan(CLOUD_THICKNESS);
	});

	test('straight up from the ground crosses the whole thickness', () => {
		const iv = slabInterval(R, 1, RB, RT)!;
		expect(iv.t0).toBeCloseTo(CLOUD_ALTITUDE, 3);
		expect(iv.t1).toBeCloseTo(CLOUD_TOP, 3);
	});

	test('straight down from above crosses the whole thickness', () => {
		const iv = slabInterval(R + 12_000, -1, RB, RT)!;
		expect(iv.t0).toBeCloseTo(12_000 - CLOUD_TOP, 3);
		expect(iv.t1).toBeCloseTo(12_000 - CLOUD_ALTITUDE, 3);
	});

	test('inside the slab the interval starts at the camera', () => {
		const iv = slabInterval(R + CLOUD_ALTITUDE + 400, 1, RB, RT)!;
		expect(iv.t0).toBe(0);
		expect(iv.t1).toBeCloseTo(CLOUD_THICKNESS - 400, 3);
		const down = slabInterval(R + CLOUD_ALTITUDE + 400, -1, RB, RT)!;
		expect(down.t0).toBe(0);
		expect(down.t1).toBeCloseTo(400, 3);
	});

	test('a ground hit clips the interval; a ground hit below the slab removes it', () => {
		const clipped = slabInterval(R + 12_000, -1, RB, RT, 12_000 - CLOUD_ALTITUDE - 300)!;
		expect(clipped.t1).toBeCloseTo(12_000 - CLOUD_ALTITUDE - 300, 3);
		expect(slabInterval(R + 12_000, -1, RB, RT, 5_000)).toBeNull();
	});

	test('a ray from above the slab that grazes past the planet gets the near stretch only', () => {
		// level ray at 12 km: it never reaches the slab's radius from above until the planet curves away from it
		const r0 = R + 12_000;
		const iv = slabInterval(r0, 0, RB, RT);
		expect(iv).toBeNull();
		// a ray tilted just below the horizontal enters the top shell and leaves it again without a base hit
		const mu = -0.17;
		const g = slabInterval(r0, mu, RB, RT)!;
		expect(g.t0).toBeGreaterThan(0);
		expect(g.t1).toBeGreaterThan(g.t0);
	});

	test('a ray that points away from the planet above the slab misses it', () => {
		expect(slabInterval(R + 12_000, 0.6, RB, RT)).toBeNull();
	});

	test('from the ground, a slightly tilted ray leaves the slab through its top', () => {
		const iv = slabInterval(R, 0.2, RB, RT)!;
		expect(iv.t0).toBeGreaterThan(CLOUD_ALTITUDE);
		expect(iv.t1).toBeGreaterThan(iv.t0);
		expect(iv.t1 - iv.t0).toBeGreaterThan(CLOUD_THICKNESS);
	});
});

describe('height profile', () => {
	test('flat base: zero at the base, full a little above it', () => {
		expect(heightProfile(0, 1)).toBe(0);
		expect(heightProfile(0.2, 1)).toBeCloseTo(1, 5);
	});

	test('thin cover has a low, soft top; heavy cover towers', () => {
		expect(heightProfile(0.75, 0)).toBeLessThan(0.05);
		expect(heightProfile(0.75, 1)).toBeGreaterThan(0.4);
		expect(heightProfile(1, 1)).toBe(0);
		for (let h = 0; h <= 1; h += 0.05) {
			expect(heightProfile(h, 0.2)).toBeLessThanOrEqual(heightProfile(h, 0.9) + 1e-9);
		}
	});

	test('stays inside 0..1 and out of range heights give 0 at both ends', () => {
		for (let h = -0.2; h <= 1.2; h += 0.1) {
			for (const c of [-1, 0, 0.5, 1, 2]) {
				const p = heightProfile(h, c);
				expect(p).toBeGreaterThanOrEqual(0);
				expect(p).toBeLessThanOrEqual(1);
			}
		}
		expect(heightProfile(-0.1, 1)).toBe(0);
		expect(heightProfile(1.1, 1)).toBe(0);
	});
});

describe('coverage shape', () => {
	test('no cloud in the skirts, full above the knee, monotonic', () => {
		expect(coverShape(0)).toBe(0);
		expect(coverShape(0.08)).toBe(0);
		expect(coverShape(0.55)).toBe(1);
		expect(coverShape(1)).toBe(1);
		let last = -1;
		for (let c = 0; c <= 1; c += 0.05) {
			const v = coverShape(c);
			expect(v).toBeGreaterThanOrEqual(last);
			last = v;
		}
	});
});

describe('slab density', () => {
	test('no cloud without cover, bounded 0..1, thin cover is eroded away by low noise', () => {
		for (let h = 0; h <= 1; h += 0.1) {
			for (let e = 0; e <= 1; e += 0.25) {
				expect(slabDensity(0, h, e)).toBe(0);
				const d = slabDensity(1, h, e);
				expect(d).toBeGreaterThanOrEqual(0);
				expect(d).toBeLessThanOrEqual(1);
			}
		}
		expect(slabDensity(0.2, 0.3, 0.1)).toBe(0);
	});

	test('a core is not forced to 1: it varies with the billow noise, more noise means more cloud', () => {
		const lo = slabDensity(1, 0.4, 0.15);
		const hi = slabDensity(1, 0.4, 0.85);
		expect(hi).toBeGreaterThan(lo);
		expect(lo).toBeGreaterThan(0.3);
		expect(lo).toBeLessThan(0.95);
	});

	test('the base is ragged: the same height has cloud under a high noise value and none under a low one', () => {
		expect(slabDensity(1, 0.02, 0.9)).toBeGreaterThan(slabDensity(1, 0.02, 0.1));
		expect(slabDensity(1, 0.02, 0.1)).toBe(0);
	});
});

describe('phase functions', () => {
	const integral = (f: (c: number) => number): number => {
		// integrate over the sphere: 2 pi * integral of f(cos) d(cos)
		const n = 20000;
		let s = 0;
		for (let i = 0; i < n; i++) s += f(-1 + ((i + 0.5) * 2) / n) * (2 / n);
		return 2 * Math.PI * s;
	};

	test('Henyey-Greenstein and the dual lobe integrate to 1', () => {
		expect(integral((c) => henyeyGreenstein(c, 0.6))).toBeCloseTo(1, 2);
		expect(integral(cloudPhase)).toBeCloseTo(1, 2);
	});

	test('forward scattering beats back scattering, with a back lobe above isotropy at the far end', () => {
		expect(cloudPhase(1)).toBeGreaterThan(cloudPhase(-1));
		expect(cloudPhase(-1)).toBeGreaterThan(cloudPhase(0));
	});

	test('multiple scattering equals the dual lobe at tau 0 times its three octaves and decays with depth', () => {
		const clear = multiScatter(0, 0.3);
		expect(clear).toBeGreaterThan(cloudPhase(0.3));
		let last = clear;
		for (const tau of [0.5, 1, 2, 4, 8, 16]) {
			const v = multiScatter(tau, 0.3);
			expect(v).toBeLessThan(last);
			last = v;
		}
		// the interior stays lit: the last octave sees a quarter of the extinction
		expect(multiScatter(8, 0.3)).toBeGreaterThan(0.05 * cloudPhase(0.3) * Math.exp(-8));
		expect(multiScatter(8, 0.3) / Math.exp(-8)).toBeGreaterThan(10);
	});

	test('powder darkens thin edges away from the sun and leaves the sun side alone', () => {
		expect(powder(0, -1)).toBeCloseTo(1 - 0.6, 5);
		expect(powder(0, 1)).toBeCloseTo(1, 5);
		expect(powder(5, -1)).toBeCloseTo(1, 1);
		for (const c of [-1, 0, 1]) expect(powder(0.3, c)).toBeLessThanOrEqual(1);
	});
});

describe('scatter gain', () => {
	test('is the isotropic-normalised phase times transmittance, capped at the sun-ward peak', () => {
		expect(scatterGain(0, 1)).toBe(CLOUD_GAIN_CAP);
		expect(scatterGain(0, -0.3)).toBeCloseTo(4 * Math.PI * multiScatter(0, -0.3), 10);
		for (const tau of [0, 1, 5, 20]) {
			for (let c = -1; c <= 1; c += 0.25)
				expect(scatterGain(tau, c)).toBeLessThanOrEqual(CLOUD_GAIN_CAP);
		}
	});
});

describe('radiance roll-off', () => {
	test('linear near zero, monotonic, never above the knee', () => {
		expect(rollOff(0)).toBe(0);
		expect(rollOff(0.01) / 0.01).toBeGreaterThan(0.99);
		let last = -1;
		for (const x of [0.1, 0.5, 1, 3, 10, 100, 1e6]) {
			const v = rollOff(x);
			expect(v).toBeGreaterThan(last);
			expect(v).toBeLessThan(CLOUD_RADIANCE_KNEE);
			last = v;
		}
	});
});

describe('billow shade', () => {
	test('cavities are darker than bulges, within 0.6..1, monotonic', () => {
		expect(billowShade(0)).toBeCloseTo(0.6, 10);
		expect(billowShade(1)).toBeCloseTo(1, 10);
		let last = 0;
		for (let e = 0; e <= 1; e += 0.1) {
			const v = billowShade(e);
			expect(v).toBeGreaterThanOrEqual(last);
			last = v;
		}
	});
});

describe('erosion octaves', () => {
	test('weights sum to 1; an all-0.5 noise gives 0.5; extremes reach 0 and 1 when all octaves are open', () => {
		expect(EROSION_WEIGHTS.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
		expect(erosion([0.5, 0.5, 0.5], 1)).toBeCloseTo(0.5, 10);
		expect(erosion([1, 1, 1], 1)).toBe(1);
		expect(erosion([0, 0, 0], 1)).toBe(0);
	});

	test('wide pixels lose the fine octaves: past the fade the result is the mean', () => {
		const n = [0.9, 0.1, 0.9];
		const fine = erosion(n, 1);
		const coarse = erosion(n, 2000);
		expect(coarse).toBeCloseTo(0.5, 10);
		expect(fine).not.toBeCloseTo(coarse, 3);
		// a footprint of 130 m has lost the 25 m octave but not the 210 m one
		expect(erosion([0.9, 0.5, 0.1], 130)).toBeGreaterThan(0.5);
		expect(erosion([0.5, 0.5, 0.1], 130)).toBeCloseTo(0.5, 10);
	});

	test('taking fewer octaves ignores the rest', () => {
		expect(erosion([0.9, 0.1, 0.1], 1, 1)).toBeCloseTo(erosion([0.9, 0.5, 0.5], 1, 3), 10);
	});
});

describe('diffuse fill', () => {
	test('full at the sunlit top, falling to 60 % where the beam is spent, and brighter high in the slab', () => {
		expect(cloudFill(0, 1)).toBeCloseTo(CLOUD_FILL, 10);
		let last = Infinity;
		for (const tau of [0, 0.2, 1, 3, 10, 50]) {
			const v = cloudFill(tau, 0.5);
			expect(v).toBeLessThan(last);
			expect(v).toBeLessThanOrEqual(CLOUD_FILL);
			last = v;
		}
		expect(cloudFill(50, 1)).toBeCloseTo(0.6 * CLOUD_FILL, 3);
		expect(cloudFill(5, 1)).toBeGreaterThan(cloudFill(5, 0));
	});
});

describe('sun optical depth through the profile', () => {
	test('zero at the top, deeper toward the base, deeper with cover and with a lower sun', () => {
		expect(sunOpticalDepth(1, 1, 1)).toBe(0);
		expect(sunOpticalDepth(0.15, 1, 1)).toBeGreaterThan(sunOpticalDepth(0.6, 1, 1));
		expect(sunOpticalDepth(0.3, 1, 1)).toBeGreaterThan(sunOpticalDepth(0.3, 0.4, 1));
		expect(sunOpticalDepth(0.3, 1, 0.5)).toBeGreaterThan(sunOpticalDepth(0.3, 1, 1));
		// the grazing floor keeps it finite
		expect(Number.isFinite(sunOpticalDepth(0, 1, 0))).toBe(true);
		expect(sunOpticalDepth(0, 1, 0)).toBe(sunOpticalDepth(0, 1, CLOUD_SUN_MU_MIN));
	});

	test('the base of a heavy cloud is dark (over one optical depth), the top bright', () => {
		expect(sunOpticalDepth(0.12, 1, CLOUD_SUN_MU_MIN)).toBeGreaterThan(1);
		expect(sunOpticalDepth(0.9, 1, 1)).toBeLessThan(0.5);
	});
});

describe('analytic march', () => {
	const uniform = (n: number, density: number, light = 1): SlabSample[] =>
		Array.from({ length: n }, () => ({ density, light }));

	test('alpha does not depend on the number of steps', () => {
		const length = 900;
		const ref = marchSlab(uniform(1, 0.7), length).alpha;
		for (const n of [2, 4, 6, 12, 48]) {
			const m = marchSlab(uniform(n, 0.7), length / n);
			expect(m.alpha).toBeCloseTo(ref, 10);
		}
		expect(ref).toBeCloseTo(1 - Math.exp(-0.7 * CLOUD_SIGMA * length), 10);
	});

	test('the radiance of a uniformly lit slab is its light times its alpha', () => {
		for (const n of [1, 5, 16]) {
			const m = marchSlab(uniform(n, 0.5, 0.8), 600 / n);
			expect(m.radiance).toBeCloseTo(0.8 * m.alpha, 10);
		}
	});

	test('empty path is clear, a very thick one is opaque, extra depth only adds opacity', () => {
		expect(marchSlab(uniform(5, 0), 200).alpha).toBe(0);
		expect(marchSlab(uniform(5, 1), 5000).alpha).toBeGreaterThan(0.999);
		const a = marchSlab(uniform(4, 0.2), 200).alpha;
		expect(marchSlab(uniform(4, 0.2), 200, 1.5).alpha).toBeGreaterThan(a);
	});

	test('light near the camera counts more than the same light behind it', () => {
		const lit: SlabSample[] = [
			{ density: 1, light: 1 },
			{ density: 1, light: 0 }
		];
		const unlit = [...lit].reverse();
		expect(marchSlab(lit, 300).radiance).toBeGreaterThan(marchSlab(unlit, 300).radiance);
	});

	test('a jittered start keeps the mean alpha of a uniform slab and moves each ray by at most a quarter of a step', () => {
		const dt = 200;
		expect(startOffset(0.5, dt)).toBe(0);
		expect(startOffset(0, dt)).toBe(-50);
		expect(startOffset(1, dt)).toBe(50);
		expect(startOffset(7, dt)).toBe(50);
		let sum = 0;
		const n = 64;
		for (let i = 0; i < n; i++) sum += startOffset((i + 0.5) / n, dt);
		expect(Math.abs(sum / n)).toBeLessThan(1e-9);
	});
});
