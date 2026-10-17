/** Plan 041 / ADR 0071: tilted parts have the right mass properties, orientation and thrust axis. */
import { describe, expect, test } from 'bun:test';
import {
	partId,
	type BodyDesc,
	type PhysicsBackend,
	type Quat,
	type Vec3,
	type VesselDesign
} from '@orbital/core';
import { createRapierBackend } from '@orbital/physics';
import Stock from '@orbital/mod-stock';
import { createSim, type Sim } from '../src/index.ts';
import { diagonalise } from '../src/mass.ts';
import { VESSEL } from '../src/state.ts';
import { partMasses } from './helpers/measure.ts';
import { UP_Y, rotate } from './helpers/attitude.ts';

/** A real backend that remembers the last body description (mass, centre of mass, principal inertia and frame). */
async function recording(): Promise<{ backend: PhysicsBackend; last: () => BodyDesc }> {
	const real = await createRapierBackend({ solverIterations: 16 });
	let desc: BodyDesc | undefined;
	return {
		backend: {
			...real,
			createBody(d) {
				desc = d;
				return real.createBody(d);
			}
		},
		last: () => desc!
	};
}

const TILT = Math.PI / 2;
const design = (tilt: { x: number; y: number; z: number } | undefined): VesselDesign => ({
	formatVersion: 3,
	name: 'Tilted',
	parts: [
		{ index: 0, part: partId('stock.command-pod'), parent: null },
		{
			index: 1,
			part: partId('stock.tank-small'),
			parent: { index: 0, parentNode: 'bottom', node: 'top' },
			...(tilt ? { tilt } : {})
		}
	],
	stages: []
});

const FALL = { position: { x: 660_000, y: 0, z: 0 }, velocity: { x: 0, y: 0, z: -300 } };

async function load(d: VesselDesign): Promise<{ sim: Sim; desc: BodyDesc; masses: number[] }> {
	const rec = await recording();
	const sim = await createSim({
		plugins: [Stock],
		backendFactory: () => rec.backend,
		seed: 1,
		maxFlightFrames: 1
	});
	const r = sim.dispatch({ type: 'load-vessel', design: d, placement: { kind: 'state', ...FALL } });
	if (!r.ok) throw new Error(r.reason);
	return { sim, desc: rec.last(), masses: partMasses(sim, sim.snapshot().vessels[0]!) };
}

/** Solid cylinder principal moments about its own centre (x, y axial, z). */
const cyl = (m: number, r: number, h: number): [number, number, number] => [
	(m * (3 * r * r + h * h)) / 12,
	0.5 * m * r * r,
	(m * (3 * r * r + h * h)) / 12
];

