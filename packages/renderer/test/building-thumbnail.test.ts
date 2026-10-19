/** Plan 235 / ADR 0227 point 5: build-menu thumbnails: size, framing, bounds and the cache. */
import { describe, expect, test } from 'bun:test';
import { Box3, PerspectiveCamera, Vector3 } from 'three';
import {
	createThumbnailCache,
	footprintMetres,
	THUMB_FOV,
	THUMB_HEIGHT,
	THUMB_WIDTH,
	thumbnailFraming,
	thumbnailGroup,
	thumbnailKey,
	thumbnailParts
} from '../src/building-thumbnail.ts';

/** Each generator at the stock footprint that uses it (cells). */
const GENERATORS: Array<[string, { w: number; d: number }]> = [
	['hangar', { w: 8, d: 5 }],
	['control', { w: 4, d: 2 }],
	['office', { w: 5, d: 3 }],
	['launch-pad', { w: 3, d: 3 }],
	['runway', { w: 4, d: 120 }],
	['dish', { w: 2, d: 2 }],
	['tanks', { w: 4, d: 4 }],
	['unknown', { w: 3, d: 3 }]
];

describe('building thumbnails', () => {
	test('are 256 × 160', () => {
		expect([THUMB_WIDTH, THUMB_HEIGHT]).toEqual([256, 160]);
	});

	test('every generator gives meshes about its footprint, standing on the ground', () => {
		for (const [g, size] of GENERATORS) {
			const group = thumbnailGroup(thumbnailParts(g, size));
			expect(group.children.length, g).toBeGreaterThan(0);
			const box = new Box3().setFromObject(group);
			// within a cell of its footprint (the hangar's apron reaches past its door)
			const m = footprintMetres(size);
			expect(box.max.x - box.min.x, g).toBeLessThanOrEqual(m.w + 12);
			expect(box.max.z - box.min.z, g).toBeLessThanOrEqual(m.d + 12);
			expect(box.min.y, g).toBeGreaterThanOrEqual(-1e-6);
		}
	});

	test('the framing puts every corner of the building in the picture', () => {
		for (const g of ['hangar', 'runway', 'dish']) {
			const size = g === 'runway' ? { w: 4, d: 120 } : { w: 8, d: 5 };
			const box = new Box3().setFromObject(thumbnailGroup(thumbnailParts(g, size)));
			const view = thumbnailFraming(box);
			const camera = new PerspectiveCamera(THUMB_FOV, THUMB_WIDTH / THUMB_HEIGHT, 0.5, 5000);
			camera.position.copy(view.position);
			camera.lookAt(view.target);
			camera.updateMatrixWorld();
			for (const x of [box.min.x, box.max.x])
				for (const y of [box.min.y, box.max.y])
					for (const z of [box.min.z, box.max.z]) {
						const p = new Vector3(x, y, z).project(camera);
						expect(Math.abs(p.x), g).toBeLessThanOrEqual(1);
						expect(Math.abs(p.y), g).toBeLessThanOrEqual(1);
					}
			// seen from above, from the south-east
			expect(view.position.y).toBeGreaterThan(view.target.y);
			expect(view.position.z).toBeGreaterThan(view.target.z);
		}
	});

	test('a cached thumbnail is reused; a failed one is drawn again', async () => {
		let draws = 0;
		let fail = true;
		const cache = createThumbnailCache(async (key) => {
			draws += 1;
			if (key === 'bad' && fail) throw new Error('no context');
			return `url:${key}`;
		});
		const key = thumbnailKey('hangar', { w: 8, d: 5 });
		expect(key).toBe('hangar:8x5');
		const a = cache.get(key);
		const b = cache.get(key);
		expect(a).toBe(b);
		expect(await a).toBe('url:hangar:8x5');
		expect(draws).toBe(1);
		await expect(cache.get('bad')).rejects.toThrow('no context');
		await Promise.resolve();
		fail = false;
		expect(await cache.get('bad')).toBe('url:bad');
		expect(draws).toBe(3);
		expect(cache.size).toBe(2);
	});
});
