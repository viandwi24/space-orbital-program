/** Plan 224 / ADR 0223: user alarms stop any warp, fire for any vessel and survive a save. */
import { describe, expect, test } from 'bun:test';
import type { EntityId } from '@orbital/core';
import { orbitState } from './helpers/measure.ts';
import { moonLander, newSim, rapier } from './helpers/vessels.ts';

async function inOrbit(altitudes: number[] = [500_000]) {
	const sim = await newSim();
	const ids: EntityId[] = [];
	for (const alt of altitudes) {
		const res = sim.dispatch({
			type: 'load-vessel',
			design: moonLander(),
			placement: { kind: 'state', ...orbitState(sim, alt) }
		});
		if (!res.ok) throw new Error(res.reason);
		ids.push(res.vessel as EntityId);
	}
	return { sim, ids };
}

describe('alarms', () => {
	test('a time alarm at T+600 s stops a 1000x warp no later than T+600 s', async () => {
		const { sim } = await inOrbit();
		const fired: string[] = [];
		const stops: string[] = [];
		sim.events.on('alarm:fired', (e) => fired.push(e.name));
		sim.events.on('warp:stopped', (e) => stops.push(e.reason));
		const at = sim.time + 600;
		const r = sim.dispatch({ type: 'add-alarm', name: 'Wake up', time: at });
		expect(r).toMatchObject({ ok: true, alarm: 'alarm.1' });
		expect(sim.snapshot().alarms).toEqual([
			{ id: 'alarm.1', name: 'Wake up', time: at, kind: 'time' }
		]);
		expect(sim.dispatch({ type: 'warp', factor: 1_000 })).toMatchObject({ granted: 1_000 });
		let worst = -Infinity;
		let n = 0;
		while (sim.warp > 1 && n++ < 10_000) {
			sim.step(1 / 60);
			worst = Math.max(worst, sim.time);
		}
		expect(sim.warp).toBe(1);
		expect(worst).toBeLessThanOrEqual(at + 1e-6);
		expect(sim.time).toBeGreaterThan(at - 1);
		expect(fired).toEqual(['Wake up']);
		expect(stops).toEqual(['alarm "Wake up"']);
		expect(sim.snapshot().alarms).toBeUndefined();
		sim.dispose();
	});

	test('under physics warp a long frame still stops on the alarm within one step', async () => {
		const { sim } = await inOrbit();
		sim.dispatch({ type: 'throttle', vessel: 1 as EntityId, value: 0 });
		const at = sim.time + 20;
		expect(sim.dispatch({ type: 'add-alarm', name: 'Soon', time: at }).ok).toBe(true);
		sim.dispatch({ type: 'warp', factor: 10 });
		sim.step(30); // one slow frame: 300 s at 10x
		expect(sim.warp).toBe(1);
		expect(sim.time).toBeGreaterThanOrEqual(at - 1e-6);
		expect(sim.time - at).toBeLessThan(0.05);
		sim.dispose();
	});

	test("an alarm on an unfocused vessel's periapsis fires under warp", async () => {
		const { sim, ids } = await inOrbit([500_000, 700_000]);
		const [focus, other] = ids as [EntityId, EntityId];
		const fired: Array<EntityId | undefined> = [];
		sim.events.on('alarm:fired', (e) => fired.push(e.vessel));
		const r = sim.dispatch({ type: 'add-alarm', kind: 'periapsis', vessel: other });
		expect(r.ok).toBe(true);
		const alarm = sim.snapshot().alarms![0]!;
		expect(alarm).toMatchObject({ kind: 'periapsis', vessel: other, name: 'Periapsis' });
		expect(alarm.time).toBeGreaterThan(sim.time);
		sim.dispatch({ type: 'warp', factor: 1_000, vessel: focus });
		let n = 0;
		while (fired.length === 0 && n++ < 100_000) sim.step(1 / 60);
		expect(fired).toEqual([other]);
		expect(sim.warp).toBe(1);
		expect(Math.abs(sim.time - alarm.time)).toBeLessThan(1e-6);
		sim.dispose();
	});

	test('alarms survive a save and load; edit, remove and warp-to work', async () => {
		const { sim } = await inOrbit();
		sim.dispatch({ type: 'add-alarm', name: 'A', time: 9_000 });
		sim.dispatch({ type: 'add-alarm', name: 'B', time: 3_000 });
		expect(sim.snapshot().alarms!.map((a) => a.name)).toEqual(['B', 'A']);
		expect(sim.dispatch({ type: 'add-alarm', id: 'alarm.2', name: 'B2', time: 12_000 }).ok).toBe(
			true
		);
		expect(sim.snapshot().alarms!.map((a) => a.name)).toEqual(['A', 'B2']);
		expect(sim.dispatch({ type: 'add-alarm', time: 1 }).ok).toBe(true); // future still (t ≈ 0)
		expect(sim.dispatch({ type: 'remove-alarm', id: 'alarm.3' }).ok).toBe(true);
		expect(sim.dispatch({ type: 'remove-alarm', id: 'alarm.3' }).ok).toBe(false);
		const save = JSON.parse(JSON.stringify(sim.save()));
		expect(save.alarms.list).toHaveLength(2);
		const { createSim } = await import('../src/index.ts');
		const Stock = (await import('@orbital/mod-stock')).default;
		const resumed = await createSim({ plugins: [Stock], backendFactory: rapier(16), resume: save });
		expect(resumed.snapshot().alarms!.map((a) => [a.id, a.name])).toEqual([
			['alarm.1', 'A'],
			['alarm.2', 'B2']
		]);
		expect(resumed.dispatch({ type: 'add-alarm', time: 20_000 })).toMatchObject({
			alarm: 'alarm.4'
		});
		const w = resumed.dispatch({
			type: 'warp-to',
			factor: 1e4,
			target: { kind: 'alarm', id: 'alarm.1' }
		});
		expect(w.ok).toBe(true);
		let n = 0;
		while (resumed.warp > 1 && n++ < 100_000) resumed.step(1 / 60);
		expect(Math.abs(resumed.time - 9_000)).toBeLessThan(1e-6);
		expect(resumed.snapshot().alarms!.map((a) => a.id)).toEqual(['alarm.2', 'alarm.4']);
		expect(sim.dispatch({ type: 'add-alarm', time: 0 }).ok).toBe(false);
		sim.dispose();
		resumed.dispose();
	});
});
