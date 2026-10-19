import { describe, expect, test } from 'bun:test';
import type { BodyId, EntityId, PartId, Snapshot } from '@orbital/core';
import { InstancedMesh, Mesh, type WebGLRenderer } from 'three';
import { atmosphereFor } from '../src/atmosphere-model.ts';
import { PlanetPass } from '../src/planet.ts';
import { PRESETS } from '../src/presets.ts';
import { SceneModel } from '../src/scene.ts';
import { LaunchSite } from '../src/site-meshes.ts';
import { stockMaps } from './stock-fixture.ts';

const R = 600_000;
const SITE = { latitude: 0.009, longitude: 0.02 };

const instanced = (site: LaunchSite): InstancedMesh[] =>
	site.root.children.filter((c): c is InstancedMesh => c instanceof InstancedMesh);

const signature = (site: LaunchSite): string[] =>
	instanced(site).map(
		(m) => `${m.count}:${Array.from(m.instanceMatrix.array.slice(0, 16)).join(',')}:${m.castShadow}`
	);

/** Plan 048, ADR 0055: a preset switch swaps kept vegetation sets instead of rebuilding. */
describe('vegetation per preset', () => {
	const low = PRESETS.low;
	const medium = PRESETS.medium;

	test('a warmed set is the same site as one built directly', () => {
		const direct = new LaunchSite(R, SITE, medium.trees, medium.tufts);
		const switched = new LaunchSite(R, SITE, low.trees, low.tufts);
		let steps = 0;
		while (switched.warmVegetation([{ trees: medium.trees, tufts: medium.tufts }])) steps++;
		// several idle periods, not one long task
		expect(steps).toBeGreaterThan(5);
		switched.setTrees(medium.trees, medium.tufts);
		expect(signature(switched)).toEqual(signature(direct));
		direct.dispose();
		switched.dispose();
	});

	test('a switch back and forth builds nothing: the same meshes come back', () => {
		const site = new LaunchSite(R, SITE, low.trees, low.tufts);
		const first = instanced(site);
		site.setTrees(medium.trees, medium.tufts);
		const second = instanced(site);
		expect(second.some((m) => first.includes(m))).toBe(false);
		site.setTrees(low.trees, low.tufts);
		expect(instanced(site)).toEqual(first);
		site.setTrees(medium.trees, medium.tufts);
		expect(instanced(site)).toEqual(second);
		// nothing of the other set is left in the scene
		expect(site.root.children.filter((c) => first.includes(c as InstancedMesh))).toHaveLength(0);
		site.dispose();
	});

	test('a switch before the warm-up finished still shows a complete site', () => {
		const direct = new LaunchSite(R, SITE, medium.trees, medium.tufts);
		const site = new LaunchSite(R, SITE, low.trees, low.tufts);
		site.warmVegetation([{ trees: medium.trees, tufts: medium.tufts }]);
		site.warmVegetation([{ trees: medium.trees, tufts: medium.tufts }]);
		site.setTrees(medium.trees, medium.tufts);
		expect(signature(site)).toEqual(signature(direct));
		direct.dispose();
		site.dispose();
	});

	test('the detail cut-off reaches the kept sets too', () => {
		const site = new LaunchSite(R, SITE, low.trees, low.tufts);
		site.setTrees(medium.trees, medium.tufts);
		site.setDetail(5_000);
		const tufts = instanced(site).filter((m) => m.geometry.getAttribute('color').count < 100);
		expect(tufts.length).toBeGreaterThan(0);
		expect(tufts.every((m) => !m.visible)).toBe(true);
		site.setDetail(10);
		expect(tufts.every((m) => m.visible)).toBe(true);
		site.dispose();
	});
});

/** The part of a WebGLRenderer that `PlanetPass.bakeTerrain` touches. */
const fakeGl = (): { gl: WebGLRenderer; renders: () => number; cloudMapRenders: () => number } => {
	let renders = 0;
	let cloudMap = 0;
	let current: unknown = null;
	const gl = {
		autoClear: true,
		extensions: { get: () => ({}) },
		getRenderTarget: () => current,
		setRenderTarget(target: unknown) {
			current = target;
		},
		render(scene: { children: { material?: { name?: string } }[] }) {
			renders++;
			if (scene.children[0]?.material?.name === 'cloud-map-bake') cloudMap++;
		}
	};
	return {
		gl: gl as unknown as WebGLRenderer,
		renders: () => renders,
		cloudMapRenders: () => cloudMap
	};
};

