import { describe, expect, it } from 'bun:test';
import { InstancedMesh, Mesh, Raycaster, Vector3, type Object3D } from 'three';
import { PartModelFactory } from '../src/parts/factory.ts';
import { PRESETS, detailOf } from '../src/presets.ts';
import { HighlightMaterials } from '../src/vab/highlight.ts';
import { PartLayer, measureDrawCost } from '../src/vab/part-layer.ts';
import {
	repeatedDefinitions,
	sameMarkers,
	type VabPart,
	type VabScene
} from '../src/vab/scene-model.ts';
import { stockMaps } from './stock-fixture.ts';

const maps = stockMaps();
const factory = (quality: 'high' | 'low' = 'high') =>
	new PartModelFactory({
		shapes: maps.shapes,
		visuals: maps.visuals,
		attach: maps.attach,
		detail: detailOf(PRESETS[quality])
	});

/** The 23-part booster rocket of journal 026: two-stage example plus 4 decouplers, boosters, cones and fins. */
export function boosterRocket(): VabScene {
	const core = [
		'stock.command-pod',
		'stock.reaction-wheel',
		'stock.tank-small',
		'stock.engine-lv',
		'stock.decoupler',
		'stock.tank-small',
		'stock.engine-lv'
	];
	const parts: VabPart[] = core.map((definition, i) => ({
		key: `${i}`,
		definition,
		position: [0, -i * 1.2, 0],
		group: 'main',
		role: 'solid'
	}));
	for (let k = 0; k < 4; k++) {
		const a = (k / 4) * Math.PI * 2;
		const at = (r: number, y: number): [number, number, number] => [
			Math.cos(a) * r,
			y,
			Math.sin(a) * r
		];
		const next = parts.length;
		for (const [j, definition, r, y] of [
			[0, 'stock.radial-decoupler', 0.7, -3],
			[1, 'stock.booster', 1.2, -4],
			[2, 'stock.nose-cone', 1.2, -1.5],
			[3, 'stock.fin', 1.0, -6]
		] as const) {
			parts.push({
				key: `${next + j}`,
				definition,
				position: at(r, y),
				yaw: -a,
				group: 'main',
				role: 'solid'
			});
		}
	}
	return { parts, groups: [{ id: 'main', x: 0, z: 0 }], nodes: [] };
}

function layerFor(scene: VabScene, quality: 'high' | 'low' = 'high') {
	const f = factory(quality);
	const layer = new PartLayer(f, new HighlightMaterials());
	layer.sync(scene);
	layer.applyHighlights(null, new Set(), new Set());
	return { layer, f };
}

