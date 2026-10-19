/** Flow locks (plan 213): an engine drains only unlocked tanks; with all locked it flames out. */
import { describe, expect, test } from 'bun:test';
import type { EntityId } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { createSim, type Sim } from '../src/index.ts';
import { rapier, stack } from './helpers/vessels.ts';

const LF = 'stock.liquid-fuel';
const OX = 'stock.oxidizer';

const amount = (sim: Sim, part: EntityId, resource: string): number =>
	sim
		.snapshot()
		.vessels[0]!.parts.find((p) => p.id === part)!
		.resources!.find((r) => r.resource === resource)!.amount;

describe('flow lock (plan 213)', () => {
	test('an engine fed by two tanks drains only the unlocked one; both locked, it flames out', async () => {
		const sim = await createSim({ plugins: [Stock], backendFactory: rapier(), seed: 1 });
		const r = sim.dispatch({
			type: 'load-vessel',
			design: stack(
				'Locked',
				['stock.probe-core', 'stock.tank-small', 'stock.tank-small', 'stock.engine-lv'],
				[[3]]
			)
		});
		if (!r.ok) throw new Error(r.reason);
		const id = r.vessel!;
		const [a, b] = sim
			.snapshot()
			.vessels[0]!.parts.filter((p) => p.definition === 'stock.tank-small')
			.map((p) => p.id);
		for (const res of [LF, OX]) {
			expect(
				sim.dispatch({ type: 'set-flow-lock', vessel: id, part: a!, resource: res, locked: true })
			).toEqual({ ok: true });
		}
		const lockedRow = sim
			.snapshot()
			.vessels[0]!.parts.find((p) => p.id === a)!
			.resources!.find((x) => x.resource === LF)!;
		expect(lockedRow.locked).toBe(true);
		sim.dispatch({ type: 'throttle', vessel: id, value: 0.2 });
		sim.dispatch({ type: 'stage', vessel: id });
		for (let i = 0; i < 100; i++) sim.step(0.02);
		expect(amount(sim, a!, LF)).toBe(400);
		expect(amount(sim, b!, LF)).toBeLessThan(400);
		const flameouts: unknown[] = [];
		sim.events.on('stock:engine-flameout' as never, (e: unknown) => void flameouts.push(e));
		for (const res of [LF, OX]) {
			sim.dispatch({ type: 'set-flow-lock', vessel: id, part: b!, resource: res, locked: true });
		}
		sim.step(0.02);
		const engine = sim
			.snapshot()
			.vessels[0]!.parts.find((p) => p.definition === 'stock.engine-lv')!;
		expect((engine.modules['stock.engine'] as { flameout: boolean }).flameout).toBe(true);
		expect(flameouts.length).toBe(1);
		// unlocking A again lets it be the source
		expect(
			sim.dispatch({ type: 'set-flow-lock', vessel: id, part: a!, resource: LF, locked: false })
		).toEqual({ ok: true });
		expect(
			sim
				.snapshot()
				.vessels[0]!.parts.find((p) => p.id === a)!
				.resources!.find((x) => x.resource === LF)!.locked
		).toBe(false);
		sim.dispose();
	}, 30_000);

	test('a lock is a toggle per resource in the container descriptor', async () => {
		const { ModuleResourceContainer } = await import('@orbital/mod-stock');
		const d = ModuleResourceContainer.describe!(
			{ contents: { [LF]: { capacity: 10, amount: 10 }, [OX]: { capacity: 10, amount: 10 } } },
			{ amounts: { [LF]: 10, [OX]: 10 }, locked: { [OX]: true } }
		)!;
		expect(d.actions!.map((x) => [x.id, x.value ?? null])).toEqual([
			[`setLock:${LF}`, false],
			[`setLock:${OX}`, true],
			['transferOut', null],
			['transferIn', null]
		]);
	});
});
