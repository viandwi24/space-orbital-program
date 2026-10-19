/** Plan 041 / ADR 0071: fuel lines move propellant one way, struts are cut on separation. */
import { describe, expect, test } from 'bun:test';
import { partId, type EntityId, type VesselDesign, type VesselSnapshot } from '@orbital/core';
import { engineConfigSchema, propellantRates, engineOutput } from '@orbital/mod-stock';
import type { Sim } from '../src/index.ts';
import { orbitState } from './helpers/measure.ts';
import { asparagus } from './helpers/structure.ts';
import { newSim } from './helpers/vessels.ts';

const LF = 'stock.liquid-fuel';

async function launch(design: VesselDesign): Promise<{ sim: Sim; id: EntityId }> {
	const sim = await newSim();
	const { position, velocity } = orbitState(sim, 200_000);
	const r = sim.dispatch({
		type: 'load-vessel',
		design,
		placement: { kind: 'state', position, velocity }
	});
	if (!r.ok) throw new Error(r.reason);
	return { sim, id: r.vessel! };
}
const run = (sim: Sim, seconds: number): void => {
	for (let i = 0; i < Math.round(seconds / 0.02); i++) sim.step(0.02);
};
const vessel = (sim: Sim, id: EntityId): VesselSnapshot =>
	sim.snapshot().vessels.find((v) => v.id === id)!;
/** Liquid fuel in the part with design index `index` (snapshot parts are in ascending index). */
const fuel = (sim: Sim, id: EntityId, design: VesselDesign, index: number): number => {
	const order = design.parts.map((p) => p.index).sort((a, b) => a - b);
	const part = vessel(sim, id).parts[order.indexOf(index)]!;
	return (part.modules['stock.resource-container'] as { amounts: Record<string, number> }).amounts[
		LF
	]!;
};
const engineState = (sim: Sim, id: EntityId, design: VesselDesign, index: number) => {
	const order = design.parts.map((p) => p.index).sort((a, b) => a - b);
	return vessel(sim, id).parts[order.indexOf(index)]!.modules['stock.engine'] as {
		ignited: boolean;
		flameout: boolean;
	};
};

/** Liquid-fuel volume rates (units/s) of the core engine and of a booster at full throttle in vacuum. */
function rates(sim: Sim): { core: number; booster: number } {
	const densityOf = (r: string): number => sim.registries.resources.get(r)?.density ?? 0;
	const rate = (part: string): number => {
		const def = sim.registries.parts.get(part)!;
		const config = engineConfigSchema.parse(def.modules!.find(([m]) => m === 'stock.engine')![1]);
		const flow = engineOutput(config, { ignited: true, throttle: 1, flameout: false }, 0).massFlow;
		return propellantRates(config, flow, densityOf).find((x) => x.resource === LF)!.rate;
	};
	return { core: rate('stock.engine-lv'), booster: rate('stock.booster-liquid') };
}

