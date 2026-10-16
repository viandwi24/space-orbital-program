import { expect, test } from 'bun:test';
import { entityId } from '@orbital/core';
import { buildTelemetry } from '../src/index.ts';
import { newRig } from './helpers.ts';

test('ship.* is a copy of the snapshot telemetry', async () => {
	const rig = await newRig();
	const runner = await rig.runner(
		`print(JSON.stringify({ t: ship.t, altitude: ship.altitude, mass: ship.mass, mode: ship.mode, parts: ship.parts.length, apo: ship.apoapsis }));`
	);
	rig.sim.step(0.5);
	const snapshot = rig.sim.snapshot();
	runner.tick(snapshot);
	const expected = buildTelemetry(snapshot, rig.vessel, {
		bodies: rig.sim.registries.bodies.list(),
		parts: rig.sim.registries.parts.list(),
		resources: rig.sim.registries.resources.list()
	});
	expect(JSON.parse(runner.logs[0]!)).toEqual({
		t: expected.t,
		altitude: expected.altitude,
		mass: expected.mass,
		mode: expected.mode,
		parts: 7,
		apo: expected.apoapsis
	});
	expect(runner.status).toBe('finished');
	// Sanity of the numbers themselves: the root part (the pod, top of the stack) is ~7.5 m above the pad.
	expect(expected.altitude).toBeGreaterThan(5);
	expect(expected.altitude).toBeLessThan(10);
	expect(expected.mass).toBeGreaterThan(1_000);
	rig.sim.dispose();
});

test('mutating telemetry in the script never reaches the host snapshot', async () => {
	const rig = await newRig();
	const runner = await rig.runner(
		`ship.position.x = 1e9; ship.parts.length = 0; ship.parts[0] = null; print(ship.position.x);`
	);
	const snapshot = rig.sim.snapshot();
	const before = JSON.stringify(snapshot);
	runner.tick(snapshot);
	expect(JSON.stringify(snapshot)).toBe(before);
	// Telemetry properties themselves are read-only.
	const strict = await rig.runner(`ship.altitude = 5;`);
	strict.tick(snapshot);
	expect(strict.status).toBe('failed');
	rig.sim.dispose();
});

test('throttle, attitude, stage and action become validated commands for the controlled vessel', async () => {
	const rig = await newRig();
	const part = Number(rig.sim.snapshot().vessels[0]!.parts[0]!.id);
	const runner = await rig.runner(`
		ship.throttle = 0.5;
		ship.throttle = 0.5;           // repeated setpoint: no second command
		ship.attitude = { pitch: 0.25 };
		stage();
		action(${part}, 'stock.command', 'noop');
		print(ship.throttle, JSON.stringify(ship.attitude));
	`);
	const result = runner.tick(rig.sim.snapshot());
	const vessel = rig.sim.snapshot().vessels[0]!.id;
	expect(result.commands).toEqual([
		{ type: 'throttle', vessel, value: 0.5 },
		{ type: 'attitude', vessel, pitch: 0.25, yaw: 0, roll: 0 },
		{ type: 'stage', vessel },
		{
			type: 'action',
			vessel,
			part: entityId(part),
			module: 'stock.command',
			action: 'noop',
			args: []
		}
	]);
	expect(runner.logs[0]).toBe('0.5 {"pitch":0.25,"yaw":0,"roll":0}');
	rig.sim.dispose();
});

test('invalid values throw inside the script and issue nothing', async () => {
	const rig = await newRig();
	const runner = await rig.runner(`
		const errors = [];
		for (const bad of [() => { ship.throttle = 2; }, () => { ship.throttle = 'x'; },
			() => { ship.attitude = { pitch: 5 }; }, () => { ship.attitude = 3; },
			() => { action('a', 'stock.command', 'x'); }, () => wait(-1)]) {
			try { bad(); errors.push('accepted'); } catch (e) { errors.push(e.name); }
		}
		print(errors.join(','));
	`);
	const result = runner.tick(rig.sim.snapshot());
	expect(runner.logs[0]).toBe('RangeError,TypeError,RangeError,TypeError,RangeError,RangeError');
	expect(result.commands).toEqual([]);
	expect(runner.status).toBe('finished');
	rig.sim.dispose();
});

test('wait(s) resumes on simulation time, not wall time', async () => {
	const rig = await newRig();
	const runner = await rig.runner(`
		print('start ' + ship.t.toFixed(2));
		await wait(1);
		print('after wait ' + ship.t.toFixed(2));
		await waitUntil(() => ship.t >= 1.5);
		print('after waitUntil ' + ship.t.toFixed(2));
	`);
	rig.drive(runner);
	let ticks = 0;
	while (runner.status === 'running') {
		rig.advance(runner);
		ticks++;
	}
	expect(runner.logs).toEqual(['start 0.00', 'after wait 1.00', 'after waitUntil 1.50']);
	expect(ticks).toBe(75);
	rig.sim.dispose();
});

test('stage() through the sim lights the engine and thrust lifts the vessel', async () => {
	const rig = await newRig();
	const runner = await rig.runner(
		`ship.throttle = 1; stage(); await wait(5); print(ship.altitude);`
	);
	rig.drive(runner);
	while (runner.status === 'running') rig.advance(runner);
	expect(Number(runner.logs[0])).toBeGreaterThan(5);
	rig.sim.dispose();
});

test('a script that throws fails with its stack; a syntax error fails at the first tick', async () => {
	const rig = await newRig();
	const thrower = await rig.runner(`await wait(0.1); throw new Error('boom');`);
	rig.drive(thrower);
	while (thrower.status === 'running') rig.advance(thrower);
	expect(thrower.status).toBe('failed');
	expect(thrower.error).toContain('boom');
	const broken = await rig.runner(`let = ;`);
	expect(broken.tick(rig.sim.snapshot()).status).toBe('failed');
	expect(broken.error).toContain('SyntaxError');
	rig.sim.dispose();
});

test('Math.random in the guest is seeded: same seed, same numbers', async () => {
	const rig = await newRig();
	const a = await rig.runner(`print(Math.random(), Math.random());`, { seed: 7 });
	const b = await rig.runner(`print(Math.random(), Math.random());`, { seed: 7 });
	const c = await rig.runner(`print(Math.random(), Math.random());`, { seed: 8 });
	for (const r of [a, b, c]) r.tick(rig.sim.snapshot());
	expect(a.logs[0]).toBe(b.logs[0]!);
	expect(a.logs[0]).not.toBe(c.logs[0]!);
	rig.sim.dispose();
});

test('a vessel missing from the snapshot is a host error, not a script failure', async () => {
	const rig = await newRig();
	const runner = await rig.runner(`await wait(1);`, { vessel: 9999 });
	expect(() => runner.tick(rig.sim.snapshot())).toThrow(/vessel 9999/);
	rig.sim.dispose();
});
