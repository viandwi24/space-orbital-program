import { describe, expect, test } from 'bun:test';
import { describeModule } from '@orbital/sdk';
import {
	ModuleWing,
	PartStrut,
	PartFuelLine,
	PartWing,
	wingCoefficients,
	wingConfigSchema,
	wingForce,
	wingLiftSlope
} from '../src/index.ts';
import { contextFor, fakeVessel } from './helpers.ts';

const config = wingConfigSchema.parse({ area: 3, aspectRatio: 6 });
const deg = (d: number): number => (d * Math.PI) / 180;
/** Hand value of `a0 / (1 + a0 / (pi e AR))` for AR 6, e 0.85. */
const SLOPE = (2 * Math.PI) / (1 + (2 * Math.PI) / (Math.PI * 0.85 * 6));

describe('stock.wing (ADR 0075)', () => {
	test('the lift slope is the finite-wing one: 4.513 per radian for AR 6, e 0.85', () => {
		expect(wingLiftSlope(config)).toBeCloseTo(SLOPE, 12);
		expect(SLOPE).toBeCloseTo(4.5132, 3);
		// A longer wing is steeper, a shorter one flatter, never above 2 pi.
		expect(wingLiftSlope({ ...config, aspectRatio: 12 })).toBeGreaterThan(SLOPE);
		expect(wingLiftSlope({ ...config, aspectRatio: 2 })).toBeLessThan(SLOPE);
		expect(wingLiftSlope({ ...config, aspectRatio: 40 })).toBeLessThan(2 * Math.PI);
	});

	test('coefficients: linear below the stall, peak at the stall angle, zero lift broadside', () => {
		expect(wingCoefficients(config, deg(5)).cl).toBeCloseTo(SLOPE * deg(5), 12);
		expect(wingCoefficients(config, deg(-5)).cl).toBeCloseTo(-SLOPE * deg(5), 12);
		const peak = SLOPE * deg(15);
		expect(wingCoefficients(config, deg(15)).cl).toBeCloseTo(peak, 12);
		expect(wingCoefficients(config, deg(14.9)).cl).toBeLessThan(peak);
		expect(wingCoefficients(config, deg(15.5)).cl).toBeLessThan(peak);
		// Half way from the stall to broadside the lift is half the peak.
		expect(wingCoefficients(config, deg(52.5)).cl).toBeCloseTo(peak / 2, 9);
		expect(wingCoefficients(config, Math.PI / 2).cl).toBeCloseTo(0, 12);
		// No tail beyond: continuous at the stall angle.
		expect(wingCoefficients(config, deg(15) + 1e-9).cl).toBeCloseTo(peak, 6);
	});

	test('drag: parasite + C_L^2 / (pi e AR) below the stall, the plate drag broadside', () => {
		const alpha = 1 / SLOPE; // C_L = 1, 12.7 degrees: below the stall
		const { cl, cd } = wingCoefficients(config, alpha);
		expect(cl).toBeCloseTo(1, 12);
		expect(cd).toBeCloseTo(0.02 + 1 / (Math.PI * 0.85 * 6), 12);
		expect(wingCoefficients(config, 0).cd).toBeCloseTo(0.02, 12);
		expect(wingCoefficients(config, Math.PI / 2).cd).toBeCloseTo(0.02 + 1.2, 12);
	});

	test('the best glide ratio of the polar is 1/2 sqrt(pi e AR / C_D0), about 14.2', () => {
		let best = 0;
		for (let a = 0.001; a < deg(15); a += 0.0005) {
			const { cl, cd } = wingCoefficients(config, a);
			best = Math.max(best, cl / cd);
		}
		const expected = 0.5 * Math.sqrt((Math.PI * 0.85 * 6) / 0.02);
		expect(expected).toBeCloseTo(14.15, 1);
		expect(best / expected).toBeGreaterThan(0.98);
		expect(best / expected).toBeLessThanOrEqual(1.0001);
	});

	test('the force: lift perpendicular and drag along the flow, q S C (hand values)', () => {
		const rho = 1.2;
		const alpha = deg(5);
		const speed = 100;
		// The wing moves along +Y at 100 m/s with the angle of attack 5 degrees (towards +Z).
		const v = { x: 0, y: speed * Math.cos(alpha), z: speed * Math.sin(alpha) };
		const f = wingForce(config, v, rho);
		const q = 0.5 * rho * speed * speed * 3;
		const { cl, cd } = wingCoefficients(config, alpha);
		const ex = { y: v.y / speed, z: v.z / speed };
		const lift = f.y * ex.z - f.z * ex.y; // component along (ez, -ey): lift pushes towards -Z
		const drag = -(f.y * ex.y + f.z * ex.z);
		expect(f.x).toBe(0);
		expect(lift).toBeCloseTo(q * cl, 6);
		expect(drag).toBeCloseTo(q * cd, 6);
		expect(f.z).toBeLessThan(0);
	});

	test('symmetry: a negative angle mirrors the force, flow along the span or in vacuum gives none', () => {
		const up = wingForce(config, { x: 0, y: 80, z: 5 }, 1);
		const down = wingForce(config, { x: 0, y: 80, z: -5 }, 1);
		expect(down.z).toBeCloseTo(-up.z, 9);
		expect(down.y).toBeCloseTo(up.y, 9);
		expect(wingForce(config, { x: 90, y: 0, z: 0 }, 1)).toEqual({ x: 0, y: 0, z: 0 });
		expect(wingForce(config, { x: 0, y: 80, z: 5 }, 0)).toEqual({ x: 0, y: 0, z: 0 });
		// Flying tail first: the same angle of attack gives the same lift, drag opposes the motion.
		const back = wingForce(config, { x: 0, y: -80, z: 5 }, 1);
		expect(back.z).toBeCloseTo(up.z, 9);
		expect(back.y).toBeGreaterThan(0);
	});

	test('past the stall the lift drops and the drag rises', () => {
		const at = (d: number) =>
			wingForce(config, { x: 0, y: 80 * Math.cos(deg(d)), z: 80 * Math.sin(deg(d)) }, 1);
		expect(Math.abs(at(25).z)).toBeLessThan(Math.abs(at(15).z) * 1.05);
		const dragAt = (d: number) => -(at(d).y * Math.cos(deg(d)) + at(d).z * Math.sin(deg(d)));
		expect(dragAt(25)).toBeGreaterThan(dragAt(15) * 1.5);
	});

	test('update applies the force at the aerodynamic centre, nothing in vacuum; the descriptor says "lift"', () => {
		const vessel = fakeVessel();
		vessel.ambient.density = 1;
		vessel.air = { x: 0, y: 80, z: 4 };
		const ctx = contextFor(
			ModuleWing,
			{ area: 3, aspectRatio: 6, centre: [0, 0.25, 0], damping: 0 },
			vessel
		);
		ModuleWing.update!(ctx, 0.02);
		expect(vessel.forces).toHaveLength(1);
		expect(vessel.forces[0]!.point).toEqual({ x: 0, y: 0.25, z: 0 });
		expect(vessel.forces[0]!.force).toEqual(wingForce(ctx.config, vessel.air, 1));
		vessel.forces.length = 0;
		vessel.ambient.density = 0;
		ModuleWing.update!(ctx, 0.02);
		expect(vessel.forces).toHaveLength(0);
		expect(
			describeModule(ModuleWing, { area: 3, aspectRatio: 6, centre: [0, 0.25, 0] })
		).toMatchObject({
			category: 'aero',
			lift: { area: 3, centre: [0, 0.25, 0] }
		});
		expect(describeModule(ModuleWing, { area: 3, aspectRatio: 6 })!.lift!.liftSlope).toBeCloseTo(
			SLOPE,
			12
		);
	});

	test('the stock wing pair: 6 m, aspect ratio 6, a radial box part', () => {
		const shape = PartWing.shape as { kind: 'box'; size: [number, number, number] };
		expect(2 * shape.size[0]).toBe(6);
		expect(PartWing.modules![0]![1]).toMatchObject({ area: 3, aspectRatio: 6 });
		expect((2 * shape.size[0]) ** 2 / (2 * 3)).toBe(6);
	});
});

describe('connector parts (ADR 0071)', () => {
	test('a strut is a plain connector, a fuel line feeds; both hang on a horizontal node', () => {
		expect(PartStrut.connector).toEqual({});
		expect(PartFuelLine.connector).toEqual({ feeds: true });
		for (const p of [PartStrut, PartFuelLine]) {
			expect(p.attach!.end!.dir).toEqual([-1, 0, 0]);
			expect(p.crossfeed).toBe(false);
		}
		// the strut may let go of its far end (plan 313); the fuel line has no module
		expect(PartStrut.modules?.map(([m]) => m)).toEqual(['stock.strut']);
		expect(PartFuelLine.modules).toBeUndefined();
	});
});