describe('tilted parts (ADR 0071)', () => {
	test('a tank tilted a quarter turn about Z: mass, centre of mass and inertia tensor match the hand calculation', async () => {
		const { sim, desc, masses } = await load(design({ x: 0, y: 0, z: TILT }));
		const [mPod, mTank] = masses as [number, number];
		// Pod origin (0,0,0); the tank pivots on the pod's bottom node and lies along -X: origin (1, -0.5, 0).
		const tank = { x: 1, y: -0.5, z: 0 };
		const total = mPod + mTank;
		const com = { x: (mTank * tank.x) / total, y: (mTank * tank.y) / total, z: 0 };
		expect(desc.mass).toBeCloseTo(total, 9);
		expect(desc.centerOfMass!.x).toBeCloseTo(com.x, 9);
		expect(desc.centerOfMass!.y).toBeCloseTo(com.y, 9);
		// Tensor about the COM: own inertia (the tank's X and Y swap under Rz(90 deg)) + parallel axis.
		const pod = cyl(mPod, 0.625, 1);
		const t = cyl(mTank, 0.625, 2);
		const own = [
			[pod, { x: 0, y: 0, z: 0 }, 0],
			[[t[1], t[0], t[2]], tank, 1]
		] as const;
		const I = [0, 0, 0, 0, 0, 0, 0, 0, 0];
		for (const [d, p] of own) {
			const m = d === pod ? mPod : mTank;
			const r = { x: p.x - com.x, y: p.y - com.y, z: p.z - com.z };
			const r2 = r.x * r.x + r.y * r.y + r.z * r.z;
			I[0]! += d[0] + m * (r2 - r.x * r.x);
			I[4]! += d[1] + m * (r2 - r.y * r.y);
			I[8]! += d[2] + m * (r2 - r.z * r.z);
			I[1]! -= m * r.x * r.y;
			I[2]! -= m * r.x * r.z;
			I[5]! -= m * r.y * r.z;
		}
		I[3] = I[1]!;
		I[6] = I[2]!;
		I[7] = I[5]!;
		const expected = diagonalise(I as Parameters<typeof diagonalise>[0]).values;
		const got = [desc.inertia!.x, desc.inertia!.y, desc.inertia!.z].sort((a, b) => a - b);
		const want = [expected.x, expected.y, expected.z].sort((a, b) => a - b);
		for (let i = 0; i < 3; i++) expect(Math.abs(got[i]! - want[i]!) / want[i]!).toBeLessThan(1e-9);
		// The upright design has a different tensor (the tilt is felt).
		const upright = await load(design(undefined));
		expect(upright.desc.inertia!.x).not.toBeCloseTo(desc.inertia!.x, 0);
		upright.sim.dispose();
		sim.dispose();
	});

	test('the snapshot part orientation is the body rotation times the part rotation', async () => {
		const { sim } = await load(design({ x: 0, y: 0, z: TILT }));
		const v = sim.snapshot().vessels[0]!;
		const pod = v.parts[0]!;
		const tank = v.parts[1]!;
		// The pod keeps the vessel's axes; the tank's +Y points along the vessel's -X, its +X along +Y.
		const up = rotate(v.orientation, UP_Y);
		const podUp = rotate(pod.orientation, UP_Y);
		const tankUp = rotate(tank.orientation, UP_Y);
		const tankX = rotate(tank.orientation, { x: 1, y: 0, z: 0 });
		const bodyX = rotate(v.orientation, { x: 1, y: 0, z: 0 });
		const close = (a: Vec3, b: Vec3): void => {
			expect(a.x).toBeCloseTo(b.x, 6);
			expect(a.y).toBeCloseTo(b.y, 6);
			expect(a.z).toBeCloseTo(b.z, 6);
		};
		close(podUp, up);
		close(tankUp, { x: -bodyX.x, y: -bodyX.y, z: -bodyX.z });
		close(tankX, up);
		// Its centre is 1 m along the body's +X and 0.5 m below the pod's.
		const d = {
			x: tank.position.x - pod.position.x,
			y: tank.position.y - pod.position.y,
			z: tank.position.z - pod.position.z
		};
		expect(d.x * bodyX.x + d.y * bodyX.y + d.z * bodyX.z).toBeCloseTo(1, 6);
		expect(d.x * up.x + d.y * up.y + d.z * up.z).toBeCloseTo(-0.5, 6);
		sim.dispose();
	});

	test('a tilted engine thrusts along its tilted axis', async () => {
		const angle = (20 * Math.PI) / 180;
		const d: VesselDesign = {
			formatVersion: 3,
			name: 'Canted',
			parts: [
				{ index: 0, part: partId('stock.command-pod'), parent: null },
				{
					index: 1,
					part: partId('stock.tank-small'),
					parent: { index: 0, parentNode: 'bottom', node: 'top' }
				},
				{
					index: 2,
					part: partId('stock.engine-lv'),
					parent: { index: 1, parentNode: 'bottom', node: 'top' },
					tilt: { x: 0, y: 0, z: angle }
				}
			],
			stages: [[2]]
		};
		// Velocity after 0.1 s with the engine lit minus the same coast without it: the thrust alone.
		const flown = async (lit: boolean) => {
			const sim = await createSim({
				plugins: [Stock],
				backendFactory: () => createRapierBackend({ solverIterations: 16 }),
				seed: 1
			});
			const r = sim.dispatch({
				type: 'load-vessel',
				design: d,
				placement: {
					kind: 'state',
					position: { x: 800_000, y: 0, z: 0 },
					velocity: { x: 0, y: 0, z: -1_000 }
				}
			});
			if (!r.ok) throw new Error(r.reason);
			const start = sim.snapshot().vessels[0]!;
			if (lit) {
				sim.dispatch({ type: 'throttle', vessel: r.vessel!, value: 1 });
				sim.dispatch({ type: 'stage', vessel: r.vessel! });
			}
			for (let i = 0; i < 5; i++) sim.step(0.02);
			// The centre of mass velocity: the snapshot's is the root part's, which includes the spin.
			const v = sim.world.get(r.vessel!, VESSEL)!.velocity;
			sim.dispose();
			return { q0: start.orientation, v };
		};
		const lit = await flown(true);
		const coast = await flown(false);
		const q0 = lit.q0;
		const dv = { x: lit.v.x - coast.v.x, y: lit.v.y - coast.v.y, z: lit.v.z - coast.v.z };
		// The engine part's +Y axis is (-sin a, cos a, 0) in vessel axes.
		const axis = rotate(q0, { x: -Math.sin(angle), y: Math.cos(angle), z: 0 });
		const speed = Math.hypot(dv.x, dv.y, dv.z);
		expect(speed).toBeGreaterThan(1);
		const cosine = (dv.x * axis.x + dv.y * axis.y + dv.z * axis.z) / speed;
		// The thrust off the centre line also starts to turn the vessel, so the bound is loose.
		expect(Math.acos(Math.min(1, cosine))).toBeLessThan((3 * Math.PI) / 180);
		const straight = rotate(q0, UP_Y);
		const off = Math.acos(
			Math.min(1, (dv.x * straight.x + dv.y * straight.y + dv.z * straight.z) / speed)
		);
		expect(off).toBeGreaterThan((10 * Math.PI) / 180);
	});

	test('untilted designs carry no rotation: the world is as before', async () => {
		const { sim } = await load(design(undefined));
		const quat = (q: Quat): number => Math.hypot(q.x, q.y, q.z);
		const v = sim.snapshot().vessels[0]!;
		expect(quat(v.parts[1]!.orientation)).toBeCloseTo(quat(v.orientation), 12);
		sim.dispose();
	});
});
