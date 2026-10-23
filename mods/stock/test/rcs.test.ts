/** Reaction control (plan 211, ADR 0217): nozzle allocation, switches and propellant use. */
import { describe, expect, test } from 'bun:test';
import { STANDARD_GRAVITY, type Vec3 } from '@orbital/sdk';
import {
	Monopropellant,
	ModuleRcs,
	nozzleFractions,
	PartRcsBlock,
	rcsConfigSchema,
	type RcsConfig
} from '../src/index.ts';
import { contextFor, fakeVessel } from './helpers.ts';

const blockConfig = rcsConfigSchema.parse(
	PartRcsBlock.modules!.find(([m]) => m === ModuleRcs.id)![1]
) as RcsConfig;

/**
 * Four blocks on a 0.625 m hull at 90° steps, as one config in the vessel frame: each block's part
 * +X points out from the axis, and its radial node sits on the hull.
 */
function ring(): RcsConfig {
	const nozzles: RcsConfig['nozzles'] = [];
	for (let k = 0; k < 4; k++) {
		const a = (k * Math.PI) / 2;
		const out = { x: Math.cos(a), z: Math.sin(a) };
		// part frame (x out, y up, z = x × y side) to the vessel frame
		const toVessel = (v: readonly [number, number, number]): [number, number, number] => [
			v[0] * out.x - v[2] * out.z,
			v[1],
			v[0] * out.z + v[2] * out.x
		];
		for (const n of blockConfig.nozzles) {
			const p = toVessel([n.pos[0] + 0.625 + 0.1, n.pos[1], n.pos[2]]);
			nozzles.push({ pos: p, dir: toVessel(n.dir) });
		}
	}
	return { ...blockConfig, nozzles };
}

function sum(config: RcsConfig, fractions: number[]): { force: Vec3; torque: Vec3 } {
	const force = { x: 0, y: 0, z: 0 };
	const torque = { x: 0, y: 0, z: 0 };
	config.nozzles.forEach((n, i) => {
		const f = fractions[i]! * config.thrust;
		const d = { x: n.dir[0] * f, y: n.dir[1] * f, z: n.dir[2] * f };
		force.x += d.x;
		force.y += d.y;
		force.z += d.z;
		torque.x += n.pos[1] * d.z - n.pos[2] * d.y;
		torque.y += n.pos[2] * d.x - n.pos[0] * d.z;
		torque.z += n.pos[0] * d.y - n.pos[1] * d.x;
	});
	return { force, torque };
}
const len = (v: Vec3): number => Math.hypot(v.x, v.y, v.z);
const ZERO = { x: 0, y: 0, z: 0 };
const on = { limiter: 1, rotate: true, translate: true };

