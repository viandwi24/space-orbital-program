/**
 * Plan 041 / ADR 0071: stage delta-v of an asparagus design (two boosters feeding the core through
 * fuel lines) equals the Tsiolkovsky intervals worked out by hand, with the draw order of the sim
 * (the lines' sources first), and a tilted engine loses the cosine of its tilt.
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
const near = (a: number, b: number, tolerance = 1e-9): void =>
	expect(Math.abs(a - b) / Math.abs(b)).toBeLessThan(tolerance);

/** Pod, tank (1), engine (2) and `n` boosters on radial decouplers, with a fuel line from each booster to the tank when `lines`. */
function asparagus(n: number, lines: boolean): VesselDesign {
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
	for (let k = 0; k < n; k++) {
		const angle = (2 * Math.PI * k) / n;
		parts.push(
			{
				index: 10 + 3 * k,
				part: partId('stock.radial-decoupler'),
				parent: { index: 1, parentNode: 'surface', node: 'radial', radial: { angle, y: 0 } },
				symmetry: 1
			},
			{
				index: 11 + 3 * k,
				part: partId('stock.booster-liquid'),
				parent: { index: 10 + 3 * k, parentNode: 'outer', node: 'radial' },
				symmetry: 2
			}
		);
		if (lines) {
			parts.push({
				index: 12 + 3 * k,
				part: partId('stock.fuel-line'),
				parent: {
					index: 11 + 3 * k,
					parentNode: 'surface',
					node: 'end',
					radial: { angle: Math.PI, y: 0.5 }
				},
				link: { index: 1, angle, y: 0.5 },
				symmetry: 3
			});
		}
		engines.push(11 + 3 * k);
		decouplers.push(10 + 3 * k);
	}
	return { formatVersion: 3, name: 'Asparagus', parts, stages: [engines, decouplers] };
}

describe('stage delta-v with fuel lines (ADR 0071)', () => {
	const n = 2;
	const report = stageDeltaV(stagingModelFromDesign(asparagus(n, true), content));
	const podMass = 840 + 50e-6;
	const tank = { dry: 250, prop: 400 * 5 + 490 * 5 };
	const engine = 1250;
	const decoupler = 40;
	const line = 10;
	// 225 : 275 is exactly the 0.9 : 1.1 mix of both engines.
	const booster = { dry: 450, prop: 225 * 5 + 275 * 5 };
	const mdotCore = 215_000 / (300 * G0);
	const mdotBooster = 150_000 / (270 * G0);
	const m0 =
		podMass + tank.dry + tank.prop + engine + n * (decoupler + booster.dry + booster.prop + line);

	it('stage 0 ends when the first booster is empty: it fed the core as well as its own engine', () => {
		// The first line (lowest index) is drawn first: that booster supplies the core engine and its
		// own, the second only its own. The core tank is not touched.
		const tBurn = booster.prop / (mdotCore + mdotBooster);
		const flow = mdotCore + n * mdotBooster;
		const m1 = m0 - flow * tBurn;
		const thrust = 215_000 + n * 150_000;
		const s0 = report.stages[0]!;
		expect(s0.stage).toBe(0);
		expect(s0.burnTime).toBeCloseTo(tBurn, 9);
		near(s0.dvVacuum, (thrust / flow) * Math.log(m0 / m1));
		expect(s0.massStart).toBeCloseTo(m0, 9);
		expect(s0.massEnd).toBeCloseTo(m1, 6);
		expect(s0.engines).toBe(1 + n);
	});

	it('stage 1 drops the boosters (and their lines) and burns the full core tank alone', () => {
		const before = podMass + tank.dry + tank.prop + engine;
		const tCore = 400 / (0.09 * mdotCore);
		const after = before - mdotCore * tCore;
		const expected = 300 * G0 * Math.log(before / after);
		const s1 = report.stages[1]!;
		expect(s1.stage).toBe(1);
		near(s1.dvVacuum, expected);
		expect(s1.massStart).toBeCloseTo(before, 6);
		expect(s1.thrustVacuum).toBeCloseTo(215_000, 6);
		near(report.totalVacuum, report.stages[0]!.dvVacuum + expected);
	});

	it('without the lines the core burns its own tank and stage 0 ends at booster burnout', () => {
		const plain = stageDeltaV(stagingModelFromDesign(asparagus(n, false), content));
		expect(plain.stages[0]!.burnTime).toBeCloseTo(booster.prop / mdotBooster, 9);
		// Different propellant routing, different stage split: the lines change the answer.
		expect(plain.stages[0]!.burnTime).toBeGreaterThan(report.stages[0]!.burnTime * 2);
	});

	it('a line is one way: the booster does not draw from the core tank when the lines are the only link', () => {
		// A design whose only line points from the core tank to the booster feeds the booster engine
		// from the tank: reversing the direction changes who draws from whom.
		const d = asparagus(1, true);
		const reversed: VesselDesign = {
			...d,
			parts: d.parts.map((p) =>
				p.part === 'stock.fuel-line'
					? {
							...p,
							parent: {
								index: 1,
								parentNode: 'surface',
								node: 'end',
								radial: { angle: 0, y: -0.5 }
							},
							link: { index: 11, angle: 0, y: 0.5 }
						}
					: p
			)
		};
		const forward = stageDeltaV(stagingModelFromDesign(d, content));
		const back = stageDeltaV(stagingModelFromDesign(reversed, content));
		// Forward: the booster tank also feeds the core, so the booster empties early. Reversed: the
		// core tank feeds the booster engine: it burns longer than its own propellant allows.
		expect(forward.stages[0]!.burnTime).toBeLessThan(
			booster.prop / (mdotCore + mdotBooster) + 1e-6
		);
		expect(back.stages[0]!.burnTime).toBeGreaterThan(booster.prop / mdotBooster + 1);
	});
});

describe('stage delta-v of a canted engine (ADR 0071)', () => {
	const build = (tilt?: number): VesselDesign => ({
		formatVersion: 3,
		name: 'Canted',
		parts: [
			{ index: 0, part: partId('stock.command-pod'), parent: null },
			{
				index: 1,
				part: partId('stock.tank-small'),
				parent: { index: 0, parentNode: 'bottom', node: 'top' }
			},
			{
				index: 2,
				part: partId('stock.engine-lv'),
				parent: { index: 1, parentNode: 'bottom', node: 'top' },
				...(tilt === undefined ? {} : { tilt: { x: 0, y: 0, z: tilt } })
			}
		],
		stages: [[2]]
	});

	it('an engine tilted by 20 degrees gives the cosine of the thrust and the same mass flow', () => {
		const angle = (20 * Math.PI) / 180;
		const straight = stageDeltaV(stagingModelFromDesign(build(), content)).stages[0]!;
		const canted = stageDeltaV(stagingModelFromDesign(build(angle), content)).stages[0]!;
		near(canted.thrustVacuum, straight.thrustVacuum * Math.cos(angle));
		near(canted.dvVacuum, straight.dvVacuum * Math.cos(angle));
		expect(canted.burnTime).toBeCloseTo(straight.burnTime, 9);
		// A tilt of a quarter turn puts the thrust across the vessel: no delta-v along it.
		const sideways = stageDeltaV(stagingModelFromDesign(build(Math.PI / 2), content)).stages[0]!;
		expect(sideways.dvVacuum).toBeCloseTo(0, 6);
	});
});
