/**
 * The vessel plan 007's exit test flies must be able to reach orbit. These tests compute its mass,
 * thrust-to-weight and ideal Δv (Tsiolkovsky) from the *registered definitions*, so retuning a part
 * so the vessel can no longer make it fails here instead of in the sim.
 */
import { describe, expect, test } from 'bun:test';
import {
	G0,
	HOME_MU,
	SEA_LEVEL_PRESSURE,
	containerConfigSchema,
	engineOutput
} from '../src/index.ts';
import { loaded } from './helpers.ts';

const { registries } = loaded;
const R = registries.bodies.get('stock.home')!.radius;
const SURFACE_G = HOME_MU / R ** 2;

const dry = (part: string): number => registries.parts.get(part)!.mass;
function propellantMass(part: string): number {
	const entry = registries.parts
		.get(part)!
		.modules?.find(([id]) => id === 'stock.resource-container');
	if (!entry) return 0;
	const { contents } = containerConfigSchema.parse(entry[1]);
	return Object.entries(contents)
		.filter(([id]) => id !== 'stock.electric-charge')
		.reduce((sum, [id, c]) => sum + c.amount * registries.resources.get(id)!.density, 0);
}
const wet = (part: string): number => dry(part) + propellantMass(part);
const engineConfig = {
	thrust: 215_000,
	ispVacuum: 300,
	ispSeaLevel: 280,
	propellants: [{ resource: 'stock.liquid-fuel', ratio: 0.9 }]
};

/** Parts top to bottom; the decoupler sits between `upper` and `lower` (it leaves with `lower`). */
function twoStage(upper: string[], lower: string[]) {
	const upperWet = upper.reduce((s, p) => s + wet(p), 0);
	const upperDry = upper.reduce((s, p) => s + dry(p), 0);
	const lowerWet = lower.reduce((s, p) => s + wet(p), 0);
	const lowerProp = lower.reduce((s, p) => s + propellantMass(p), 0);
	const m0 = upperWet + lowerWet;
	const burnout1 = m0 - lowerProp;
	const dvStage1 = engineOutput(engineConfig, { ignited: true, throttle: 1, flameout: false }, 0);
	const ve = dvStage1.isp * G0;
	return {
		m0,
		twrSeaLevel:
			engineOutput(
				engineConfig,
				{ ignited: true, throttle: 1, flameout: false },
				SEA_LEVEL_PRESSURE
			).thrust /
			(m0 * SURFACE_G),
		dv1: ve * Math.log(m0 / burnout1),
		dv2: ve * Math.log(upperWet / upperDry),
		twrStage2: dvStage1.thrust / (upperWet * SURFACE_G)
	};
}

const UPPER = ['stock.command-pod', 'stock.reaction-wheel', 'stock.tank-small', 'stock.engine-lv'];

describe('reference two-stage vessel (pod, wheel, small tank, engine | decoupler, small tank, engine)', () => {
	const v = twoStage(UPPER, ['stock.decoupler', 'stock.tank-small', 'stock.engine-lv']);

	// realistic early-era stats since plan 380 (ADR 0317): 1 160 kg tanks, a 275 kg LV-T30
	test('masses: wet 12 760 kg, upper stage 6 825 kg', () => {
		expect(v.m0).toBeCloseTo(12_760, 6);
		expect(UPPER.reduce((s, p) => s + wet(p), 0)).toBeCloseTo(6_825, 6);
	});

	test('can reach orbit: Δv >= 3 800 m/s (about 3 400 m/s is needed) and sea-level TWR > 1.3', () => {
		expect(v.dv1 + v.dv2).toBeGreaterThanOrEqual(3_800);
		expect(v.twrSeaLevel).toBeGreaterThan(1.3);
		expect(v.twrStage2).toBeGreaterThan(1);
		// The upper stage alone carries most of the budget, so a late staging still reaches orbit.
		expect(v.dv2).toBeGreaterThan(2_500);
	});

	test('orbital speed for the target orbit is below the budget with margin', () => {
		const vCirc = Math.sqrt(HOME_MU / (R + 80_000));
		expect(vCirc).toBeCloseTo(2_279, -1);
		expect(v.dv1 + v.dv2 - vCirc).toBeGreaterThan(1_500); // allowance for gravity and drag losses
	});
});

describe('heavy variant (medium tank in the lower stage)', () => {
	test('more Δv, thinner liftoff margin: documented trade-off', () => {
		const heavy = twoStage(UPPER, ['stock.decoupler', 'stock.tank-medium', 'stock.engine-lv']);
		expect(heavy.dv1 + heavy.dv2).toBeGreaterThan(4_900);
		expect(heavy.twrSeaLevel).toBeGreaterThan(1.1);
		expect(heavy.twrSeaLevel).toBeLessThan(1.3);
	});
});
