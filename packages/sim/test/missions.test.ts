/** The stock main line (plan 100, ADR 0151): a done mission starts its next; prerequisites hold. */
import { describe, expect, test } from 'bun:test';
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
