/** Plan 318 (ADR 0274): which pad a vessel stands on, and Clear debris. */
import { describe, expect, test } from 'bun:test';
import type { EntityId, VesselPlacement } from '@orbital/core';
import type { Sim } from '../src/index.ts';
import { newSim, probe, stack } from './helpers/vessels.ts';

const MU = 3.5316e12;
const tank = () => stack('Tank', ['stock.tank-small'], []);
const inOrbit: VesselPlacement = {
	kind: 'state',
	position: { x: -800_000, y: 0, z: 0 },
	velocity: { x: 0, y: 0, z: Math.sqrt(MU / 800_000) }
};

const load = (sim: Sim, design = probe(), placement?: VesselPlacement): EntityId => {
	const r = sim.dispatch({ type: 'load-vessel', design, ...(placement ? { placement } : {}) });
	if (!r.ok || r.vessel === undefined) throw new Error(r.ok ? 'no vessel' : r.reason);
	return r.vessel;
};
const vessel = (sim: Sim, id: EntityId) => sim.snapshot().vessels.find((v) => v.id === id);

describe('atSite (plan 318)', () => {
	test('a vessel on the pad stands at the pad; one 30 m east reads 30 m east; one 6 km away is off the site', async () => {
		const sim = await newSim({ maxFlightFrames: 2 });
		const onPad = load(sim);
		const east = load(sim, probe(), { kind: 'surface', longitude: 30 / 600_000 });
		const away = load(sim, probe(), { kind: 'surface', longitude: 0.01 });
		sim.step(0.02);
		const spot = vessel(sim, onPad)!.atSite!;
		expect(spot.site).toEqual(expect.any(String));
		expect(Math.hypot(spot.east, spot.north)).toBeLessThan(1);
		expect(vessel(sim, east)!.atSite!.east).toBeCloseTo(30, 0);
		expect(Math.abs(vessel(sim, east)!.atSite!.north)).toBeLessThan(1);
		expect(vessel(sim, away)!.atSite).toBeUndefined();
		sim.dispose();
	});

	test('a vessel in orbit is at no site', async () => {
		const sim = await newSim();
		const id = load(sim, probe(), inOrbit);
		expect(vessel(sim, id)!.atSite).toBeUndefined();
		sim.dispose();
	});
});

describe('clear-debris (plan 318)', () => {
	test('removes every debris vessel and keeps controlled ones; with a site only the debris near it', async () => {
		const sim = await newSim();
		const ship = load(sim); // controlled, on the pad
		const padDebris = load(sim, tank(), { kind: 'surface', longitude: 0.000_05 }); // 30 m off
		const orbitDebris = load(sim, tank(), inOrbit);
		sim.step(0.02);
		const site = vessel(sim, ship)!.atSite!.site;
		const reasons: string[] = [];
		sim.events.on('vessel:destroyed', (e) => reasons.push(e.reason));

		expect(sim.dispatch({ type: 'clear-debris', site })).toEqual({ ok: true });
		expect(vessel(sim, padDebris)).toBeUndefined();
		expect(vessel(sim, orbitDebris)).toBeDefined();
		expect(vessel(sim, ship)).toBeDefined();

		expect(sim.dispatch({ type: 'clear-debris' })).toEqual({ ok: true });
		expect(vessel(sim, orbitDebris)).toBeUndefined();
		expect(vessel(sim, ship)).toBeDefined();
		expect(reasons).toEqual(['terminated', 'terminated']);
		sim.dispose();
	});

	test('an unknown site is refused', async () => {
		const sim = await newSim();
		const r = sim.dispatch({ type: 'clear-debris', site: 'nowhere' });
		expect(r.ok).toBe(false);
		sim.dispose();
	});

	test('a vessel retyped by the player is not debris', async () => {
		const sim = await newSim();
		const t = load(sim, tank(), inOrbit);
		expect(sim.dispatch({ type: 'set-vessel-type', vessel: t, vesselType: 'station' }).ok).toBe(
			true
		);
		sim.dispatch({ type: 'clear-debris' });
		expect(vessel(sim, t)).toBeDefined();
		sim.dispose();
	});
});
