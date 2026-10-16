/** Plan 032: `bodies`, deterministic `Date`, command feedback, the fuel count and `warp`. */
import { expect, test } from 'bun:test';
import { MAX_SCRIPT_WARP } from '../src/index.ts';
import { newRig } from './helpers.ts';

test('bodies lists every registered body, frozen, with derived mu', async () => {
	const rig = await newRig();
	const runner = await rig.runner(`
		const ids = Object.keys(bodies);
		print(ids.join(','));
		const b = bodies[ship.body];
		print(b.radius, b.mu === ship.mu, b.id === ship.body, Object.isFrozen(bodies), Object.isFrozen(b));
		try { bodies[ship.body].radius = 1; print('wrote'); } catch (e) { print(e.name); }
	`);
	runner.tick(rig.sim.snapshot());
	const known = rig.sim.registries.bodies.list().map((b) => String(b.id));
	expect(runner.logs[0]).toBe(known.join(','));
	expect(runner.logs[1]).toBe(`${rig.sim.registries.bodies.list()[0]!.radius} true true true true`);
	expect(runner.logs[2]).toBe('TypeError');
	expect(runner.status).toBe('finished');
	rig.sim.dispose();
});

test('Date reads simulation time: Date.now() and new Date() are sim ms, arguments are unchanged', async () => {
	const rig = await newRig();
	rig.sim.step(1.5);
	const t = rig.sim.snapshot().t;
	const runner = await rig.runner(`
		print(Date.now(), new Date().getTime(), Date().length > 0);
		print(new Date(86400000).toISOString(), Date.UTC(2000, 0, 1), new Date(0) instanceof Date);
		print(new Date().constructor === Date, Object.getPrototypeOf(Date) === Function.prototype);
		class Later extends Date {}
		print(new Later(5).getTime());
		await wait(2);
		print(Date.now());
	`);
	runner.tick(rig.sim.snapshot());
	expect(runner.logs[0]).toBe(`${Math.floor(t * 1000)} ${Math.floor(t * 1000)} true`);
	expect(runner.logs[1]).toBe('1970-01-02T00:00:00.000Z 946684800000 true');
	expect(runner.logs[2]).toBe('true true');
	expect(runner.logs[3]).toBe('5');
	rig.sim.step(2.1);
	runner.tick(rig.sim.snapshot());
	expect(runner.logs[4]).toBe(`${Math.floor(rig.sim.snapshot().t * 1000)}`);
	// two runs of the same script on the same snapshots print the same thing
	const again = await rig.runner(`print(Date.now())`);
	again.tick(rig.sim.snapshot());
	expect(again.logs[0]).toBe(runner.logs[4]!);
	rig.sim.dispose();
});

test('stage() resolves with the host verdict on the next tick; refusals are listed in ship.refusals', async () => {
	const rig = await newRig();
	const runner = await rig.runner(`
		const first = await stage();
		print('stage', JSON.stringify(first));
		const second = await stage();
		print('stage2', JSON.stringify(second));
		print('refusals', JSON.stringify(ship.refusals));
		ship.throttle = 1;
		await nextTick();
		print('after', JSON.stringify(ship.refusals));
	`);
	const first = runner.tick(rig.sim.snapshot());
	expect(first.commands.map((c) => c.type)).toEqual(['stage']);
	expect(first.seqs).toHaveLength(1);
	expect(runner.logs).toEqual([]);
	// the host answers: accepted
	const second = runner.tick(rig.sim.snapshot(), [{ seq: first.seqs[0]!, ok: true }]);
	expect(runner.logs).toEqual(['stage {"ok":true}']);
	expect(second.commands.map((c) => c.type)).toEqual(['stage']);
	// refused
	const third = runner.tick(rig.sim.snapshot(), [
		{ seq: second.seqs[0]!, ok: false, reason: 'vessel 1 has no stage left to fire' }
	]);
	expect(runner.logs.slice(1)).toEqual([
		'stage2 {"ok":false,"reason":"vessel 1 has no stage left to fire"}',
		'refusals [{"command":"stage","reason":"vessel 1 has no stage left to fire"}]'
	]);
	// a refused throttle setter shows up in refusals on the tick after
	expect(third.commands.map((c) => c.type)).toEqual(['throttle']);
	runner.tick(rig.sim.snapshot(), [{ seq: third.seqs[0]!, ok: false, reason: 'no fuel' }]);
	expect(runner.logs.at(-1)).toBe('after [{"command":"throttle","reason":"no fuel"}]');
	expect(runner.status).toBe('finished');
	rig.sim.dispose();
});

test('a repeated setpoint resolves at once and an unknown or repeated verdict is ignored', async () => {
	const rig = await newRig();
	const runner = await rig.runner(`
		ship.throttle = 0.5;
		await nextTick();
		ship.throttle = 0.5;
		print('same', ship.refusals.length);
		await nextTick();
	`);
	const a = runner.tick(rig.sim.snapshot());
	expect(a.seqs).toHaveLength(1);
	const b = runner.tick(rig.sim.snapshot(), [
		{ seq: a.seqs[0]!, ok: true },
		{ seq: 9999, ok: false, reason: 'x' },
		{ seq: a.seqs[0]!, ok: false, reason: 'again' }
	]);
	expect(b.commands).toEqual([]);
	expect(runner.logs).toEqual(['same 0']);
	rig.sim.dispose();
});

test('warp(f) is a command without a vessel, factor 1 to 100 000; anything else throws into the script', async () => {
	const rig = await newRig();
	const runner = await rig.runner(`
		warp(10);
		for (const bad of [0, 0.5, ${MAX_SCRIPT_WARP + 1}, NaN, 'x']) {
			try { warp(bad); print('accepted', bad); } catch (e) { print(e.name); }
		}
		warp(${MAX_SCRIPT_WARP});
	`);
	const result = runner.tick(rig.sim.snapshot());
	expect(result.commands).toEqual([
		{ type: 'warp', factor: 10 },
		{ type: 'warp', factor: MAX_SCRIPT_WARP }
	]);
	expect(runner.logs).toEqual(['RangeError', 'RangeError', 'RangeError', 'RangeError', 'RangeError']);
	rig.sim.dispose();
});

test('fuel: a runaway ends after the same number of polls on every run, whatever the clock says', async () => {
	const rig = await newRig();
	const outcomes: string[] = [];
	for (let i = 0; i < 3; i++) {
		let fake = 0;
		// A clock that never reaches the deadline: only fuel can end the loop.
		const runner = await rig.runner('while (true) {}', {
			fuelPolls: 50,
			budgetMs: 60_000,
			now: () => fake++ * 0
		});
		const result = runner.tick(rig.sim.snapshot());
		outcomes.push(`${result.status}|${runner.error}`);
	}
	expect(new Set(outcomes).size).toBe(1);
	expect(outcomes[0]).toBe('terminated|work budget exceeded (50 interrupt polls per tick)');
	// a harmless script stays far under a realistic fuel limit and keeps running
	const harmless = await rig.runner('while (true) { ship.altitude; await nextTick(); }', {
		fuelPolls: 50,
		budgetMs: 60_000,
		now: () => 0
	});
	for (let i = 0; i < 5; i++) expect(harmless.tick(rig.sim.snapshot()).status).toBe('running');
	rig.sim.dispose();
});
