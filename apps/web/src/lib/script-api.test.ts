import { partId, type VesselDesign } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { createRapierBackend } from '@orbital/physics';
import { createScriptRunner } from '@orbital/scripting';
import { createSim } from '@orbital/sim';
import { describe, expect, it } from 'vitest';
import { DEBUG, GLOBALS, SHIP } from './script-api';

/** The lower-case names ECMAScript itself puts on a QuickJS global. */
const ECMASCRIPT = new Set(
	'decodeURI decodeURIComponent encodeURI encodeURIComponent escape eval globalThis isFinite isNaN parseFloat parseInt undefined unescape'.split(
		' '
	)
);

const probe: VesselDesign = {
	formatVersion: 1,
	name: 'Probe',
	parts: ['stock.command-pod', 'stock.reaction-wheel', 'stock.tank-small'].map((part, index) => ({
		index,
		part: partId(part),
		parent: index === 0 ? null : { index: index - 1, parentNode: 'bottom', node: 'top' }
	})),
	stages: []
};

describe('the typed script API table against the real sandbox', () => {
	it('lists exactly the globals and the ship members the engine defines', async () => {
		const sim = await createSim({
			plugins: [Stock],
			backendFactory: () => createRapierBackend({ solverIterations: 16 }),
			maxFlightFrames: 1
		});
		try {
			const loaded = sim.dispatch({ type: 'load-vessel', design: probe });
			if (!loaded.ok) throw new Error(loaded.reason);
			const runner = await createScriptRunner(
				`
				print(Object.getOwnPropertyNames(globalThis).filter((n) => !/^[A-Z]/.test(n)).sort().join(','));
				print(Object.keys(ship).sort().join(','));
				print(String(typeof bodies['stock.home'].state));
				`,
				{
					vessel: Number(loaded.vessel),
					bodies: sim.registries.bodies.list(),
					parts: sim.registries.parts.list(),
					resources: sim.registries.resources.list(),
					budgetMs: 2_000
				}
			);
			runner.tick(sim.snapshot());
			expect(runner.status).toBe('finished');
			const globals = runner.logs[0]!.split(',').filter((n) => !ECMASCRIPT.has(n));
			expect(globals.sort()).toEqual(GLOBALS.map((e) => e.name).sort());
			expect(runner.logs[1]!.split(',')).toEqual(SHIP.map((e) => e.name).sort());
		} finally {
			sim.dispose();
		}
	}, 30_000);

	it('defines debug only with Debug mode on, with exactly the members of the table (plan 203)', async () => {
		const sim = await createSim({
			plugins: [Stock],
			backendFactory: () => createRapierBackend({ solverIterations: 16 }),
			maxFlightFrames: 1
		});
		try {
			const loaded = sim.dispatch({ type: 'load-vessel', design: probe });
			if (!loaded.ok) throw new Error(loaded.reason);
			const source = `print(typeof debug, typeof debug === 'object' ? Object.keys(debug).sort().join(',') : '-');
				print(typeof globalThis.debug?.setResource);`;
			const env = {
				vessel: Number(loaded.vessel),
				bodies: sim.registries.bodies.list(),
				parts: sim.registries.parts.list(),
				resources: sim.registries.resources.list(),
				budgetMs: 2_000
			};
			const off = await createScriptRunner(source, env);
			off.tick(sim.snapshot());
			expect(off.logs).toEqual(['undefined -', 'undefined']);
			off.dispose();
			const on = await createScriptRunner(source, { ...env, debug: true });
			on.tick(sim.snapshot());
			expect(on.logs[0]).toBe(`object ${DEBUG.map((e) => e.name).sort().join(',')}`);
			expect(on.logs[1]).toBe('function');
			on.dispose();
		} finally {
			sim.dispose();
		}
	}, 30_000);

	it('has a signature and a description for every entry, and no name twice', () => {
		for (const e of [...GLOBALS, ...SHIP, ...DEBUG]) {
			expect(e.signature.length, e.name).toBeGreaterThan(2);
			expect(e.doc.length, e.name).toBeGreaterThan(10);
		}
		expect(new Set(GLOBALS.map((e) => e.name)).size).toBe(GLOBALS.length);
		expect(new Set(SHIP.map((e) => e.name)).size).toBe(SHIP.length);
	});

	it('marks exactly the setters the prelude defines as writable', () => {
		expect(SHIP.filter((e) => e.writable).map((e) => e.name)).toEqual([
			'throttle',
			'attitude',
			'sas'
		]);
	});
});
