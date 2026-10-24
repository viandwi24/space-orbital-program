import { describe, expect, test } from 'bun:test';
import {
	aerialPerspective,
	applyAir,
	columnDensity,
	atmosphereFor,
	horizonColour,
	hitsPlanet,
	luminance,
	OZONE,
	OZONE_ABSORPTION,
	OZONE_STRENGTH,
	ozoneDensity,
	skyAmbient,
	skyRadiance,
	sunTransmittance,
	TERRAIN_VEIL,
	terrainVeil
} from '../src/atmosphere-model.ts';
import { DEG } from '../src/vec.ts';

const atm = atmosphereFor(600_000, 70_000);

describe('atmosphere model', () => {
	test('noon zenith is blue: blue exceeds green exceeds red', () => {
		const [r, g, b] = skyRadiance(atm, 0, 85 * DEG, 60 * DEG, 0);
		expect(b).toBeGreaterThan(g);
		expect(g).toBeGreaterThan(r);
		expect(luminance([r, g, b])).toBeGreaterThan(0.05);
	});

	test('direct sun light reddens as the sun lowers (red/blue ratio rises monotonically)', () => {
		let last = 0;
		for (const e of [60, 30, 15, 8, 4, 2, 1]) {
			const [r, , b] = sunTransmittance(atm, 0, e * DEG);
			const ratio = r / b;
			expect(ratio).toBeGreaterThan(last);
			last = ratio;
		}
		expect(last).toBeGreaterThan(3); // clearly orange at 1 degree
	});

	test('sunset sky near the sun is redder than the noon zenith', () => {
		const noon = skyRadiance(atm, 0, 85 * DEG, 60 * DEG, 0);
		const dusk = skyRadiance(atm, 0, 5 * DEG, 3 * DEG, 0);
		expect(dusk[0] / dusk[2]).toBeGreaterThan(noon[0] / noon[2]);
	});

	test('transmittance is monotonic in altitude and 1 above the atmosphere', () => {
		let last = 0;
		for (const h of [0, 2_000, 8_000, 20_000, 50_000, 71_000]) {
			const t = sunTransmittance(atm, h, 20 * DEG)[2];
			expect(t).toBeGreaterThanOrEqual(last);
			last = t;
		}
		expect(last).toBeCloseTo(1, 6);
	});

	test('sky luminance at 200 km altitude looking at the horizon is below 1 % of the ground value', () => {
		const ground = luminance(skyRadiance(atm, 0, 10 * DEG, 40 * DEG, 1));
		const space = luminance(skyRadiance(atm, 200_000, 85 * DEG, 40 * DEG, 1));
		expect(space).toBeLessThan(ground * 0.01);
	});

	test('limb of the planet seen from orbit is lit on the day side and dark on the night side', () => {
		// looking just above the geometric horizon from 100 km
		const horizon = Math.acos(600_000 / 700_000); // dip below horizontal
		const day = luminance(skyRadiance(atm, 100_000, -horizon + 0.5 * DEG, 60 * DEG, Math.PI));
		const night = luminance(skyRadiance(atm, 100_000, -horizon + 0.5 * DEG, -30 * DEG, Math.PI));
		expect(day).toBeGreaterThan(night * 20);
	});

	test('a ray into the ground hits the planet, a ray up does not', () => {
		expect(hitsPlanet(atm, 600_010, -0.5)).toBe(true);
		expect(hitsPlanet(atm, 600_010, 0.5)).toBe(false);
	});

	test('ambient and horizon colours are finite and positive at noon', () => {
		for (const c of [skyAmbient(atm, 0, 50 * DEG), horizonColour(atm, 0, 50 * DEG)]) {
			for (const v of c) {
				expect(Number.isFinite(v)).toBe(true);
				expect(v).toBeGreaterThan(0);
			}
		}
	});
});

