/** Plan 033 / ADR 0047: debris pieces cut from the real part meshes. */
import { describe, expect, test } from 'bun:test';
import { BoxGeometry, CylinderGeometry, type MeshStandardMaterial } from 'three';
import { PartModelFactory } from '../src/parts/factory.ts';
import { PRESETS, detailOf } from '../src/presets.ts';
import {
	PIECE_VERTICES,
	fallbackSource,
	mergeShardSources,
	pickTriangles,
	shardSourceFromGeometry,
	triangleArea,
	writePiece
} from '../src/effects/shards.ts';
import { detectTransitions } from '../src/effects/transitions.ts';
import { stockMaps } from './stock-fixture.ts';

describe('shardSourceFromGeometry', () => {
	test('collects every triangle with its area and the colour of its group', () => {
		const box = new BoxGeometry(2, 1, 1); // 12 triangles in 6 groups
		const source = shardSourceFromGeometry(box, (m) => (m === 0 ? [1, 0, 0] : [0, 1, 0]));
		expect(source.cumulativeArea.length).toBe(12);
		// Total surface of a 2x1x1 box: 2(2+2+1) = 10 m2.
		expect(source.cumulativeArea[11]).toBeCloseTo(10, 6);
		expect(triangleArea(source.triangles, 0)).toBeCloseTo(0.5, 6); // half of the 1 x 1 end face
		expect(Array.from(source.colours.slice(0, 3))).toEqual([1, 0, 0]);
		expect(Array.from(source.colours.slice(3 * 11, 3 * 11 + 3))).toEqual([0, 1, 0]);
	});

	test('merging keeps the total area and the colours', () => {
		const a = shardSourceFromGeometry(new BoxGeometry(1, 1, 1), () => [1, 0, 0]);
		const b = shardSourceFromGeometry(new CylinderGeometry(1, 1, 2, 8), () => [0, 0, 1]);
		const merged = mergeShardSources([a, b]);
		expect(merged.cumulativeArea.length).toBe(a.cumulativeArea.length + b.cumulativeArea.length);
		expect(merged.cumulativeArea[merged.cumulativeArea.length - 1]).toBeCloseTo(
			a.cumulativeArea[a.cumulativeArea.length - 1]! +
				b.cumulativeArea[b.cumulativeArea.length - 1]!,
			6
		);
		expect(merged.colours[3 * a.cumulativeArea.length + 2]).toBe(1);
	});
});

describe('pickTriangles', () => {
	test('is deterministic and weighted by area', () => {
		// A big and a tiny triangle in one source.
		const source = {
			triangles: new Float32Array([0, 0, 0, 10, 0, 0, 0, 0, 10, 0, 0, 0, 0.1, 0, 0, 0, 0, 0.1]),
			colours: new Float32Array(6),
			cumulativeArea: new Float64Array([50, 50.005])
		};
		const picks = pickTriangles(source, 400, 7);
		expect(pickTriangles(source, 400, 7)).toEqual(picks);
		expect(picks.filter((t) => t === 1).length).toBeLessThan(4);
		expect(picks.filter((t) => t === 0).length).toBeGreaterThan(395);
		expect(pickTriangles({ ...source, cumulativeArea: new Float64Array(0) }, 5, 1)).toEqual([]);
	});
});

describe('writePiece', () => {
	test('a prism of 24 vertices centred on the triangle, longest edge as asked, thickness as asked', () => {
		const source = fallbackSource([1, 1, 1]);
		const out = new Float32Array(PIECE_VERTICES * 3);
		writePiece(source, 0, 2, 0.2, out, 0);
		let cx = 0;
		let cy = 0;
		let cz = 0;
		for (let i = 0; i < PIECE_VERTICES; i++) {
			cx += out[i * 3]!;
			cy += out[i * 3 + 1]!;
			cz += out[i * 3 + 2]!;
		}
		expect(cx / PIECE_VERTICES).toBeCloseTo(0, 5);
		expect(cy / PIECE_VERTICES).toBeCloseTo(0, 5);
		expect(cz / PIECE_VERTICES).toBeCloseTo(0, 5);
		// Triangle (0,0,0),(1,0,0),(0,0,1) has its normal along Y: thickness shows in y.
		const ys = Array.from({ length: PIECE_VERTICES }, (_, i) => out[i * 3 + 1]!);
		expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(0.2, 5);
		// Longest edge is the hypotenuse, sqrt(2) before scaling to 2 m.
		const xs = Array.from({ length: PIECE_VERTICES }, (_, i) => out[i * 3]!);
		expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(2 / Math.SQRT2, 5);
	});
});

describe('real part geometry', () => {
	test('the stock tank yields thousands of triangles in its paint and metal colours', () => {
		const maps = stockMaps();
		const factory = new PartModelFactory({
			shapes: maps.shapes,
			visuals: maps.visuals,
			attach: maps.attach,
			detail: detailOf(PRESETS.high)
		});
		const model = factory.create('stock.tank-small');
		const mesh = model.staticMesh!;
		const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
		const source = shardSourceFromGeometry(mesh.geometry, (i) => {
			const c = (materials[i] as MeshStandardMaterial).color;
			return [c.r, c.g, c.b];
		});
		expect(source.cumulativeArea.length).toBeGreaterThan(200);
		// More than one colour: the paint and the metal bands.
		const distinct = new Set<string>();
		for (let t = 0; t < source.cumulativeArea.length; t++) {
			distinct.add(Array.from(source.colours.slice(t * 3, t * 3 + 3)).join(','));
		}
		expect(distinct.size).toBeGreaterThan(1);
		model.dispose();
		factory.dispose();
	});
});

describe('destroyed events name the lost parts', () => {
	test('definitions of what vanished travel with the event', () => {
		const part = (id: number, definition: string) => ({
			id,
			definition,
			position: { x: 0, y: id, z: 0 }
		});
		const events = detectTransitions(
			[
				{
					id: 1,
					soi: 'home',
					position: { x: 600_000, y: 0, z: 0 },
					velocity: { x: 0, y: 0, z: -300 },
					parts: [part(1, 'stock.tank-small'), part(2, 'stock.engine-lv')]
				}
			],
			[],
			{ omega: () => ({ x: 0, y: 0, z: 0 }), sizeOf: () => 1 }
		);
		const destroyed = events.find((e) => e.kind === 'destroyed');
		expect(destroyed && 'definitions' in destroyed && destroyed.definitions).toEqual([
			'stock.tank-small',
			'stock.engine-lv'
		]);
	});
});
