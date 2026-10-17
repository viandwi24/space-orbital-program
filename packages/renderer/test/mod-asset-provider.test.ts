/** Plan 051 / ADR 0076: model parts shipped by a mod, through the same path the browser uses. */
import { describe, expect, test } from 'bun:test';
import type { PartVisual } from '@orbital/core';
import { Mesh, MeshStandardMaterial, Object3D } from 'three';
import { assetFit } from '../src/parts/asset-fit.ts';
import { PartModelFactory } from '../src/parts/factory.ts';
import { GltfPartProvider } from '../src/parts/gltf-provider.ts';
import type { PartNode, PartShape } from '../src/parts/types.ts';
import { PRESETS, detailOf } from '../src/presets.ts';
import { buildGlb, encodePng, lathe } from '../../../tools/mod-build/glb.ts';

const detail = detailOf(PRESETS.high);

/** 1 m tall, 0.5 m radius body plus a bell that turns, authored in the part frame like a mod would. */
function engineGlb(scale = 1): Uint8Array {
	return buildGlb({
		meshes: [
			lathe(
				[
					[0.45 * scale, -0.2 * scale],
					[0.5 * scale, 0],
					[0.45 * scale, 0.5 * scale]
				],
				12,
				0,
				'body'
			),
			lathe(
				[
					[0.1 * scale, -0.2 * scale],
					[0.4 * scale, -0.5 * scale]
				],
				12,
				0,
				'bell'
			)
		],
		materials: [{ color: [0.8, 0.8, 0.85, 1], metallic: 0.6, roughness: 0.4 }],
		nodes: [
			{ name: 'body', mesh: 0 },
			{ name: 'moving', mesh: 1, translation: [0, -0.2 * scale, 0] }
		],
		roots: [0, 1]
	});
}

const shape: PartShape = { kind: 'cylinder', radius: 0.5, height: 1 };
const attach: Record<string, PartNode> = {
	top: { pos: [0, 0.5, 0], dir: [0, 1, 0] },
	bottom: { pos: [0, -0.5, 0], dir: [0, -1, 0] }
};
const visual: PartVisual = {
	kind: 'tank',
	asset: 'models/engine.glb',
	plume: { module: 'm.engine', nozzle: [0, -0.5, 0], exitRadius: 0.3, length: 3 },
	articulation: { module: 'm.engine', field: 'gimbal', mode: 'gimbal' }
};

async function provider(bytes: Uint8Array, warnings: string[] = []): Promise<GltfPartProvider> {
	const p = new GltfPartProvider({
		assets: new Map([['m.engine', bytes]]),
		onWarning: (_d, message) => warnings.push(message)
	});
	await p.preload(['m.engine']);
	return p;
}

const request = { definition: 'm.engine', shape, attach, visual, detail };

describe('a model from a mod package', () => {
	test('a real glb parses from bytes; bounds and triangles are read, a bell that hangs below the stack node is reported', async () => {
		const warnings: string[] = [];
		const p = await provider(engineGlb(), warnings);
		expect(p.failures.size).toBe(0);
		const model = p.create(request)!;
		expect(model.triangles).toBe(2 * 12 * 2 + 12 * 2);
		expect(model.bounds.max.y).toBeCloseTo(0.5, 5);
		expect(model.bounds.min.y).toBeCloseTo(-0.7, 5);
		// The bell hangs below the stack node by 0.2 m: reported, not hidden.
		expect(warnings.join('\n')).toContain('sticks out');
		model.dispose();
		p.dispose();
	});

	test('the same asset is shared, not parsed per instance', async () => {
		const p = await provider(engineGlb());
		const a = p.create(request)!;
		const b = p.create(request)!;
		expect(a.root).not.toBe(b.root);
		const geo = (m: typeof a) => {
			const out: unknown[] = [];
			m.root.traverse((o) => {
				if (o instanceof Mesh && !(o.parent?.name === 'plume')) out.push(o.geometry);
			});
			return out;
		};
		expect(geo(a).slice(0, 1)).toEqual(geo(b).slice(0, 1));
		p.dispose();
	});

	test('a plume hangs on the gimbal pivot and the pivot turns with the snapshot', async () => {
		const p = await provider(engineGlb());
		const model = p.create(request)!;
		const moving = model.root.getObjectByName('moving') as Object3D;
		expect(moving.getObjectByName('plume')).toBeDefined();
		model.setState({
			modules: { 'm.engine': { ignited: true, throttle: 1, flameout: false, gimbal: [0.1, 0] } }
		});
		expect(moving.quaternion.z).toBeLessThan(-0.04);
		expect((moving.getObjectByName('plume') as Object3D).visible).toBe(true);
		model.setState({ modules: {} });
		expect(moving.quaternion.z).toBeCloseTo(0, 6);
		model.dispose();
		p.dispose();
	});

	test('a hot part glows and cools back without touching the shared materials', async () => {
		const p = await provider(engineGlb());
		const model = p.create(request)!;
		const mesh = () => {
			let found: Mesh | undefined;
			model.root.traverse((o) => {
				if (!found && o instanceof Mesh && o.material instanceof MeshStandardMaterial) found = o;
			});
			return found as Mesh & { material: MeshStandardMaterial };
		};
		const shared = mesh().material;
		model.setState({ modules: {}, temperature: 1400 });
		expect(mesh().material).not.toBe(shared);
		expect(mesh().material.emissive.r).toBeGreaterThan(0);
		model.setState({ modules: {}, temperature: 300 });
		expect(mesh().material.emissive.r).toBe(0);
		expect(shared.emissive.r).toBe(0);
		model.dispose();
		p.dispose();
	});

	test('warnings: a model twice the size, a missing moving node, deploy', async () => {
		const warnings: string[] = [];
		const p = await provider(engineGlb(2), warnings);
		p.create({ ...request, visual: { ...visual, deploy: { module: 'm.engine', flag: 'x' } } });
		const text = warnings.join('\n');
		expect(text).toContain('sticks out');
		expect(text).toContain('attach node "top"');
		expect(text).toContain('"deploy"');
		p.dispose();
		const plain = buildGlb({
			meshes: [
				lathe(
					[
						[0.5, -0.5],
						[0.5, 0.5]
					],
					8,
					0
				)
			],
			materials: [{ color: [1, 1, 1, 1] }],
			nodes: [{ name: 'body', mesh: 0 }],
			roots: [0]
		});
		const w2: string[] = [];
		const p2 = await provider(plain, w2);
		p2.create(request);
		expect(w2.join('\n')).toContain('node named "moving"');
		expect(w2.filter((w) => w.includes('attach') || w.includes('sticks'))).toEqual([]);
		p2.dispose();
	});
});

