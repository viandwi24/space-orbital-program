/**
 * Plan 044 exit test: the stock two-stage moon rocket flies from the pad to a landing at rest on
 * the moon, through `dispatch` and `snapshot` only: ascent to a low orbit, a transfer burn timed for
 * the moon, the coast across the sphere of influence at time warp (warp drops at the crossing),
 * a capture burn at periapsis, and a powered landing.
 */
import { expect, test } from 'bun:test';
import type { EntityId } from '@orbital/core';
import { length, sub } from '@orbital/kepler';
import { tiltDegrees } from './helpers/ground.ts';
import { createAscent, defaultAscent } from './helpers/ascent.ts';
import { createLanding, defaultLanding } from './helpers/landing.ts';
import {
	burn,
	point,
	note,
	lowerPeriapsis,
	periapsisTime,
	retroBurnAtPeriapsis,
	snapshotOf,
	transferBurnTime,
	warpTo,
	type Mission
} from './helpers/mission.ts';
import { vesselMass } from './helpers/measure.ts';
import { systemOf } from './helpers/moon.ts';
import { moonLander, moonShot, newSim } from './helpers/vessels.ts';

/** Miss distance of the transfer across the moon's orbit radius, m (a periapsis near 50 km altitude). */
const SHIFT = 500_000;

async function fly() {
	const started = performance.now();
	const sim = await newSim();
	const s = systemOf(sim);
	const loaded = sim.dispatch({ type: 'load-vessel', design: moonShot() });
	if (!loaded.ok) throw new Error(loaded.reason);
	const vessel = loaded.vessel as EntityId;
	const m: Mission = { sim, vessel, log: [] };
	const crossings: Array<{ t: number; from: string; to: string; warp: number }> = [];
	sim.events.on('vessel:soi-changed', (e) => {
		if (e.vessel === vessel)
			crossings.push({ t: sim.time, from: e.from, to: e.to, warp: sim.warp });
	});
	const damaged: unknown[] = [];
	sim.events.on('part:damaged', (e) => damaged.push(e));

	// 1. Launch and orbit.
	const ascent = createAscent(sim, vessel, {
		...defaultAscent,
		stageCount: 1,
		jettisonAtCut: true,
		apoapsis: 100_000,
		periapsis: 76_000,
		turnStart: 100,
		turnEnd: 25_000,
		turnPitch: 1.2
	});
	while (sim.time < 1_500 && ascent.phase !== 'done') {
		sim.step(0.02);
		ascent.update();
	}
	const mass = (): number => vesselMass(sim, snapshotOf(m).v);
	note(m, `orbit reached (${ascent.phase}), mass ${mass().toFixed(0)} kg`);

	// 2. Transfer burn, centred on the departure time that meets the moon.
	for (let i = 0; i < 200; i++) sim.step(0.02);
	const orbit0 = snapshotOf(m).v.orbit!;
	const departure = transferBurnTime(sim, orbit0, sim.time, SHIFT);
	point(m, 'prograde');
	warpTo(m, departure - 12);
	while (sim.time < departure - 12) sim.step(0.02);
	const wantedApoapsis = s.orbit.a + SHIFT;
	const gap = (): number => {
		const o = snapshotOf(m).v.orbit;
		return o === undefined ? Infinity : wantedApoapsis - o.a * (1 + o.e);
	};
	const taper = (g: number): number => (g > 2_000_000 ? 1 : g > 300_000 ? 0.2 : 0.03);
	const tmi = burn(
		m,
		() => gap() <= 0,
		400,
		() => taper(gap())
	);
	note(m, `transfer burn ${tmi.toFixed(1)} s, mass ${mass().toFixed(0)} kg`);

	// 3. Coast to the moon's sphere at time warp.
	for (let i = 0; i < 300 && snapshotOf(m).v.mode !== 'on-rails'; i++) sim.step(0.02);
	let guard = 0;
	while (snapshotOf(m).v.soi !== s.moon.id && guard++ < 50) warpTo(m, sim.time + 40_000, true);
	note(m, `in the moon's sphere, warp ${sim.warp}`);
	const entry = snapshotOf(m).v.orbit!;

	// 4. Capture at periapsis into a long ellipse, then one orbit later a second small retrograde
	// burn at periapsis brings the apoapsis down to a low orbit (a burn centred on periapsis keeps it).
	const capture = retroBurnAtPeriapsis(m, s.moonMu, 1_200_000);
	note(m, `capture burn ${capture.toFixed(1)} s, mass ${mass().toFixed(0)} kg`);
	for (let i = 0; i < 300 && snapshotOf(m).v.mode !== 'on-rails'; i++) sim.step(0.02);
	const ellipse = snapshotOf(m).v.orbit!;
	const lowering = retroBurnAtPeriapsis(m, s.moonMu, 300_000);
	note(m, `lowering burn ${lowering.toFixed(1)} s, mass ${mass().toFixed(0)} kg`);
	const moonOrbit = snapshotOf(m).v.orbit!;
	for (let i = 0; i < 300 && snapshotOf(m).v.mode !== 'on-rails'; i++) sim.step(0.02);
	const descent = lowerPeriapsis(m, s.moonMu, s.moon.radius + 10_000);
	note(m, `descent burn ${descent.toFixed(1)} s, mass ${mass().toFixed(0)} kg`);
	for (let i = 0; i < 300 && snapshotOf(m).v.mode !== 'on-rails'; i++) sim.step(0.02);
	const low = snapshotOf(m).v.orbit!;
	warpTo(m, periapsisTime(low, s.moonMu, sim.time) - 60);

	// 5. Landing.
	const landing = createLanding(sim, vessel, {
		...defaultLanding,
		body: s.moon.id,
		rootToFoot: 7.2,
		margin: 0.5,
		finalSpeed: 30,
		leanGain: 0.1
	});
	for (let i = 0; sim.time < 80_000 && landing.phase !== 'done'; i++) {
		sim.step(0.02);
		landing.update();
	}
	return {
		sim,
		s,
		m,
		vessel,
		crossings,
		damaged,
		entry,
		ellipse,
		moonOrbit,
		landing,
		tmi,
		capture,
		wall: performance.now() - started
	};
}