describe('aerial perspective (ADR 0037)', () => {
	/** The atmosphere of plan 019 to 025: scattering layer = pressure scale height, constant boost on Mie. */
	const legacy = {
		...atm,
		rayleighHeight: 5_600,
		betaRayleigh: [8.3e-6, 19.3e-6, 47.3e-6] as [number, number, number],
		mieBoost: atm.skyBoost
	};
	const sunEl = 35 * DEG;
	/** Radiance of dark ground (albedo 0.1) under the sun and the sky at sea level. */
	const darkGround = (a: typeof atm): number => {
		const sunT = sunTransmittance(a, 0, sunEl);
		const amb = skyAmbient(a, 0, sunEl);
		return luminance(
			[0, 1, 2].map(
				(c) => (0.1 / Math.PI) * (a.sunIrradiance * sunT[c]! * Math.sin(sunEl) + amb[c]! * Math.PI)
			) as [number, number, number]
		);
	};
	const veil = (a: typeof atm, altitude: number, distance: number): number => {
		const el = -Math.asin(Math.min(altitude / distance, 1));
		const ap = aerialPerspective(a, altitude, Math.min(el, -0.05), distance, sunEl, 1);
		return luminance(ap.inscatter) / darkGround(a);
	};

	test('a 10 km slant path over dark ground has a veil of at most 0.6 of the ground at 3, 6 and 10 km altitude', () => {
		for (const alt of [3_000, 6_000, 10_000]) {
			expect(veil(atm, alt, 10_000)).toBeLessThanOrEqual(0.6);
			// and it used to be worse: the change is what fixes the milky land
			expect(veil(legacy, alt, 10_000)).toBeGreaterThan(veil(atm, alt, 10_000) * 1.3);
		}
	});

	test('the sky colour is unchanged: zenith radiance and sun transmittance stay within 5 %', () => {
		for (const [view, sun] of [
			[85, 60],
			[45, 35],
			[20, 20]
		] as const) {
			const a = skyRadiance(atm, 0, view * DEG, sun * DEG, 0.5);
			const b = skyRadiance(legacy, 0, view * DEG, sun * DEG, 0.5);
			for (let c = 0; c < 3; c++) expect(Math.abs(a[c]! / b[c]! - 1)).toBeLessThan(0.05);
		}
		for (const e of [60, 30, 10]) {
			const a = sunTransmittance(atm, 0, e * DEG);
			const b = sunTransmittance(legacy, 0, e * DEG);
			for (let c = 0; c < 3; c++) expect(Math.abs(a[c]! - b[c]!)).toBeLessThan(0.05);
		}
	});

	test('the vertical optical depth is the same, only the density near the ground is lower', () => {
		const vertical = (a: typeof atm) => a.betaRayleigh[2]! * a.rayleighHeight;
		expect(vertical(atm)).toBeCloseTo(vertical(legacy), 6);
		expect(atm.betaRayleigh[2]!).toBeLessThan(legacy.betaRayleigh[2]!);
	});

	test('the veil grows with distance and the surface fades with it', () => {
		let lastVeil = 0;
		let lastT = 1;
		for (const d of [2_000, 5_000, 10_000, 20_000, 40_000]) {
			const ap = aerialPerspective(atm, 3_000, -0.15, d, sunEl, 1);
			expect(luminance(ap.inscatter)).toBeGreaterThan(lastVeil);
			expect(luminance(ap.transmittance)).toBeLessThan(lastT);
			lastVeil = luminance(ap.inscatter);
			lastT = luminance(ap.transmittance);
		}
	});
});

describe('terrain veil (plan 039)', () => {
	test('thin up to 20 km, back to the sky at 90 km, monotone and smooth in between', () => {
		expect(terrainVeil(0)).toBe(TERRAIN_VEIL.near);
		expect(terrainVeil(TERRAIN_VEIL.fadeFrom)).toBe(TERRAIN_VEIL.near);
		expect(terrainVeil(TERRAIN_VEIL.fadeTo)).toBe(1);
		expect(terrainVeil(400_000)).toBe(1);
		let last: number = TERRAIN_VEIL.near;
		for (let d = 0; d <= 120_000; d += 1_000) {
			const v = terrainVeil(d);
			expect(v).toBeGreaterThanOrEqual(last - 1e-12);
			expect(v - last).toBeLessThan(0.02);
			last = v;
		}
	});
	test('the haze of ADR 0037 only gets lighter: at 10 km the veil is at most half of the model veil, which was already under 0.6 of the ground', () => {
		expect(terrainVeil(10_000)).toBeLessThanOrEqual(0.5);
		for (const altitude of [3_000, 6_000, 10_000]) {
			const ap = aerialPerspective(atm, altitude, -0.1, 10_000, 40 * DEG, 1);
			expect(luminance(ap.inscatter) * terrainVeil(10_000)).toBeLessThan(luminance(ap.inscatter));
		}
	});
});

