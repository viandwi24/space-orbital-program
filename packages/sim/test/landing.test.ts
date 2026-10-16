import { expect, test } from 'bun:test';
import { length } from '@orbital/kepler';
import { groundRelativeVelocity, tiltDegrees } from './helpers/ground.ts';
import { createLanding } from './helpers/landing.ts';
import { altitude, orbitState } from './helpers/measure.ts';
import { lander, newSim } from './helpers/vessels.ts';

/** Plan 012 exit test: from a stable 100 km orbit to standing on the ground, headlessly. */
async function land() {
	const started = performance.now();
	const sim = await newSim();
	const damaged: unknown[] = [];
	sim.events.on('part:damaged', (e) => damaged.push(e));
	const placed = sim.dispatch({
		type: 'load-vessel',
		design: lander(),
		placement: { kind: 'state', ...orbitState(sim, 100_000) }
	});
	if (!placed.ok) throw new Error(placed.reason);
	const id = placed.vessel!;
	const start = sim.snapshot().vessels[0]!;
	sim.dispatch({ type: 'stage', vessel: id }); // light the engine
	const landing = createLanding(sim, id);
	while (sim.time < 3_000 && landing.phase !== 'done') {
		sim.step(0.02);
		landing.update();
	}
	return { sim, id, start, landing, damaged, wall: performance.now() - started };
}

test('a lander flown from a stable 100 km orbit ends at rest, upright, on its legs, with every part', async () => {
	const { sim, id, start, landing, damaged, wall } = await land();
	const v = sim.snapshot().vessels.find((s) => s.id === id)!;
	console.log(
		`landing: ${landing.log.map((l) => `${l.t.toFixed(0)} s ${l.note}`).join(' | ')}; ` +
			`rest speed ${length(groundRelativeVelocity(v)).toExponential(2)} m/s, tilt ${tiltDegrees(v).toFixed(2)} deg, ` +
			`sim ${sim.time.toFixed(0)} s, wall ${wall.toFixed(0)} ms`
	);
	expect(start.mode).toBe('on-rails'); // it started in a stable orbit
	expect(altitude(start.position)).toBeGreaterThan(99_000);
	expect(landing.phase).toBe('done');
	expect(v.mode).toBe('flight');
	expect(length(groundRelativeVelocity(v))).toBeLessThan(0.1);
	expect(tiltDegrees(v)).toBeLessThan(5);
	expect(v.parts).toHaveLength(6);
	expect(damaged).toEqual([]);
	expect(altitude(v.position)).toBeGreaterThan(10); // the root sits about 10.8 m above the ground
	expect(altitude(v.position)).toBeLessThan(11.5);
	expect(sim.time).toBeLessThan(3_000);
	expect(wall).toBeLessThan(60_000);
	sim.dispose();
}, 90_000);

test('the landing is deterministic: two runs give byte-identical snapshots', async () => {
	const a = await land();
	const b = await land();
	expect(JSON.stringify(b.sim.snapshot())).toBe(JSON.stringify(a.sim.snapshot()));
	expect(JSON.stringify(b.sim.world.serialize())).toBe(JSON.stringify(a.sim.world.serialize()));
	a.sim.dispose();
	b.sim.dispose();
}, 90_000);