describe('fuel lines (ADR 0071)', () => {
	test('the core engine draws from the booster tanks first, one way; the boosters feed only themselves', async () => {
		const design = asparagus(2);
		const { sim, id } = await launch(design);
		const { core, booster } = rates(sim);
		expect(fuel(sim, id, design, 2)).toBe(400);
		sim.dispatch({ type: 'throttle', vessel: id, value: 1 });
		sim.dispatch({ type: 'stage', vessel: id });
		const t = 5;
		run(sim, t);
		// The first booster tank (lower id) feeds the core engine and its own engine; the second only
		// its own; the core tank is untouched. The engines' start-up ramp is not in the model, so the
		// match is to within one step of flow.
		const slack = 3 * 0.02 * (core + booster);
		expect(400 - fuel(sim, id, design, 2)).toBe(0);
		expect(225 - fuel(sim, id, design, 11)).toBeCloseTo((core + booster) * t, -1);
		expect(Math.abs(225 - fuel(sim, id, design, 14) - booster * t)).toBeLessThan(slack + 1);
		// When the first booster tank is dry its engine stops (a line is one way: the core tank cannot
		// refill it) while the core engine carries on from the second booster, still not from its tank.
		run(sim, 225 / (core + booster) - t + 2);
		expect(fuel(sim, id, design, 11)).toBe(0);
		expect(engineState(sim, id, design, 11).flameout).toBe(true);
		expect(engineState(sim, id, design, 3).flameout).toBe(false);
		expect(fuel(sim, id, design, 2)).toBe(400);
		sim.dispose();
	});

	test('the first booster burns out when the delta-v model says it does (225 / (core + booster) s)', async () => {
		const design = asparagus(2);
		const { sim, id } = await launch(design);
		const { core, booster } = rates(sim);
		sim.dispatch({ type: 'throttle', vessel: id, value: 1 });
		sim.dispatch({ type: 'stage', vessel: id });
		let t = 0;
		while (!engineState(sim, id, design, 11).flameout && t < 60) {
			sim.step(0.02);
			t += 0.02;
		}
		// The same closed form as `delta-v-lines.test.ts` in the web client.
		expect(t).toBeGreaterThan(225 / (core + booster) - 0.1);
		expect(t).toBeLessThan(225 / (core + booster) + 0.1);
		sim.dispose();
	});

	test('without the lines the core engine draws only from its own tank', async () => {
		const design = asparagus(2, { lines: false });
		const { sim, id } = await launch(design);
		const { core } = rates(sim);
		sim.dispatch({ type: 'throttle', vessel: id, value: 1 });
		sim.dispatch({ type: 'stage', vessel: id });
		run(sim, 5);
		expect(400 - fuel(sim, id, design, 2)).toBeCloseTo(core * 5, -1);
		sim.dispose();
	});

	test('firing the radial decouplers cuts the lines: the core then draws only its own tank', async () => {
		const design = asparagus(2);
		const { sim, id } = await launch(design);
		const { core } = rates(sim);
		sim.dispatch({ type: 'throttle', vessel: id, value: 1 });
		sim.dispatch({ type: 'stage', vessel: id });
		run(sim, 3);
		const lineIndices = [8, 9];
		const before = vessel(sim, id).parts.filter((p) => p.link);
		expect(before.length).toBe(lineIndices.length);
		expect(before.every((p) => p.definition === 'stock.fuel-line')).toBe(true);
		expect(fuel(sim, id, design, 2)).toBe(400);
		sim.dispatch({ type: 'stage', vessel: id });
		const core0 = vessel(sim, id);
		// The lines hang on the boosters that left: the core keeps no link and no line part.
		expect(core0.parts.some((p) => p.link)).toBe(false);
		for (const v of sim.snapshot().vessels) {
			if (v.id !== id) expect(v.parts.some((p) => p.link)).toBe(false);
		}
		const start = fuel(sim, id, design, 2);
		run(sim, 4);
		expect(start - fuel(sim, id, design, 2)).toBeCloseTo(core * 4, -1);
		sim.dispose();
	});

	test('a design with no connector part is byte-identical run to run', async () => {
		const out: string[] = [];
		for (let i = 0; i < 2; i++) {
			const design = asparagus(2, { lines: false });
			const { sim, id } = await launch(design);
			sim.dispatch({ type: 'throttle', vessel: id, value: 1 });
			sim.dispatch({ type: 'stage', vessel: id });
			run(sim, 6);
			out.push(JSON.stringify(sim.snapshot()));
			sim.dispose();
		}
		expect(out[1]).toBe(out[0]!);
	});
});

