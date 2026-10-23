/**
 * Plan 264: a cylinder part collides as squares inscribed in its circle, not as the box around it,
 * so a rolling pod rides on its visible rim; and the ground the sim collides with is the height
 * function the renderer draws (both call `@orbital/core`'s terrain field).
 */
import { describe, expect, test } from 'bun:test';
import {
	createBodyTerrainField,
	createMoonTerrainField,
	latLonDirection,
	type PartDefinition
} from '@orbital/core';
import { length } from '@orbital/kepler';
import Stock from '@orbital/mod-stock';
import { createSim } from '../src/index.ts';
import { colliderBoxes, CYLINDER_SQUARES } from '../src/parts.ts';
import { rapier, stack } from './helpers/vessels.ts';

const cylinder = (radius: number, height: number) =>
	({ shape: { kind: 'cylinder', radius, height } }) as unknown as PartDefinition;

/** How far the union of the boxes reaches from the axis in direction `phi` (horizontal plane), m. */
function reach(boxes: ReturnType<typeof colliderBoxes>, phi: number): number {
	return Math.max(
		...boxes.map((b) => {
			const a = phi - b.yaw;
			return b.halfExtents.x / Math.max(Math.abs(Math.cos(a)), Math.abs(Math.sin(a)));
		})
	);
}

describe('collider boxes', () => {
	test('a box part is one box, a cylinder is squares inscribed in its circle', () => {
		const box = colliderBoxes({ shape: { kind: 'box', size: [1, 2, 3] } } as PartDefinition);
		expect(box).toEqual([{ halfExtents: { x: 0.5, y: 1, z: 1.5 }, yaw: 0 }]);
		const boxes = colliderBoxes(cylinder(0.625, 1.1));
		expect(boxes).toHaveLength(CYLINDER_SQUARES);
		for (const b of boxes) expect(b.halfExtents.y).toBeCloseTo(0.55, 12);
	});

	test('the union never reaches beyond the drawn rim and fills at least 85 % of it', () => {
		for (const r of [0.3, 0.625, 1.25, 2.5]) {
			const boxes = colliderBoxes(cylinder(r, 1));
			let lo = Infinity;
			let hi = 0;
			for (let k = 0; k < 720; k++) {
				const e = reach(boxes, (k / 720) * 2 * Math.PI);
				lo = Math.min(lo, e);
				hi = Math.max(hi, e);
			}
			expect(hi).toBeLessThanOrEqual(r * (1 + 1e-9));
			expect(lo).toBeGreaterThanOrEqual(0.85 * r);
		}
		// the box around the circle (before plan 264) reached r sqrt 2: 41 % beyond the rim
		expect(
			reach([{ halfExtents: { x: 0.625, y: 0.5, z: 0.625 }, yaw: 0 }], Math.PI / 4)
		).toBeCloseTo(0.625 * Math.SQRT2, 9);
	});
});

async function roll(terrain: boolean) {
	const sim = await createSim({
		plugins: [Stock],
		backendFactory: rapier(16),
		seed: 1,
		...(terrain ? { terrain: createBodyTerrainField } : {})
	});
	const radius = 190_000;
	const up = latLonDirection(0, 0.5);
	const east = { x: -up.z, y: 0, z: up.x };
	const el = Math.hypot(east.x, east.z);
	// the ground height at the spot, from a vessel put on it
	const probe = sim.dispatch({
		type: 'load-vessel',
		design: stack('Pod', ['stock.command-pod'], []),
		placement: { kind: 'surface', body: 'stock.cinder', latitude: 0, longitude: 0.5 }
	} as never);
	if (!probe.ok) throw new Error(probe.reason);
	sim.step(0.02);
	const ground = sim.snapshot().vessels.find((v) => v.id === probe.vessel)!.terrainHeight ?? 0;
	sim.dispatch({ type: 'terminate-vessel', vessel: probe.vessel } as never);
	const r = radius + ground + 3;
	const placed = sim.dispatch({
		type: 'load-vessel',
		design: stack('Pod', ['stock.command-pod'], []),
		placement: {
			kind: 'state',
			body: 'stock.cinder',
			position: { x: up.x * r, y: up.y * r, z: up.z * r },
			velocity: {
				x: (east.x / el) * 9 - up.x,
				y: -up.y,
				z: (east.z / el) * 9 - up.z
			}
		}
	} as never);
	if (!placed.ok) throw new Error(placed.reason);
	const heights: number[] = [];
	for (let i = 0; i < 40 / 0.02; i++) {
		sim.step(0.02);
		const v = sim.snapshot().vessels.find((x) => x.id === placed.vessel);
		if (!v || v.surface) break;
		heights.push(length(v.position) - radius - (v.terrainHeight ?? 0));
	}
	sim.dispose();
	return heights;
}

describe('a pod rolling on the Moon', () => {
	test('on flat ground it stays on its rim: no hop above 4 m once it has touched down', async () => {
		const h = await roll(false);
		const touched = h.findIndex((x) => x < 1.2);
		expect(touched).toBeGreaterThan(0);
		// before plan 264 the circumscribed box threw it up to 10 m up on the same run
		// (3 m was measured with the probe pod that gave the ground height still standing on the spot:
		// its `remove-vessel` was no command, and the pod rolled over the other one's ground; plan 391)
		expect(Math.max(...h.slice(touched))).toBeLessThan(4);
	}, 120_000);
});

describe('the ground the sim collides with is the ground the renderer draws', () => {
	test('a vessel put on Cinder and on Home reads the core field height at its spot', async () => {
		const spots = [
			['stock.cinder', 0, 0.5],
			['stock.cinder', 0.3, 2.1],
			['stock.home', 0.1, 0.5]
		] as const;
		for (const [body, lat, lon] of spots) {
			const sim = await createSim({
				plugins: [Stock],
				backendFactory: rapier(16),
				seed: 1,
				terrain: createBodyTerrainField
			});
			const placed = sim.dispatch({
				type: 'load-vessel',
				design: stack('Pod', ['stock.command-pod'], []),
				placement: { kind: 'surface', body, latitude: lat, longitude: lon }
			} as never);
			if (!placed.ok) throw new Error(placed.reason);
			sim.step(0.02);
			const v = sim.snapshot().vessels.find((x) => x.id === placed.vessel)!;
			const radius = body === 'stock.cinder' ? 190_000 : 600_000;
			const field =
				body === 'stock.cinder'
					? createMoonTerrainField({ radius })
					: createBodyTerrainField({ radius, terrain: { kind: 'hills' } } as never)!;
			expect(
				Math.abs((v.terrainHeight ?? NaN) - field.heightAt(latLonDirection(lat, lon)))
			).toBeLessThan(0.5);
			sim.dispose();
		}
	}, 60_000);
});
