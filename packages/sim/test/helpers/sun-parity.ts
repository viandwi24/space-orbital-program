/**
 * Plan 122's parity scenarios: the stock moon rocket's headless ascent to a low orbit, then the
 * transfer to the moon and capture (the release-saves flight, plan 023). Returns each stage's state
 * relative to its sphere's body, so the same flight with the Sun at the root can be compared with
 * the frozen numbers from before (`fixtures/sun-parity.json`).
 */
import Stock from '@orbital/mod-stock';
import { createBodyTerrainField, type EntityId } from '@orbital/core';
import { createSim } from '../../src/index.ts';
import { createAscent, defaultAscent } from './ascent.ts';
import {
	burn,
	point,
	retroBurnAtPeriapsis,
	snapshotOf,
	transferBurnTime,
	warpTo,
	type Mission
} from './mission.ts';
import { systemOf } from './moon.ts';
import { moonShot, rapier } from './vessels.ts';

export interface ParityState {
	t: number;
	soi: string;
	position: { x: number; y: number; z: number };
	velocity: { x: number; y: number; z: number };
}

export async function runParity(): Promise<{ orbit: ParityState; moon: ParityState }> {
	const sim = await createSim({
		plugins: [Stock],
		backendFactory: rapier(16),
		seed: 1,
		terrain: createBodyTerrainField
	});
	const s = systemOf(sim);
	const loaded = sim.dispatch({ type: 'load-vessel', design: { ...moonShot(), name: 'Parity' } });
	if (!loaded.ok) throw new Error(loaded.reason);
	const m: Mission = { sim, vessel: loaded.vessel as EntityId, log: [] };
	const state = (): ParityState => {
		const v = snapshotOf(m).v;
		return { t: sim.time, soi: String(v.soi), position: v.position, velocity: v.velocity };
	};
	const ascent = createAscent(sim, m.vessel, {
		...defaultAscent,
		// the boosters, then the core: the lander finishes the ascent (plan 380)
		stageCount: 2,
		jettisonAtCut: false,
		// an 80 km parking orbit since plan 380 (it was 100): the early-era lander has no Δv to spare
		apoapsis: 80_000,
		periapsis: 76_000,
		turnStart: 100,
		// flatter since plan 380: the early-era core lofted and left the lander short
		turnEnd: 30_000,
		turnPitch: 1.4
	});
	while (sim.time < 1_500 && ascent.phase !== 'done') {
		sim.step(0.02);
		ascent.update();
	}
	for (let i = 0; i < 200; i++) sim.step(0.02);
	const orbit = state();
	const departure = transferBurnTime(sim, snapshotOf(m).v.orbit!, sim.time, 500_000);
	point(m, 'prograde');
	warpTo(m, departure - 12);
	while (sim.time < departure - 12) sim.step(0.02);
	const wanted = s.orbit.a + 500_000;
	const gap = () => {
		const o = snapshotOf(m).v.orbit;
		return o === undefined ? Infinity : wanted - o.a * (1 + o.e);
	};
	burn(
		m,
		() => gap() <= 0,
		400,
		() => (gap() > 2_000_000 ? 1 : gap() > 300_000 ? 0.2 : 0.03)
	);
	for (let i = 0; i < 300 && snapshotOf(m).v.mode !== 'on-rails'; i++) sim.step(0.02);
	let guard = 0;
	while (snapshotOf(m).v.soi !== s.moon.id && guard++ < 50) warpTo(m, sim.time + 40_000, true);
	retroBurnAtPeriapsis(m, s.moonMu, 1_200_000);
	for (let i = 0; i < 300 && snapshotOf(m).v.mode !== 'on-rails'; i++) sim.step(0.02);
	const moon = state();
	sim.dispose();
	return { orbit, moon };
}