describe('progressive terrain bake', () => {
	const make = (preset: keyof typeof PRESETS) =>
		new PlanetPass(atmosphereFor(R, 100_000), PRESETS[preset], SITE);
	const uTerrain = (p: PlanetPass): unknown => p.material.uniforms.uTerrain!.value;

	test('the first frame bakes all six faces and the cloud-coverage map (plan 054), a size change one face per frame', () => {
		const planet = make('high');
		const { gl, renders } = fakeGl();
		planet.bakeTerrain(gl);
		expect(renders()).toBe(6 + 1);
		const baked = uTerrain(planet);
		planet.setQuality(PRESETS.low);
		// the baked map keeps drawing until the new one is complete
		for (let frame = 1; frame <= 5; frame++) {
			const before = renders();
			planet.bakeTerrain(gl);
			expect(renders() - before).toBe(1);
			expect(uTerrain(planet)).toBe(baked);
		}
		planet.bakeTerrain(gl);
		expect(uTerrain(planet)).not.toBe(baked);
		// done: nothing more to bake
		const before = renders();
		planet.bakeTerrain(gl);
		expect(renders()).toBe(before);
		planet.dispose();
	});

	test('the cloud-coverage map is baked once: preset switches and an unchanged cover do not bake it again, a new cover does (plan 054)', () => {
		const planet = make('high');
		const { gl, cloudMapRenders } = fakeGl();
		planet.bakeTerrain(gl);
		expect(cloudMapRenders()).toBe(1);
		for (const preset of ['medium', 'high', 'low', 'high'] as const) {
			planet.setQuality(PRESETS[preset]);
			for (let i = 0; i < 8; i++) planet.bakeTerrain(gl);
		}
		expect(cloudMapRenders()).toBe(1);
		planet.material.uniforms.uCloudCover!.value = 0.6;
		planet.bakeTerrain(gl);
		expect(cloudMapRenders()).toBe(2);
		planet.bakeTerrain(gl);
		expect(cloudMapRenders()).toBe(2);
		// a preset without shafts keeps the map it has and does not follow a cover change
		planet.setQuality(PRESETS.low);
		planet.material.uniforms.uCloudCover!.value = 0.3;
		planet.bakeTerrain(gl);
		expect(cloudMapRenders()).toBe(2);
		planet.dispose();
	});

	test('a second change mid-bake starts over for the newest size', () => {
		const planet = make('high');
		const { gl, renders } = fakeGl();
		planet.bakeTerrain(gl);
		planet.setQuality(PRESETS.low);
		planet.bakeTerrain(gl);
		planet.bakeTerrain(gl);
		// back to the size that is already baked: no more work
		planet.setQuality(PRESETS.high);
		const before = renders();
		planet.bakeTerrain(gl);
		expect(renders()).toBe(before);
		planet.dispose();
	});

	test('a change of the colour map width does not re-bake the terrain', () => {
		const planet = make('medium');
		const { gl, renders } = fakeGl();
		planet.bakeTerrain(gl);
		planet.setQuality({ ...PRESETS.medium, mapWidth: 512 });
		const before = renders();
		planet.bakeTerrain(gl);
		expect(renders()).toBe(before);
		planet.dispose();
	});

	test('a moved site bakes everything at once', () => {
		const planet = make('high');
		const { gl, renders } = fakeGl();
		planet.bakeTerrain(gl);
		planet.setSite(0.2, 0.3);
		const before = renders();
		planet.bakeTerrain(gl);
		expect(renders() - before).toBe(6);
		planet.dispose();
	});
});

