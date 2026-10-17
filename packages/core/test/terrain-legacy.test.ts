/**
 * The Legacy world keeps today's terrain (plan 084, ADR 0142 points 2 and 3): heights, lake levels
 * and biome maps against golden samples taken before the seed and zones existed. Heights are
 * compared within `HEIGHT_TOLERANCE`, not bit for bit: the same float64 maths differs in the last
 * ulp between Apple arm64 (where the goldens were taken) and Linux x86-64 (5.7e-12 m measured).
 * The SHA-256 of all 10 000 heights is still checked where it can hold: on the machine kind that
 * wrote it (`process.arch === 'arm64'` on macOS).
 */
import { describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import golden from './fixtures/terrain-legacy.json';
import {
	cachedPlanetMap,
	createRng,
	createTerrainField,
	latLonDirection,
	type Vec3
} from '../src/index.ts';

const R = 600_000;
/** Metres. Far above the cross-platform ulp noise, far below anything visible or physical. */
export const HEIGHT_TOLERANCE = 1e-9;
/** The machine kind that recorded the bit-exact digests. */
export const RECORDED_HERE = process.platform === 'darwin' && process.arch === 'arm64';

/** The 10 000 directions of the fixture: every other one anywhere, the rest within 120 km of (0, 0). */
export function goldenDirections(): Vec3[] {
	const rng = createRng(84);
	const dirs: Vec3[] = [];
	for (let i = 0; i < 10_000; i++) {
		if (i % 2 === 0) {
			const z = 2 * rng.next() - 1;
			const a = 2 * Math.PI * rng.next();
			const s = Math.sqrt(1 - z * z);
			dirs.push({ x: s * Math.cos(a), y: z, z: s * Math.sin(a) });
		} else {
			const d = (rng.next() * 120_000) / R;
			const b = 2 * Math.PI * rng.next();
			dirs.push(latLonDirection(d * Math.sin(b), d * Math.cos(b)));
		}
	}
	return dirs;
}

const sha = (b: ArrayBufferView): string =>
	createHash('sha256')
		.update(new Uint8Array(b.buffer, b.byteOffset, b.byteLength))
		.digest('hex');

describe('Legacy terrain', () => {
	test('heights at 10 000 directions equal the pre-084 function', () => {
		const field = createTerrainField({ radius: R });
		const h = new Float64Array(goldenDirections().map((d) => field.heightAt(d)));
		const first = Array.from(h.slice(0, golden.first.length));
		const worstFirst = Math.max(...first.map((v, i) => Math.abs(v - golden.first[i]!)));
		const every = Array.from(h).filter((_, i) => i % 5 === 0);
		const worstEvery = Math.max(...every.map((v, i) => Math.abs(v - golden.heightsEvery5[i]!)));
		expect(worstFirst).toBeLessThanOrEqual(HEIGHT_TOLERANCE);
		expect(worstEvery).toBeLessThanOrEqual(HEIGHT_TOLERANCE);
		expect(h.filter((v) => v > 0).length).toBe(golden.nonZero);
		if (RECORDED_HERE) expect(sha(h)).toBe(golden.heightsSha256);
	});

	test('the biome maps are byte-identical', () => {
		for (const [w, digest] of Object.entries(golden.maps)) {
			expect(sha(cachedPlanetMap(Number(w)).data)).toBe(digest);
		}
	});
});
