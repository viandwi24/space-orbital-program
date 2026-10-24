/**
 * Plan 289 (ADR 0256): a 7.5 m stack built from the size-class parts stands on the pad and lifts
 * off on six large solid motors.
 */
import { describe, expect, test } from 'bun:test';
import { partId, type EntityId, type VesselDesign, type VesselSnapshot } from '@orbital/core';
import { dot, length, normalize } from '@orbital/kepler';
import type { Sim } from '../src/index.ts';
import { UP_Y, rotate } from './helpers/attitude.ts';
import { newSim } from './helpers/vessels.ts';

const CHAIN = [
	'stock.probe-core',
	'stock.adapter-1250-1875',
	'stock.adapter-1875-2500',
	'stock.adapter-2500-3750',
	'stock.adapter-3750-5000',
	'stock.adapter-5000-7500',
	'stock.tank-7500'
];
/** The same chain topped with six 15 m tanks: about 100 m of 7.5 m stack (plan 275). */
const TALL = [...CHAIN, ...Array.from({ length: 6 }, () => 'stock.tank-7500-long')];
const EMPTY = {
	'stock.resource-container': {
		contents: {
			'stock.liquid-fuel': { capacity: 25_920, amount: 0 },
			'stock.oxidizer': { capacity: 31_680, amount: 0 }
		}
	}
};

/**
 * The probe core, the adapter chain 1.25 → 7.5 m and a 7.5 m tank, with six `stock.srb-large` on
 * radial decouplers around the tank. The tank starts empty: full, it weighs about 320 t, and the
 * six motors give 1.8 MN.
 */
const tower = (chain: readonly string[] = CHAIN, count = 6): VesselDesign => {
	const parts: VesselDesign['parts'] = chain.map((part, index) => ({
		index,
		part: partId(part),
		parent: index === 0 ? null : { index: index - 1, parentNode: 'bottom', node: 'top' }
	}));
	// every tank starts empty
	chain.forEach((part, index) => {
		if (part.startsWith('stock.tank-'))
			parts[index] = { ...parts[index]!, settings: structuredClone(EMPTY) };
	});
	const last = chain.length - 1;
	const first = chain.length;
	const motors: number[] = [];
	const decouplers: number[] = [];
	for (let k = 0; k < count; k++) {
		const angle = (2 * Math.PI * k) / count;
		parts.push(
			{
				index: first + 2 * k,
				part: partId('stock.radial-decoupler'),
				parent: { index: last, parentNode: 'surface', node: 'radial', radial: { angle, y: 0 } },
				symmetry: 1
			},
			{
				index: first + 1 + 2 * k,
				part: partId('stock.srb-large'),
				parent: { index: first + 2 * k, parentNode: 'outer', node: 'radial' },
				symmetry: 2
			}
		);
		decouplers.push(first + 2 * k);
		motors.push(first + 1 + 2 * k);
	}
	return { formatVersion: 3, name: 'Tower 7.5 m', parts, stages: [motors, decouplers] };
};

const vessel = (sim: Sim, id: EntityId): VesselSnapshot =>
	sim.snapshot().vessels.find((v) => v.id === id)!;
const run = (sim: Sim, seconds: number): void => {
	for (let i = 0; i < Math.round(seconds / 0.02); i++) sim.step(0.02);
};
/** Cosine of the angle between the stack's axis and local up. */
const upright = (v: VesselSnapshot): number =>
	dot(rotate(v.orientation, UP_Y), normalize(v.position));

/** Loads `design`, lets it stand 5 s on the pad, stages it and checks that it climbs. */
async function standsAndLifts(design: VesselDesign, partCount: number): Promise<void> {
	const sim = await newSim();
	const loaded = sim.dispatch({ type: 'load-vessel', design });
	if (!loaded.ok) throw new Error(loaded.reason);
	const id = loaded.vessel!;
	const start = vessel(sim, id);
	expect(start.parts).toHaveLength(partCount);
	const r0 = length(start.position);
	// throttle up: the vessel leaves the pad's rails for physics; the solid motors wait for a stage
	expect(sim.dispatch({ type: 'throttle', vessel: id, value: 1 }).ok).toBe(true);
	// 5 s on the ground, sampled every step while physics holds it (it goes back to surface rails
	// once it has rested 2 s, ADR 0024, which needs it still)
	let inFlight = 0;
	let drift = 0;
	let tilt = 1;
	for (let i = 0; i < 250; i++) {
		sim.step(0.02);
		const v = vessel(sim, id);
		if (v.mode !== 'flight') continue;
		inFlight++;
		drift = Math.max(drift, Math.abs(length(v.position) - r0));
		tilt = Math.min(tilt, upright(v));
	}
	// about the 2 s rest of ADR 0024 in physics (99 steps measured)
	expect(inFlight).toBeGreaterThanOrEqual(95);
	expect(drift).toBeLessThan(0.05);
	expect(tilt).toBeGreaterThan(Math.cos((1 * Math.PI) / 180));
	const stood = vessel(sim, id);
	expect(Math.abs(length(stood.position) - r0)).toBeLessThan(0.05);
	expect(sim.dispatch({ type: 'stage', vessel: id }).ok).toBe(true);
	run(sim, 5);
	const flying = vessel(sim, id);
	expect(length(flying.position) - r0).toBeGreaterThan(20);
	expect(upright(flying)).toBeGreaterThan(Math.cos((5 * Math.PI) / 180));
	sim.dispose();
}

describe('the 7.5 m size class on the pad (plan 289)', () => {
	test('the tower stands 5 s without sinking or tipping, then lifts off when staged', async () => {
		await standsAndLifts(tower(), CHAIN.length + 12);
	}, 120_000);

	test('a 100 m tower of 7.5 m tanks stands 5 s and lifts off (plan 275)', async () => {
		await standsAndLifts(tower(TALL, 10), TALL.length + 20);
	}, 240_000);
});