describe('part materials of the other presets', () => {
	const BODY = 'stock.home' as BodyId;
	const q0 = { x: 0, y: 0, z: 0, w: 1 };
	const maps = stockMaps();
	const part = (n: number, definition: string, y: number) => ({
		id: n as EntityId,
		definition: definition as PartId,
		position: { x: 0, y, z: 0 },
		orientation: q0,
		modules: {}
	});

	test('warmPartScene builds one model per distinct definition, apart from the ones in flight', () => {
		const model = new SceneModel({
			bodies: [
				{
					id: BODY,
					radius: R,
					atmosphere: { scaleHeight: 5600, surfacePressure: 101_325, height: 70_000 }
				}
			],
			partShapes: maps.shapes,
			partVisuals: maps.visuals,
			partAttach: maps.attach,
			preset: 'high',
			launchSite: { latitude: 0, longitude: 0 }
		});
		const snapshot: Snapshot = {
			t: 0,
			bodies: [{ id: BODY, position: { x: 0, y: 0, z: 0 }, rotation: q0 }],
			vessels: [
				{
					id: 1 as EntityId,
					mode: 'flight',
					soi: BODY,
					position: { x: R + 2, y: 0, z: 0 },
					velocity: { x: 0, y: 0, z: 0 },
					orientation: q0,
					parts: [
						part(1, 'stock.tank-small', 0),
						part(2, 'stock.tank-small', 1.6),
						part(3, 'stock.decoupler', 3)
					]
				}
			]
		};
		model.sync(snapshot);
		const warm = model.warmPartScene('low');
		expect(warm.children.map((c) => c.name)).toEqual([
			'part:stock.tank-small',
			'part:stock.decoupler'
		]);
		const real = new Set<unknown>();
		model.scene.traverse((o) => o instanceof Mesh && real.add(o.material));
		warm.traverse((o) => {
			if (o instanceof Mesh) expect(real.has(o.material)).toBe(false);
		});
		model.dispose();
	});

	test('the shadow map is allocated once: High → Medium → Low → High keeps the depth texture and never resizes (plan 201)', () => {
		const model = shadowModel('high');
		const shadow = model.environment.sunLight.shadow;
		expect(shadow.mapSize.x).toBe(PRESETS.high.shadowMapSize);
		// what the first render allocates (no WebGL here): a map whose resizes and frees are counted
		const depthTexture = {};
		let resized = 0;
		let freed = 0;
		shadow.map = {
			depthTexture,
			setSize: () => (resized += 1),
			dispose: () => (freed += 1)
		} as never;
		const map = shadow.map;
		for (const preset of ['medium', 'low', 'high', 'medium', 'high'] as const) {
			model.setPreset(preset);
			expect(model.environment.sunLight.castShadow).toBe(PRESETS[preset].shadowMapSize > 0);
			for (let i = 0; i < 5; i++) model.prepareFrame(1 / 60);
		}
		expect(shadow.map).toBe(map);
		expect((shadow.map as unknown as { depthTexture: object }).depthTexture).toBe(depthTexture);
		expect(shadow.mapSize.x).toBe(PRESETS.high.shadowMapSize);
		expect(resized).toBe(0);
		expect(freed).toBe(0);
		model.dispose();
	});

	test('a raised preset grows the map a few frames later (the player chose more)', () => {
		const model = shadowModel('medium');
		const shadow = model.environment.sunLight.shadow;
		expect(shadow.mapSize.x).toBe(PRESETS.medium.shadowMapSize);
		model.setPreset('high');
		model.prepareFrame(1 / 60);
		model.prepareFrame(1 / 60);
		expect(shadow.mapSize.x).toBe(PRESETS.medium.shadowMapSize);
		model.prepareFrame(1 / 60);
		expect(shadow.mapSize.x).toBe(PRESETS.high.shadowMapSize);
		// and back down keeps the larger map
		model.setPreset('medium');
		for (let i = 0; i < 5; i++) model.prepareFrame(1 / 60);
		expect(shadow.mapSize.x).toBe(PRESETS.high.shadowMapSize);
		model.dispose();
	});
});

/** A scene on one atmospheric body at the pad, synced once, at `preset`. */
function shadowModel(preset: 'high' | 'medium'): SceneModel {
	const BODY = 'stock.home' as BodyId;
	const q0 = { x: 0, y: 0, z: 0, w: 1 };
	const maps = stockMaps();
	const model = new SceneModel({
		bodies: [
			{
				id: BODY,
				radius: R,
				atmosphere: { scaleHeight: 5600, surfacePressure: 101_325, height: 70_000 }
			}
		],
		partShapes: maps.shapes,
		partVisuals: maps.visuals,
		partAttach: maps.attach,
		preset,
		launchSite: { latitude: 0, longitude: 0 }
	});
	model.sync({
		t: 0,
		bodies: [{ id: BODY, position: { x: 0, y: 0, z: 0 }, rotation: q0 }],
		vessels: []
	});
	return model;
}