describe('RCS nozzle allocation (plan 211)', () => {
	test('a four-block ring translating +X pushes along +X with under 1 % of the torque of a rotation', () => {
		const config = ring();
		const move = sum(config, nozzleFractions(config, on, ZERO, ZERO, { x: 1, y: 0, z: 0 }));
		expect(move.force.x).toBeGreaterThan(0);
		expect(Math.hypot(move.force.y, move.force.z)).toBeLessThan(1e-6 * move.force.x);
		const turn = sum(config, nozzleFractions(config, on, ZERO, { x: 1, y: 0, z: 0 }, ZERO));
		expect(len(turn.torque)).toBeGreaterThan(0);
		expect(len(move.torque)).toBeLessThan(0.01 * len(turn.torque));
		// translating up and rolling also work
		const up = sum(config, nozzleFractions(config, on, ZERO, ZERO, { x: 0, y: 1, z: 0 }));
		expect(up.force.y).toBeGreaterThan(0);
		const roll = sum(config, nozzleFractions(config, on, ZERO, { x: 0, y: 1, z: 0 }, ZERO));
		expect(roll.torque.y).toBeGreaterThan(0);
	});

	test('with translate off a block gives no force for a translation request; the limiter scales', () => {
		const config = ring();
		const off = nozzleFractions(config, { ...on, translate: false }, ZERO, ZERO, {
			x: 1,
			y: 0,
			z: 0
		});
		expect(off.every((f) => f === 0)).toBe(true);
		const half = nozzleFractions(config, { ...on, limiter: 0.5 }, ZERO, ZERO, { x: 1, y: 0, z: 0 });
		expect(Math.max(...half)).toBeCloseTo(0.5, 9);
		const noTurn = nozzleFractions(
			config,
			{ ...on, rotate: false },
			ZERO,
			{ x: 1, y: 0, z: 0 },
			ZERO
		);
		expect(noTurn.every((f) => f === 0)).toBe(true);
	});

	test('propellant drops by thrust × time / (Isp × g0), in vacuum', () => {
		const vessel = fakeVessel({ [Monopropellant.id]: 100 });
		const v = vessel as typeof vessel & { rcs: boolean; translateDemand: Vec3 };
		v.rcs = true;
		// one nozzle of the block pushes +Y: full forward translation fires it alone
		v.translateDemand = { x: 0, y: 1, z: 0 };
		const ctx = contextFor(
			ModuleRcs,
			PartRcsBlock.modules!.find(([m]) => m === ModuleRcs.id)![1] as never,
			vessel
		);
		const dt = 0.02;
		for (let i = 0; i < 50; i++) ModuleRcs.update!(ctx, dt);
		const fired = 1_000 * 1; // one nozzle at full fire for 1 s
		const expected = fired / (240 * STANDARD_GRAVITY) / Monopropellant.density;
		expect(100 - vessel.stock[Monopropellant.id]!).toBeCloseTo(expected, 9);
		expect(vessel.forces).toHaveLength(50);
		expect(vessel.forces[0]!.force.y).toBeCloseTo(1_000, 6);
		// RCS off: nothing fires
		v.rcs = false;
		ModuleRcs.update!(ctx, dt);
		expect(vessel.forces).toHaveLength(50);
		// no propellant: dry, no force
		v.rcs = true;
		vessel.stock[Monopropellant.id] = 0;
		ModuleRcs.update!(ctx, dt);
		expect(ctx.state.dry).toBe(true);
		expect(vessel.forces).toHaveLength(50);
	});
});

describe('RCS family (plan 277)', () => {
	test("every thruster part's puffs (the model's bells) are its module's nozzles", async () => {
		const { STOCK_RCS_PARTS } = await import('../src/parts/rcs.ts');
		const thrusters = STOCK_RCS_PARTS.filter((p) => p.modules?.some(([m]) => m === ModuleRcs.id));
		expect(thrusters.map((p) => p.id).sort()).toEqual([
			'stock.rcs-bipropellant',
			'stock.rcs-block',
			'stock.rcs-block-5',
			'stock.rcs-cold-gas',
			'stock.rcs-linear',
			'stock.rcs-pair'
		]);
		for (const part of thrusters) {
			const config = rcsConfigSchema.parse(part.modules!.find(([m]) => m === ModuleRcs.id)![1]);
			expect(part.visual?.puffs?.nozzles, part.id).toEqual(config.nozzles);
			// every nozzle's exit lies inside the part's box, so the bell is inside the shape
			const shape = part.shape!;
			if (shape.kind !== 'box') throw new Error(`${part.id} is not a box`);
			for (const n of config.nozzles) {
				for (let i = 0; i < 3; i++)
					expect(Math.abs(n.pos[i]!), part.id).toBeLessThanOrEqual(shape.size[i]! / 2 + 1e-9);
			}
		}
	});

	test('the five-way block can push the vessel inward; the pair only along the hull', async () => {
		const { PartRcsBlock5, PartRcsPair } = await import('../src/parts/rcs.ts');
		const nozzlesOf = (p: typeof PartRcsBlock5) =>
			rcsConfigSchema.parse(p.modules!.find(([m]) => m === ModuleRcs.id)![1]).nozzles;
		expect(nozzlesOf(PartRcsBlock5).some((n) => n.dir[0] < -0.9)).toBe(true);
		expect(nozzlesOf(PartRcsPair).every((n) => Math.abs(n.dir[1]) > 0.99)).toBe(true);
	});
});