describe('textures', () => {
	test('an embedded PNG goes through the loader (browser path stubbed: Bun has no createImageBitmap)', async () => {
		const g = globalThis as { createImageBitmap?: unknown };
		const before = g.createImageBitmap;
		g.createImageBitmap = async (blob: Blob) => ({
			width: 2,
			height: 2,
			close() {},
			size: blob.size
		});
		try {
			const glb = buildGlb({
				meshes: [
					lathe(
						[
							[0.5, -0.5],
							[0.5, 0.5]
						],
						8,
						0
					)
				],
				materials: [{ color: [1, 1, 1, 1], texture: 0 }],
				nodes: [{ name: 'body', mesh: 0 }],
				roots: [0],
				images: [encodePng(2, 2, new Uint8Array(16).fill(128))]
			});
			const p = await provider(glb);
			expect(p.failures.size).toBe(0);
			const model = p.create(request)!;
			let map: unknown;
			model.root.traverse((o) => {
				if (o instanceof Mesh && o.material instanceof MeshStandardMaterial && o.material.map) {
					map = o.material.map;
				}
			});
			expect(map).toBeDefined();
			p.dispose();
		} finally {
			g.createImageBitmap = before;
		}
	});
});

describe('fallback', () => {
	test('a damaged asset is declined and the generator named by kind builds the part', async () => {
		const p = await provider(new Uint8Array(64));
		expect(p.failures.has('m.engine')).toBe(true);
		const factory = new PartModelFactory({
			shapes: new Map([['m.engine', shape]]),
			visuals: new Map([['m.engine', { kind: 'tank', asset: 'models/engine.glb' }]]),
			providers: [p],
			detail
		});
		expect(factory.create('m.engine').triangles).toBeGreaterThan(100);
		factory.dispose();
		p.dispose();
	});

	test('with the asset loaded the factory returns the model, for the VAB icon path too', async () => {
		const p = await provider(engineGlb());
		const factory = new PartModelFactory({
			shapes: new Map([['m.engine', shape]]),
			visuals: new Map([['m.engine', visual]]),
			attach: new Map([['m.engine', attach]]),
			providers: [p],
			detail
		});
		await factory.preload(['m.engine']);
		expect(factory.create('m.engine').triangles).toBe(72);
		factory.dispose();
		p.dispose();
	});
});

describe('assetFit', () => {
	const box = (min: [number, number, number], max: [number, number, number]) => ({ min, max });
	test('a model inside the shape with faces on the nodes has no warnings', () => {
		expect(assetFit(box([-0.5, -0.5, -0.5], [0.5, 0.5, 0.5]), shape, attach)).toEqual([]);
	});
	test('tolerance is 5 cm or a tenth of the length, whichever is larger', () => {
		expect(assetFit(box([-0.54, -0.5, -0.54], [0.54, 0.5, 0.54]), shape, attach)).toEqual([]);
		expect(assetFit(box([-0.7, -0.5, -0.5], [0.7, 0.5, 0.5]), shape, attach)).toHaveLength(1);
	});
	test('a model far smaller than its shape is flagged as a scale error', () => {
		const w = assetFit(box([-0.1, -0.1, -0.1], [0.1, 0.1, 0.1]), shape, undefined);
		expect(w[0]).toContain('check the scale');
	});
	test('a node off the model face is flagged with both positions', () => {
		const w = assetFit(box([-0.5, -0.5, -0.5], [0.5, 0.3, 0.5]), shape, attach);
		expect(w).toHaveLength(1);
		expect(w[0]).toContain('"top"');
		expect(w[0]).toContain('0.5');
		expect(w[0]).toContain('0.3');
	});
	test('an empty model is reported', () => {
		expect(assetFit(box([0, 0, 0], [0, 0, 0]), shape, attach)).toEqual(['the model has no volume']);
	});
});
