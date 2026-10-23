import { describe, expect, test } from 'bun:test';
import type { EntityId } from '@orbital/core';
import Stock, { PartTankSmall } from '@orbital/mod-stock';
import { definePlugin } from '@orbital/sdk';
import { advanceTemperature, noseRadius, stagnationFlux, surfaceArea } from '../src/thermal.ts';
import { PART } from '../src/state.ts';
import {
	AMBIENT_TEMPERATURE,
	EMISSIVITY,
	SKIN_HEAT_CAPACITY,
	STEFAN_BOLTZMANN
} from '../src/index.ts';
import { altitude, orbitState } from './helpers/measure.ts';
import { deorbit, enter, probeEntry, shieldedProbe, type EntryOptions } from './helpers/reentry.ts';
import { newSim, probe, stack } from './helpers/vessels.ts';

/** A small tank rated 800 K (the stock one takes 2000 K since plan 212): the overheat path. */
const HotTank = definePlugin({
	meta: { id: 'test', version: '1.0.0', api: '^0.1' },
	depends: [Stock],
	setup(ctx) {
		ctx.parts.register({
			...PartTankSmall,
			id: 'test.tank-800',
			maxTemperature: 800
		} as typeof PartTankSmall);
	}
});
const probeHotEntry = () =>
	stack('Probe', ['stock.command-pod', 'stock.reaction-wheel', 'test.tank-800'], []);

interface Run {
	damaged: Array<{ t: number } & Record<string, unknown>>;
	peak: number;
	peakByPart: Map<string, number>;
	parts: number;
	ablator: number | undefined;
	end: string;
	json: string;
}

/** Fly an entry until the vessel is below 5 km, gone, or `limit` seconds passed. */
async function fly(
	design: Parameters<typeof enter>[0],
	opts: EntryOptions,
	limit = 900,
	extra: Parameters<typeof enter>[2] = {}
): Promise<Run> {
	const { sim, id, damaged } = await enter(design, opts, extra);
	let peak = 0;
	const peakByPart = new Map<string, number>();
	let parts = 0;
	let ablator: number | undefined;
	let end = 'time';
	while (sim.time < limit) {
		sim.step(0.02);
		const snap = sim.snapshot();
		const v = snap.vessels.find((s) => s.id === id);
		if (!v) {
			end = 'gone';
			break;
		}
		parts = v.parts.length;
		for (const p of v.parts) {
			peak = Math.max(peak, p.temperature!);
			peakByPart.set(p.definition, Math.max(peakByPart.get(p.definition) ?? 0, p.temperature!));
			const shield = p.modules['stock.heat-shield'] as { ablator: number } | undefined;
			if (shield) ablator = shield.ablator;
		}
		if (altitude(v.position) < 5_000) {
			end = 'low';
			break;
		}
	}
	const json = JSON.stringify([sim.snapshot(), sim.world.serialize()]);
	sim.dispose();
	return { damaged, peak, peakByPart, parts, ablator, end, json };
}

