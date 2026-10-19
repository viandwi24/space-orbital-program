/** The pad before liftoff (plan 200, ADR 0216 point 3): "On the pad", no orbit, MET 0. */
import { readFileSync } from 'node:fs';
import { calendarOf, epochFromUnixMs, partId, type VesselDesign } from '@orbital/core';
import { SOL_BODIES } from '@orbital/mod-sol';
import Stock from '@orbital/mod-stock';
import { createRapierBackend } from '@orbital/physics';
import { createSim, type Sim } from '@orbital/sim';
import { render } from 'svelte/server';
import { afterEach, describe, expect, it } from 'vitest';
import { createHudController } from '../hud-controller';
import { catchUpOffer } from '../worlds/world-model';
import OrbitStrip from './OrbitStrip.svelte';

const rocket: VesselDesign = {
	formatVersion: 1,
	name: 'Pad',
	parts: ['stock.command-pod', 'stock.tank-small', 'stock.engine-lv'].map((p, index) => ({
		index,
		part: partId(p),
		parent: index === 0 ? null : { index: index - 1, parentNode: 'bottom', node: 'top' }
	})),
	stages: [[2]]
};

let sim: Sim | null = null;
afterEach(() => {
	sim?.dispose();
	sim = null;
});

async function onThePad() {
	sim = await createSim({
		plugins: [Stock],
		backendFactory: () => createRapierBackend({ solverIterations: 16 }),
		seed: 1
	});
	const r = sim.dispatch({ type: 'load-vessel', design: rocket });
	if (!r.ok) throw new Error(r.reason);
	const hud = createHudController({
		design: rocket,
		content: sim.registries,
		bodies: sim.registries.bodies.list(),
		project: () => null,
		now: () => 0,
		rendezvous: () => ({ approach: null, aids: [] })
	});
	hud.attach(Number(r.vessel));
	for (let i = 0; i < 50; i++) sim.step(0.02);
	hud.snapshot(sim.snapshot());
	return { hud, vessel: r.vessel! };
}

describe('the pad state', () => {
	it('reads "On the pad", shows no orbit and no countdown, and MET 0', async () => {
		const { hud } = await onThePad();
		const model = hud.model(0, 0.5)!;
		expect(model.prelaunch).toBe(true);
		expect(model.situation).toBe('On the pad, ready to launch');
		expect(model.met).toBe(0);
		expect(model.time).toBeGreaterThan(0);
		const { body } = render(OrbitStrip, {
			props: { orbit: model.orbit, phase: model.phase, prelaunch: model.prelaunch }
		});
		expect(body).toContain('On the surface, no orbit yet');
		expect(body).not.toContain('Apoapsis');
		expect(body).not.toContain('warp-to-ap');
	});

	it('the first stage is liftoff: MET counts from it', async () => {
		const { hud, vessel } = await onThePad();
		const fired = sim!.time;
		expect(sim!.dispatch({ type: 'throttle', vessel, value: 1 }).ok).toBe(true);
		expect(sim!.dispatch({ type: 'stage', vessel }).ok).toBe(true);
		for (let i = 0; i < 50; i++) sim!.step(0.02);
		hud.snapshot(sim!.snapshot());
		const model = hud.model(0, 1)!;
		expect(model.prelaunch).toBe(false);
		expect(model.situation).not.toContain('On the pad');
		expect(model.met).toBeCloseTo(sim!.time - fired, 6);
	});
});

describe('flight page details (plan 200)', () => {
	it('draws one blackout badge', () => {
		const page = readFileSync(
			new URL('../../routes/(world)/flight/+page.svelte', import.meta.url),
			'utf8'
		);
		expect(page.match(/<BlackoutBadge\b/g)).toHaveLength(1);
	});

	it('offers "Catch up to now" in a Sol world only', async () => {
		sim = await createSim({ plugins: [Stock], backendFactory: () => createRapierBackend({}) });
		const stock = calendarOf(sim.registries.bodies.list());
		const sol = calendarOf(SOL_BODIES);
		const epoch = epochFromUnixMs(Date.UTC(2026, 0, 1)); // the world began in January
		const world = { t: 0, vessels: [] };
		const now = Date.UTC(2026, 9, 19);
		expect(catchUpOffer(epoch, stock, world, now).kind).toBe('none');
		expect(catchUpOffer(epoch, sol, world, now).kind).toBe('offer');
	});
});