describe('RCS follow-ups (plan 299)', () => {
	test('the bipropellant thruster draws liquid fuel and oxidizer at 9 : 11 by volume', async () => {
		const { PartRcsBipropellant } = await import('../src/parts/rcs.ts');
		const { LiquidFuel, Oxidizer } = await import('../src/index.ts');
		const vessel = fakeVessel({ [LiquidFuel.id]: 1000, [Oxidizer.id]: 1000 });
		const v = vessel as typeof vessel & { rcs: boolean; translateDemand: Vec3 };
		v.rcs = true;
		// one nozzle pushes +Y: full forward translation fires it alone
		v.translateDemand = { x: 0, y: 1, z: 0 };
		const ctx = contextFor(
			ModuleRcs,
			PartRcsBipropellant.modules!.find(([m]) => m === ModuleRcs.id)![1] as never,
			vessel
		);
		for (let i = 0; i < 50; i++) ModuleRcs.update!(ctx, 0.02);
		const fuel = 1000 - vessel.stock[LiquidFuel.id]!;
		const ox = 1000 - vessel.stock[Oxidizer.id]!;
		expect(fuel).toBeGreaterThan(0);
		expect(fuel / ox).toBeCloseTo(0.9 / 1.1, 9);
		// the whole mass is thrust × time / (Isp × g0) (one 3 kN nozzle for 1 s, vacuum)
		const mass = fuel * LiquidFuel.density + ox * Oxidizer.density;
		expect(mass).toBeCloseTo(3_000 / (290 * STANDARD_GRAVITY), 6);
		// short of oxidizer the nozzle fires less, and dry at none
		vessel.stock[Oxidizer.id] = 0;
		ModuleRcs.update!(ctx, 0.02);
		expect(ctx.state.dry).toBe(true);
	});

	test('with roll switched off, a roll command gives no torque; pitch still does', () => {
		const config = ring();
		const torqueFor = (demand: Vec3, axes: Record<string, boolean>) => {
			const vessel = fakeVessel({ [Monopropellant.id]: 100 });
			const v = vessel as typeof vessel & { rcs: boolean };
			v.rcs = true;
			vessel.demand = demand;
			const ctx = contextFor(ModuleRcs, config as never, vessel);
			for (const [axis, on] of Object.entries(axes)) ModuleRcs.actions!.setAxis!(ctx, axis, on);
			ModuleRcs.update!(ctx, 0.02);
			const torque = { x: 0, y: 0, z: 0 };
			vessel.forces.forEach(({ force, point }) => {
				const p = point ?? { x: 0, y: 0, z: 0 };
				torque.x += p.y * force.z - p.z * force.y;
				torque.y += p.z * force.x - p.x * force.z;
				torque.z += p.x * force.y - p.y * force.x;
			});
			return torque;
		};
		const roll = { x: 0, y: 1, z: 0 };
		expect(Math.abs(torqueFor(roll, {}).y)).toBeGreaterThan(1);
		expect(torqueFor(roll, { roll: false })).toEqual({ x: 0, y: 0, z: 0 });
		const pitch = { x: 1, y: 0, z: 0 };
		expect(Math.abs(torqueFor(pitch, { roll: false }).x)).toBeGreaterThan(1);
		expect(torqueFor(pitch, { pitch: false })).toEqual({ x: 0, y: 0, z: 0 });
	});

	test('a switched-off translation axis gives no force along it', () => {
		const vessel = fakeVessel({ [Monopropellant.id]: 100 });
		const v = vessel as typeof vessel & { rcs: boolean; translateDemand: Vec3 };
		v.rcs = true;
		v.translateDemand = { x: 0, y: 1, z: 0 };
		const ctx = contextFor(ModuleRcs, blockConfig as never, vessel);
		ModuleRcs.actions!.setAxis!(ctx, 'forward', false);
		ModuleRcs.update!(ctx, 0.02);
		expect(vessel.forces).toHaveLength(0);
	});

	test('a part without a propellant or a mix is refused', () => {
		const { propellant: _p, ...none } = blockConfig;
		expect(() => rcsConfigSchema.parse(none)).toThrow();
	});
});
