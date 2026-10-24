/**
 * Plan 414 (ADR 0373): the scene's lights are a fixed pool. Every light is in every lit material's
 * light loop and its count is part of the shader's key, so the count must not change with the hour or
 * a lamp toggling, and it is small: each light cost the pad about 0.4 ms a frame.
 */
import { describe, expect, test } from 'bun:test';
import { Light, Scene } from 'three';
import { LampPool, LAMP_BUDGET } from '../src/lamps.ts';
import { FLOOD_POOL } from '../src/site.ts';
import { LaunchSite } from '../src/site-meshes.ts';

const lightsIn = (o: Scene | LaunchSite['root']): Light[] => {
	const out: Light[] = [];
	o.traverse((x) => {
		if ((x as Light).isLight) out.push(x as Light);
	});
	return out;
};

describe('the site floodlights', () => {
	test('are a pool of FLOOD_POOL lights, always visible, whatever the hour', () => {
		const site = new LaunchSite(600_000, { latitude: 0, longitude: 0 }, 0, 0);
		const floods = () => lightsIn(site.root).filter((l) => l.name === 'site-flood');
		expect(floods()).toHaveLength(FLOOD_POOL);
		for (const level of [0, 0.3, 1, 0]) {
			site.setLamps(level);
			expect(floods()).toHaveLength(FLOOD_POOL);
			expect(floods().every((l) => l.visible)).toBe(true);
		}
		expect(floods()[0]!.intensity).toBe(0); // day again
		site.setLamps(1);
		expect(floods()[0]!.intensity).toBeGreaterThan(0);
		site.dispose();
	});
	test('the pooled light stands at the bank nearest the camera', () => {
		const site = new LaunchSite(600_000, { latitude: 0, longitude: 0 }, 0, 0);
		site.root.updateMatrixWorld(true);
		const light = lightsIn(site.root).find((l) => l.name === 'site-flood')!;
		site.aimFloods({ x: 200, y: 0, z: 200 });
		const a = light.position.clone();
		site.aimFloods({ x: -200, y: 0, z: -200 });
		expect(light.position.distanceTo(a)).toBeGreaterThan(10);
		site.dispose();
	});
});

describe('the lamp pool', () => {
	test('keeps its lights in the scene at any count of lit lamps', () => {
		const scene = new Scene();
		const pool = new LampPool(scene);
		expect(
			lightsIn(scene).filter((l) => (l as { isSpotLight?: boolean }).isSpotLight)
		).toHaveLength(LAMP_BUDGET);
		pool.dispose();
	});
});

describe('the light budget', () => {
	test('the pools add up to a handful', () => {
		expect(FLOOD_POOL + LAMP_BUDGET).toBeLessThanOrEqual(4);
	});
});
