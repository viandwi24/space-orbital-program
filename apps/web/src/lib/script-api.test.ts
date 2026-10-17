import { partId, type VesselDesign } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { createRapierBackend } from '@orbital/physics';
import { createScriptRunner } from '@orbital/scripting';
import { createSim } from '@orbital/sim';
import { describe, expect, it } from 'vitest';
import { GLOBALS, SHIP } from './script-api';

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

	it('has a signature and a description for every entry, and no name twice', () => {
		for (const e of [...GLOBALS, ...SHIP]) {
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
