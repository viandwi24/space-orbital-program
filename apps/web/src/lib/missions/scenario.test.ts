/** A mission pack from examples/ (plan 100, ADR 0151 point 4): its world starts with a vessel in orbit. */
import { calendarOf, loadPlugins } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { createRapierBackend } from '@orbital/physics';
import { createSim } from '@orbital/sim';
import { describe, expect, it } from 'vitest';
import Sample from '../../../../../examples/mod-sample/src/index';
import { createWorldInfo } from '../worlds/world-model';
import { scenarioStart } from './scenario-start';

const plugins = [Stock, Sample];
const { registries } = loadPlugins(plugins);
const catalog = { rules: registries.rules.list(), presets: registries.presets.list() };

describe('the sample mission pack', () => {
	it('creates a world with its starting vessel in a 100 km orbit and its mission running', async () => {
		const scenario = registries.scenarios.get('sample.relay-start')!;
		const made = createWorldInfo(
			{
				id: 'w-pack',
				seed: 3,
				preset: scenario.preset,
				rules: scenario.rules ?? {},
				start: { kind: 'day-one' },
				gravityModel: 'patched',
				systemId: 'stock',
				systemVersion: '1.0.0',
				variant: 'default'
			},
			catalog,
			calendarOf(registries.bodies.list()),
			0
		);
		if (!made.ok) throw new Error(made.reason);
		expect(made.world.preset).toBe('stock.career');

		const start = scenarioStart(scenario, registries.bodies);
		expect(start.design.name).toBe('Relay 1');
		const sim = await createSim({
			plugins,
			world: made.world,
			backendFactory: () => createRapierBackend({ solverIterations: 16 }),
			seed: 3
		});
		const loaded = sim.dispatch({
			type: 'load-vessel',
			design: start.design,
			placement: start.placement
		});
		if (!loaded.ok) throw new Error(loaded.reason);
		for (const id of start.missions)
			expect(sim.dispatch({ type: 'objective-start', source: { kind: 'mission', id } }).ok).toBe(
				true
			);
		for (let i = 0; i < 50; i++) sim.step(0.02);

		const v = sim.snapshot().vessels.find((x) => x.id === loaded.vessel)!;
		const home = registries.bodies.get('stock.home')!;
		expect(v.soi).toBe('stock.home');
		const o = v.orbit!;
		expect(o.e).toBeLessThan(0.01);
		expect(o.a * (1 - o.e) - home.radius).toBeGreaterThan(95_000);
		expect(sim.snapshot().objectives?.find((x) => x.source.id === 'sample.to-cinder')?.status).toBe(
			'active'
		);
	});
});
