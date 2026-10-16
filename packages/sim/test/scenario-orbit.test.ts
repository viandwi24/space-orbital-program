import { expect, test } from 'bun:test';
import { createAscent } from './helpers/ascent.ts';
import { newSim, twoStage } from './helpers/vessels.ts';

const RADIUS = 600_000;

/** Phase 0 exit test: the stock two-stage vessel reaches a stable orbit, headlessly, through dispatch/snapshot only. */
test('scripted two-stage ascent reaches a stable orbit within 1200 s in under 30 s of wall time', async () => {
	const started = performance.now();
	const sim = await newSim();
	const loaded = sim.dispatch({ type: 'load-vessel', design: twoStage() });
	if (!loaded.ok) throw new Error(loaded.reason);
	const ascent = createAscent(sim, loaded.vessel!);

	while (sim.time < 1_200 && ascent.phase !== 'done') {
		sim.step(0.02);
		ascent.update();
	}
	expect(ascent.phase).toBe('done');

	// Let the idle vessel settle onto rails (two seconds without any force), then read the orbit.
	for (let i = 0; i < 200; i++) sim.step(0.02);
	const wall = performance.now() - started;
	const v = sim.snapshot().vessels[0]!;
	const orbit = v.orbit!;
	const periapsis = orbit.a * (1 - orbit.e) - RADIUS;
	const apoapsis = orbit.a * (1 + orbit.e) - RADIUS;
	console.log(
		`orbit: apoapsis ${(apoapsis / 1000).toFixed(2)} km, periapsis ${(periapsis / 1000).toFixed(2)} km, e ${orbit.e.toFixed(4)}, sim time ${sim.time.toFixed(1)} s, wall ${wall.toFixed(0)} ms`
	);
	console.log(ascent.log.map((l) => `${l.t.toFixed(1)}s ${l.note}`).join('\n'));

	expect(periapsis).toBeGreaterThan(70_000);
	expect(orbit.e).toBeLessThan(0.1);
	expect(sim.time).toBeLessThanOrEqual(1_200);
	expect(v.mode).toBe('on-rails');
	expect(v.parts).toHaveLength(7 - 3); // the lower stage (decoupler, tank, engine) stayed behind
	expect(wall).toBeLessThan(30_000);
});