describe('ozone layer (plan 054, ADR 0069)', () => {
	const noOzone = { ...atm, betaOzone: [0, 0, 0] as [number, number, number] };

	test('the density is a tent: 0 at 10 km, 1 at 25 km, 0 at 40 km, linear between, 0 outside', () => {
		expect(ozoneDensity(0)).toBe(0);
		expect(ozoneDensity(OZONE.base)).toBe(0);
		expect(ozoneDensity(17_500)).toBeCloseTo(0.5, 12);
		expect(ozoneDensity(OZONE.peak)).toBe(1);
		expect(ozoneDensity(32_500)).toBeCloseTo(0.5, 12);
		expect(ozoneDensity(OZONE.top)).toBe(0);
		expect(ozoneDensity(70_000)).toBe(0);
	});

	test("the absorption coefficients are Hillaire's (0.650, 1.881, 0.085) x 1e-6 per metre: green most, blue least (the Chappuis band)", () => {
		expect(OZONE_ABSORPTION[0]).toBeCloseTo(0.65e-6, 12);
		expect(OZONE_ABSORPTION[1]).toBeCloseTo(1.881e-6, 12);
		expect(OZONE_ABSORPTION[2]).toBeCloseTo(0.085e-6, 12);
		expect(OZONE_ABSORPTION[1]).toBeGreaterThan(OZONE_ABSORPTION[0]);
		expect(OZONE_ABSORPTION[0]).toBeGreaterThan(OZONE_ABSORPTION[2]);
		for (let c = 0; c < 3; c++)
			expect(atm.betaOzone[c]!).toBeCloseTo(OZONE_ABSORPTION[c]! * OZONE_STRENGTH, 15);
	});

	test('the column straight up is the tent area (15 km) times the absorption: 0.1 optical depth in green', () => {
		const [, , column] = columnDensity(atm, atm.radius, 1);
		expect(Math.abs(column / 15_000 - 1)).toBeLessThan(0.01);
		expect(atm.betaOzone[1]! * column).toBeCloseTo(0.0988, 2);
	});

	test('a low sun loses green: 0.7 of the no-ozone value at the horizon, red 0.88, blue untouched', () => {
		const a = sunTransmittance(atm, 0, 0);
		const b = sunTransmittance(noOzone, 0, 0);
		expect(a[1] / b[1]).toBeLessThan(0.75);
		expect(a[1] / b[1]).toBeGreaterThan(0.6);
		expect(a[0] / b[0]).toBeGreaterThan(0.8);
		expect(a[2] / b[2]).toBeGreaterThan(0.97);
	});

	test('at noon the ozone costs the sun less than 12 percent of its green and the sky colour stays blue', () => {
		const a = sunTransmittance(atm, 0, 60 * DEG);
		const b = sunTransmittance(noOzone, 0, 60 * DEG);
		expect(a[1] / b[1]).toBeGreaterThan(0.88);
		const [r, g, bl] = skyRadiance(atm, 0, 85 * DEG, 60 * DEG, 0);
		expect(bl).toBeGreaterThan(g);
		expect(g).toBeGreaterThan(r);
	});

	test('twilight zenith is bluer-violet with ozone: blue to green is at least 1.4 times the no-ozone ratio with the sun 2 to 8 degrees below the horizon', () => {
		for (const e of [-2, -4, -6, -8]) {
			const a = skyRadiance(atm, 0, 80 * DEG, e * DEG, 0);
			const b = skyRadiance(noOzone, 0, 80 * DEG, e * DEG, 0);
			expect(a[2] / a[1] / (b[2] / b[1])).toBeGreaterThan(1.4);
			expect(a[2]).toBeGreaterThan(a[1]);
		}
	});

	test('ozone only absorbs: in-scatter along a path never exceeds the no-ozone value, transmittance never rises', () => {
		for (const [view, sun] of [
			[10, 5],
			[40, -3],
			[80, 20]
		] as const) {
			const a = skyRadiance(atm, 0, view * DEG, sun * DEG, 0.4);
			const b = skyRadiance(noOzone, 0, view * DEG, sun * DEG, 0.4);
			for (let c = 0; c < 3; c++) expect(a[c]!).toBeLessThanOrEqual(b[c]! * 1.000001);
		}
		const ap = aerialPerspective(atm, 3_000, -0.1, 30_000, 20 * DEG, 1);
		const bp = aerialPerspective(noOzone, 3_000, -0.1, 30_000, 20 * DEG, 1);
		for (let c = 0; c < 3; c++)
			expect(ap.transmittance[c]!).toBeLessThanOrEqual(bp.transmittance[c]!);
	});

	test('a path that never reaches 10 km sees no ozone: aerial perspective over the ground is unchanged', () => {
		const ap = aerialPerspective(atm, 1_000, -0.02, 8_000, 35 * DEG, 1);
		const bp = aerialPerspective(noOzone, 1_000, -0.02, 8_000, 35 * DEG, 1);
		for (let c = 0; c < 3; c++) {
			expect(ap.transmittance[c]!).toBeCloseTo(bp.transmittance[c]!, 12);
			// the sun's path to the point still crosses the layer
			expect(Math.abs(ap.inscatter[c]! / bp.inscatter[c]! - 1)).toBeLessThan(0.15);
		}
	});
});

describe("a body's own air coefficients (plan 405)", () => {
	test('no coefficients leave the air as it was; they scale it field by field', () => {
		expect(applyAir(atm, undefined)).toBe(atm);
		const red = applyAir(atm, { rayleigh: [3, 1, 0.5], mie: 2, mieG: 0.4, skyBoost: 1.5 });
		expect(red.betaRayleigh[0]).toBeCloseTo(atm.betaRayleigh[0] * 3, 12);
		expect(red.betaRayleigh[2]).toBeCloseTo(atm.betaRayleigh[2] * 0.5, 12);
		expect(red.betaMie).toBeCloseTo(atm.betaMie * 2, 12);
		expect(red.mieG).toBe(0.4);
		expect(red.skyBoost).toBeCloseTo(atm.skyBoost * 1.5, 12);
		expect(red.rayleighHeight).toBe(atm.rayleighHeight);
	});
	test('a redder Rayleigh makes the zenith less blue than the stock air', () => {
		const stock = skyRadiance(atm, 0, 85 * DEG, 60 * DEG, 0);
		const mod = skyRadiance(applyAir(atm, { rayleigh: [4, 1, 0.3] }), 0, 85 * DEG, 60 * DEG, 0);
		expect(mod[2] / mod[0]).toBeLessThan(stock[2] / stock[0]);
	});
});
