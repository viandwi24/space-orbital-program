/** Plan 040 / ADR 0080: the persistent exhaust trail ribbon. */
import { describe, expect, test } from 'bun:test';
import { TrailRibbon } from '../src/effects/trail-ribbon.ts';
import {
	MAX_TRAILS,
	RIBBON_STRIDE,
	TRAIL_CAPACITY,
	TRAIL_DRIFT,
	TRAIL_GROWTH,
	TRAIL_LIFETIME,
	TRAIL_MAX_INTERVAL,
	TRAIL_SPACING,
	TrailBuffer,
	VERTICES_PER_POINT,
	trailAlpha,
	trailDensity,
	trailWidth,
	writeRibbon,
	writeRibbonIndices
} from '../src/effects/trail.ts';

describe('sampling', () => {
	test('the first point is kept, a close one in the same instant is not, a far one is', () => {
		const t = new TrailBuffer();
		expect(t.add(0, 0, 0, 1, 1, 0.02)).toBe(true);
		expect(t.add(0, TRAIL_SPACING * 0.5, 0, 1, 1, 0.02)).toBe(false);
		expect(t.add(0, TRAIL_SPACING, 0, 1, 1, 0.02)).toBe(true);
		expect(t.count).toBe(2);
	});

	test('a hovering engine still adds a point every TRAIL_MAX_INTERVAL', () => {
		const t = new TrailBuffer();
		t.add(0, 0, 0, 1, 1, 0);
		let added = 0;
		for (let i = 0; i < 100; i++) if (t.add(0, 0, 0, 1, 1, 0.05)) added++;
		// 100 x 0.05 s = 5 s: one point per interval (the sum of the steps is not exact)
		expect(added).toBeGreaterThanOrEqual(Math.floor(5 / TRAIL_MAX_INTERVAL) - 1);
		expect(added).toBeLessThanOrEqual(Math.floor(5 / TRAIL_MAX_INTERVAL));
	});

	test('the oldest point is dropped when full', () => {
		const t = new TrailBuffer();
		for (let i = 0; i < TRAIL_CAPACITY + 10; i++) t.add(i * TRAIL_SPACING, 0, 0, 1, 1, 0.01);
		expect(t.count).toBe(TRAIL_CAPACITY);
		expect(t.x[0]).toBe(10 * TRAIL_SPACING);
		expect(t.x[TRAIL_CAPACITY - 1]).toBe((TRAIL_CAPACITY + 9) * TRAIL_SPACING);
	});
});

describe('aging and wind', () => {
	test('points age with simulated time and are removed after their life', () => {
		const t = new TrailBuffer();
		t.add(0, 0, 0, 1, 1, 0);
		t.step(TRAIL_LIFETIME / 2);
		t.add(100, 0, 0, 1, 1, 0);
		expect(t.age[0]).toBeCloseTo(TRAIL_LIFETIME / 2, 9);
		t.step(TRAIL_LIFETIME / 2 + 0.001);
		expect(t.count).toBe(1); // the first is past its life, the second is half way
		expect(t.age[0]).toBeCloseTo(TRAIL_LIFETIME / 2 + 0.001, 9);
		t.step(TRAIL_LIFETIME);
		expect(t.count).toBe(0);
	});

	test('a paused sim (dt = 0) changes nothing', () => {
		const t = new TrailBuffer();
		t.add(1, 2, 3, 1, 1, 0);
		const before = t.digest();
		t.step(0, () => {
			throw new Error('must not sample the wind');
		});
		expect(t.digest()).toBe(before);
	});

	test('the wind moves a point by wind x dt x TRAIL_DRIFT', () => {
		const t = new TrailBuffer();
		t.add(0, 0, 0, 1, 1, 0);
		t.step(2, (_x, _y, _z, out) => {
			out[0] = 10;
			out[1] = 0;
			out[2] = -4;
		});
		expect(t.x[0]).toBeCloseTo(10 * 2 * TRAIL_DRIFT, 9);
		expect(t.z[0]).toBeCloseTo(-4 * 2 * TRAIL_DRIFT, 9);
		expect(t.y[0]).toBe(0);
	});

	test('wind that grows with height shears a vertical trail', () => {
		const t = new TrailBuffer();
		for (let i = 0; i < 20; i++) t.add(0, i * TRAIL_SPACING, 0, 1, 1, 0);
		t.step(10, (_x, y, _z, out) => {
			out[0] = y * 0.1;
			out[1] = 0;
			out[2] = 0;
		});
		expect(t.x[19]!).toBeGreaterThan(t.x[1]! * 5);
	});
});

