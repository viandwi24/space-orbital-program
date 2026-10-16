/** Plan 033 / ADR 0047: the glTF asset provider with the procedural fallback. */
import { describe, expect, test } from 'bun:test';
import { PartModelFactory } from '../src/parts/factory.ts';
import { GltfPartProvider } from '../src/parts/gltf-provider.ts';
import { PRESETS, detailOf } from '../src/presets.ts';
import { stockMaps } from './stock-fixture.ts';

// three's FileLoader reports progress with a browser `ProgressEvent` even for data: URIs; Bun has none.
if (typeof globalThis.ProgressEvent === 'undefined') {
	(globalThis as { ProgressEvent?: unknown }).ProgressEvent = class extends Event {
		constructor(
			type: string,
			init: { lengthComputable?: boolean; loaded?: number; total?: number } = {}
		) {
			super(type);
			Object.assign(this, init);
		}
	};
}

/** A 2 x 1 x 1 box as an embedded glTF 2.0 document: 8 positions, 12 triangles, one material. */
function boxGltf(): string {
	const positions = new Float32Array([
		-1, -0.5, -0.5, 1, -0.5, -0.5, 1, 0.5, -0.5, -1, 0.5, -0.5, -1, -0.5, 0.5, 1, -0.5, 0.5, 1, 0.5,
		0.5, -1, 0.5, 0.5
	]);
	const indices = new Uint16Array([
		0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 3, 7, 6, 3, 6, 2, 1, 2, 6, 1, 6, 5, 0, 4,
		7, 0, 7, 3
	]);
	const bytes = new Uint8Array(positions.byteLength + indices.byteLength);
	bytes.set(new Uint8Array(positions.buffer), 0);
	bytes.set(new Uint8Array(indices.buffer), positions.byteLength);
	return JSON.stringify({
		asset: { version: '2.0' },
		scene: 0,
		scenes: [{ nodes: [0] }],
		nodes: [{ mesh: 0, name: 'box' }],
		meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }] }],
		materials: [{ pbrMetallicRoughness: { baseColorFactor: [0.8, 0.2, 0.2, 1] } }],
		accessors: [
			{
				bufferView: 0,
				componentType: 5126,
				count: 8,
				type: 'VEC3',
				min: [-1, -0.5, -0.5],
				max: [1, 0.5, 0.5]
			},
			{ bufferView: 1, componentType: 5123, count: 36, type: 'SCALAR' }
		],
		bufferViews: [
			{ buffer: 0, byteOffset: 0, byteLength: positions.byteLength, target: 34962 },
			{ buffer: 0, byteOffset: positions.byteLength, byteLength: indices.byteLength, target: 34963 }
		],
		buffers: [
			{
				byteLength: bytes.byteLength,
				uri: `data:application/octet-stream;base64,${Buffer.from(bytes).toString('base64')}`
			}
		]
	});
}

const maps = stockMaps();
const detail = detailOf(PRESETS.high);

describe('GltfPartProvider', () => {
	test('loads a glTF document, reports its bounds and triangles, and clones per instance', async () => {
		const provider = new GltfPartProvider({
			models: new Map([['stock.tank-small', 'box.gltf']]),
			read: async () => boxGltf()
		});
		await provider.preload(['stock.tank-small']);
		expect(provider.failures.size).toBe(0);
		const model = provider.create({
			definition: 'stock.tank-small',
			shape: maps.shapes.get('stock.tank-small'),
			detail
		})!;
		expect(model).not.toBeNull();
		expect(model.triangles).toBe(12);
		expect(model.bounds.min.x).toBeCloseTo(-1, 6);
		expect(model.bounds.max.x).toBeCloseTo(1, 6);
		expect(model.bounds.max.y).toBeCloseTo(0.5, 6);
		expect(Object.keys(model.nodes).sort()).toEqual(['bottom', 'top']);
		const second = provider.create({ definition: 'stock.tank-small', detail })!;
		expect(second.root).not.toBe(model.root);
		model.dispose();
		second.dispose();
		provider.dispose();
	});

	test('declines a definition it has no asset for, and one whose asset failed', async () => {
		const provider = new GltfPartProvider({
			models: new Map([['stock.engine-lv', 'missing.glb']]),
			read: async () => {
				throw new Error('HTTP 404');
			}
		});
		await provider.preload(['stock.engine-lv', 'stock.tank-small']);
		expect(provider.failures.get('stock.engine-lv')).toContain('404');
		expect(provider.create({ definition: 'stock.engine-lv', detail })).toBeNull();
		expect(provider.create({ definition: 'stock.tank-small', detail })).toBeNull();
		provider.dispose();
	});

	test('a malformed document fails cleanly', async () => {
		const provider = new GltfPartProvider({
			models: new Map([['stock.tank-small', 'bad.gltf']]),
			read: async () => '{"asset":{"version":"1.0"}}'
		});
		await provider.preload(['stock.tank-small']);
		expect(provider.failures.has('stock.tank-small')).toBe(true);
		expect(provider.create({ definition: 'stock.tank-small', detail })).toBeNull();
		provider.dispose();
	});
});

describe('factory with an asset provider', () => {
	const build = (provider: GltfPartProvider, visuals = maps.visuals) =>
		new PartModelFactory({
			shapes: maps.shapes,
			visuals,
			attach: maps.attach,
			providers: [provider],
			detail
		});

	test('the asset replaces the procedural model', async () => {
		const provider = new GltfPartProvider({
			models: new Map([['stock.tank-small', 'box.gltf']]),
			read: async () => boxGltf()
		});
		const factory = build(provider);
		await factory.preload(['stock.tank-small']);
		expect(factory.create('stock.tank-small').triangles).toBe(12);
		expect(factory.create('stock.tank-medium').triangles).toBeGreaterThan(100); // untouched
		factory.dispose();
		provider.dispose();
	});

	test('when the load fails, a model part falls back to the generator it names, then to the shape', async () => {
		const provider = new GltfPartProvider({
			models: new Map([['test.asset', 'gone.glb']]),
			read: async () => {
				throw new Error('offline');
			}
		});
		const visuals = new Map(maps.visuals);
		visuals.set('test.asset', {
			kind: 'model',
			params: { url: 'gone.glb', fallbackKind: 'tank' }
		});
		const shapes = new Map(maps.shapes);
		shapes.set('test.asset', { kind: 'cylinder', radius: 0.625, height: 2 });
		const factory = new PartModelFactory({
			shapes,
			visuals,
			providers: [provider],
			detail
		});
		await factory.preload(['test.asset']);
		expect(factory.create('test.asset').triangles).toBeGreaterThan(100); // the tank generator
		visuals.set('test.asset', { kind: 'model', params: { url: 'gone.glb' } });
		const plain = new PartModelFactory({ shapes, visuals, providers: [provider], detail });
		expect(plain.create('test.asset').triangles).toBeLessThan(100); // the plain cylinder
		factory.dispose();
		plain.dispose();
		provider.dispose();
	});
});
