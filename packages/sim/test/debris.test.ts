import { describe, expect, test } from 'bun:test';
import { createAscent } from './helpers/ascent.ts';
import { altitude, orbitState } from './helpers/measure.ts';
import { newSim, stack, twoStage } from './helpers/vessels.ts';

/** Plan 013 / ADR 0021: debris does not hold time warp hostage. */
describe('debris lifecycle', () => {
	test('warp is accepted 3 s after reaching orbit; the discarded stage was removed on rails', async () => {
		const sim = await newSim();
		const loaded = sim.dispatch({ type: 'load-vessel', design: twoStage() });
		if (!loaded.ok) throw new Error(loaded.reason);
		const orbiter = loaded.vessel!;
		const destroyed: Array<{ vessel: number; reason: string }> = [];
		sim.events.on('vessel:destroyed', (e) => destroyed.push(e));
		const ascent = createAscent(sim, orbiter);
		while (sim.time < 1_200 && ascent.phase !== 'done') {
			sim.step(0.02);
			ascent.update();
		}
		expect(ascent.phase).toBe('done');
		for (let i = 0; i < 150; i++) sim.step(0.02); // 3 s: the orbiter settles onto rails
		const arrival = sim.time;
		expect(arrival).toBeLessThan(250); // the debris would not hit the ground before about 380 s

		// The stage fell back through the top of the atmosphere on rails and was removed there.
		expect(destroyed.length).toBeGreaterThan(0);
		for (const e of destroyed) expect(e.reason).toContain('re-entered');
		const removed = destroyed.length;

		const warp = sim.dispatch({ type: 'warp', factor: 5 });
		if (!warp.ok) throw new Error(warp.reason);
		sim.step(100); // 100 s of host time at 5x = 500 s
		expect(sim.time).toBeCloseTo(arrival + 500, 6);
		const after = sim.snapshot().vessels;
		expect(after.map((v) => v.id)).toEqual([orbiter]);
		expect(after[0]!.mode).toBe('on-rails');
		expect(destroyed).toHaveLength(removed); // nothing else disappeared
	});

	test('debris born ascending goes on rails within 3 s of separation, with an orbit', async () => {
		const sim = await newSim();
		const loaded = sim.dispatch({ type: 'load-vessel', design: twoStage() });
		if (!loaded.ok) throw new Error(loaded.reason);
		const orbiter = loaded.vessel!;
		const ascent = createAscent(sim, orbiter);
		let staged = -1;
		while (sim.time < 120 && staged < 0) {
			sim.step(0.02);
			ascent.update();
			if (sim.snapshot().vessels.length > 1) staged = sim.time;
		}
		expect(staged).toBeGreaterThan(0);
		for (let i = 0; i < 150; i++) {
			sim.step(0.02);
			ascent.update();
		}
		const debris = sim.snapshot().vessels.filter((v) => v.id !== orbiter);
		expect(debris.length).toBeGreaterThan(0);
		for (const d of debris) {
			expect(d.mode).toBe('on-rails');
			expect(d.orbit).toBeDefined();
			expect(altitude(d.position)).toBeGreaterThan(400);
		}
	});

	test('debris at rest on the ground is removed after the rest time', async () => {
		const sim = await newSim();
		const reasons: string[] = [];
		sim.events.on('vessel:destroyed', (e) => reasons.push(e.reason));
		// No command pod, so no control source: debris by definition.
		const tank = stack('Tank', ['stock.tank-small'], []);
		const loaded = sim.dispatch({ type: 'load-vessel', design: tank });
		if (!loaded.ok) throw new Error(loaded.reason);
		expect(sim.snapshot().vessels[0]!.mode).toBe('flight');
		for (let i = 0; i < 400; i++) sim.step(0.02); // 8 s: not yet
		expect(sim.snapshot().vessels).toHaveLength(1);
		for (let i = 0; i < 800; i++) sim.step(0.02); // 16 s in total
		expect(sim.snapshot().vessels).toHaveLength(0);
		expect(reasons).toHaveLength(1);
		expect(reasons[0]).toContain('surface');
		expect(sim.dispatch({ type: 'warp', factor: 5 }).ok).toBe(true);
	});

	test('a controlled vessel at rest on the pad is not removed; it goes on surface rails and warp is accepted (plan 016)', async () => {
		// Until plan 016 this vessel stayed in flight for ever and warp was refused.
		const sim = await newSim();
		const loaded = sim.dispatch({ type: 'load-vessel', design: twoStage() });
		if (!loaded.ok) throw new Error(loaded.reason);
		for (let i = 0; i < 1_500; i++) sim.step(0.02); // 30 s
		const v = sim.snapshot().vessels;
		expect(v).toHaveLength(1);
		expect(v[0]!.mode).toBe('on-rails');
		expect(v[0]!.surface).toBe(true);
		expect(sim.dispatch({ type: 'warp', factor: 5 }).ok).toBe(true);
	});

	test('descending debris below the atmosphere top stays in flight and takes impact damage (plan 012)', async () => {
		const sim = await newSim();
		const events: string[] = [];
		sim.events.on('part:damaged', (e) => events.push(`damaged:${e.outcome}`));
		sim.events.on('vessel:destroyed', (e) => events.push(`destroyed:${e.reason}`));
		const tank = stack('Tank', ['stock.tank-small'], []);
		const placed = sim.dispatch({
			type: 'load-vessel',
			design: tank,
			placement: { kind: 'state', ...orbitState(sim, 5_000, 0) }
		});
		if (!placed.ok) throw new Error(placed.reason);
		const modes = new Set<string>();
		for (let i = 0; i < 4_000 && sim.snapshot().vessels.length > 0; i++) {
			sim.step(0.02);
			for (const v of sim.snapshot().vessels) modes.add(v.mode);
		}
		expect([...modes]).toEqual(['flight']);
		expect(events).toEqual(['damaged:destroyed', 'destroyed:stock.tank-small destroyed by impact']);
	});

	test('debris above the atmosphere on a falling path goes on rails and is removed on entering it', async () => {
		const sim = await newSim();
		const reasons: string[] = [];
		sim.events.on('vessel:destroyed', (e) => reasons.push(e.reason));
		const tank = stack('Tank', ['stock.tank-small'], []);
		const placed = sim.dispatch({
			type: 'load-vessel',
			design: tank,
			placement: { kind: 'state', ...orbitState(sim, 100_000, 0.5) }
		});
		if (!placed.ok) throw new Error(placed.reason);
		for (let i = 0; i < 150; i++) sim.step(0.02);
		expect(sim.snapshot().vessels[0]!.mode).toBe('on-rails');
		expect(sim.dispatch({ type: 'warp', factor: 50 }).ok).toBe(true);
		sim.step(20); // 1 000 s of sim time: it falls through 70 km in a few hundred seconds
		expect(sim.snapshot().vessels).toHaveLength(0);
		expect(reasons).toEqual(['debris re-entered the atmosphere']);
	});
});

