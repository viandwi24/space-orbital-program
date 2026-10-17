/**
 * Plan 080 goldens, recorded on the code before the trajectory provider existed: the map path,
 * node prediction and rendezvous aids for fixed inputs. The move behind `TrajectoryProvider` must
 * leave every number identical.
 */
import { GRAVITATIONAL_CONSTANT, type BodyDefinition, type EntityId, type Snapshot } from '@orbital/core';
import { toStateVector } from '@orbital/kepler';
import Stock from '@orbital/mod-stock';
import { createRapierBackend } from '@orbital/physics';
import { createSim } from '@orbital/sim';
import { partId, type VesselDesign } from '@orbital/core';
import { describe, expect, it } from 'vitest';
import { bodyNodes, predictManeuvers, predictMapPath } from './map-path';
import { patchedApproach, rendezvousAids } from './rendezvous-aids';

const HOME_MU = 3.5316e12;
const home = { id: 'stock.home', mass: HOME_MU / GRAVITATIONAL_CONSTANT, radius: 600_000, rotationPeriod: 21_600 } as unknown as BodyDefinition;
const moon = {
	id: 'stock.cinder',
	mass: 5.776e10 / GRAVITATIONAL_CONSTANT,
	radius: 190_000,
	rotationPeriod: 135_524,
	parent: 'stock.home',
	orbit: { a: 11.8e6, e: 0, i: 0, raan: 0, argp: 0, m0: 1, epoch: 0 }
} as unknown as BodyDefinition;
const bodies = bodyNodes([home, moon]);

// A transfer from 680 km to the moon's orbit plus 800 km, timed to meet the moon (as the sim tests do).
function transfer() {
	const r1 = 680_000;
	const rm = 11.8e6 + 800_000;
	const a = (r1 + rm) / 2;
	const flight = Math.PI * Math.sqrt((a * a * a) / HOME_MU);
	const n = Math.sqrt(HOME_MU / 11.8e6 ** 3);
	return toStateVector({ a, e: (rm - r1) / (rm + r1), i: 0, raan: 0, argp: 1 + n * flight - Math.PI, m0: 0, epoch: 0 }, HOME_MU, 0);
}

const q0 = { x: 0, y: 0, z: 0, w: 1 };
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
function snapshotOf(): Snapshot {
	const st = transfer();
	return {
		t: 0,
		bodies: [],
		vessels: [
			{
				id: 1 as EntityId,
				mode: 'on-rails',
				soi: 'stock.home',
				position: st.r,
				velocity: st.v,
				orientation: q0,
				parts: []
			}
		]
	} as unknown as Snapshot;
}

describe('trajectory goldens (plan 080)', () => {
	it('map path through the moon sphere', () => {
		expect(predictMapPath(snapshotOf(), 1, bodies, 400_000)).toMatchSnapshot();
	});

	it('node prediction with two nodes', () => {
		const maneuvers = [
			{ id: 0, time: 120, prograde: 40, normal: 5, radial: -3 },
			{ id: 1, time: 3_000, prograde: -25, normal: 0, radial: 10 }
		];
		expect(predictManeuvers(snapshotOf(), 1, bodies, maneuvers as never, 400_000)).toMatchSnapshot();
	});

	it('closest approach and aids for the moon as target (snapshot from the sim)', async () => {
		const sim = await createSim({ plugins: [Stock], backendFactory: () => createRapierBackend(), seed: 1 });
		const st = transfer();
		const placed = sim.dispatch({
			type: 'load-vessel',
			design: probe,
			placement: { kind: 'state', position: st.r, velocity: st.v }
		});
		if (!placed.ok) throw new Error(placed.reason);
		expect(sim.dispatch({ type: 'target-set', vessel: placed.vessel!, target: { kind: 'body', id: 'stock.cinder' } as never }).ok).toBe(true);
		sim.step(0.02);
		const snap = sim.snapshot();
		const v = snap.vessels.find((x) => x.id === placed.vessel)!;
		const simBodies = bodyNodes(sim.registries.bodies.list());
		const approach = patchedApproach(snap, v, simBodies);
		expect(approach).toMatchSnapshot();
		expect(rendezvousAids(snap, v, simBodies, approach)).toMatchSnapshot();
		sim.dispose();
	});
});
