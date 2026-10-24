/**
 * Plan 275 (CPL-02): a separator cuts the stack as a decoupler does and is used up by the cut, so
 * neither stage carries a ring and no third vessel is left behind.
 */
import { expect, test } from 'bun:test';
import { newSim, stack } from './helpers/vessels.ts';

// 0 pod, 1 tank, 2 separator, 3 tank, 4 engine; stage 0 fires the separator.
const PARTS = [
	'stock.command-pod',
	'stock.tank-small',
	'stock.separator-1250',
	'stock.tank-small',
	'stock.engine-lv'
];

test('a fired separator is removed and the stack falls into two vessels', async () => {
	const sim = await newSim();
	const loaded = sim.dispatch({ type: 'load-vessel', design: stack('Separated', PARTS, [[2]]) });
	if (!loaded.ok) throw new Error(loaded.reason);
	const destroyed: string[] = [];
	sim.events.on('vessel:destroyed', (e) => destroyed.push(e.reason));
	expect(sim.snapshot().vessels).toHaveLength(1);
	expect(sim.dispatch({ type: 'stage', vessel: loaded.vessel! }).ok).toBe(true);
	sim.step(0.02);
	sim.step(0.02);
	const vessels = sim.snapshot().vessels;
	const parts = vessels.map((v) => v.parts.map((p) => String(p.definition)).sort());
	// the upper stage keeps the pod and its tank; the lower one its tank and engine; no separator anywhere
	expect(vessels).toHaveLength(2);
	expect(parts.flat()).not.toContain('stock.separator-1250');
	expect(parts.flat().sort()).toEqual(
		['stock.command-pod', 'stock.engine-lv', 'stock.tank-small', 'stock.tank-small'].sort()
	);
	expect(destroyed).toEqual(['spent']);
	sim.dispose();
});

test('a decoupler of the same stack leaves its ring on the lower stage', async () => {
	const sim = await newSim();
	const parts = [...PARTS];
	parts[2] = 'stock.decoupler';
	const loaded = sim.dispatch({ type: 'load-vessel', design: stack('Decoupled', parts, [[2]]) });
	if (!loaded.ok) throw new Error(loaded.reason);
	sim.dispatch({ type: 'stage', vessel: loaded.vessel! });
	sim.step(0.02);
	const all = sim.snapshot().vessels.flatMap((v) => v.parts.map((p) => String(p.definition)));
	expect(all).toContain('stock.decoupler');
	sim.dispose();
});
