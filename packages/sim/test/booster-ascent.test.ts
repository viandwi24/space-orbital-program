/**
 * Plan 026 / 033: a Saturn-style vessel (core, four radial boosters, four fins) reaches orbit
 * through dispatch/snapshot only, with three reaction wheels and with ONE (the engines gimbal,
 * ADR 0045). That the headless PD loop also manages one wheel without gimbal is true (journal
 * 033); the authority difference at high dynamic pressure is pinned in `gimbal.test.ts`.
 */
import { expect, test } from 'bun:test';
import type { VesselDesign } from '@orbital/core';
import { createAscent, defaultAscent } from './helpers/ascent.ts';
import { newTestSim } from './helpers/test-mod.ts';
import { saturn } from './helpers/vessels.ts';

const RADIUS = 600_000;

async function ascend(design: VesselDesign, limit = 1_500) {
	const sim = await newTestSim();
	const created: number[] = [];
	sim.events.on('vessel:created', (e) => created.push(e.vessel as number));
	const loaded = sim.dispatch({ type: 'load-vessel', design });
	if (!loaded.ok) throw new Error(loaded.reason);
	const ascent = createAscent(sim, loaded.vessel!, {
		...defaultAscent,
		// One stage when a booster runs dry (the radial decouplers), one at the cut (stack decoupler).
		stageCount: 1,
		jettisonAtCut: true,
		// the solid BST-1 (plan 210) gives less Δv than the old liquid one: a lower first apoapsis
		apoapsis: 120_000,
		turnStart: 100,
		turnEnd: 12_000,
		turnPitch: 1.1
	});
	let maxAlt = 0;
	while (sim.time < limit && ascent.phase !== 'done') {
		sim.step(0.02);
		ascent.update();
		const v = sim.snapshot().vessels.find((x) => x.id === loaded.vessel);
		if (!v) break;
		maxAlt = Math.max(maxAlt, Math.hypot(v.position.x, v.position.y, v.position.z) - RADIUS);
	}
	return { sim, ascent, vessel: loaded.vessel!, created, maxAlt };
}

function orbitOf(r: Awaited<ReturnType<typeof ascend>>) {
	for (let i = 0; i < 200; i++) r.sim.step(0.02);
	const v = r.sim.snapshot().vessels.find((x) => x.id === r.vessel)!;
	const orbit = v.orbit!;
	return { v, periapsis: orbit.a * (1 - orbit.e) - RADIUS, e: orbit.e };
}

test('four boosters and four fins: lift-off, booster separation at burnout, upper stage to orbit', async () => {
	const r = await ascend(saturn());
	console.log(r.ascent.log.map((l) => `${l.t.toFixed(1)}s ${l.note}`).join('\n'));
	expect(r.ascent.phase).toBe('done');
	expect(r.ascent.log.some((l) => l.note === 'staged')).toBe(true);
	const { v, periapsis, e } = orbitOf(r);
	console.log(
		`periapsis ${(periapsis / 1000).toFixed(1)} km, e ${e.toFixed(4)}, t ${r.sim.time.toFixed(0)} s, vessels created ${r.created.length}`
	);
	expect(periapsis).toBeGreaterThan(70_000);
	expect(e).toBeLessThan(0.1);
	expect(v.mode).toBe('on-rails');
	// Pod, three wheels, tank and engine: the boosters, the fins and the lower stage were left behind.
	expect(v.parts).toHaveLength(6);
	// Four booster sets (the first split gives one vessel per cut) and the lower stage.
	expect(r.created.length).toBeGreaterThanOrEqual(5);
	r.sim.dispose();
}, 60_000);

test('ONE reaction wheel: the gimbal lets the finned 23-part rocket pitch over and reach orbit', async () => {
	const r = await ascend(saturn(1));
	console.log(r.ascent.log.map((l) => `${l.t.toFixed(1)}s ${l.note}`).join('\n'));
	expect(r.ascent.phase).toBe('done');
	const { v, periapsis, e } = orbitOf(r);
	console.log(`one wheel: periapsis ${(periapsis / 1000).toFixed(1)} km, e ${e.toFixed(4)}`);
	expect(periapsis).toBeGreaterThan(70_000);
	expect(e).toBeLessThan(0.1);
	expect(v.parts).toHaveLength(4);
	r.sim.dispose();
}, 60_000);