describe('struts (ADR 0071)', () => {
	/** Pod, tank, decoupler, tank, engine with a strut from the upper tank across the decoupler to the lower tank. */
	const spanning = (): VesselDesign => ({
		formatVersion: 3,
		name: 'Strutted',
		parts: [
			{ index: 0, part: partId('stock.command-pod'), parent: null },
			{
				index: 1,
				part: partId('stock.tank-small'),
				parent: { index: 0, parentNode: 'bottom', node: 'top' }
			},
			{
				index: 2,
				part: partId('stock.decoupler'),
				parent: { index: 1, parentNode: 'bottom', node: 'top' }
			},
			{
				index: 3,
				part: partId('stock.tank-small'),
				parent: { index: 2, parentNode: 'bottom', node: 'top' }
			},
			{
				index: 4,
				part: partId('stock.engine-lv'),
				parent: { index: 3, parentNode: 'bottom', node: 'top' }
			},
			{
				index: 5,
				part: partId('stock.strut'),
				parent: { index: 1, parentNode: 'surface', node: 'end', radial: { angle: 0, y: -0.9 } },
				link: { index: 3, angle: 0, y: 0.9 }
			}
		],
		stages: [[2]]
	});

	test('a link is a point on the surface of the target, in the inertial axes', async () => {
		const design = spanning();
		const { sim, id } = await launch(design);
		const v = vessel(sim, id);
		const strut = v.parts[5]!;
		const target = v.parts[3]!;
		expect(strut.link?.peer).toBe(target.id);
		// y 0.9 m above the lower tank's centre, on its +X side: the tank radius from its axis.
		const axis = { x: 0, y: 1, z: 0 };
		const rot = (q: typeof v.orientation, w: typeof axis) => {
			const u = { x: q.x, y: q.y, z: q.z };
			const t = {
				x: 2 * (u.y * w.z - u.z * w.y),
				y: 2 * (u.z * w.x - u.x * w.z),
				z: 2 * (u.x * w.y - u.y * w.x)
			};
			return {
				x: w.x + q.w * t.x + (u.y * t.z - u.z * t.y),
				y: w.y + q.w * t.y + (u.z * t.x - u.x * t.z),
				z: w.z + q.w * t.z + (u.x * t.y - u.y * t.x)
			};
		};
		const up = rot(v.orientation, axis);
		const d = {
			x: strut.link!.point.x - target.position.x,
			y: strut.link!.point.y - target.position.y,
			z: strut.link!.point.z - target.position.z
		};
		expect(d.x * up.x + d.y * up.y + d.z * up.z).toBeCloseTo(0.9, 6);
		expect(Math.hypot(d.x, d.y, d.z)).toBeCloseTo(Math.hypot(0.9, 0.625), 6);
		sim.dispose();
	});

	test('a strut across a decoupler does not hold the halves together: the vessel splits and the link is cut', async () => {
		const { sim, id } = await launch(spanning());
		expect(vessel(sim, id).parts.filter((p) => p.link)).toHaveLength(1);
		expect(sim.snapshot().vessels).toHaveLength(1);
		sim.dispatch({ type: 'stage', vessel: id });
		const vessels = sim.snapshot().vessels;
		expect(vessels).toHaveLength(2);
		expect(vessels.flatMap((v) => v.parts).filter((p) => p.link)).toHaveLength(0);
		// The strut stays with the upper tank it hangs on, the engine half leaves.
		const keeper = vessels.find((v) => v.id === id)!;
		expect(keeper.parts.map((p) => String(p.definition))).toContain('stock.strut');
		sim.dispose();
	});

	test('a strut inside one stage stays after a separation elsewhere; the run is deterministic', async () => {
		const runs: string[] = [];
		for (let i = 0; i < 2; i++) {
			const design = asparagus(2, { lines: false, struts: true });
			const { sim, id } = await launch(design);
			sim.dispatch({ type: 'throttle', vessel: id, value: 1 });
			sim.dispatch({ type: 'stage', vessel: id });
			run(sim, 4);
			runs.push(JSON.stringify(sim.snapshot()));
			expect(vessel(sim, id).parts.filter((p) => p.link)).toHaveLength(2);
			sim.dispose();
		}
		expect(runs[1]).toBe(runs[0]!);
	});

	test('a connector part without its design link is refused at load', async () => {
		const bad = spanning();
		const last = bad.parts[bad.parts.length - 1]!;
		const { link: _link, ...without } = last;
		const sim = await newSim();
		const r = sim.dispatch({
			type: 'load-vessel',
			design: { ...bad, parts: [...bad.parts.slice(0, -1), without] }
		});
		expect(r.ok).toBe(false);
		sim.dispose();
	});
});