describe('design records (plan 221, ADR 0208 point 1)', () => {
	test('a decouple event carries the parent id and the indices each side kept; each side keeps its design', async () => {
		const sim = await newSim();
		const r = sim.dispatch({ type: 'load-vessel', design: twoStage() });
		if (!r.ok) throw new Error(r.reason);
		const id = r.vessel!;
		const splits: Array<{
			parent: number;
			vessel: number;
			parentParts: number[];
			parts: number[];
		}> = [];
		sim.events.on('vessel:split', (e) =>
			splits.push({
				parent: Number(e.parent),
				vessel: Number(e.vessel),
				parentParts: e.parentParts,
				parts: e.parts
			})
		);
		sim.dispatch({ type: 'stage', vessel: id });
		sim.dispatch({ type: 'throttle', vessel: id, value: 1 });
		for (let i = 0; i < 100; i++) sim.step(0.02);
		sim.dispatch({ type: 'stage', vessel: id }); // fires the decoupler
		sim.step(0.02);
		expect(splits).toHaveLength(1);
		expect(splits[0]!.parent).toBe(Number(id));
		expect(splits[0]!.parentParts).toEqual([0, 1, 2, 3]);
		expect(splits[0]!.parts).toEqual([4, 5, 6]);
		const upper = sim.designOf(id)!;
		const lower = sim.designOf(splits[0]!.vessel as never)!;
		expect(upper.design.name).toBe('Two-stage');
		expect(lower.design.name).toBe('Two-stage');
		expect(upper.parts).toEqual([0, 1, 2, 3]);
		expect(lower.parts).toEqual([4, 5, 6]);
		expect(upper.rebuilt).toBe(false);
	});
});