const omegaOf = (period: number): number => (2 * Math.PI) / period;

test('the stock rocket goes to the moon and lands at rest on it', async () => {
	const r = await fly();
	const { sim, s, m } = r;
	console.log(m.log.map((l) => `${l.t.toFixed(0)} s ${l.note}`).join('\n'));
	console.log(
		r.landing.log.map((l) => `${l.t.toFixed(0)} s ${l.note}`).join(' | '),
		`wall ${r.wall.toFixed(0)} ms`
	);

	// Across the sphere once, entering; warp dropped to 1 for the player.
	expect(r.crossings.map((c) => `${c.from}>${c.to}`)).toEqual([`${s.home.id}>${s.moon.id}`]);
	expect(m.log.some((l) => l.note === "in the moon's sphere, warp 1")).toBe(true);
	// The encounter is a flyby that passes the surface, and the capture orbit does not hit it.
	const entryPeriapsis = r.entry.a * (1 - r.entry.e);
	expect(entryPeriapsis).toBeGreaterThan(s.moon.radius + 20_000);
	expect(entryPeriapsis).toBeLessThan(s.moon.radius + 200_000);
	expect(r.ellipse.e).toBeLessThan(1);
	expect(r.moonOrbit.e).toBeLessThan(0.3);
	expect(r.moonOrbit.a * (1 - r.moonOrbit.e)).toBeGreaterThan(s.moon.radius + 20_000);

	// Landed on its legs, at rest, upright, with every part, in the moon's sphere: after a few quiet
	// seconds it goes on surface rails and turns with the moon.
	expect(r.landing.phase).toBe('done');
	for (let i = 0; i < 1_500 && snapshotOf(m).v.mode !== 'on-rails'; i++) sim.step(0.02);
	const v = snapshotOf(m).v;
	expect(v.mode).toBe('on-rails');
	expect(v.surface).toBe(true);
	expect(String(v.soi)).toBe(s.moon.id);
	const omega = omegaOf(s.moon.rotationPeriod);
	const ground = { x: omega * v.position.z, y: 0, z: -omega * v.position.x };
	expect(length(sub(v.velocity, ground))).toBeLessThan(0.05);
	expect(tiltDegrees(v)).toBeLessThan(5);
	expect(v.parts).toHaveLength(6);
	expect(r.damaged).toEqual([]);
	const standing = length(v.position) - s.moon.radius;
	expect(standing).toBeGreaterThan(7);
	expect(standing).toBeLessThan(8); // the root sits 7.2 m above the ground on the deployed legs
	expect(sim.time).toBeLessThan(80_000);
	expect(r.wall).toBeLessThan(60_000);
	sim.dispose();
}, 120_000);

test('the mission is deterministic: two runs give byte-identical snapshots and worlds', async () => {
	const a = await fly();
	const b = await fly();
	expect(JSON.stringify(b.sim.snapshot())).toBe(JSON.stringify(a.sim.snapshot()));
	expect(JSON.stringify(b.sim.world.serialize())).toBe(JSON.stringify(a.sim.world.serialize()));
	expect(JSON.stringify(b.m.log)).toBe(JSON.stringify(a.m.log));
	a.sim.dispose();
	b.sim.dispose();
}, 120_000);