describe('VAB instancing budget', () => {
	it('draws the 23-part booster rocket in at most 120 calls and 60 000 triangles (colour + shadow pass)', () => {
		expect(boosterRocket().parts.length).toBe(23);
		for (const quality of ['high', 'low'] as const) {
			const { layer } = layerFor(boosterRocket(), quality);
			const c = measureDrawCost(layer.root);
			const calls = c.drawCalls + c.shadowDrawCalls;
			const tris = c.triangles + c.shadowTriangles;
			console.log(
				`${quality}: ${calls} draw calls, ${tris} triangles, ${layer.instancedCount} instanced`
			);
			expect(calls).toBeLessThanOrEqual(120);
			expect(tris).toBeLessThanOrEqual(60_000);
			expect(layer.instancedCount).toBe(20);
		}
	});

	it('is far below the cost of 23 separate full-detail models', () => {
		const f = factory();
		const root = new (layerFor(boosterRocket()).layer.root.constructor as typeof Object3D)();
		for (const p of boosterRocket().parts) root.add(f.create(p.definition).root);
		const c = measureDrawCost(root);
		console.log(
			`separate: ${c.drawCalls + c.shadowDrawCalls} calls, ${c.triangles + c.shadowTriangles} triangles`
		);
		expect(c.drawCalls + c.shadowDrawCalls).toBeGreaterThan(120);
	});

	it('shares one geometry and material between symmetric copies', () => {
		const { layer } = layerFor(boosterRocket());
		const boosters = [...layer.parts.values()].filter((e) => e.slot.definition === 'stock.booster');
		expect(boosters.length).toBe(4);
		const first = boosters[0]!.model.staticMesh!;
		for (const b of boosters) {
			expect(b.model.staticMesh!.geometry).toBe(first.geometry);
			expect(b.model.staticMesh!.material).toEqual(first.material);
			expect(b.model.staticMesh!.visible).toBe(false);
		}
		const instances: InstancedMesh[] = [];
		layer.root.traverse((o) => {
			if (o instanceof InstancedMesh && o.name === 'instances:stock.booster') instances.push(o);
		});
		expect(instances.length).toBe(1);
		expect(instances[0]!.geometry).toBe(first.geometry);
		expect(instances[0]!.material).toBe(first.material);
		expect(instances[0]!.count).toBe(4);
	});

	it('uses reduced detail for three or more copies only', () => {
		const rep = repeatedDefinitions(boosterRocket().parts);
		expect(rep.has('solid|stock.booster')).toBe(true);
		expect(rep.has('solid|stock.tank-small')).toBe(false);
		const { layer } = layerFor(boosterRocket());
		const booster = [...layer.parts.values()].find((e) => e.slot.definition === 'stock.booster')!;
		const tank = [...layer.parts.values()].find((e) => e.slot.definition === 'stock.tank-small')!;
		const full = factory().create('stock.booster');
		expect(booster.lod).toBe('repeated');
		expect(booster.model.triangles).toBeLessThan(full.triangles);
		expect(tank.lod).toBe('full');
	});

	it('still picks an instanced part with a ray and moves the instance with its part', () => {
		const { layer } = layerFor(boosterRocket());
		layer.root.updateMatrixWorld(true);
		const target = layer.parts.get('8')!; // a booster
		expect(target.slot.definition).toBe('stock.booster');
		const p = target.model.root.position;
		const ray = new Raycaster(new Vector3(p.x, p.y, p.z + 8), new Vector3(0, 0, -1));
		// Aim from the outside at the part's own axis; the first hit belongs to a part with a key.
		ray.ray.origin.set(
			p.x + 6 * Math.cos(Math.atan2(p.z, p.x)),
			p.y,
			p.z + 6 * Math.sin(Math.atan2(p.z, p.x))
		);
		ray.ray.direction.set(-Math.cos(Math.atan2(p.z, p.x)), 0, -Math.sin(Math.atan2(p.z, p.x)));
		const hits = ray.intersectObjects(
			[...layer.parts.values()].map((e) => e.model.root),
			true
		);
		let o: Object3D | null = hits[0]?.object ?? null;
		while (o && o.userData.key === undefined) o = o.parent;
		expect(o?.userData.key).toBe('8');
	});

	it('gives a highlighted copy its own mesh and keeps the rest instanced', () => {
		const { layer } = layerFor(boosterRocket());
		layer.applyHighlights(null, new Set(['8']), new Set());
		const own = layer.parts.get('8')!.model.staticMesh!;
		expect(own.visible).toBe(true);
		const inst: InstancedMesh[] = [];
		layer.root.traverse((o) => {
			if (o instanceof InstancedMesh && o.name === 'instances:stock.booster') inst.push(o);
		});
		expect(inst[0]!.count).toBe(3);
		layer.applyHighlights(null, new Set(), new Set());
		expect(own.visible).toBe(false);
	});

	it('draws ghosts as their own meshes with an x-ray pass, never instanced', () => {
		const scene = boosterRocket();
		for (let k = 0; k < 4; k++) {
			scene.parts.push({
				key: `g${k}`,
				definition: 'stock.fin',
				position: [k, 0, 0],
				group: 'main',
				role: 'ghost'
			});
		}
		const { layer } = layerFor(scene);
		const g = layer.parts.get('g0')!;
		expect([...g.overlays.keys()].sort()).toEqual(['ghost', 'xray']);
		let xray = 0;
		g.model.root.traverse((o) => {
			if (o instanceof Mesh && o.userData.overlay) {
				expect(o.raycast).not.toBe(Mesh.prototype.raycast);
				xray++;
			}
		});
		expect(xray).toBe(2);
		expect(g.model.staticMesh!.visible).toBe(true);
	});

	it('compares marker lists', () => {
		const m = {
			key: 'com',
			kind: 'com' as const,
			group: 'main',
			position: [0, 1, 0] as [number, number, number]
		};
		expect(sameMarkers(undefined, [])).toBe(true);
		expect(sameMarkers([m], [{ ...m }])).toBe(true);
		expect(sameMarkers([m], [{ ...m, position: [0, 2, 0] }])).toBe(false);
		expect(sameMarkers([m], [])).toBe(false);
	});
});
