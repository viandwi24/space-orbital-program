/** The stock main line (plan 100, ADR 0151): a done mission starts its next; prerequisites hold. */
import { describe, expect, test } from 'bun:test';
import { legacyWorldInfo } from '@orbital/core';
import Sol from '@orbital/mod-sol';
import Stock from '@orbital/mod-stock';
import { createSim, type Sim } from '../src/index.ts';
import { createAscent, defaultAscent } from './helpers/ascent.ts';
import { rapier, twoStage } from './helpers/vessels.ts';

const newSim = () => createSim({ plugins: [Stock], backendFactory: rapier(), seed: 1 });

const status = (sim: Sim, id: string) =>
	sim.snapshot().objectives?.find((o) => o.source.id === id)?.status;

describe('stock main line', () => {
	test('a mission whose prerequisites are not done is refused', async () => {
		const sim = await newSim();
		const r = sim.dispatch({
			type: 'objective-start',
			source: { kind: 'mission', id: 'stock.orbit' }
		});
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.reason).toContain('"stock.space"');
	});

	test('completing mission 1 in the headless ascent starts mission 2 (its next)', async () => {
		const sim = await newSim();
		expect(
			sim.dispatch({
				type: 'objective-start',
				source: { kind: 'mission', id: 'stock.first-launch' }
			}).ok
		).toBe(true);
		const loaded = sim.dispatch({ type: 'load-vessel', design: twoStage() });
		if (!loaded.ok) throw new Error(loaded.reason);
		const completed: string[] = [];
		sim.events.on('objective:completed', (e) => completed.push(e.source.id));
		const ascent = createAscent(sim, loaded.vessel!, {
			...defaultAscent,
			apoapsis: 95_000,
			periapsis: 85_000
		});
		while (sim.time < 400 && !completed.includes('stock.space')) {
			sim.step(0.02);
			ascent.update();
		}
		expect(completed[0]).toBe('stock.first-launch');
		// mission 2 started on its own when mission 1 was done, and went on to be done in the climb
		expect(completed).toContain('stock.space');
		expect(status(sim, 'stock.first-launch')).toBe('done');
		expect(status(sim, 'stock.orbit')).toBe('active');
		// nothing past the line's next step started
		expect(status(sim, 'stock.moon-flyby')).toBeUndefined();
	});
});

describe('the main line in a Sol world (system audit D3)', () => {
	const solSim = () =>
		createSim({
			plugins: [Stock, Sol],
			backendFactory: rapier(),
			seed: 1,
			world: {
				...legacyWorldInfo(1),
				id: 'missions-sol',
				systemId: 'sol',
				systemVersion: '0.1.0',
				variant: 'rescaled',
				sites: []
			}
		});
	const start = (sim: Sim, id: string) =>
		sim.dispatch({ type: 'objective-start', source: { kind: 'mission', id } });

	test('the Moon missions name the Moon; a planet mission for stock bodies is not flown', async () => {
		const sim = await solSim();
		expect(start(sim, 'stock.first-launch').ok).toBe(true);
		// refused for its prerequisites only: `moon` is the Earth's Moon here
		const moon = start(sim, 'stock.moon-landing');
		expect(moon.ok ? '' : moon.reason).toContain('completed first');
		const ochre = start(sim, 'stock.ochre-flyby');
		expect(ochre.ok ? '' : ochre.reason).toBe('this world has no "stock.ochre"');
		sim.dispose();
	});
});
