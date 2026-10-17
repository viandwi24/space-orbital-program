/** Plan 052 / ADR 0068 and plan 060: the GLSL twin and the instanced stones, drawn from core's stone list. */
import { describe, expect, test } from 'bun:test';
import { stonesAround, STONES, stoneSalt } from '@orbital/core';
import { MoonStones, NEAR_CAPACITY } from '../src/moon-stones.ts';
import { moonFragmentBump, moonFragmentCommon } from '../src/shaders/moon.glsl.ts';
import { patchFrame } from '../src/terrain-patch.ts';
import { normalize, vec } from '../src/vec.ts';
import { MeshDepthMaterial, MeshLambertMaterial } from 'three';

const R = 190_000;
const landing = vec(1, 0, 0);

describe('the GLSL twin carries the constants', () => {
	test('lattice and size constants are in the shader source', () => {
		const f = (n: number): string => (Number.isInteger(n) ? `${n}.0` : String(n));
		for (const k of [
			STONES.cell,
			STONES.regionCells,
			STONES.quiet,
			STONES.busy,
			STONES.radiusMin,
			STONES.radiusSpan,
			STONES.boulderScale,
			STONES.flatten * (1 - STONES.sink)
		]) {
			expect(moonFragmentCommon).toContain(f(k));
		}
		expect(moonFragmentCommon).toContain('uStoneSalt');
		expect(stoneSalt(0)).toBe(STONES.salt);
		expect(moonFragmentBump).toContain('stoneDomes(vMoonN)');
	});
});

describe('the instanced stones', () => {
	const frame = patchFrame(landing, R, 2_048);
	const make = (): MoonStones =>
		new MoonStones(R, new MeshLambertMaterial(), new MeshDepthMaterial());

	test('they appear near the ground, in two meshes with the near one capped, and not high up', () => {
		const stones = make();
		stones.update(landing, 5, null);
		expect(stones.near.visible).toBe(false); // the fine patch is not baked yet
		stones.update(landing, 5, frame);
		expect(stones.near.visible && stones.far.visible).toBe(true);
		expect(stones.count).toBeGreaterThan(50);
		const nearCount = (stones.near.geometry as unknown as { instanceCount: number }).instanceCount;
		const farCount = (stones.far.geometry as unknown as { instanceCount: number }).instanceCount;
		expect(nearCount).toBeGreaterThan(0);
		expect(nearCount).toBeLessThanOrEqual(NEAR_CAPACITY);
		expect(nearCount + farCount).toBe(stones.count);
		expect(stones.count).toBeLessThanOrEqual(STONES.maxInstances);
		stones.update(landing, STONES.maxAltitude + 10, frame);
		expect(stones.near.visible).toBe(false);
		expect(stones.far.visible).toBe(false);
	});

	test('the list is kept while the camera moves a little and rebuilt after the refresh distance', () => {
		const stones = make();
		stones.update(landing, 5, frame);
		const attribute = stones.far.geometry.getAttribute('aStone');
		const before = attribute.getX(0);
		stones.update(normalize(vec(1, 0, 2 / R)), 5, frame); // 2 m: kept
		expect(attribute.getX(0)).toBe(before);
		stones.update(normalize(vec(1, 0, (STONES.refreshDistance + 2) / R)), 5, frame);
		expect(attribute.getX(0)).not.toBe(before);
	});
});

describe('drawn stones are core stones (plan 060)', () => {
	test('every instance is a stone of core.stonesAround: same radius and yaw, and the count matches', () => {
		const frame = patchFrame(landing, R, 2_048);
		const stones = new MoonStones(R, new MeshLambertMaterial(), new MeshDepthMaterial());
		stones.update(landing, 5, frame);
		const expected = stonesAround(landing, R).filter((s) => {
			const k =
				s.direction.x * frame.centre.x +
				s.direction.y * frame.centre.y +
				s.direction.z * frame.centre.z;
			return k > 1e-6;
		});
		let matched = 0;
		for (const mesh of [stones.near, stones.far]) {
			const a = mesh.geometry.getAttribute('aStone');
			const n = (mesh.geometry as unknown as { instanceCount: number }).instanceCount;
			for (let i = 0; i < n; i++) {
				// float32 attributes: compare within their precision
				const hit = expected.some(
					(s) => Math.abs(s.radius - a.getZ(i)) < 1e-5 && Math.abs(s.yaw - a.getW(i)) < 1e-5
				);
				expect(hit).toBe(true);
				matched++;
			}
		}
		expect(matched).toBe(stones.count);
		expect(matched).toBeGreaterThan(50);
		expect(matched).toBeLessThanOrEqual(expected.length);
		expect(expected.length - matched).toBeLessThan(expected.length * 0.1 + 3); // dropped only at the patch edge
	});
});
