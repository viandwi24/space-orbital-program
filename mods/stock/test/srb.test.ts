/** Solid motors (plan 210, ADR 0203): no throttle, no shutdown, a limiter that stretches the burn. */
import { describe, expect, test } from 'bun:test';
import { ModuleEngine, PartBooster, PartSrbLarge, PartSrbSmall, SolidFuel } from '../src/index.ts';
import { contextFor, fakeVessel } from './helpers.ts';

const engineOf = (part: typeof PartBooster) =>
	part.modules!.find(([m]) => m === ModuleEngine.id)![1] as never;
const fuelOf = (part: typeof PartBooster): number =>
	(
		part.modules!.find(([m]) => m === 'stock.resource-container')![1] as {
			contents: Record<string, { capacity: number }>;
		}
	).contents[SolidFuel.id]!.capacity;

/** Seconds a lit BST-1 burns from full at `limiter`, with the throttle at `throttle`. */
function burn(
	limiter: number,
	throttle = 1
): { seconds: number; vessel: ReturnType<typeof fakeVessel> } {
	const vessel = fakeVessel({ [SolidFuel.id]: fuelOf(PartBooster) });
	vessel.control.throttle = throttle;
	const ctx = contextFor(ModuleEngine, engineOf(PartBooster), vessel);
	ModuleEngine.actions!.setLimiter!(ctx, limiter);
	ModuleEngine.onStage!(ctx);
	const dt = 0.02;
	let t = 0;
	while (ctx.state.ignited && t < 1_000) {
		ModuleEngine.update!(ctx, dt);
		t += dt;
	}
	expect(ctx.state.flameout).toBe(true);
	return { seconds: t, vessel };
}

describe('solid rocket motors (plan 210)', () => {
	test('an SRB ignores the throttle and burns to empty', () => {
		const full = burn(1, 1);
		const idle = burn(1, 0);
		expect(idle.seconds).toBeCloseTo(full.seconds, 6);
		expect(full.vessel.stock[SolidFuel.id]).toBeLessThan(1e-9);
		// 330 u × 7.5 kg at 150 kN / (240 s × g0): about 39 s (an early solid's Isp, plan 380)
		expect(full.seconds).toBeGreaterThan(36);
		expect(full.seconds).toBeLessThan(42);
	});

	test('at a 50 % limiter its burn time doubles and its thrust halves', () => {
		const full = burn(1);
		const half = burn(0.5);
		expect(half.seconds / full.seconds).toBeCloseTo(2, 2);
		expect(half.vessel.forces[0]!.force.y / full.vessel.forces[0]!.force.y).toBeCloseTo(0.5, 6);
	});

	test('a lit SRB cannot shut down, and its limiter stays where it was set', () => {
		const vessel = fakeVessel({ [SolidFuel.id]: 100 });
		const ctx = contextFor(ModuleEngine, engineOf(PartBooster), vessel);
		ModuleEngine.actions!.setLimiter!(ctx, 0.6);
		ModuleEngine.onStage!(ctx);
		ModuleEngine.actions!.shutdown!(ctx);
		ModuleEngine.actions!.setActive!(ctx, false);
		ModuleEngine.actions!.setLimiter!(ctx, 1);
		expect(ctx.state.ignited).toBe(true);
		expect(ctx.state.limiter).toBe(0.6);
		const d = ModuleEngine.describe!(ctx.config, ctx.state)!;
		const active = d.actions!.find((a) => a.id === 'setActive')!;
		const limiter = d.actions!.find((a) => a.id === 'setLimiter')!;
		expect(active.enabled).toBe(false);
		expect(limiter.enabled).toBe(false);
	});

	test('a liquid engine keeps its throttle and shutdown; the limiter scales it', () => {
		const vessel = fakeVessel({ 'stock.liquid-fuel': 1_000, 'stock.oxidizer': 1_000 });
		vessel.control.throttle = 0.5;
		const ctx = contextFor(
			ModuleEngine,
			{
				thrust: 100_000,
				ispVacuum: 300,
				ispSeaLevel: 280,
				propellants: [
					{ resource: 'stock.liquid-fuel', ratio: 0.9 },
					{ resource: 'stock.oxidizer', ratio: 1.1 }
				]
			},
			vessel
		);
		ModuleEngine.actions!.setLimiter!(ctx, 0.5);
		ModuleEngine.onStage!(ctx);
		ModuleEngine.update!(ctx, 0.02);
		expect(vessel.forces[0]!.force.y).toBeCloseTo(25_000, 3);
		ModuleEngine.actions!.shutdown!(ctx);
		expect(ctx.state.ignited).toBe(false);
	});

	test('the three motors carry solid fuel only', () => {
		for (const part of [PartSrbSmall, PartBooster, PartSrbLarge]) {
			const cfg = engineOf(part) as { solid: boolean; propellants: Array<{ resource: string }> };
			expect(cfg.solid, part.id).toBe(true);
			expect(cfg.propellants.map((p) => p.resource)).toEqual([SolidFuel.id]);
			expect(fuelOf(part)).toBeGreaterThan(0);
		}
	});
});
