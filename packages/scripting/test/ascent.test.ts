import { expect, test } from 'bun:test';
import { ascentScript } from '../src/index.ts';
import { newRig } from './helpers.ts';

/** Plan 010: the sample autopilot, written against the scripting API only, reaches orbit headlessly. */
test('the sample ascent script reaches a stable orbit (periapsis > 70 km, e < 0.1)', async () => {
	const started = performance.now();
	const rig = await newRig();
	const runner = await rig.runner(ascentScript);
	let maxTick = 0;
	let ticks = 0;
	rig.drive(runner);
	while (rig.sim.time < 1_200 && runner.status === 'running') {
		rig.sim.step(0.02);
		const r = rig.drive(runner);
		maxTick = Math.max(maxTick, r.elapsedMs);
		ticks++;
	}
	expect(runner.error).toBeUndefined();
	expect(runner.status).toBe('finished');

	for (let i = 0; i < 200; i++) rig.sim.step(0.02); // two idle seconds: the vessel goes on rails
	const v = rig.sim.snapshot().vessels[0]!;
	const orbit = v.orbit!;
	const periapsis = orbit.a * (1 - orbit.e) - 600_000;
	const apoapsis = orbit.a * (1 + orbit.e) - 600_000;
	console.log(
		`script orbit: apoapsis ${(apoapsis / 1000).toFixed(2)} km, periapsis ${(periapsis / 1000).toFixed(2)} km, e ${orbit.e.toFixed(4)}, sim time ${rig.sim.time.toFixed(1)} s, ` +
			`${ticks} ticks, max tick ${maxTick.toFixed(2)} ms, wall ${(performance.now() - started).toFixed(0)} ms\n` +
			runner.logs.join('\n')
	);
	expect(periapsis).toBeGreaterThan(70_000);
	expect(orbit.e).toBeLessThan(0.1);
	expect(v.mode).toBe('on-rails');
	expect(v.parts).toHaveLength(4); // the lower stage stayed behind
	expect(maxTick).toBeLessThan(10); // within the default budget on every tick
	rig.sim.dispose();
}, 60_000);
