import { describe, expect, test } from 'bun:test';
import {
	aerialPerspective,
	atmosphereFor,
	horizonColour,
	hitsPlanet,
	luminance,
	skyAmbient,
	skyRadiance,
	sunTransmittance
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
