/** Plan 400: one light per cluster of engines, from their summed thrust. */
import { describe, expect, test } from 'bun:test';
import {
	LIGHT_MAX,
	LIGHT_PER_THRUST,
	clusterLights,
	type ClusterEngine
} from '../src/effects/plume-cluster.ts';

const engine = (x: number, y: number, z: number, thrust = 0.5, vessel = 1): ClusterEngine => ({
	vessel,
	position: { x, y, z },
	radius: 0.46,
	thrust,
	colour: [1, 0.5, 0.1]
});

describe('plume cluster lights (plan 400)', () => {
	test('a five-engine cluster makes one light at its centroid', () => {
		const ring = [0, 1, 2, 3].map((k) =>
			engine(Math.cos(k * (Math.PI / 2)) * 1.2, 0, Math.sin(k * (Math.PI / 2)) * 1.2)
		);
		const lights = clusterLights([...ring, engine(0, 0, 0)]);
		expect(lights).toHaveLength(1);
		expect(lights[0]!.engines).toBe(5);
		expect(lights[0]!.position.x).toBeCloseTo(0, 6);
		expect(lights[0]!.position.z).toBeCloseTo(0, 6);
	});

	test('two stages apart make two lights; another vessel makes its own', () => {
		expect(clusterLights([engine(0, 0, 0), engine(0, 25, 0)])).toHaveLength(2);
		expect(clusterLights([engine(0, 0, 0), engine(0, 0.5, 0, 0.5, 2)])).toHaveLength(2);
	});

	test('the intensity follows the summed thrust and is capped', () => {
		const one = clusterLights([engine(0, 0, 0, 0.5)])[0]!;
		const two = clusterLights([engine(0, 0, 0, 0.5), engine(1, 0, 0, 0.5)])[0]!;
		expect(one.intensity).toBeCloseTo(0.5 * LIGHT_PER_THRUST, 9);
		expect(two.intensity).toBeCloseTo(2 * one.intensity, 9);
		expect(clusterLights([engine(0, 0, 0, 1e6)])[0]!.intensity).toBe(LIGHT_MAX);
	});

	test('engines with no thrust make no light; the strongest comes first', () => {
		expect(clusterLights([engine(0, 0, 0, 0)])).toHaveLength(0);
		expect(clusterLights([])).toHaveLength(0);
		const lights = clusterLights([engine(0, 0, 0, 0.2), engine(0, 30, 0, 0.9)]);
		expect(lights[0]!.intensity).toBeGreaterThan(lights[1]!.intensity);
	});
});
