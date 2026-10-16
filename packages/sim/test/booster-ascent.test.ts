/** Plan 026: a Saturn-style vessel (core, four radial boosters, four fins) reaches orbit through dispatch/snapshot only. */
import { expect, test } from 'bun:test';
import { createAscent, defaultAscent } from './helpers/ascent.ts';
import { newSim, saturn } from './helpers/vessels.ts';

const RADIUS = 600_000;

test('four boosters and four fins: lift-off, booster separation at burnout, upper stage to orbit', async () => {
	const sim = await newSim();
	const created: number[] = [];
	sim.events.on('vessel:created', (e) => created.push(e.vessel as number));
	const loaded = sim.dispatch({ type: 'load-vessel', design: saturn() });
	if (!loaded.ok) throw new Error(loaded.reason);
	const ascent = createAscent(sim, loaded.vessel!, {
		...defaultAscent,
		// One stage when a booster runs dry (the radial decouplers), one at the cut (stack decoupler).
		stageCount: 1,
		jettisonAtCut: true,
		apoapsis: 200_000,
		turnStart: 100,
		turnEnd: 12_000,
		turnPitch: 1.1
	});
	while (sim.time < 1_500 && ascent.phase !== 'done') {
		sim.step(0.02);
		ascent.update();
	}
	console.log(ascent.log.map((l) => `${l.t.toFixed(1)}s ${l.note}`).join('\n'));
	expect(ascent.phase).toBe('done');
	expect(ascent.log.some((l) => l.note === 'staged')).toBe(true);
	for (let i = 0; i < 200; i++) sim.step(0.02);
	const v = sim.snapshot().vessels.find((x) => x.id === loaded.vessel)!;
	const orbit = v.orbit!;
	const periapsis = orbit.a * (1 - orbit.e) - RADIUS;
	console.log(
		`periapsis ${(periapsis / 1000).toFixed(1)} km, e ${orbit.e.toFixed(4)}, t ${sim.time.toFixed(0)} s, vessels created ${created.length}`
	);
	expect(periapsis).toBeGreaterThan(70_000);
	expect(orbit.e).toBeLessThan(0.1);
	expect(v.mode).toBe('on-rails');
	// Pod, three wheels, tank and engine: the boosters, the fins and the lower stage were left behind.
	expect(v.parts).toHaveLength(6);
	// Four booster sets (the first split gives one vessel per cut) and the lower stage.
	expect(created.length).toBeGreaterThanOrEqual(5);
	sim.dispose();
}, 60_000);