describe('width, opacity and density', () => {
	test('the ribbon widens from w0 to TRAIL_GROWTH x w0 and never shrinks', () => {
		expect(trailWidth(2, 0)).toBe(2);
		expect(trailWidth(2, TRAIL_LIFETIME)).toBeCloseTo(2 * TRAIL_GROWTH, 9);
		let last = 0;
		for (let a = 0; a <= TRAIL_LIFETIME; a += 1) {
			const w = trailWidth(2, a);
			expect(w).toBeGreaterThanOrEqual(last);
			last = w;
		}
	});

	test('opacity rises over the first moments, then falls to 0 at the end of the life', () => {
		expect(trailAlpha(0)).toBe(0);
		expect(trailAlpha(0.6)).toBeGreaterThan(trailAlpha(TRAIL_LIFETIME / 2));
		expect(trailAlpha(TRAIL_LIFETIME / 2)).toBeGreaterThan(trailAlpha(TRAIL_LIFETIME * 0.9));
		expect(trailAlpha(TRAIL_LIFETIME)).toBe(0);
	});

	test('density is 0 in vacuum and thin air, 1 in thick air, rising in between', () => {
		expect(trailDensity(0)).toBe(0);
		expect(trailDensity(0.003)).toBe(0);
		expect(trailDensity(1)).toBe(1);
		expect(trailDensity(0.12)).toBe(1);
		expect(trailDensity(0.03)).toBeGreaterThan(trailDensity(0.01));
	});
});

describe('the ribbon strip', () => {
	const identity = (x: number, y: number, z: number, into: [number, number, number]): void => {
		into[0] = x;
		into[1] = y;
		into[2] = z;
	};

	test('two vertices per point, tangents along the path, newest point first', () => {
		const t = new TrailBuffer();
		for (let i = 0; i < 5; i++) t.add(0, i * TRAIL_SPACING, 0, 1.5, 0.8, 0);
		const out = new Float32Array(10 * RIBBON_STRIDE);
		const n = writeRibbon(t, identity, out, 0);
		expect(n).toBe(5 * VERTICES_PER_POINT);
		// first pair is the newest point with side -1 and +1
		expect(out[1]).toBe(4 * TRAIL_SPACING);
		expect(out[6]).toBe(-1);
		expect(out[RIBBON_STRIDE + 6]).toBe(1);
		expect(out[4]).toBeCloseTo(1, 6); // tangent y
		expect(out[7]).toBeCloseTo(1.5, 6); // width of an age-0 point
		// the along coordinate runs 0 .. 1
		expect(out[9]).toBe(0);
		expect(out[(n - 1) * RIBBON_STRIDE + 9]).toBe(1);
	});

	test('the older, wider ribbon is thinner: opacity falls faster than the fade alone', () => {
		const t = new TrailBuffer();
		for (let i = 0; i < 4; i++) t.add(0, i * TRAIL_SPACING, 0, 2, 1, 0);
		t.step(TRAIL_LIFETIME / 2);
		const out = new Float32Array(8 * RIBBON_STRIDE);
		writeRibbon(t, identity, out, 0);
		const width = trailWidth(2, TRAIL_LIFETIME / 2);
		expect(out[7]).toBeCloseTo(width, 5);
		expect(out[8]).toBeCloseTo(trailAlpha(TRAIL_LIFETIME / 2) / Math.sqrt(width / 2), 5);
		expect(out[8]!).toBeLessThan(trailAlpha(TRAIL_LIFETIME / 2));
	});

	test('fewer than two points write nothing', () => {
		const t = new TrailBuffer();
		t.add(0, 0, 0, 1, 1, 0);
		expect(writeRibbon(t, identity, new Float32Array(100), 0)).toBe(0);
	});

	test('indices make two triangles per segment and stay inside the vertices', () => {
		const idx = new Uint16Array(100);
		const w = writeRibbonIndices(idx, 0, 10, 5);
		expect(w).toBe(4 * 6);
		for (let i = 0; i < w; i++) {
			expect(idx[i]!).toBeGreaterThanOrEqual(10);
			expect(idx[i]!).toBeLessThan(10 + 5 * VERTICES_PER_POINT);
		}
		expect(writeRibbonIndices(idx, 0, 0, 1)).toBe(0);
	});
});

