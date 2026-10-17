import { partId, type EntityId, type Vec3, type VesselDesign } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { createRapierBackend } from '@orbital/physics';
import { createSim, type Sim } from '@orbital/sim';
import { afterEach, describe, expect, it } from 'vitest';
import { createHudController } from './hud-controller';

const probe: VesselDesign = {
	formatVersion: 1,
	name: 'Probe',
	parts: ['stock.command-pod', 'stock.reaction-wheel', 'stock.tank-small'].map((p, index) => ({
		index,
		part: partId(p),
		parent: index === 0 ? null : { index: index - 1, parentNode: 'bottom', node: 'top' }
	})),
	stages: []
};
const MU = 3.5316e12;
function circ(r: number, phase: number): { position: Vec3; velocity: Vec3 } {
	const v = Math.sqrt(MU / r);
	return {
		position: { x: r * Math.cos(phase), y: 0, z: -r * Math.sin(phase) },
		velocity: { x: -v * Math.sin(phase), y: 0, z: -v * Math.cos(phase) }
	};
}

let sim: Sim | null = null;
afterEach(() => {
	sim?.dispose();
	sim = null;
});

async function setup() {
	sim = await createSim({
		plugins: [Stock],
		backendFactory: () => createRapierBackend({ solverIterations: 16 }),
		seed: 1
	});
	const load = (state: { position: Vec3; velocity: Vec3 }): EntityId => {
		const r = sim!.dispatch({
			type: 'load-vessel',
			design: probe,
			placement: { kind: 'state', ...state }
		});
		if (!r.ok) throw new Error(r.reason);
		return r.vessel as EntityId;
	};
	const a = load(circ(750_000, 0));
	const b = load(circ(760_000, 0.4));
	const hud = createHudController({
		design: probe,
		content: sim.registries,
		bodies: sim.registries.bodies.list(),
		project: () => null,
		now: () => 0,
		rendezvous: () => ({ approach: null, aids: [] })
	});
	hud.attach(Number(a));
	const feed = (): void => hud.snapshot(sim!.snapshot());
	feed();
	return { hud, feed, a, b };
}

describe('HUD controller with a target', () => {
	it('shows the target markers; target mode adds the relative pair and reads the relative speed', async () => {
		const { hud, feed, a, b } = await setup();
		const kinds = () => hud.frame().navball!.markers.map((m) => m.kind);
		expect(kinds()).not.toContain('target');
		sim!.dispatch({ type: 'target-set', vessel: a, target: { kind: 'vessel', id: b } });
		feed();
		expect(kinds()).toEqual(expect.arrayContaining(['target', 'anti-target', 'prograde']));
		expect(kinds()).not.toContain('target-prograde');

		// V: auto -> surface -> orbit -> target (only because there is a target).
		expect(hud.cycleSpeedMode()).toBe('surface');
		expect(hud.cycleSpeedMode()).toBe('orbit');
		expect(hud.cycleSpeedMode()).toBe('target');
		const model = hud.model(0, 0)!;
		const t = sim!.snapshot().vessels.find((v) => v.id === a)!.target!;
		expect(model.speedMode).toBe('target');
		expect(model.speed).toBeCloseTo(t.relativeSpeed, 9);
		expect(kinds()).toEqual(expect.arrayContaining(['target', 'anti-target', 'target-prograde']));
		expect(kinds()).not.toContain('prograde');
		// The relative prograde points along minus the target's relative velocity.
		const pro = hud.frame().navball!.markers.find((m) => m.kind === 'target-prograde')!;
		const l = Math.hypot(t.velocity.x, t.velocity.y, t.velocity.z);
		expect(pro.dir.x).toBeCloseTo(-t.velocity.x / l, 9);
		expect(pro.dir.z).toBeCloseTo(-t.velocity.z / l, 9);
		expect(model.rendezvous).toEqual({ approach: null, aids: [] });

		// Losing the target leaves target mode: back to auto, the cycle skips it again.
		sim!.dispatch({ type: 'target-set', vessel: a, target: null });
		feed();
		const after = hud.model(0, 0)!;
		expect(after.speedPreference).toBe('auto');
		expect(after.speedMode).not.toBe('target');
		expect(after.rendezvous).toBeNull();
		expect(hud.cycleSpeedMode()).toBe('surface');
	});
});
