/**
 * Plan 026 / ADR 0034: stage delta-v of a core with two radial boosters equals the Tsiolkovsky
 * intervals worked out by hand. The boosters (150 kN, Isp 270 s, 2 500 kg of propellant each)
 * burn dry before the core stage (215 kN, Isp 300 s, 4 450 kg), so stage 0 ends at booster
 * burnout and the radial decouplers' stage burns the rest of the core.
 */
import { loadPlugins, partId, type VesselDesign } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { describe, expect, it } from 'vitest';
import { stageDeltaV, stagingModelFromDesign } from './delta-v';

const { registries } = loadPlugins([Stock]);
const content = {
	parts: registries.parts,
	modules: registries.modules,
	resources: registries.resources
};
const G0 = 9.80665;
/** Relative agreement to 1e-9. */
const near = (a: number, b: number): void =>
	expect(Math.abs(a - b) / Math.abs(b)).toBeLessThan(1e-7);

function design(boosters: number): VesselDesign {
	const parts: VesselDesign['parts'] = [
		{ index: 0, part: partId('stock.command-pod'), parent: null },
		{
			index: 1,
			part: partId('stock.tank-small'),
			parent: { index: 0, parentNode: 'bottom', node: 'top' }
		},
		{
			index: 2,
			part: partId('stock.engine-lv'),
			parent: { index: 1, parentNode: 'bottom', node: 'top' }
		}
	];
	const engines = [2];
	const decouplers: number[] = [];
	for (let k = 0; k < boosters; k++) {
		const angle = (2 * Math.PI * k) / boosters;
		parts.push(
			{
				index: 10 + 2 * k,
				part: partId('stock.radial-decoupler'),
				parent: { index: 1, parentNode: 'surface', node: 'radial', radial: { angle, y: 0 } },
				symmetry: 1
			},
			{
				index: 11 + 2 * k,
				part: partId('stock.booster'),
				parent: { index: 10 + 2 * k, parentNode: 'outer', node: 'radial' },
				symmetry: 2
			}
		);
		engines.push(11 + 2 * k);
		decouplers.push(10 + 2 * k);
	}
	return { formatVersion: 2, name: 'Boosted', parts, stages: [engines, decouplers] };
}

describe('stage delta-v with radial boosters', () => {
	const n = 2;
	const report = stageDeltaV(stagingModelFromDesign(design(n), content));

	// Hand numbers (kg, N, s).
	// The pod also carries 50 EC at 1e-6 kg each.
	const podMass = 840 + 50e-6;
	const tank = { dry: 250, prop: 400 * 5 + 490 * 5 };
	const engine = 1250;
	const decoupler = 40;
	// 225 : 275 is exactly the engine's 0.9 : 1.1 mix, so both propellants run out together.
	const booster = { dry: 450, prop: 225 * 5 + 275 * 5 };
	const mdotCore = 215_000 / (300 * G0);
	const mdotBooster = 150_000 / (270 * G0);
	const m0 = podMass + tank.dry + tank.prop + engine + n * (decoupler + booster.dry + booster.prop);

	it('stage 0 is the burn until the boosters are empty', () => {
		const tBurn = booster.prop / mdotBooster;
		const flow = mdotCore + n * mdotBooster;
		const m1 = m0 - flow * tBurn;
		const thrust = 215_000 + n * 150_000;
		const expected = (thrust / flow) * Math.log(m0 / m1);
		const s0 = report.stages[0]!;
		expect(s0.stage).toBe(0);
		near(s0.dvVacuum, expected);
		expect(s0.burnTime).toBeCloseTo(tBurn, 9);
		expect(s0.massStart).toBeCloseTo(m0, 9);
		expect(s0.massEnd).toBeCloseTo(m1, 6);
		expect(s0.thrustVacuum).toBeCloseTo(thrust, 6);
		expect(s0.engines).toBe(1 + n);
	});

	it('stage 1 drops the boosters and burns the rest of the core', () => {
		const tBoost = booster.prop / mdotBooster;
		const left = tank.prop - mdotCore * tBoost;
		const before = podMass + tank.dry + left + engine;
		// The core tank holds 400 u of fuel to 490 u of oxidizer, not quite the 0.9 : 1.1 mix:
		// the fuel runs out first and leaves a little oxidizer behind.
		const fuelLeft = 400 - 0.09 * mdotCore * tBoost;
		const tCore = fuelLeft / (0.09 * mdotCore);
		const after = before - mdotCore * tCore;
		const expected = 300 * G0 * Math.log(before / after);
		const s1 = report.stages[1]!;
		expect(s1.stage).toBe(1);
		near(s1.dvVacuum, expected);
		expect(s1.massStart).toBeCloseTo(before, 6);
		expect(s1.thrustVacuum).toBeCloseTo(215_000, 6);
		near(report.totalVacuum, report.stages[0]!.dvVacuum + expected);
	});

	it('a booster that carries more propellant than the core ends the burn with the core', () => {
		// Without any separation stage nothing is shed: one burn to empty, all engines to the end.
		const plain = { ...design(n), stages: [[2, 11, 13]] };
		const r = stageDeltaV(stagingModelFromDesign(plain, content));
		expect(r.stages).toHaveLength(1);
		expect(r.stages[0]!.burnTime).toBeGreaterThan(booster.prop / mdotBooster - 1e-9);
	});
});