describe('re-entry heating (plan 014, ADR 0023)', () => {
	test('an unshielded probe on a deorbit path heats tail first and, under KSP-like limits, survives', async () => {
		// plan 212 (ADR 0204 point 5): parts fail at 2000 K, pods 2400 K; a low-orbit return stays under
		const run = await fly(probeEntry(), deorbit);
		console.log(`unshielded: end ${run.end}, peak ${run.peak.toFixed(0)} K`);
		expect(run.end).toBe('low');
		expect(run.damaged).toEqual([]);
		expect(run.peak).toBeGreaterThan(600);
		expect(run.peakByPart.get('stock.tank-small')).toBe(run.peak); // the end facing the flow
	});

	test('a part rated for less overheats and is lost on the same entry, tail first', async () => {
		const run = await fly(probeHotEntry(), deorbit, 900, { plugins: [HotTank] });
		const burnt = run.damaged.filter((d) => d.cause === 'overheat');
		console.log(
			`unshielded: end ${run.end}, peak ${run.peak.toFixed(0)} K, lost ` +
				burnt
					.map((d) => `${d.definition}@${d.t.toFixed(0)}s/${Math.round(d.temperature as number)}K`)
					.join(', ')
		);
		expect(burnt.length).toBeGreaterThanOrEqual(1);
		expect(burnt[0]!.definition).toBe('test.tank-800'); // the end facing the flow goes first
		expect(burnt[0]!.outcome).toBe('destroyed');
		expect(burnt[0]!.temperature as number).toBeGreaterThan(800);
		expect(run.damaged.every((d) => d.cause === 'overheat')).toBe(true); // nothing reached the ground
	});

	test('the same entry with a heat shield loses nothing and burns ablator', async () => {
		const run = await fly(shieldedProbe(), deorbit);
		console.log(
			`shielded: end ${run.end}, peak ${run.peak.toFixed(0)} K, ablator left ${run.ablator?.toFixed(2)} of 300`
		);
		expect(run.end).toBe('low');
		expect(run.damaged).toEqual([]);
		expect(run.parts).toBe(4);
		expect(run.ablator!).toBeLessThan(300); // the realistic shield's (plan 380)
		expect(run.ablator!).toBeGreaterThan(0);
		expect(run.peak).toBeLessThan(900); // below the tank limit
	});

	test('"Re-entry heating" 0 keeps every part cool; at 1 a shielded pod stays under its 2400 K', async () => {
		const off = await fly(probeEntry(), deorbit, 900, { heating: 0 });
		expect(off.peak).toBeLessThan(400);
		expect(off.damaged).toEqual([]);
		const on = await fly(shieldedProbe(), deorbit, 900, { heating: 1 });
		expect(on.peakByPart.get('stock.command-pod')!).toBeLessThan(2_400);
		expect(on.damaged).toEqual([]);
		// a hotter rule heats more
		const hot = await fly(probeEntry(), deorbit, 900, { heating: 1.2 });
		const normal = await fly(probeEntry(), deorbit, 900, { heating: 1 });
		expect(hot.peak).toBeGreaterThan(normal.peak);
	}, 120_000); // four entries: past bun's 5 s default on a loaded CI runner

	test('a slow, low pass does not heat significantly', async () => {
		const run = await fly(probeEntry(), { altitude: 10_000, speed: 300, angle: 0.4 }, 20);
		console.log(`slow: peak ${run.peak.toFixed(1)} K`);
		expect(run.peak).toBeLessThan(AMBIENT_TEMPERATURE + 10);
		expect(run.damaged).toEqual([]);
	});

	test('re-entry is deterministic: two runs give byte-identical snapshots and worlds', async () => {
		const a = await fly(shieldedProbe(), deorbit, 250);
		const b = await fly(shieldedProbe(), deorbit, 250);
		expect(b.json).toBe(a.json);
	});

	test('a hot part cools by radiation: in flight on the ground and on rails in orbit', async () => {
		const sim = await newSim();
		const flight = sim.dispatch({ type: 'load-vessel', design: probe() });
		if (!flight.ok) throw new Error(flight.reason);
		const part = (id: EntityId) => sim.world.get(id, PART)!;
		const tank = sim.snapshot().vessels[0]!.parts[2]!.id;
		part(tank).temperature = 800;
		let last = 800;
		for (let i = 0; i < 10; i++) {
			sim.step(60); // 3000 flight steps
			const t = part(tank).temperature;
			expect(t).toBeLessThan(last);
			last = t;
		}
		expect(last).toBeLessThan(500);
		expect(last).toBeGreaterThan(AMBIENT_TEMPERATURE);
		// The snapshot carries it.
		expect(sim.snapshot().vessels[0]!.parts[2]!.temperature).toBe(last);
		sim.dispose();
	});

	test('a hot part cools on rails too', async () => {
		const sim = await newSim();
		const placed = sim.dispatch({
			type: 'load-vessel',
			design: probe(),
			placement: { kind: 'state', ...orbitState(sim, 100_000) }
		});
		if (!placed.ok) throw new Error(placed.reason);
		expect(sim.snapshot().vessels[0]!.mode).toBe('on-rails');
		const tank = sim.snapshot().vessels[0]!.parts[2]!.id;
		sim.world.get(tank, PART)!.temperature = 800;
		sim.step(600);
		expect(sim.world.get(tank, PART)!.temperature).toBeLessThan(500);
		sim.dispose();
	});
});

describe('thermal model pieces', () => {
	const area = surfaceArea({ kind: 'cylinder', radius: 0.625, height: 2 });
	const capacity = SKIN_HEAT_CAPACITY * area;

	test('surface area and nose radius of a cylinder and a box', () => {
		expect(area).toBeCloseTo(2 * Math.PI * 0.625 * 2.625, 9);
		expect(surfaceArea({ kind: 'box', size: [1, 2, 3] })).toBe(22);
		expect(noseRadius({ kind: 'cylinder', radius: 0.625, height: 2 })).toBe(0.625);
		expect(noseRadius({ kind: 'box', size: [1, 2, 3] })).toBe(0.5);
	});

	test('Sutton-Graves flux scales as sqrt(density) and speed cubed', () => {
		const q = stagnationFlux(1e-3, 0.625, 2_000);
		expect(q).toBeCloseTo(1.74e-4 * Math.sqrt(1e-3 / 0.625) * 8e9, 6);
		expect(stagnationFlux(4e-3, 0.625, 2_000) / q).toBeCloseTo(2, 12);
		expect(stagnationFlux(1e-3, 0.625, 4_000) / q).toBeCloseTo(8, 12);
	});

	test('without power a hot part relaxes monotonically to the ambient temperature, for any step', () => {
		for (const h of [0.02, 1, 10, 1e4]) {
			let t = 900;
			for (let i = 0; i < 5; i++) {
				const next = advanceTemperature(t, 0, capacity, area, h);
				expect(next).toBeLessThanOrEqual(t);
				expect(next).toBeGreaterThanOrEqual(AMBIENT_TEMPERATURE);
				t = next;
			}
		}
		expect(advanceTemperature(AMBIENT_TEMPERATURE, 0, capacity, area, 100)).toBeCloseTo(
			AMBIENT_TEMPERATURE,
			9
		);
	});

	test('with constant power it converges to the radiative equilibrium', () => {
		const power = 40_000;
		const t = advanceTemperature(AMBIENT_TEMPERATURE, power, capacity, area, 1e12);
		const out = EMISSIVITY * STEFAN_BOLTZMANN * area * (t ** 4 - AMBIENT_TEMPERATURE ** 4);
		expect(out).toBeCloseTo(power, 3);
	});

	test('small steps agree with the explicit integration to first order', () => {
		let t = 300;
		const power = 20_000;
		for (let i = 0; i < 500; i++) t = advanceTemperature(t, power, capacity, area, 0.02);
		let e = 300;
		for (let i = 0; i < 500; i++) {
			e +=
				(0.02 / capacity) *
				(power - EMISSIVITY * STEFAN_BOLTZMANN * area * (e ** 4 - AMBIENT_TEMPERATURE ** 4));
		}
		expect(Math.abs(t - e) / (e - 300)).toBeLessThan(0.01);
	});
});
