/** Plan 223 / ADR 0208: vessel types, rename, terminate, recovery by distance and the debris cap. */
import { describe, expect, test } from 'bun:test';
import { legacyWorldInfo, type EntityId, type WorldInfo } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { createSim, type Sim } from '../src/index.ts';
import { orbitState } from './helpers/measure.ts';
import { newSim, rapier, stack } from './helpers/vessels.ts';

const career = (): WorldInfo => ({
	...legacyWorldInfo(1),
	id: '6f1d2a4e-8b3c-4e5f-9a7b-1c2d3e4f5a6b',
	preset: 'stock.career'
});
const pod = () => stack('Pod', ['stock.command-pod'], []);

/** A pod on the ground `metres` east along the equator from the Legacy site, at rest. */
function landedPod(sim: Sim, metres: number): EntityId {
	const R = sim.registries.bodies.get('stock.home')!.radius;
	const r = sim.dispatch({
		type: 'load-vessel',
		design: pod(),
		placement: { kind: 'surface', latitude: 0, longitude: metres / R }
	});
	if (!r.ok) throw new Error(r.reason);
	for (let i = 0; i < 300; i++) sim.step(0.02);
	return r.vessel!;
}

const quoteOf = (sim: Sim, id: EntityId) =>
	sim.snapshot().vessels.find((v) => v.id === id)!.recovery;

describe('recovery anywhere (plan 223)', () => {
	test('the factor is 1.0 on the pad, 0.98 at 2 km and lower at 200 km', async () => {
		const factors: number[] = [];
		for (const d of [0, 2_000, 200_000]) {
			const sim = await createSim({ plugins: [Stock], backendFactory: rapier(8), world: career() });
			const id = landedPod(sim, d);
			const q = quoteOf(sim, id);
			expect(q).toBeDefined();
			factors.push(q!.factor);
			// any landed vessel, not only the one flown, recovers at its quote
			const before = sim.snapshot().economy!.funds;
			expect(sim.dispatch({ type: 'recover-vessel', vessel: id }).ok).toBe(true);
			expect(sim.snapshot().economy!.funds - before).toBeCloseTo(q!.credit, 6);
			sim.dispose();
		}
		expect(factors[0]).toBe(1);
		expect(factors[1]).toBe(0.98);
		expect(factors[2]!).toBeLessThan(0.98);
	});
});

describe('rename, type and terminate (plan 223)', () => {
	test('rename and set-type round-trip through a save; the type is guessed until set', async () => {
		const sim = await newSim();
		const r = sim.dispatch({
			type: 'load-vessel',
			design: stack('Probe', ['stock.probe-core', 'stock.tank-small'], []),
			placement: { kind: 'state', ...orbitState(sim, 300_000) }
		});
		const id = r.ok ? r.vessel! : (0 as EntityId);
		const shown = () => sim.snapshot().vessels.find((v) => v.id === id)!;
		expect(shown().type).toBe('probe');
		expect(sim.dispatch({ type: 'rename-vessel', vessel: id, name: '  Relay One ' }).ok).toBe(true);
		expect(sim.dispatch({ type: 'set-vessel-type', vessel: id, vesselType: 'relay' }).ok).toBe(
			true
		);
		expect(shown()).toMatchObject({ name: 'Relay One', type: 'relay' });
		expect(sim.dispatch({ type: 'rename-vessel', vessel: id, name: '   ' }).ok).toBe(false);
		const save = JSON.parse(JSON.stringify(sim.save()));
		const resumed = await createSim({ plugins: [Stock], backendFactory: rapier(16), resume: save });
		expect(resumed.snapshot().vessels.find((v) => v.id === id)).toMatchObject({
			name: 'Relay One',
			type: 'relay'
		});
		sim.dispose();
		resumed.dispose();
	});

	test('terminate removes the vessel and its crew follow the crew-death rule', async () => {
		for (const [death, status] of [
			['permanent', 'lost'],
			['off', 'available']
		] as const) {
			const sim = await newSim();
			expect(sim.dispatch({ type: 'crew-hire', profession: 'pilot' }).ok).toBe(true);
			expect(sim.dispatch({ type: 'set-rule', rule: 'stock.crew-death', value: death }).ok).toBe(
				true
			);
			const r = sim.dispatch({
				type: 'load-vessel',
				design: pod(),
				placement: { kind: 'state', ...orbitState(sim, 300_000) },
				crew: [{ member: 'c1', part: 0 }]
			});
			const id = r.ok ? r.vessel! : (0 as EntityId);
			const reasons: string[] = [];
			sim.events.on('vessel:destroyed', (e) => reasons.push(e.reason));
			expect(sim.dispatch({ type: 'terminate-vessel', vessel: id }).ok).toBe(true);
			expect(sim.snapshot().vessels.some((v) => v.id === id)).toBe(false);
			expect(reasons).toEqual(['terminated']);
			expect(sim.snapshot().crew!.find((m) => m.id === 'c1')!.status).toBe(status);
			expect(sim.dispatch({ type: 'terminate-vessel', vessel: id }).ok).toBe(false);
			sim.dispose();
		}
	});
});

describe('persistent debris (plan 223)', () => {
	test('300 debris objects with cap 250 leave the 250 newest', async () => {
		const sim = await newSim();
		const tank = stack('Tank', ['stock.tank-small'], []);
		const ids: EntityId[] = [];
		for (let k = 0; k < 300; k++) {
			const r = sim.dispatch({
				type: 'load-vessel',
				design: tank,
				placement: { kind: 'state', ...orbitState(sim, 200_000 + k * 1_000) }
			});
			if (!r.ok) throw new Error(r.reason);
			ids.push(r.vessel!);
		}
		const debris = () =>
			sim
				.snapshot()
				.vessels.filter((v) => v.type === 'debris')
				.map((v) => v.id);
		expect(debris()).toHaveLength(300);
		expect(sim.dispatch({ type: 'set-debris-cap', cap: 250 }).ok).toBe(true);
		expect(debris().sort((a, b) => a - b)).toEqual(ids.slice(50));
		sim.step(0.1); // the cap holds on the steps too
		expect(debris()).toHaveLength(250);
		expect(sim.dispatch({ type: 'set-debris-cap', cap: 0 }).ok).toBe(true);
		expect(debris()).toHaveLength(0);
		sim.dispose();
	});

	test('debris at rest is no longer deleted after 10 s', async () => {
		const sim = await newSim();
		const r = sim.dispatch({
			type: 'load-vessel',
			design: stack('Tank', ['stock.tank-small'], [])
		});
		if (!r.ok) throw new Error(r.reason);
		for (let i = 0; i < 1_200; i++) sim.step(0.02); // 24 s
		const v = sim.snapshot().vessels.find((x) => x.id === r.vessel);
		expect(v).toMatchObject({ type: 'debris', surface: true });
		sim.dispose();
	});
});