describe('TrailRibbon', () => {
	test('an engine feeds one trail; a relit engine after a pause starts a new one', () => {
		const r = new TrailRibbon();
		for (let i = 0; i < 10; i++) r.offer('1:1', 0, i * TRAIL_SPACING, 0, 1, 1, 0.1);
		expect(r.trails.size).toBe(1);
		r.step(0.2);
		r.step(0.6);
		r.offer('1:1', 0, 200, 0, 1, 1, 0.1);
		expect(r.trails.size).toBe(2);
		r.dispose();
	});

	test('no more than MAX_TRAILS at once: the one fed least recently goes', () => {
		const r = new TrailRibbon();
		for (let e = 0; e < MAX_TRAILS; e++) r.offer(`e${e}`, 0, 0, 0, 1, 1, 0.1);
		r.step(1);
		for (let e = 1; e < MAX_TRAILS; e++) r.offer(`e${e}`, 0, 5 * TRAIL_SPACING, 0, 1, 1, 0.1);
		r.offer('new', 0, 0, 0, 1, 1, 0.1);
		expect(r.trails.size).toBe(MAX_TRAILS);
		expect([...r.trails.keys()].some((k) => k.startsWith('e0#'))).toBe(false);
		expect([...r.trails.keys()].some((k) => k.startsWith('new#'))).toBe(true);
		r.dispose();
	});

	test('trails that have aged out are removed, and writing fills the draw range', () => {
		const r = new TrailRibbon();
		for (let i = 0; i < 6; i++) r.offer('a', 0, i * TRAIL_SPACING, 0, 1, 1, 0.1);
		r.write(
			{ world: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 } },
			{ x: 0, y: 0, z: 0 },
			[1, 1, 1]
		);
		expect(r.mesh.visible).toBe(true);
		expect(r.mesh.geometry.drawRange.count).toBe(5 * 6);
		r.step(TRAIL_LIFETIME + 1);
		expect(r.trails.size).toBe(0);
		r.write(
			{ world: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 } },
			{ x: 0, y: 0, z: 0 },
			[1, 1, 1]
		);
		expect(r.mesh.visible).toBe(false);
		r.dispose();
	});
});

describe('TrailRibbon buffers', () => {
	test('the index and vertex attributes are the arrays the ribbon writes (not copies)', () => {
		const r = new TrailRibbon();
		for (let i = 0; i < 6; i++) r.offer('a', 0, i * TRAIL_SPACING, 0, 1, 1, 0.1);
		r.write(
			{ world: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 } },
			{ x: 0, y: 0, z: 0 },
			[1, 1, 1]
		);
		const index = r.mesh.geometry.getIndex()!;
		expect(index.array[1]).toBe(1);
		expect(index.array[2]).toBe(2);
		expect(index.array[5]).toBe(2);
		const position = r.mesh.geometry.getAttribute('position') as unknown as {
			data: { array: Float32Array };
		};
		expect(position.data.array[1]).toBe(5 * TRAIL_SPACING); // the newest point comes first
		r.dispose();
	});
});
