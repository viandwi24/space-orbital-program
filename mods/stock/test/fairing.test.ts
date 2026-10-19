/** Fairings (plan 219, ADR 0224): limits, profile and mass, and the jettison's two panels. */
import { describe, expect, test } from 'bun:test';
import {
	ModuleFairing,
	fairingConfigSchema,
	fairingMass,
	fairingProblem,
	fairingProfile
} from '../src/index.ts';
import { contextFor, fakeVessel } from './helpers.ts';

const config = (sections: Array<{ height: number; radius: number }>, closed = true) =>
	fairingConfigSchema.parse({ size: 1.25, baseTop: 0.1, sections, closed });

describe('fairing (plan 219)', () => {
	test('limits: a 45 degree taper is too steep; 30 is fine; width and height bounded', () => {
		expect(fairingProblem(1.25, [{ height: 1, radius: 0.625 + Math.tan(Math.PI / 6) }])).toBeNull();
		expect(fairingProblem(1.25, [{ height: 0.5, radius: 1.125 }])).toBe('Too steep');
		expect(fairingProblem(1.25, [{ height: 1, radius: 0.2 }])).toBe('Too narrow');
		expect(fairingProblem(1.25, [{ height: 3, radius: 1.3 }])).toBe('Too wide');
		expect(
			fairingProblem(
				1.25,
				Array.from({ length: 4 }, () => ({ height: 4, radius: 0.625 }))
			)
		).toBe('Too tall');
	});

	test('the profile runs from the base rim up and closes to the axis; the mass is the shell area', () => {
		const c = config([
			{ height: 1, radius: 0.8 },
			{ height: 0.5, radius: 0.8 }
		]);
		const p = fairingProfile(c);
		expect(p[0]).toEqual({ y: 0.1, r: 0.625 });
		expect(p.at(-1)).toEqual({ y: 1.6 + 0.8, r: 0 });
		expect(fairingMass(c)).toBeGreaterThan(20);
		expect(fairingMass(c)).toBeLessThan(80);
		expect(fairingProfile(config([]))).toEqual([]);
	});

	test('only a closed shell shields; jettison throws two half panels off sideways, once', () => {
		const open = config([{ height: 1, radius: 0.8 }], false);
		expect(
			ModuleFairing.shell!(open, { jettisoned: false, sections: [], closed: false })
		).toBeNull();
		const c = config([{ height: 1, radius: 0.8 }]);
		const vessel = fakeVessel();
		const spawned: Array<{ velocity: { x: number }; settings?: unknown }> = [];
		const v = Object.assign(vessel, {
			spawnDebris: (s: (typeof spawned)[number]) => void spawned.push(s)
		});
		const ctx = contextFor(ModuleFairing, c, v);
		expect(ModuleFairing.mass!(ctx.config, ctx.state)).toBeCloseTo(fairingMass(c), 9);
		ModuleFairing.onStage!(ctx);
		ModuleFairing.onStage!(ctx);
		expect(spawned).toHaveLength(2);
		expect(spawned[0]!.velocity.x).toBeCloseTo(-spawned[1]!.velocity.x, 9);
		expect(spawned[0]!.velocity.x).toBeGreaterThan(0);
		expect(ModuleFairing.mass!(ctx.config, ctx.state)).toBe(0);
		expect(ModuleFairing.shell!(ctx.config, ctx.state)).toBeNull();
	});
});
