/**
 * Plan 265 (ADR 0246): a pod's mass sits low and its blunt base turns to face the airflow, so a
 * bare pod re-enters heat shield first by itself; a pod that has been thrown on the ground does
 * not end on its top. A pod on a rocket has its base covered: no moment, so the stock rockets
 * and their frozen flights are as they were.
 */
import { describe, expect, test } from 'bun:test';
import { latLonDirection, type BodyDesc, type PhysicsBackend } from '@orbital/core';
import { createRapierBackend } from '@orbital/physics';
import { length } from '@orbital/kepler';
import Stock, { PartCommandPod, PartHeatShield } from '@orbital/mod-stock';
import { createSim, type Sim } from '../src/index.ts';
import { newSim, rapier, stack } from './helpers/vessels.ts';

const R = 600_000;

/** Angle between the vessel's base (-Y) and its velocity, degrees: 0 is base first. */
function baseAngle(v: ReturnType<Sim['snapshot']>['vessels'][number]): number {
	const q = v.orientation;
	const ny = {
		x: 2 * (q.x * q.y - q.w * q.z),
		y: 1 - 2 * (q.x * q.x + q.z * q.z),
		z: 2 * (q.y * q.z + q.w * q.x)
	};
	const s = length(v.velocity);
	const c = -(ny.x * v.velocity.x + ny.y * v.velocity.y + ny.z * v.velocity.z) / s;
	return (Math.acos(Math.max(-1, Math.min(1, c))) * 180) / Math.PI;
}

/** Fall from 8 km at 250 m/s with the vessel's base `tilt` degrees off the airflow; the angle over time. */
async function fall(parts: string[], tilt: number, seconds: number): Promise<number[]> {
	const sim = await newSim();
	const a = (tilt * Math.PI) / 180;
	const placed = sim.dispatch({
		type: 'load-vessel',
		design: stack('Capsule', parts, []),
		placement: {
			kind: 'state',
			body: 'stock.home',
			position: { x: 0, y: R + 8_000, z: 0 },
			velocity: { x: 0, y: -250, z: 0 },
			orientation: { x: 0, y: 0, z: Math.sin(a / 2), w: Math.cos(a / 2) }
		}
	} as never);
	if (!placed.ok) throw new Error(placed.reason);
	const angles: number[] = [];
	for (let i = 0; i < seconds / 0.02; i++) {
		sim.step(0.02);
		const v = sim.snapshot().vessels.find((x) => x.id === placed.vessel);
		if (!v) break;
		if (i % 25 === 0) angles.push(baseAngle(v));
	}
	sim.dispose();
	return angles;
}

describe('the pod in the airflow', () => {
	test('a bare pod released 45 degrees off the airflow turns base first within 3 s, with no SAS, and stays', async () => {
		const angles = await fall(['stock.command-pod'], 45, 20);
		expect(angles[0]).toBeGreaterThan(40);
		// 25 samples a second apart by 0.5 s: sample 6 is 3 s in
		expect(Math.max(...angles.slice(6))).toBeLessThan(5);
	}, 60_000);

	test('a pod over a heat shield does the same, with the shield as its blunt end', async () => {
		const angles = await fall(['stock.command-pod', 'stock.heat-shield'], 45, 20);
		expect(Math.max(...angles.slice(6))).toBeLessThan(5);
	}, 60_000);
});

describe('the pod on the ground', () => {
	test('its mass sits low: the body the sim hands the backend has its centre of mass under the pod origin', async () => {
		const real = await createRapierBackend({ solverIterations: 16 });
		let desc: BodyDesc | undefined;
		const spy: PhysicsBackend = {
			...real,
			createBody(d) {
				desc = d;
				return real.createBody(d);
			}
		};
		const sim = await createSim({
			plugins: [Stock],
			backendFactory: () => spy,
			maxFlightFrames: 1
		});
		const placed = sim.dispatch({
			type: 'load-vessel',
			design: stack('Pod', ['stock.command-pod'], []),
			placement: {
				kind: 'state',
				body: 'stock.home',
				position: { x: 0, y: R + 5_000, z: 0 },
				velocity: { x: 0, y: 0, z: 0 }
			}
		} as never);
		if (!placed.ok) throw new Error(placed.reason);
		const [, low] = PartCommandPod.centerOfMass!;
		expect(low).toBeLessThan(0);
		expect(desc!.centerOfMass!.y).toBeCloseTo(low, 9);
		expect(PartHeatShield.centerOfMass![1]).toBeLessThan(0);
		sim.dispose();
	});

	test('a pod thrown past the horizontal on flat ground never ends on its top', async () => {
		for (const tilt of [150, 165, 195, 210]) {
			const sim = await createSim({ plugins: [Stock], backendFactory: rapier(16), seed: 1 });
			const up = latLonDirection(0, 0.5);
			const h = (tilt * Math.PI) / 180;
			// the orientation of a vessel standing on the ground there, then turned about its own X axis
			const stand = sim.dispatch({
				type: 'load-vessel',
				design: stack('Pod', ['stock.command-pod'], []),
				placement: { kind: 'surface', body: 'stock.cinder', latitude: 0, longitude: 0.5 }
			} as never);
			if (!stand.ok) throw new Error(stand.reason);
			sim.step(0.02);
			const o = sim.snapshot().vessels.find((x) => x.id === stand.vessel)!.orientation;
			sim.dispatch({ type: 'remove-vessel', vessel: stand.vessel } as never);
			const t = { x: Math.sin(h / 2), y: 0, z: 0, w: Math.cos(h / 2) };
			const orientation = {
				w: o.w * t.w - o.x * t.x - o.y * t.y - o.z * t.z,
				x: o.w * t.x + o.x * t.w + o.y * t.z - o.z * t.y,
				y: o.w * t.y - o.x * t.z + o.y * t.w + o.z * t.x,
				z: o.w * t.z + o.x * t.y - o.y * t.x + o.z * t.w
			};
			const r = 190_000 + 3;
			const placed = sim.dispatch({
				type: 'load-vessel',
				design: stack('Pod', ['stock.command-pod'], []),
				placement: {
					kind: 'state',
					body: 'stock.cinder',
					position: { x: up.x * r, y: up.y * r, z: up.z * r },
					velocity: { x: 0, y: 0, z: 0 },
					orientation
				}
			} as never);
			if (!placed.ok) throw new Error(placed.reason);
			for (let i = 0; i < 90 / 0.02; i++) sim.step(0.02);
			const v = sim.snapshot().vessels.find((x) => x.id === placed.vessel)!;
			const q = v.orientation;
			const ny = {
				x: 2 * (q.x * q.y - q.w * q.z),
				y: 1 - 2 * (q.x * q.x + q.z * q.z),
				z: 2 * (q.y * q.z + q.w * q.x)
			};
			const n = length(v.position);
			const axisFromUp =
				(Math.acos(
					Math.max(
						-1,
						Math.min(1, (ny.x * v.position.x + ny.y * v.position.y + ny.z * v.position.z) / n)
					)
				) *
					180) /
				Math.PI;
			// 0 is upright on its base, 90 on its side, 180 on its top
			expect(axisFromUp, `thrown at ${tilt}°`).toBeLessThan(135);
			sim.dispose();
		}
	}, 300_000);
});
