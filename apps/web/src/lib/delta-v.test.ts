import { loadPlugins, type VesselSnapshot } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { createRapierBackend } from '@orbital/physics';
import { createSim } from '@orbital/sim';
import { describe, expect, it } from 'vitest';
import { referenceTwoStage } from './design';
import {
	entityIndexMap,
	stageDeltaV,
	stagingModelFromDesign,
	stagingModelFromSnapshot,
	twr,
	type ContentLookups
} from './delta-v';

const { registries } = loadPlugins([Stock]);
const content: ContentLookups = {
	parts: registries.parts,
	modules: registries.modules,
	resources: registries.resources
};

// Stock numbers written out by hand (mods/stock/src/parts.ts): the test must not read them from the code under test.
const G0 = 9.80665;
const THRUST = 215_000;
const ISP_VAC = 300;
const ISP_SL = 280;
const MASS = { pod: 840, wheel: 100, tank: 250, engine: 1250, decoupler: 50 };
const EC = 50 * 1e-6;
const U = 5; // kg per unit of fuel / oxidizer
const mdot = THRUST / (ISP_VAC * G0);
const rateFuel = (mdot * 0.9) / (0.9 * U + 1.1 * U);
const rateOx = (mdot * 1.1) / (0.9 * U + 1.1 * U);
const burnTime = Math.min(400 / rateFuel, 490 / rateOx);
const burned = mdot * burnTime;
const tank = MASS.tank + (400 + 490) * U;
const m1 = MASS.pod + EC + MASS.wheel + tank + MASS.engine + MASS.decoupler + tank + MASS.engine;
const m2 = MASS.pod + EC + MASS.wheel + tank + MASS.engine;
const tsiolkovsky = (isp: number, m0: number, mEnd: number): number =>
	isp * G0 * Math.log(m0 / mEnd);

describe('stage delta-v of the stock two-stage vessel', () => {
	const model = stagingModelFromDesign(referenceTwoStage(), content);
	const report = stageDeltaV(model);
	it('matches Tsiolkovsky per stage, in vacuum and at sea level', () => {
		expect(report.stages.map((s) => s.stage)).toEqual([0, 1]);
		const [a, b] = report.stages;
		expect(Math.abs(a!.dvVacuum / tsiolkovsky(ISP_VAC, m1, m1 - burned) - 1)).toBeLessThan(1e-9);
		expect(Math.abs(a!.dvSeaLevel / tsiolkovsky(ISP_SL, m1, m1 - burned) - 1)).toBeLessThan(1e-9);
		expect(Math.abs(b!.dvVacuum / tsiolkovsky(ISP_VAC, m2, m2 - burned) - 1)).toBeLessThan(1e-9);
		expect(Math.abs(b!.dvSeaLevel / tsiolkovsky(ISP_SL, m2, m2 - burned) - 1)).toBeLessThan(1e-9);
		expect(a!.burnTime).toBeCloseTo(burnTime, 9);
	});
	it('stays at the figures journal 022 recorded: 1,161 + 2,844 m/s at sea level, 1,244 + 3,047 m/s in vacuum', () => {
		const [a, b] = report.stages;
		expect([a!.dvSeaLevel, b!.dvSeaLevel].map(Math.round)).toEqual([1161, 2844]);
		expect([a!.dvVacuum, b!.dvVacuum].map(Math.round)).toEqual([1244, 3047]);
	});
	it('the total is the sum of the stages', () => {
		const sum = tsiolkovsky(ISP_VAC, m1, m1 - burned) + tsiolkovsky(ISP_VAC, m2, m2 - burned);
		expect(Math.abs(report.totalVacuum / sum - 1)).toBeLessThan(1e-9);
	});
	it('thrust, TWR and fuel: full tank, sea-level thrust below vacuum thrust', () => {
		const a = report.stages[0]!;
		expect(a.thrustVacuum).toBeCloseTo(THRUST, 6);
		expect(a.thrustSeaLevel).toBeCloseTo((THRUST * ISP_SL) / ISP_VAC, 6);
		expect(a.propellant / a.propellantCapacity).toBeCloseTo(1, 12);
		expect(a.propellantCapacity).toBeCloseTo((400 + 490) * U, 6);
		expect(twr(a.thrustSeaLevel, a.massStart, 9.81)).toBeGreaterThan(1);
	});
	it('a design without engines or stages has no stages and no delta-v', () => {
		const empty = stageDeltaV(
			stagingModelFromDesign({ ...referenceTwoStage(), stages: [] }, content)
		);
		expect(empty.stages).toEqual([]);
		expect(empty.totalVacuum).toBe(0);
	});
});

describe('stage delta-v from a live snapshot', () => {
	it('drops what burned and what was jettisoned', async () => {
		const design = referenceTwoStage();
		const sim = await createSim({
			plugins: [Stock],
			backendFactory: () => createRapierBackend({ solverIterations: 16 }),
			maxFlightFrames: 1
		});
		try {
			const loaded = sim.dispatch({ type: 'load-vessel', design });
			if (!loaded.ok || loaded.vessel === undefined) throw new Error('load failed');
			const id = loaded.vessel;
			const find = (): VesselSnapshot => sim.snapshot().vessels.find((v) => v.id === id)!;
			const map = entityIndexMap(design, find());
			expect(map.size).toBe(design.parts.length);

			// Pad: identical to the design.
			const pad = stageDeltaV(stagingModelFromSnapshot(design, content, find(), map), 0);
			expect(pad.totalVacuum).toBeCloseTo(
				stageDeltaV(stagingModelFromDesign(design, content)).totalVacuum,
				6
			);

			sim.dispatch({ type: 'throttle', vessel: id, value: 1 });
			sim.dispatch({ type: 'stage', vessel: id });
			sim.step(10);
			const live = stageDeltaV(stagingModelFromSnapshot(design, content, find(), map), 1);
			expect(live.stages[0]).toMatchObject({ stage: 0, current: true });
			expect(live.stages[0]!.burnTime).toBeGreaterThan(burnTime - 10.5);
			expect(live.stages[0]!.burnTime).toBeLessThan(burnTime - 9.5);
			expect(live.stages[0]!.propellant / live.stages[0]!.propellantCapacity).toBeLessThan(0.9);
			expect(live.stages[1]!.stage).toBe(1);
			expect(live.totalVacuum).toBeLessThan(pad.totalVacuum);

			// Fire stage 2: the booster is gone, only the upper burn remains.
			sim.step(Math.ceil(burnTime) - 8);
			sim.dispatch({ type: 'stage', vessel: id });
			sim.step(0.5);
			const upper = stageDeltaV(stagingModelFromSnapshot(design, content, find(), map), 2);
			expect(upper.stages[0]).toMatchObject({ stage: 1, current: true });
			expect(upper.stages).toHaveLength(1);
			expect(upper.totalVacuum).toBeLessThan(tsiolkovsky(ISP_VAC, m2, m2 - burned) + 1);
			expect(upper.totalVacuum).toBeGreaterThan(tsiolkovsky(ISP_VAC, m2, m2 - burned) * 0.8);
		} finally {
			sim.dispose();
		}
	}, 30_000);
});
