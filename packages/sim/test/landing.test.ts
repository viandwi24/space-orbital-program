import { expect, test } from 'bun:test';
import { length } from '@orbital/kepler';
import { groundRelativeVelocity, tiltDegrees } from './helpers/ground.ts';
import { createLanding, defaultLanding } from './helpers/landing.ts';
import { altitude, orbitState } from './helpers/measure.ts';
import { orbitLander, ORBIT_LANDER_ROOT_TO_FOOT, newSim } from './helpers/vessels.ts';

/** Plan 012 exit test: from a stable 100 km orbit to standing on the ground, headlessly. */
async function land() {
	const started = performance.now();
	const sim = await newSim();
	const damaged: unknown[] = [];
	sim.events.on('part:damaged', (e) => damaged.push(e));
	const placed = sim.dispatch({
		type: 'load-vessel',
		design: orbitLander(),
		placement: { kind: 'state', ...orbitState(sim, 100_000) }
	});
	if (!placed.ok) throw new Error(placed.reason);
	const id = placed.vessel!;
	const start = sim.snapshot().vessels[0]!;
	sim.dispatch({ type: 'stage', vessel: id }); // light the engine
	const landing = createLanding(sim, id, {
		...defaultLanding,
		rootToFoot: ORBIT_LANDER_ROOT_TO_FOOT
	});
	let peak = 0; // hottest part skin over the whole descent, K (plan 014)
	for (let i = 0; sim.time < 3_000 && landing.phase !== 'done'; i++) {
		sim.step(0.02);
		landing.update();
		if (i % 25 === 0) {
			for (const v of sim.snapshot().vessels) {
				for (const p of v.parts) peak = Math.max(peak, p.temperature ?? 0);
			}
		}
	}
	return { sim, id, start, landing, damaged, peak, wall: performance.now() - started };
}

test('a lander flown from a stable 100 km orbit ends at rest, upright, on its legs, with every part', async () => {
	const { sim, id, start, landing, damaged, peak, wall } = await land();
	const v = sim.snapshot().vessels.find((s) => s.id === id)!;
	console.log(
		`landing: ${landing.log.map((l) => `${l.t.toFixed(0)} s ${l.note}`).join(' | ')}; ` +
			`rest speed ${length(groundRelativeVelocity(v)).toExponential(2)} m/s, tilt ${tiltDegrees(v).toFixed(2)} deg, ` +
			`peak skin ${peak.toFixed(0)} K, sim ${sim.time.toFixed(0)} s, wall ${wall.toFixed(0)} ms`
	);
	expect(start.mode).toBe('on-rails'); // it started in a stable orbit
	expect(altitude(start.position)).toBeGreaterThan(99_000);
	expect(landing.phase).toBe('done');
	expect(v.mode).toBe('flight');
	expect(length(groundRelativeVelocity(v))).toBeLessThan(0.1);
	expect(tiltDegrees(v)).toBeLessThan(5);
	expect(v.parts).toHaveLength(7);
	expect(damaged).toEqual([]); // no impact and, since plan 014, no overheating
	expect(peak).toBeLessThan(400); // far below every part limit: the braking burn keeps it slow
	// the root sits its root-to-foot height above the ground (14.05 m on the orbit lander)
	expect(altitude(v.position)).toBeGreaterThan(ORBIT_LANDER_ROOT_TO_FOOT - 0.8);
	expect(altitude(v.position)).toBeLessThan(ORBIT_LANDER_ROOT_TO_FOOT + 0.7);
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
