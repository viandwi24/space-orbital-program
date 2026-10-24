/**
 * Plan 414 (ADR 0373): the site adds no light to the scene, and the lamp pool is a fixed set. Every
 * light is in every lit material's light loop and its count is part of the shader's key, so the count
 * must not change with the hour or a lamp toggling, and it is small: a point light cost the pad about
 * 0.4 ms a frame.
 */
import { describe, expect, test } from 'bun:test';
import { Light, Mesh, MeshBasicMaterial, Scene } from 'three';
import { LampPool, LAMP_BUDGET } from '../src/lamps.ts';
import { floodLightPositions } from '../src/site.ts';
import { LaunchSite } from '../src/site-meshes.ts';

const lightsIn = (o: Scene | LaunchSite['root']): Light[] => {
	const out: Light[] = [];
	o.traverse((x) => {
		if ((x as Light).isLight) out.push(x as Light);
	});
	return out;
};

describe('the site floodlights', () => {
	test('are not lights: the site holds none, at any hour', () => {
		const site = new LaunchSite(600_000, { latitude: 0, longitude: 0 }, 0, 0);
		for (const level of [0, 0.3, 1, 0]) {
			site.setLamps(level);
			expect(lightsIn(site.root)).toHaveLength(0);
		}
		site.dispose();
	});
	test('are a cone and a pool of glow per mast bank, drawn all day at an opacity that follows the hour', () => {
		const site = new LaunchSite(600_000, { latitude: 0, longitude: 0 }, 0, 0);
		const glow = () => {
			const out: Mesh[] = [];
			site.root.traverse((x) => {
				if (x.name === 'site-flood-glow') out.push(x as Mesh);
			});
			return out;
		};
		expect(glow()).toHaveLength(floodLightPositions().length * 2); // a cone and a pool of light each
		const opacity = () => (glow()[0]!.material as MeshBasicMaterial).opacity;
		site.setLamps(0);
		expect(opacity()).toBe(0);
		expect(glow().every((m) => m.visible)).toBe(true); // drawn at 0: its pipeline exists from the load
		site.setLamps(1);
		expect(opacity()).toBeGreaterThan(0.5);
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
	test('a pool of a few lamps and no light from the site', () => {
		expect(LAMP_BUDGET).toBeLessThanOrEqual(2);
	});
});
